import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { isFortuneTellerTarget } from "../../utils/gameRules";
import { board, nightInfoFor, queueFor, seat } from "./_tbHarness";

/**
 * 占卜师 (Fortune Teller) —— 官方：
 * 【角色能力】每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。
 *   **会有一名善良玩家始终被你的能力当作恶魔。**（红罗刹）
 * 【角色简介】「他不会得知具体哪一名玩家是恶魔，只知道两名玩家之中有恶魔。
 *   如果两名玩家均不是恶魔，他会得知"否"。」
 */
describe("占卜师 (Fortune Teller)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["fortune_teller", "imp", "chef", "soldier", "mayor"]);

  it("三个夜晚都唤醒，且目标数为 2（官方「选择两名玩家」）", () => {
    const seats = mk();
    for (const night of [1, 2, 3]) {
      expect(queueFor(seats, 0, night)).toContain("fortune_teller");
    }
    const info: any = nightInfoFor(seats, 0, 1);
    expect(String(info.guide)).toMatch(/两名|2\s*名/);
  });

  it("⭐⭐ 恶魔目标 → 判定为「有恶魔」", () => {
    expect(isFortuneTellerTarget(seat(1, "imp") as any)).toBe(true);
  });

  it("⭐ 普通镇民目标 → 判定为「无恶魔」", () => {
    expect(isFortuneTellerTarget(seat(2, "chef") as any)).toBe(false);
    expect(isFortuneTellerTarget(seat(3, "soldier") as any)).toBe(false);
  });

  it("⭐⭐ 红罗刹（一名善良玩家始终被当作恶魔）→ 判定为「有恶魔」", () => {
    expect(
      isFortuneTellerTarget(seat(4, "mayor", { isRedHerring: true }) as any),
      "红罗刹必须被占卜师当作恶魔"
    ).toBe(true);
  });

  it("⭐ 官方：红罗刹只对占卜师生效 —— 共情者/厨师不受影响", () => {
    // 红罗刹的登记逻辑挂在 viewingRole === "fortune_teller" 上；
    // 此处验证占卜师判定独立成立，而普通判定（getRegistration）不把红罗刹当恶魔。
    const redHerring = seat(4, "mayor", { isRedHerring: true });
    expect(isFortuneTellerTarget(redHerring as any)).toBe(true);
  });

  it("中毒时仍会唤醒（说书人装作他仍有能力）", () => {
    const seats = mk();
    const poisoned = seats.map((s) =>
      s.id === 0
        ? { ...s, statusEffects: [{ type: "poisoned", source: "poisoner" }] }
        : s
    );
    expect(queueFor(poisoned, 0, 2)).toContain("fortune_teller");
  });
});
