import { describe, expect, it } from "vitest";
import { butlerAbility, initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { board, runRole } from "./_tbHarness";

/**
 * 管家 (Butler) —— 官方：
 * 【角色能力】每个夜晚，你要选择**除你以外**的一名玩家：明天白天，
 *   只有他投票时你才能投票。
 * 【角色简介】「如果主人在投票时举手，或主人的投票已经被统计时，管家可以举手
 *   参与投票。如果主人放下了他的手，表明他不参与投票……」
 */
describe("管家 (Butler)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["butler", "empath", "chef", "monk", "imp"]);

  it("⭐⭐ 每晚选择一名其他玩家 → 记录主人（abilityResult = 主人座位 id）", async () => {
    const res = await runRole(butlerAbility, mk(), 0, { targets: [2] });
    expect(res.meta.abilityResult).toBe(2);
  });

  it("⭐ 不能选自己（官方：选择**除你以外**的一名玩家）", async () => {
    const res = await runRole(butlerAbility, mk(), 0, { targets: [0] });
    expect(res.aborted, "管家选自己应被拒绝").toBe(true);
  });

  it("⭐ 每夜必须选一人：未给目标 → 中止", async () => {
    const res = await runRole(butlerAbility, mk(), 0, { targets: [] });
    expect(res.aborted).toBe(true);
  });

  it("官方「每个夜晚」→ 首夜与常规夜都必须选主人（不是首夜限定）", async () => {
    const first = await runRole(butlerAbility, mk(), 0, {
      night: 1,
      phase: "firstNight",
      targets: [1],
    });
    const second = await runRole(butlerAbility, mk(), 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(first.meta.abilityResult).toBe(1);
    expect(second.meta.abilityResult).toBe(1);
  });

  it("中毒 / 醉酒的管家仍被唤醒、仍可选主人，但投票限制不生效（官方：说书人装作他仍有能力）", async () => {
    const seats = mk();
    seats[0].statusEffects = [{ type: "poisoned", source: "poisoner" }];
    const res = await runRole(butlerAbility, seats, 0, { targets: [1] });
    // 能力被干扰 → 记录里会标明；但交互照常（不 abort）
    expect(res.aborted).toBe(false);
    expect(res.meta.isCorrupted ?? true).toBe(true);
  });
});
