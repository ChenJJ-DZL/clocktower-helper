import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { checkGameEnd } from "../../../../app/gameLogic";

/**
 * 镜像双子（Evil Twin）胜负判定专项：
 * 当邪恶双子与善良双子都存活时，恶魔全灭不立即判善良获胜。
 *  （依据：官方 Wiki "如果你们都存活，善良阵营无法获胜"）
 */

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
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

describe("镜像双子：两双子都存活时恶魔全灭不判善良胜", () => {
  it("2 个恶魔被杀 + 双子都存活 → 游戏继续（不判善良胜）", () => {
    const seats: Seat[] = [
      makeSeat(0, "evil_twin", "minion", { isGoodTwin: false }),
      makeSeat(1, "washerwoman", "townsfolk", { isGoodTwin: true }),
      makeSeat(2, "fortune_teller", "townsfolk"),
      makeSeat(3, "monk", "townsfolk"),
      // 双恶魔都已死亡
      makeSeat(4, "imp", "demon", { isDead: true }),
      makeSeat(5, "vortox", "demon", { isDead: true }),
    ];
    const result = checkGameEnd(seats, "execution", 4, {
      evilTwinPair: { goodId: 1, evilId: 0 },
    });
    // 期望：双子都存活 → 游戏继续，不返回 Good
    if (result.isGameOver) {
      expect(result.winner).not.toBe("Good");
    } else {
      expect(result.winner).toBeNull();
    }
  });

  it("双子都存活 + 恶魔全灭 + 邪恶过半 → 应判邪恶胜", () => {
    const seats: Seat[] = [
      makeSeat(0, "evil_twin", "minion"),
      makeSeat(1, "washerwoman", "townsfolk", { isGoodTwin: true }),
      makeSeat(2, "fortune_teller", "townsfolk", { isDead: true }),
      makeSeat(3, "monk", "townsfolk", { isDead: true }),
      makeSeat(4, "imp", "demon", { isDead: true }),
    ];
    const result = checkGameEnd(seats, "execution", 4, {
      evilTwinPair: { goodId: 1, evilId: 0 },
    });
    // 期望：存活邪恶（双子）≥ 存活善良 → 邪恶胜
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Evil");
  });

  it("邪恶双子死亡（善良双子存活）→ 恶魔全灭后，邪恶双子不再阻挡", () => {
    const seats: Seat[] = [
      makeSeat(0, "evil_twin", "minion", { isDead: true }),
      makeSeat(1, "washerwoman", "townsfolk", { isGoodTwin: true }),
      makeSeat(2, "fortune_teller", "townsfolk"),
      makeSeat(3, "monk", "townsfolk"),
      makeSeat(4, "imp", "demon", { isDead: true }),
    ];
    const result = checkGameEnd(seats, "execution", 4, {
      evilTwinPair: { goodId: 1, evilId: 0 },
    });
    // 邪恶双子已死 → 阻挡解除 → 善良胜
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Good");
  });
});
