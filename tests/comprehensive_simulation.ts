
import fs from 'fs';
import path from 'path';
import { roles, Role, Seat, GamePhase, Script, RoleType } from '../app/data.ts';
import { generateNightActionQueue } from '../src/utils/nightQueueGenerator.ts';
import { calculateNightInfo } from '../src/utils/nightLogic.ts';
import {
    getRandom,
    isEvil,
    computeIsPoisoned,
    addPoisonMark,
} from '../src/utils/gameRules.ts';

// --- Constants & Types ---
const SIMULATION_COUNT = 100;
const OUTPUT_FILE = 'simulation_report.json';

// Presets from single_sim_run.js
const TB_PRESETS = [
    { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
    { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
    { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
    { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
];

interface SimulationLog {
    gameId: number;
    setup: {
        seats: any[]; // Simplified seat info
    };
    phases: PhaseLog[];
    winner: string | null;
}

interface PhaseLog {
    phase: string;
    actions: ActionLog[];
    modalsTriggered: string[];
}

interface ActionLog {
    seatId: number;
    role: string;
    consoleHint: string;
    targets: number[];
    actionResult: string;
    modal?: string;
}

// --- Helper Functions ---

const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const pickPreset = () => TB_PRESETS[Math.floor(Math.random() * TB_PRESETS.length)];

const filterRoles = (type: string) =>
    roles.filter((r: Role) => (r.script === '暗流涌动' || !r.script) && r.type === type);

// --- Simulation Logic ---

class GameSimulation {
    seats: Seat[] = [];
    gameId: number;
    gameLog: SimulationLog;
    currentPhase: GamePhase = 'setup';
    nightCount = 0;
    logs: any[] = [];
    activeModal: { type: string; data: any } | null = null;

    // Mock Setters
    setSeats = (updater: any) => {
        this.seats = typeof updater === 'function' ? updater(this.seats) : updater;
    };
    setSelectedActionTargets = () => { }; // No-op in sim, we pass targets directly
    setCurrentModal = (modal: any) => {
        this.activeModal = modal;
        if (modal) {
            const currentPhaseLog = this.gameLog.phases[this.gameLog.phases.length - 1];
            if (currentPhaseLog) {
                currentPhaseLog.modalsTriggered.push(modal.type);
            }
        }
    };
    addLog = (msg: string) => {
        this.logs.push(msg);
    };
    // Simplified kill (just mark dead)
    killPlayer = (targetId: number, options: any = {}) => {
        this.setSeats((prev: Seat[]) => prev.map(s => s.id === targetId ? { ...s, isDead: true } : s));
        this.addLog(`Player ${targetId + 1} killed.`);
    };

    constructor(gameId: number) {
        this.gameId = gameId;
        this.gameLog = {
            gameId,
            setup: { seats: [] },
            phases: [],
            winner: null
        };
    }

    setup() {
        const preset = pickPreset();
        const total = preset.total;
        const seatArray: Seat[] = Array.from({ length: total }, (_, id) => ({
            id,
            role: null as any,
            isDead: false,
            isPoisoned: false,
            isDrunk: false,
            statusDetails: [],
            statuses: [],
            // Mock missing properties
            isProtected: false,
            protectedBy: null,
            isRedHerring: false,
            hasAbilityEvenDead: false,
            isDemonSuccessor: false,
            // ... allow loose typing
        } as any)) as Seat[];

        const picked = [
            ...shuffle(filterRoles('townsfolk')).slice(0, preset.townsfolk),
            ...shuffle(filterRoles('outsider')).slice(0, preset.outsider),
            ...shuffle(filterRoles('minion')).slice(0, preset.minion),
            ...shuffle(filterRoles('demon')).slice(0, preset.demon),
        ];
        const shuffledRoles = shuffle(picked);

        seatArray.forEach((s, i) => {
            s.role = shuffledRoles[i];
            // Basic setup logic
            if (s.role && s.role.id === 'drunk') s.isDrunk = true;
        });

        this.seats = seatArray;
        this.gameLog.setup.seats = this.seats.map(s => ({ id: s.id + 1, role: s.role?.name || "Unknown" }));
    }

    async runNight(isFirstNight: boolean) {
        this.currentPhase = isFirstNight ? 'firstNight' : 'night';
        if (!isFirstNight) this.nightCount++;

        const phaseLabel = isFirstNight ? 'First Night' : `Night ${this.nightCount}`;
        const phaseLog: PhaseLog = { phase: phaseLabel, actions: [], modalsTriggered: [] };
        this.gameLog.phases.push(phaseLog);

        const queue = generateNightActionQueue(this.seats, isFirstNight);

        for (const seat of queue) {
            if (seat.isDead && !seat.hasAbilityEvenDead) continue; // Double check
            if (!seat.role) continue; // Skip if no role (shouldn't happen)

            // 1. Calculate Info (Console Hint)
            // We mimic what useGameController/GameConsole does with calculateNightInfo

            // Need mock set functions for night info? calculateNightInfo mostly just computes string.
            const info = calculateNightInfo(
                { name: '暗流涌动' } as any, // Mock script
                this.seats,
                seat.id,
                this.currentPhase,
                null, // lastDuskExecution
                undefined, // fakeInspection
                undefined, // drunkFirstInfo
                isEvil // isEvil fn
            );

            const actionLog: ActionLog = {
                seatId: seat.id + 1,
                role: seat.role.name,
                consoleHint: info?.guide || 'No hint',
                targets: [],
                actionResult: 'Skipped'
            };

            // 2. Decide Action (Randomly pick targets)
            const targets = this.pickRandomTargets(seat);
            actionLog.targets = targets.map(t => t + 1);

            // 3. Execute Action Logic (Simulated)
            if (targets.length > 0) {
                if (seat.role.id === 'poisoner') {
                    // Example Simulation
                    actionLog.actionResult = "Poisoned target " + (targets[0] + 1);
                } else if (seat.role.id === 'imp') {
                    actionLog.actionResult = "Killed target " + (targets[0] + 1);
                    this.killPlayer(targets[0]);
                } else {
                    actionLog.actionResult = "Action performed (Simulation)";
                }

                // Trigger Modal Log
                if (seat.role.id === 'poisoner') {
                    this.setCurrentModal({ type: 'POISON_CONFIRM' });
                }
            }

            phaseLog.actions.push(actionLog);
            this.activeModal = null; // Reset modal
        }
    }

    pickRandomTargets(seat: Seat): number[] {
        // Simple logic: pick 1 alive player other than self (usually)
        const candidates = this.seats.filter(s => s.id !== seat.id && !s.isDead);
        if (candidates.length > 0) {
            return [candidates[Math.floor(Math.random() * candidates.length)].id];
        }
        return [];
    }
}

async function run() {
    const reports = [];
    console.log(`Starting ${SIMULATION_COUNT} simulations...`);
    for (let i = 0; i < SIMULATION_COUNT; i++) {
        const sim = new GameSimulation(i);
        sim.setup();
        await sim.runNight(true); // First Night
        // sim.runDay(); 
        // sim.runNight(false);
        reports.push(sim.gameLog);
        if (i % 10 === 0) console.log(`Completed simulation ${i}/${SIMULATION_COUNT}`);
    }

    // Safe write
    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reports, null, 2));
        console.log(`Report written to ${OUTPUT_FILE}`);
    } catch (e) {
        console.error("Failed to write report:", e);
    }
}

run();
