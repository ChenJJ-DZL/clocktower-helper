import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { getDemonKillImmunityType, isImmuneToDemonKill } from "../../utils/soldierImmunity";
import { seat } from "./_tbHarness";

/**
 * 镇长 (Mayor) —— 官方：
 * 【角色能力】如果只有**三名玩家存活**且**白天没有人被处决**，你的阵营获胜。
 *   如果**你在夜晚即将死亡**，可能会有一名其他玩家代替你死亡。
 * 【角色简介】「如果镇长被攻击且即将死去时，说书人可以选择另一名玩家死亡。
 *   没有人会得知该玩家的死亡原因。」
 */
describe("镇长 (Mayor)", () => {
  /** 恰好 3 人存活：镇长 + 恶魔 + 一名镇民 */
  const threeAlive = () => [seat(0, "mayor"), seat(1, "imp"), seat(2, "empath")];

  it("⭐⭐ 仅 3 人存活 + 平安日（无人被处决）→ 镇长阵营获胜", () => {
    const res = checkGameEnd(threeAlive() as any, "execution", null);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("镇长");
  });

  it("⭐ 4 人存活 + 平安日 → 不触发和平获胜", () => {
    const seats = [...threeAlive(), seat(3, "chef")];
    const res = checkGameEnd(seats as any, "execution", null);
    expect(res.reason ?? "").not.toContain("镇长");
  });

  it("⭐ 3 人存活但**有人被处决** → 不触发（须是平安日）", () => {
    const res = checkGameEnd(threeAlive() as any, "execution", 2);
    expect(res.reason ?? "").not.toContain("镇长");
  });

  it("中毒 / 醉酒的镇长不触发和平获胜", () => {
    // ⚠️ 判据用 `isPoisoned` / `isDrunk` 布尔位（生产由 computeIsPoisoned 同步）
    const poisoned = threeAlive();
    poisoned[0] = {
      ...poisoned[0],
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "poisoner" }],
    };
    expect(
      checkGameEnd(poisoned as any, "execution", null).reason ?? ""
    ).not.toContain("镇长");

    const drunkMayor = threeAlive();
    drunkMayor[0] = { ...drunkMayor[0], isDrunk: true };
    expect(
      checkGameEnd(drunkMayor as any, "execution", null).reason ?? ""
    ).not.toContain("镇长");
  });

  it("⭐ 夜晚将死时：镇长存活且 ≥3 人 → 免疫类型为 mayor（可由他人代死）", () => {
    expect(getDemonKillImmunityType(seat(0, "mayor"), 3)).toBe("mayor");
    expect(getDemonKillImmunityType(seat(0, "mayor"), 5)).toBe("mayor");
  });

  it("⭐ 存活不足 3 人 → 镇长不再获得代死保护（官方：仅三人及以上）", () => {
    expect(getDemonKillImmunityType(seat(0, "mayor"), 2)).toBeNull();
  });

  it("镇长的代死保护与士兵不同：它**不是**绝对免疫（免疫表里 mayor ≠ soldier）", () => {
    // isImmuneToDemonKill 只覆盖"绝对免疫"（士兵/水手/弄臣）；
    // 镇长的保护是"可能由他人代死"，走 getDemonKillImmunityType 的 mayor 分支。
    expect(isImmuneToDemonKill(seat(0, "mayor"))).toBe(false);
    expect(getDemonKillImmunityType(seat(0, "mayor"), 5)).toBe("mayor");
  });
});
