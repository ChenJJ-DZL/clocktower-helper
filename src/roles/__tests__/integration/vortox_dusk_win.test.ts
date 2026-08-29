import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { checkGameEnd } from "../../../../app/gameLogic";

/**
 * 涡流（Vortox）黄昏胜利专项：
 * 官方 Wiki "如果白天没人被处决，邪恶阵营获胜"（流放旅行者不算）。
 *  此判定应在黄昏阶段（白天结束）触发，不应等到处决阶段。
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

describe("涡流：黄昏阶段（check_phase）今日无人被处决 → 邪恶胜", () => {
  it("涡流在场 + 白天无任何处决 + check_phase 判定 → 邪恶胜", () => {
    const seats: Seat[] = [
      makeSeat(0, "vortox", "demon"),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(3, "soldier", "townsfolk"),
      makeSeat(4, "poisoner", "minion"),
    ];
    const result = checkGameEnd(seats, "check_phase", null, {
      isVortoxWorld: true,
      todayHasExecution: false,
    });
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Evil");
    expect(result.reason).toContain("涡流");
  });

  it("涡流在场 + 白天有处决 + 存活邪恶<存活善良 → 涡流黄昏胜利被有处决的事实阻止", () => {
    // 存活 1 涡流 + 2 镇民，1 镇民白天被处决
    const seats: Seat[] = [
      makeSeat(0, "vortox", "demon"),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(3, "soldier", "townsfolk", { isDead: true }), // 白天被处决
      makeSeat(4, "poisoner", "minion", { isDead: true }),
    ];
    const result = checkGameEnd(seats, "check_phase", null, {
      isVortoxWorld: true,
      todayHasExecution: true,
    });
    // 涡流黄昏胜利被有处决的事实阻止；进入存活 3 vs 0 邪恶速胜分支
    // （存活 3 恶魔 1：因 aliveCount <= 2 不满足，但 1 ≥ 2？不，1 < 2 → 不进入"存活≤2"分支）
    // 实际会进入存活邪恶（1）≥ 存活善良（2）？ 不，1 < 2 → 不邪恶速胜
    // 所以应是游戏继续或按其他分支
    if (result.isGameOver) {
      // 不应因涡流黄昏胜利（无今日执行）判负
      expect(result.reason).not.toContain("涡流");
    } else {
      expect(result.winner).toBeNull();
    }
  });

  it("涡流不在场 + 白天无任何处决 + check_phase 判定 → 不应因涡流胜利", () => {
    const seats: Seat[] = [
      makeSeat(0, "imp", "demon"),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(3, "soldier", "townsfolk"),
      makeSeat(4, "poisoner", "minion"),
    ];
    const result = checkGameEnd(seats, "check_phase", null, {
      isVortoxWorld: false,
      todayHasExecution: false,
    });
    if (result.isGameOver) {
      expect(result.winner).not.toBe("Evil");
    }
  });
});
