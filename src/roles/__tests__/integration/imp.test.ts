import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { impAbility } from "../../new_engine/imp.ability";

function s(id: number, rid: string, rt: string, o?: { dead?: boolean }) {
  const n: Record<string, string> = {
    imp: "小恶魔",
    soldier: "士兵",
    poisoner: "投毒者",
    chef: "厨师",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!o?.dead,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number, nc: number, targetIds: number[]): MiddlewareContext {
  return {
    snapshot: {
      nightCount: nc,
      gamePhase: nc === 1 ? "firstNight" : "night",
      seats: [
        s(0, "imp", "demon"),
        s(1, "soldier", "townsfolk"),
        s(2, "poisoner", "minion"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "imp",
      roleName: "小恶魔",
      priority: 45,
      isFirstNightOnly: false,
      abilityId: "imp_kill",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: 45,
      targetIds,
      processed: false,
      success: false,
      meta: {},
    },
    targetIds,
    meta: {},
    aborted: false,
  };
}
const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});
describe("小恶魔 引擎集成测试", () => {
  test("非首夜杀人", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 2, [1]))).aborted
    ).toBe(false);
  });
  test("首夜不杀人(知爪牙)", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 1, []))).aborted
    ).toBe(true);
  });
  test("自杀传位给爪牙", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 2, [0]))).aborted
    ).toBe(false);
  });
});

/**
 * 🎙️ 说书人「技能修正页」（2026-09-14 用户实测缺陷）
 *
 * 用户附图：恶魔结果页显示「小恶魔试图杀死【1号】，但未能造成伤亡」，
 * 而结果页是**给玩家看的** ⇒ 直接泄漏"击杀被挡下"，
 * 违反官方「恶魔不知道哪一名玩家受到了保护」。
 *
 * 修复要求：
 *   ① `displayInfo.playerFacingLog` = 中性文案「你选择了【X】」（玩家面）；
 *   ② `displayInfo.storytellerCorrection` = 说书人专用真相（含"僧侣保护"）；
 *   ③ 引擎真值 `displayInfo.log` **仍保留**"未能造成伤亡"（说书人控制台/日志不丢真相）。
 */
describe("🎙️ 小恶魔 · 僧侣保护下的结果页信息隔离", () => {
  /** 目标座位挂上僧侣保护（statusEffects: protected） */
  function ctxWithMonkProtection(targetId = 1): MiddlewareContext {
    const c = ctx(0, 2, [targetId]);
    const seats = (c.snapshot.seats as any[]).map((s) =>
      s.id === targetId
        ? { ...s, statusEffects: [{ type: "protected" }] }
        : s
    );
    return { ...c, snapshot: { ...c.snapshot, seats } };
  }

  test("⭐ 玩家面文案是中性「你选择了【X】」，绝不含「未能造成伤亡」", async () => {
    const out: any = await runFullAbilityPipeline(
      pipe(impAbility),
      ctxWithMonkProtection(1)
    );
    const di = out.meta.displayInfo;
    // 夹具座位有 playerName → findLabel 产出「P2(2号)」；关键是不含失败原因
    expect(di.playerFacingLog).toBe("你选择了【P2(2号)】");
    expect(di.playerFacingLog).toContain("2号");
    expect(di.playerFacingLog).not.toContain("未能造成伤亡");
    expect(di.playerFacingLog).not.toContain("保护");
    expect(di.playerFacingLog).not.toContain("僧侣");
  });

  test("⭐ 说书人修正页给出「僧侣保护」真相", async () => {
    const out: any = await runFullAbilityPipeline(
      pipe(impAbility),
      ctxWithMonkProtection(1)
    );
    const c = out.meta.displayInfo.storytellerCorrection;
    expect(c).toBeTruthy();
    expect(c.reason).toBe("monk_protection");
    expect(c.title).toContain("僧侣保护");
    expect(c.detail).toContain("僧侣保护");
  });

  test("⭐ 引擎真值 displayInfo.log 仍保留真相（说书人日志不丢）", async () => {
    const out: any = await runFullAbilityPipeline(
      pipe(impAbility),
      ctxWithMonkProtection(1)
    );
    expect(out.meta.displayInfo.log).toContain("未能造成伤亡");
  });

  test("正常击杀时 playerFacingLog 也只给中性事实（成败留给黎明）", async () => {
    const out: any = await runFullAbilityPipeline(pipe(impAbility), ctx(0, 2, [1]));
    // 目标 2号（1号是士兵 → 免疫）；换一个非士兵目标
    const out2: any = await runFullAbilityPipeline(
      pipe(impAbility),
      ctx(0, 2, [2])
    );
    const di = (out2.meta.displayInfo ?? out.meta.displayInfo) as any;
    expect(di.playerFacingLog).toMatch(/^你选择了【/);
  });
});
