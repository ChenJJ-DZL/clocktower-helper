import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { impAbility, initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { generateDynamicNightQueue } from "../../utils/dynamicQueueGenerator";
import { board, runRole } from "./_tbHarness";

/**
 * 小恶魔 (Imp) —— 官方：
 * 【角色能力】每个夜晚*，你要选择一名玩家：他死亡。
 *   如果你以这种方式**自杀**，一名爪牙会变成小恶魔。
 * 【角色简介】「除首个夜晚以外的每个夜晚，小恶魔会选择一名玩家进行杀戮。」
 */
describe("小恶魔 (Imp)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["imp", "empath", "chef", "baron", "soldier"]);

  it("⭐⭐ 选择一名玩家 → 该玩家被标记死亡（`markedForDeath`，由黎明结算）", async () => {
    const res = await runRole(impAbility, mk(), 0, { targets: [1] });
    expect(res.meta.abilityResult.targetId).toBe(1);
    expect(res.meta.abilityResult.isSuicide).toBe(false);
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    // ⚠️ 引擎的契约是 `markedForDeath`（"由黎明系统结算死亡"），不是立刻 isDead
    expect(
      target.markedForDeath || target.isDead,
      "被选中的玩家应被标记死亡"
    ).toBe(true);
    expect(res.meta.impResult?.targetId ?? res.meta.abilityResult.targetId).toBe(1);
  });

  it("⭐⭐ 自杀（选择自己）→ isSuicide = true，自己死亡", async () => {
    const res = await runRole(impAbility, mk(), 0, { targets: [0] });
    expect(res.meta.abilityResult.isSuicide).toBe(true);
    const self = res.snapshot.seats.find((s: any) => s.id === 0);
    expect(self.isDead, "自杀的小恶魔应死亡").toBe(true);
  });

  it("⭐ 未选目标 → 中止（官方：每个夜晚*必须选一名玩家）", async () => {
    const res = await runRole(impAbility, mk(), 0, { targets: [] });
    expect(res.aborted).toBe(true);
  });

  it("⭐ 士兵免疫恶魔击杀 → 小恶魔选士兵后**无人死亡**", async () => {
    // 官方士兵：「如果小恶魔在夜晚攻击士兵，无事发生。没有任何人会死亡。
    //            小恶魔也不能再去选择攻击另外一名玩家。」
    const res = await runRole(impAbility, mk(), 0, { targets: [4] });
    const soldier = res.snapshot.seats.find((s: any) => s.id === 4);
    expect(soldier.role?.id).toBe("soldier");
    expect(soldier.isDead, "士兵不应被恶魔杀死").toBe(false);
  });

  it("⭐ 官方「除首个夜晚以外」：首夜只有 demon_info 系统步骤，第 2 夜才有自身能力节点", () => {
    const snap = (night: number) => ({
      seats: mk(),
      gamePhase: night === 1 ? "firstNight" : "night",
      nightCount: night,
      statusEffects: {},
      poppyGrowerDead: false,
      reminders: [],
      log: [],
    });
    const q = (night: number) =>
      generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        snap(night) as any,
        { isFirstNight: night === 1 }
      ).filter((n: any) => n.seatId === 0);

    const first = q(1).map((n: any) => n.roleId);
    expect(first, "首夜小恶魔应被 demon_info 唤醒").toContain("demon_info");
    expect(first, "首夜不应有小恶魔自身击杀节点").not.toContain("imp");

    const second = q(2).map((n: any) => n.roleId);
    expect(second, "第 2 夜应有小恶魔自身击杀节点").toContain("imp");
  });
});
