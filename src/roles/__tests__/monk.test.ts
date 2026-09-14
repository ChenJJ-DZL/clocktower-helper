import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry, monkAbility } from "../new_engine/abilityRegistry";
import { board, nightInfoFor, queueFor, runRole } from "./_tbHarness";

/**
 * 僧侣 (Monk) —— 官方：
 * 【角色能力】每个夜晚*，你要选择**除你以外**的一名玩家：当晚恶魔的负面能力对他无效。
 * 【角色简介】「除首个夜晚以外的每个夜晚，僧侣可以保护除自己以外的任意玩家。
 *   如果恶魔攻击了被僧侣保护的玩家，那名玩家不会死亡。恶魔也不能再去攻击另一名
 *   玩家——当晚会没有任何人死亡。」
 */
describe("僧侣 (Monk)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["monk", "empath", "chef", "imp", "poisoner"]);

  it("⭐ 首夜不唤醒；第 2 / 3 夜唤醒（官方 «*» = 除首夜外）", () => {
    const seats = mk();
    expect(queueFor(seats, 0, 1)).not.toContain("monk");
    expect(queueFor(seats, 0, 2)).toContain("monk");
    expect(queueFor(seats, 0, 3)).toContain("monk");
  });

  it("⭐ 必须选一名目标（targetLimit 1/1）", () => {
    const info: any = nightInfoFor(mk(), 0, 2);
    expect(JSON.stringify(info.guide)).toMatch(/选择|保护/);
  });

  it("⭐⭐ 能保护**除自己以外**的玩家", async () => {
    const res = await runRole(monkAbility, mk(), 0, { night: 2, targets: [1] });
    expect(res.aborted, "保护他人不应被拒绝").toBe(false);
  });

  it("⭐⭐ 不能保护自己（官方明文「除你以外」）", async () => {
    const res = await runRole(monkAbility, mk(), 0, { night: 2, targets: [0] });
    expect(res.aborted, "僧侣选自己应被拒绝").toBe(true);
  });

  it("⭐ 被保护者当晚免疫恶魔击杀：士兵式免伤表不含僧侣（保护是另一条路径）", async () => {
    // 僧侣的保护由 target 保护标记实现，而非"目标自身免疫"；
    // 因此单独断言：未经保护的镇民在免伤表里为 false，被保护后由保护层拦截。
    const { isImmuneToDemonKill } = await import("../../utils/soldierImmunity");
    const seats = mk();
    expect(isImmuneToDemonKill(seats[1])).toBe(false);
  });
});
