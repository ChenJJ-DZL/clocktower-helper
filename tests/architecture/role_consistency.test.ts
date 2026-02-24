
import { roles as globalRoles } from '../../app/data';
import { calculateNightInfo } from '../../src/utils/nightLogic';
import { Seat } from '../../app/data';

// Mock dependencies
// calculateNightInfo signature: (targetSeat, seats, history, gamePhase, roles, selectedScript)

describe('Role Architecture Consistency', () => {
    test('calculateNightInfo propagates definition layer target counts to meta', () => {
        // 1. Iterate through all roles
        globalRoles.forEach(role => {
            // Cast role to any to access potentially optional definition fields for testing
            const roleDef = role as any;

            // 2. Check if role has a definition for target count
            // Need to check both night and firstNight
            const nightTarget = roleDef.night?.target?.count;
            const firstNightTarget = roleDef.firstNight?.target?.count;

            if (!nightTarget && !firstNightTarget) return;

            // 3. Simulate Night Info calculation
            // Mock minimal seat with this role
            const mockSeat: Seat = {
                id: 0,
                role: role,
                isDead: false,
                isDrunk: false,
                isPoisoned: false,
                isProtected: false,
                isRedHerring: false,
                isFortuneTellerRedHerring: false,
                isSentenced: false,
                hasUsedSlayerAbility: false,
                hasUsedVirginAbility: false,
                hasBeenNominated: false,
                isDemonSuccessor: false,
                hasAbilityEvenDead: false,
                statusDetails: [],
                statuses: [],
                grandchildId: null,
                isGrandchild: false,
                zombuulLives: 1,
            } as any;

            const mockSeats = [mockSeat, { id: 1 }, { id: 2 }] as any[]; // Add dummy seats for potential targets

            // Test First Night
            if (firstNightTarget) {
                // Correct signature: seat, seats, history, phase, roles, script
                const info = calculateNightInfo(mockSeat, mockSeats, [], 'firstNight', globalRoles, null as any);
                if (info) {
                    expect(info.meta?.targetCount).toBeDefined();
                    expect(info.meta?.targetCount?.max).toBe(firstNightTarget.max);

                    // Verify interaction object (new way - Surgical Fix)
                    expect((info as any).interaction).toBeDefined();
                    expect((info as any).interaction.amount).toBe(firstNightTarget.max);
                    expect((info as any).interaction.type).toBe('choose_player');
                }
            }

            // Test Other Night
            if (nightTarget) {
                const info = calculateNightInfo(mockSeat, mockSeats, [], 'night', globalRoles, null as any);
                if (info) {
                    expect(info.meta?.targetCount).toBeDefined();
                    expect(info.meta?.targetCount?.max).toBe(nightTarget.max);

                    // Verify interaction object (new way)
                    expect((info as any).interaction).toBeDefined();
                    expect((info as any).interaction.amount).toBe(nightTarget.max);
                }
            }
        });
    });
});
