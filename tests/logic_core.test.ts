import type { Role, Seat } from "../app/data";
import {
  type GameAction,
  initializeSeats,
  processGameEvent,
} from "../app/gameLogic";

// Mock Roles
const zombuul: Role = { id: "zombuul", name: "僵怖", type: "demon" };
const _imp: Role = { id: "imp", name: "小恶魔", type: "demon" };
const teaLady: Role = { id: "tea_lady", name: "茶艺师", type: "townsfolk" };
const villager: Role = { id: "villager", name: "村民", type: "townsfolk" };

describe("Pure Game Logic Core", () => {
  let seats: Seat[];

  beforeEach(() => {
    seats = initializeSeats(5);
  });

  test("Zombuul False Death Logic", () => {
    // Setup Zombuul
    seats[0].role = zombuul;
    seats[0].zombuulLives = 1;
    seats[0].isFirstDeathForZombuul = false;

    const action: GameAction = {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "execution", // or execution? Zombuul works on execution too? Yes.
    };

    const result = processGameEvent(seats, "day", action);
    const zombuulSeat = result.seats[0];

    // Should be "False Death"
    expect(zombuulSeat.isDead).toBe(false); // Physically alive
    expect(zombuulSeat.isFirstDeathForZombuul).toBe(true);
    expect(zombuulSeat.zombuulLives).toBe(0);
    expect(result.logs[0]).toContain("假死");
  });

  test("Tea Lady Protection Logic", () => {
    // Setup: Tea Lady (1), Good Neighbor (0), Good Neighbor (2)
    seats[0].role = villager; // Good
    seats[1].role = teaLady; // Good
    seats[2].role = villager; // Good

    const action: GameAction = {
      type: "KILL_PLAYER",
      targetId: 0, // Kill neighbor
      source: "demon",
      killerRoleId: "imp",
    };

    const result = processGameEvent(seats, "night", action);

    // Should be protected
    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs[0]).toContain("被茶艺师保护");
  });

  test("Execution Logic", () => {
    seats[0].role = villager;
    const action: GameAction = {
      type: "EXECUTE_PLAYER",
      targetId: 0,
    };

    const result = processGameEvent(seats, "day", action);

    expect(result.seats[0].isDead).toBe(true);
    expect(result.seats[0].isSentenced).toBe(true);
    expect(result.logs[0]).toContain("被处决");
  });
});
