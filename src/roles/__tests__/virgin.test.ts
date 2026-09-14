import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry, virginAbility } from "../new_engine/abilityRegistry";
import { board, runRole } from "./_tbHarness";

/**
 * 贞洁者 (Virgin) —— 官方：
 * 【角色能力】当你首次被提名时，如果提名你的玩家是镇民，他立刻被处决。
 * 【角色简介】「只有镇民才会被贞洁者的能力处决。如果外来者，爪牙或恶魔提名了
 *   贞洁者，无事发生，并且提名流程会继续。」
 * 【提示标记】不论贞洁者是否醉酒中毒，都要放置「失去能力」标记。
 *
 * 归属判定（注册制）：
 *   · 镇民 → 触发
 *   · 间谍 → 触发（可被当作**善良镇民**）
 *   · 陌客 → **不触发**（官方陌客条目穷举可被当作的角色类型为
 *     「外来者、爪牙或恶魔」——**不含镇民**）
 */
describe("贞洁者 (Virgin)", () => {
  initializeAbilityRegistry();

  /** 造一局：位 0 贞洁者，位 1 提名者（角色可替换） */
  async function nominateBy(nominatorRoleId: string, opts: any = {}) {
    const b = board(["virgin", nominatorRoleId, "empath", "baron", "imp"]);
    return runRole(virginAbility, b, 0, {
      phase: "day",
      meta: { nominatorId: 1, ...(opts.meta ?? {}) },
    });
  }

  it("⭐⭐ 提名者是**镇民** → 提名者立刻被处决", async () => {
    const res = await nominateBy("empath");
    expect(res.meta.abilityResult.shouldExecute).toBe(true);
    expect(res.meta.abilityResult.executedSeatId).toBe(1);
  });

  it("⭐ 提名者是**爪牙 / 恶魔 / 外来者** → 无事发生（官方「无事发生，提名流程继续」）", async () => {
    for (const rid of ["baron", "imp", "saint"]) {
      const res = await nominateBy(rid);
      expect(
        res.meta.abilityResult.shouldExecute,
        `${rid} 提名不应触发处决`
      ).toBe(false);
      expect(res.meta.abilityResult.executedSeatId).toBeUndefined();
    }
  });

  it("⭐⭐ 提名者是**陌客** → 不触发（陌客可被当作的角色类型不含镇民）", async () => {
    // 官方陌客：「你可能会被当作邪恶阵营、爪牙角色或恶魔角色」
    //          「陌客能在同一个夜晚的不同能力中分别被当作善良或邪恶阵营，
    //           外来者、爪牙或恶魔角色。」→ 永不为镇民
    const res = await nominateBy("recluse");
    expect(
      res.meta.abilityResult.shouldExecute,
      "陌客登记为邪恶，不是镇民 → 不应被贞洁者处决"
    ).toBe(false);
  });

  it("提名者是**间谍** → 触发（可被当作善良镇民）", async () => {
    const res = await nominateBy("spy");
    expect(res.meta.abilityResult.shouldExecute).toBe(true);
  });

  it("自己提名自己 → 不触发（但能力仍被消耗）", async () => {
    const b = board(["virgin", "empath", "baron", "imp"]);
    const res = await runRole(virginAbility, b, 0, {
      phase: "day",
      meta: { nominatorId: 0 },
    });
    expect(res.meta.abilityResult.shouldExecute).toBe(false);
    expect(res.meta.abilityResult.abilityConsumed).toBe(true);
  });

  it("官方「不论是否醉酒中毒都要放置失去能力标记」→ 被干扰时仍标记 abilityConsumed", async () => {
    const b = board(["virgin", "empath", "baron", "imp"]);
    const b2 = b.map((s) =>
      s.id === 0
        ? { ...s, statusEffects: [{ type: "poisoned", source: "poisoner" }] }
        : s
    );
    const res = await runRole(virginAbility, b2, 0, {
      phase: "day",
      meta: { nominatorId: 1 },
    });
    expect(res.meta.abilityResult.abilityConsumed).toBe(true);
    expect(
      res.meta.abilityResult.shouldExecute,
      "中毒的贞洁者能力不生效 → 不应处决提名者"
    ).toBe(false);
  });

  it("首次之后的能力消耗：已使用过的贞洁者不再触发", async () => {
    const b = board(["virgin", "empath", "baron", "imp"]);
    b[0].abilityUsed = true;
    const res = await runRole(virginAbility, b, 0, {
      phase: "day",
      meta: { nominatorId: 1 },
    });
    expect(res.aborted).toBe(true);
  });
});
