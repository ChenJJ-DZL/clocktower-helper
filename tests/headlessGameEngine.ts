/**
 * 无头游戏引擎 — Layer 4 仿真对局层核心
 *
 * 不依赖浏览器，直接通过新引擎能力注册表执行游戏。
 */

import type { GamePhase, Role, Seat } from "../app/data";
import { roles } from "../app/data";
import { isEvil } from "../src/utils/gameRules";
import { unifiedRoleDefinition } from "../src/roles/unifiedRoleDefinition";
import { getRawAbilityMap, initializeAbilityRegistry } from "../src/roles/new_engine/abilityRegistry";
import { generateDynamicNightQueue, type NightOrderEntry } from "../src/utils/dynamicQueueGenerator";
import { runFullAbilityPipeline } from "../src/utils/middlewarePipeline";
import type { MiddlewareContext } from "../src/utils/middlewareTypes";
import { nightOrderParser } from "../src/utils/nightOrderParser";

export interface ScriptConfig {
  id: string;
  name: string;
}

export const SCRIPTS: ScriptConfig[] = [
  { id: "暗流涌动",      name: "Trouble Brewing" },
  { id: "黯月初升",      name: "Bad Moon Rising" },
  { id: "梦陨春宵",      name: "Sects & Violets" },
  { id: "夜半狂欢",      name: "Midnight Revelry" },
  { id: "__all__",       name: "All Roles (Mixed)" },
];

export const MIN_PLAYERS = 7;
export const MAX_PLAYERS = 15;
export const MAX_ROUNDS = 15;

export interface TriggerRecord {
  seatId: number;
  roleId: string;
  roleName: string;
  abilityId: string;
  abilityName: string;
  timing: "night" | "day" | "passive";
  round: number;
  targets: number[];
  success: boolean;
  error?: string;
  corrupted: boolean;
}

export interface GameReport {
  script: string;
  playerCount: number;
  seedsRoleIds: string[];
  seedsRoleNames: string[];
  rounds: RoundReport[];
  winner: "good" | "evil" | null;
  triggers: TriggerRecord[];
  errors: string[];
  crashed: boolean;
  crashMessage?: string;
  durationMs: number;
  totalRounds: number;
}

interface RoundReport {
  round: number;
  phase: "day" | "night";
  events: string[];
  abilityTriggers: TriggerRecord[];
  deaths: number[];
  nominations: number;
  executed: number | null;
}

