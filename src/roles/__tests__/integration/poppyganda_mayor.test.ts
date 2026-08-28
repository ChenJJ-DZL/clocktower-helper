import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { checkGameEnd } from "../../../../app/gameLogic";

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type },
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

describe("镇长：3 人存活平安日好人获胜", () => {
  it("存活 3 人且镇长健康 → 白天无人被处决判好人胜", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Good");
  });

  it("市长中毒时平安日不触发获胜", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk", { isPoisoned: true }),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    if (result.isGameOver) {
      expect(result.reason).not.toBe("市长触发和平获胜条件");
    }
  });

  it("存活人数不是 3 人时平安日不触发", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    if (result.isGameOver) {
      expect(result.reason).not.toBe("市长触发和平获胜条件");
    }
  });
});
