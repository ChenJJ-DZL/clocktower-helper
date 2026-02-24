import { checkGameEnd, GameEndResult } from '../app/gameLogic';
import type { Seat } from '../app/data';

// Helper to create mock seats
function createSeats(
    roles: { id: string; type: string; isDead?: boolean; isGood?: boolean; isPoisoned?: boolean; isDrunk?: boolean }[]
): Seat[] {
    return roles.map((r, i) => ({
        id: i,
        isDead: r.isDead || false,
        isPoisoned: r.isPoisoned || false,
        isDrunk: r.isDrunk || false,
        role: { id: r.id, type: r.type, name: r.id, side: r.isGood !== false ? 'good' : 'evil' } as any,
        statusDetails: [],
        statuses: [],
    } as unknown as Seat));
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASSED: ${message}`);
    }
}

console.log('--- Verifying Priority Pyramid Logic ---');

// 1. Evil Twin blocks Good win (even if Demon dead)
console.log('\nTest Case 1: Evil Twin blocks Good win (Demon dead)');
{
    const seats = createSeats([
        { id: 'evil_twin', type: 'minion', isGood: false }, // Alive Evil Twin
        { id: 'washerwoman', type: 'townsfolk', isGood: true }, // Alive Good Twin (assume pair)
        { id: 'imp', type: 'demon', isDead: true, isGood: false }, // Dead Demon
        { id: 'outsider', type: 'outsider', isGood: true },
    ]);

    const result = checkGameEnd(seats, 'execution', 2, {
        evilTwinPair: { goodId: 1, evilId: 0 }
    });

    // Should result in CONTINUE or EVIL WIN (if only 2 alive), but definitely NOT GOOD WIN
    assert(result.winner !== 'Good', 'Good should NOT win if Evil Twin is active');
    // Alive count: 3 (Twin, Twin, Outsider). So should interpret as game continues?
    // Logic: 
    // 1. Twin blocks Good win.
    // 2. Demon dead -> effectively 0 demons.
    // 3. But Twin blocks.
    // 4. Alive count 3 -> Game continues.
    assert(result.isGameOver === false, 'Game should continue (Twin active, >2 players)');
}

// 2. Demon Dead -> Good Wins (Standard)
console.log('\nTest Case 2: Demon Dead -> Good Wins (Standard)');
{
    const seats = createSeats([
        { id: 'minion', type: 'minion', isGood: false },
        { id: 'townsfolk', type: 'townsfolk', isGood: true },
        { id: 'imp', type: 'demon', isDead: true, isGood: false },
    ]);

    const result = checkGameEnd(seats, 'execution', 2);
    assert(result.isGameOver === true && result.winner === 'Good', 'Good should win if Demon is dead');
}

// 3. Mastermind delays Good Win
console.log('\nTest Case 3: Mastermind delays Good Win');
{
    const seats = createSeats([
        { id: 'mastermind', type: 'minion', isGood: false },
        { id: 'townsfolk', type: 'townsfolk', isGood: true },
        { id: 'imp', type: 'demon', isDead: true, isGood: false },
    ]);

    // Note: executedPlayerId=2 (Demon)
    const result = checkGameEnd(seats, 'execution', 2, {
        isMastermindActive: true
    });

    assert(result.isGameOver === false, 'Game should continue if Mastermind is active');
}

// 4. Saint Executed -> Evil Wins (Immediate Trigger)
console.log('\nTest Case 4: Saint Executed -> Evil Wins');
{
    const seats = createSeats([
        { id: 'saint', type: 'outsider', isGood: true, isDead: true }, // Just executed
        { id: 'imp', type: 'demon', isDead: false, isGood: false }, // Demon alive
    ]);

    // Checking right after execution
    const result = checkGameEnd(seats, 'execution', 0); // 0 is Saint
    assert(result.isGameOver === true && result.winner === 'Evil', 'Evil should win if Saint executed');
}

// 5. 2 Players Alive -> Evil Wins (Survival Count)
console.log('\nTest Case 5: 2 Players Alive -> Evil Wins');
{
    const seats = createSeats([
        { id: 'imp', type: 'demon', isGood: false }, // Alive
        { id: 'townsfolk', type: 'townsfolk', isGood: true }, // Alive
        { id: 'townsfolk', type: 'townsfolk', isGood: true, isDead: true },
    ]);

    const result = checkGameEnd(seats, 'execution', null);
    assert(result.isGameOver === true && result.winner === 'Evil', 'Evil should win if only 2 alive');
}

// 6. Mayor Wins (3 players, no execution)
console.log('\nTest Case 6: Mayor Wins');
{
    const seats = createSeats([
        { id: 'mayor', type: 'townsfolk', isGood: true },
        { id: 'imp', type: 'demon', isGood: false },
        { id: 'minion', type: 'minion', isGood: false },
    ]);
    // 3 alive
    const result = checkGameEnd(seats, 'execution', null); // No execution
    assert(result.isGameOver === true && result.winner === 'Good', 'Mayor should win if 3 alive and no execution');
}

// 7. Zombuul (Dead but effective) -> Game Continues
console.log('\nTest Case 7: Zombuul (Dead but effective) -> Game Continues');
{
    const seats = crreateZombuulSeats();

    const result = checkGameEnd(seats, 'execution', 0);
    assert(result.isGameOver === false, 'Game should continue if Zombuul is dead but effective');
}

function crreateZombuulSeats() {
    return [
        {
            id: 0,
            isDead: true,
            isZombuulTrulyDead: false, // Critical flag
            role: { id: 'zombuul', type: 'demon', side: 'evil' },
        } as any,
        { id: 1, isDead: false, role: { id: 'townsfolk', type: 'townsfolk', side: 'good' } } as any,
        { id: 2, isDead: false, role: { id: 'townsfolk', type: 'townsfolk', side: 'good' } } as any,
        { id: 3, isDead: false, role: { id: 'townsfolk', type: 'townsfolk', side: 'good' } } as any,
    ];
}

console.log('\n✅ All Priority Tests Passed!');