interface RoleSetup {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomN(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function filterRolesByScript(scriptId, type) {
  return roles.filter((r) => r.type === type && (!r.script || r.script === scriptId));
}

function getRoleSetup(playerCount) {
  if (playerCount >= 9 && playerCount <= 10) return { townsfolk: 5, outsider: 2, minion: 1, demon: 1 };
  if (playerCount === 11) return { townsfolk: 7, outsider: 0, minion: 2, demon: 1 };
  if (playerCount === 12) return { townsfolk: 7, outsider: 1, minion: 2, demon: 1 };
  if (playerCount >= 13) return { townsfolk: 7, outsider: 2, minion: 2, demon: 1 };
  return { townsfolk: 5, outsider: 0, minion: 1, demon: 1 };
}

function buildFullNightOrder() {
  const firstNightOrder = nightOrderParser.getFirstNightOrder();
  const otherNightOrder = nightOrderParser.getOtherNightOrder();
  const allRoleIds = new Set([
    ...firstNightOrder.map(i => i.roleId),
    ...otherNightOrder.map(i => i.roleId),
  ]);
  const entries = [];
  allRoleIds.forEach((roleId) => {
    const firstItem = firstNightOrder.find(i => i.roleId === roleId);
    const otherItem = otherNightOrder.find(i => i.roleId === roleId);
    const priority = firstItem?.firstNightOrder || otherItem?.otherNightOrder || 99;
    const abilities = unifiedRoleDefinition.getRoleAbilities(roleId);
    const ability = abilities[0];
    entries.push({
      roleId,
      roleName: firstItem?.roleName || otherItem?.roleName || roleId,
      abilityId: ability?.abilityId || roleId + ":ability",
      priority,
      firstNightOnly: !otherItem,
      wakeMessage: ability?.wakePromptId || "",
    });
  });
  entries.sort((a, b) => a.priority - b.priority);
  return entries;
}

function buildAbilityMap() {
  return getRawAbilityMap();
}

export class HeadlessGameEngine {
  constructor(script, playerCount) {
    this.script = script;
    this.playerCount = playerCount;
    this.seats = [];
    this.nightCount = 0;
    this.currentRound = 0;
    this.phase = "setup";
    this.gameOver = false;
    this.winner = null;
    this.triggers = [];
    this.errors = [];
    this.roundLogs = [];
    this.crashed = false;
    this.crashMessage = null;
    this.startTime = Date.now();
    this.deadThisNight = [];
    this.events = [];

    initializeAbilityRegistry();
    this.fullNightOrder = buildFullNightOrder();
    this.abilityMap = buildAbilityMap();
  }

  async runGame() {
    this.startTime = Date.now();
    try {
      this.assignRoles();
      while (!this.gameOver && this.currentRound < MAX_ROUNDS) {
        this.currentRound++;
        await this.runNightPhase();
        if (this.gameOver) break;
        await this.runDayPhase();
      }
    } catch (e) {
      this.crashed = true;
      this.crashMessage = e.message || String(e);
      this.errors.push("[CRASH] " + this.crashMessage);
    }
    return this.getReport();
  }

  assignRoles() {
    const setup = getRoleSetup(this.playerCount);
    const allTownsfolk = shuffle(filterRolesByScript(this.script.id, "townsfolk"));
    const allOutsider = shuffle(filterRolesByScript(this.script.id, "outsider"));
    const allMinion = shuffle(filterRolesByScript(this.script.id, "minion"));
    const allDemon = shuffle(filterRolesByScript(this.script.id, "demon"));

    const usedRoles = [
      ...allTownsfolk.slice(0, setup.townsfolk),
      ...allOutsider.slice(0, setup.outsider),
      ...allMinion.slice(0, setup.minion),
      ...allDemon.slice(0, setup.demon),
    ];

    const shuffled = shuffle(usedRoles);

    this.seats = shuffled.map((role, i) => ({
      id: i,
      role,
      charadeRole: null,
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
    }));
  }

  async runNightPhase() {
    this.nightCount++;
    const isFirst = this.nightCount === 1;
    this.phase = isFirst ? "firstNight" : "night";
    this.deadThisNight = [];

    const roundReport = {
      round: this.currentRound,
      phase: "night",
      events: [],
      abilityTriggers: [],
      deaths: [],
      nominations: 0,
      executed: null,
    };

    const queue = generateDynamicNightQueue(
      this.fullNightOrder,
      this.createSnapshot(),
      { isFirstNight: isFirst }
    );

    for (const node of queue) {
      const seat = this.seats.find(s => s.id === node.seatId);
      if (!seat || seat.isDead) continue;

      const ability = this.abilityMap[node.abilityId];
      if (!ability) {
        this.errors.push("能力未注册: " + node.abilityId);
        continue;
      }

      const targets = this.selectTargets(seat, ability.targetConfig);

      const context = {
        snapshot: this.createSnapshot(),
        actionNode: { ...node, targetIds: targets.map(t => t.id) },
        targetIds: targets.map(t => t.id),
        meta: {},
        aborted: false,
      };

      try {
        const result = await runFullAbilityPipeline(
          {
            preCheck: ability.preCheck || [],
            calculate: ability.calculate || [],
            stateUpdate: ability.stateUpdate || [],
            postProcess: ability.postProcess || [],
          },
          context
        );

        if (result.snapshot?.seats) {
          this.syncSeatsFromSnapshot(result.snapshot.seats);
        }

        const isCorrupted = result.meta?.abilityEffective === false;
        const trigger = {
          seatId: seat.id,
          roleId: seat.role?.id || "",
          roleName: seat.role?.name || "",
          abilityId: node.abilityId,
          abilityName: ability.abilityName || "",
          timing: "night",
          round: this.currentRound,
          targets: targets.map(t => t.id),
          success: !result.aborted,
          error: result.abortReason,
          corrupted: !!isCorrupted,
        };
        this.triggers.push(trigger);
        roundReport.abilityTriggers.push(trigger);
      } catch (e) {
        this.errors.push("能力异常 " + node.roleName + ": " + (e.message || String(e)));
        this.triggers.push({
          seatId: seat.id,
          roleId: seat.role?.id || "",
          roleName: seat.role?.name || "",
          abilityId: node.abilityId,
          abilityName: ability.abilityName || "",
          timing: "night",
          round: this.currentRound,
          targets: targets.map(t => t.id),
          success: false,
          error: e.message,
          corrupted: false,
        });
      }
    }

    this.processDemonKill();
    this.roundLogs.push(roundReport);
    this.checkGameEnd();
  }

  async runDayPhase() {
    this.phase = "day";
    const roundReport = {
      round: this.currentRound,
      phase: "day",
      events: [],
      abilityTriggers: [],
      deaths: [],
      nominations: 0,
      executed: null,
    };

    const alive = this.getAliveSeats();
    if (alive.length >= 3) {
      const picked = pickRandomN(alive, 2);
      const [nominator, nominee] = picked;
      if (nominator && nominee && nominator.id !== nominee.id) {
        roundReport.nominations = 1;
        const yesVotes = alive.filter(() => Math.random() > 0.4).length;
        const threshold = Math.ceil(alive.length / 2);
        if (yesVotes >= threshold) {
          this.killSeat(nominee.id);
          roundReport.executed = nominee.id;
          roundReport.deaths.push(nominee.id);
          this.checkGameEnd();
        }
      }
    }

    this.roundLogs.push(roundReport);
  }

  selectTargets(actor, targetConfig) {
    const alive = this.getAliveSeats().filter(s => {
      if (!targetConfig.allowSelf && s.id === actor.id) return false;
      if (!targetConfig.allowDead && s.isDead) return false;
      return true;
    });
    if (alive.length === 0) return [];
    const count = Math.min(targetConfig.max || 1, alive.length);
    return pickRandomN(alive, count);
  }

  processDemonKill() {
    if (this.nightCount === 1) return; // 首夜恶魔不杀人
    const aliveDemons = this.getAliveSeats().filter(s => s.role?.type === "demon");
    for (const demon of aliveDemons) {
      const targets = this.getAliveSeats().filter(s => s.id !== demon.id && !this.deadThisNight.includes(s.id));
      if (targets.length === 0) continue;
      const victim = targets[Math.floor(Math.random() * targets.length)];
      if (!victim.isProtected) {
        this.killSeat(victim.id);
        if (!this.deadThisNight.includes(victim.id)) this.deadThisNight.push(victim.id);
      }
    }
  }

  checkGameEnd() {
    if (this.gameOver) return;
    const alive = this.getAliveSeats();
    const evilAlive = alive.filter(s => isEvil(s));
    const goodAlive = alive.filter(s => !isEvil(s));
    const demonAlive = evilAlive.some(s => s.role?.type === "demon");

    if (!demonAlive) { this.winner = "good"; this.gameOver = true; return; }
    if (goodAlive.length === 0) { this.winner = "evil"; this.gameOver = true; return; }
    if (alive.length <= 2 && evilAlive.length >= 1) { this.winner = "evil"; this.gameOver = true; return; }
  }

  getAliveSeats() { return this.seats.filter(s => !s.isDead); }
  killSeat(id) { const idx = this.seats.findIndex(s => s.id === id); if (idx >= 0) this.seats[idx] = { ...this.seats[idx], isDead: true }; }

  createSnapshot() {
    return {
      nightCount: this.nightCount,
      seats: this.seats.map(s => ({ ...s, isAlive: !s.isDead, statusEffects: s.statuses || [] })),
      statusEffects: {},
      gamePhase: this.phase,
    };
  }

  syncSeatsFromSnapshot(snapshotSeats) {
    for (const snapSeat of snapshotSeats) {
      const idx = this.seats.findIndex(s => s.id === snapSeat.id);
      if (idx >= 0) {
        this.seats[idx] = { ...this.seats[idx], ...snapSeat };
      }
    }
  }

  getReport() {
    return {
      script: this.script.name,
      playerCount: this.playerCount,
      seedsRoleIds: this.seats.map(s => s.role?.id || ""),
      seedsRoleNames: this.seats.map(s => s.role?.name || ""),
      rounds: this.roundLogs,
      winner: this.winner,
      triggers: this.triggers,
      errors: this.errors,
      crashed: this.crashed,
      crashMessage: this.crashMessage,
      durationMs: Date.now() - this.startTime,
      totalRounds: this.currentRound,
    };
  }

  getTriggeredRoleIds() {
    return [...new Set(this.triggers.map(t => t.roleId))];
  }

  getUntriggeredRoleIds() {
    const allAssigned = new Set(this.seats.map(s => s.role?.id || ""));
    const triggered = new Set(this.triggers.map(t => t.roleId));
    return [...allAssigned].filter(id => !triggered.has(id));
  }
}