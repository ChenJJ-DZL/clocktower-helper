import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { monkAbility } from "../../new_engine/monk.ability";

function s(id: number, rid: string, rt: string, o?: { drunk?: boolean }) {
  const n: Record<string, string> = {
    monk: "僧侣",
    soldier: "士兵",
    imp: "小恶魔",
    washerwoman: "洗衣妇",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isDrunk: !!o?.drunk,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: o?.drunk ? [{ type: "drunk" }] : [],
    hasAbilityEvenDead: false,
  };
}
function ctx(
  sid: number,
  nc: number,
  phase: string,
  seats: ReturnType<typeof s>[],
  targetIds?: number[]
): MiddlewareContext {
  return {
    snapshot: { nightCount: nc, gamePhase: phase, seats, statusEffects: {} },
    actionNode: {
      seatId: sid,
      roleId: "monk",
      roleName: "僧侣",
      priority: 24,
      isFirstNightOnly: false,
      abilityId: "monk_night",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: 24,
      targetIds: targetIds || [1],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: targetIds || [1],
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

/** 取某座位上 source==="monk" 的 protected 效果个数 */
const monkProtCount = (seat: any): number =>
  (seat?.statusEffects ?? []).filter(
    (e: any) => e?.type === "protected" && e?.source === "monk"
  ).length;

describe("僧侣 引擎集成测试", () => {
  // ── 1. 状态真变更：保护标记必须真的写到目标座位 ──────────────────
  test("选择目标 → 目标座位真的挂上 protected(source=monk) 效果", async () => {
    const ss = [
      s(0, "monk", "townsfolk"),
      s(1, "soldier", "townsfolk"),
      s(2, "imp", "demon"),
    ];
    const res: any = await runFullAbilityPipeline(
      pipe(monkAbility),
      ctx(0, 2, "night", ss, [1])
    );
    expect(res.aborted).toBe(false);

    const outSeats = res.snapshot.seats;
    const target = outSeats.find((x: any) => x.id === 1);
    const monkSelf = outSeats.find((x: any) => x.id === 0);
    const other = outSeats.find((x: any) => x.id === 2);

    // 🔒 关键：不是"没崩"，而是"标记真的写进去了"
    expect(monkProtCount(target), "目标座位应恰有 1 条僧侣保护").toBe(1);
    expect(
      target.statusEffects.find(
        (e: any) => e.type === "protected" && e.source === "monk"
      ),
      "保护效果应记录来源座位与生效夜"
    ).toMatchObject({ sourceSeatId: 0, appliedAtNight: 2 });
    expect(monkProtCount(monkSelf), "僧侣本人不应被标记").toBe(0);
    expect(monkProtCount(other), "非目标座位不应被标记").toBe(0);
  });

  // ── 2. 单夜替换而非叠加：旧保护必须被清掉 ────────────────────────
  test("🔴 次夜改保另一人 → 旧目标的僧侣保护被清除（不叠加、不留双 🛡️）", async () => {
    const ss = [
      s(0, "monk", "townsfolk"),
      s(1, "soldier", "townsfolk"),
      s(2, "washerwoman", "townsfolk"),
    ];
    // 模拟：昨夜（night 1）僧侣曾保护 1 号，遗留标记仍在
    (ss[1] as any).statusEffects = [
      { type: "protected", source: "monk", sourceSeatId: 0, appliedAtNight: 1 },
    ];

    const res: any = await runFullAbilityPipeline(
      pipe(monkAbility),
      ctx(0, 2, "night", ss, [2]) // 次夜改保 2 号
    );
    expect(res.aborted).toBe(false);

    const outSeats = res.snapshot.seats;
    const oldTarget = outSeats.find((x: any) => x.id === 1);
    const newTarget = outSeats.find((x: any) => x.id === 2);

    expect(monkProtCount(newTarget), "新目标应挂 1 条保护").toBe(1);
    expect(
      monkProtCount(oldTarget),
      "旧目标的僧侣保护必须被清除，否则两处同时挂 🛡️（违反『每夜只能保护一人』）"
    ).toBe(0);
  });

  // ── 3. 不误伤他人：非僧侣来源的 protected 必须保留 ────────────────
  test("🔴 清理只针对 source=monk：他人（如士兵自身/其他来源）的保护不得被误删", async () => {
    const ss = [
      s(0, "monk", "townsfolk"),
      s(1, "soldier", "townsfolk"),
      s(2, "washerwoman", "townsfolk"),
    ];
    // 1 号（旧目标）同时挂着**非僧侣来源**的保护
    (ss[1] as any).statusEffects = [
      { type: "protected", source: "soldier", sourceSeatId: 1, appliedAtNight: 1 },
      { type: "protected", source: "monk", sourceSeatId: 0, appliedAtNight: 1 },
    ];
    // 2 号（新目标）也挂着非僧侣来源的保护
    (ss[2] as any).statusEffects = [
      { type: "protected", source: "other", appliedAtNight: 1 },
    ];

    const res: any = await runFullAbilityPipeline(
      pipe(monkAbility),
      ctx(0, 2, "night", ss, [2])
    );
    const outSeats = res.snapshot.seats;
    const oldTarget = outSeats.find((x: any) => x.id === 1);
    const newTarget = outSeats.find((x: any) => x.id === 2);

    expect(monkProtCount(oldTarget), "旧目标的僧侣保护应被清").toBe(0);
    expect(
      (oldTarget.statusEffects ?? []).some(
        (e: any) => e.type === "protected" && e.source === "soldier"
      ),
      "非僧侣来源的保护必须原样保留（清理不能一刀切）"
    ).toBe(true);
    expect(
      (newTarget.statusEffects ?? []).some(
        (e: any) => e.type === "protected" && e.source === "other"
      ),
      "新目标上既有的非僧侣保护必须保留"
    ).toBe(true);
    expect(monkProtCount(newTarget), "新目标应新增 1 条僧侣保护").toBe(1);
  });

  // ── 4. 首夜不唤醒 ────────────────────────────────────────────────
  test("首夜不唤醒", async () => {
    expect(
      (
        await runFullAbilityPipeline(
          pipe(monkAbility),
          ctx(0, 1, "firstNight", [
            s(0, "monk", "townsfolk"),
            s(1, "soldier", "townsfolk"),
          ])
        )
      ).aborted
    ).toBe(true);
  });

  // ── 5. 醉酒失效 ──────────────────────────────────────────────────
  test("醉酒 → 保护不生效（目标座位不得被挂 protected 标记）", async () => {
    const ss = [
      s(0, "monk", "townsfolk", { drunk: true }),
      s(1, "soldier", "townsfolk"),
    ];
    const res: any = await runFullAbilityPipeline(
      pipe(monkAbility),
      ctx(0, 2, "night", ss, [1])
    );
    expect(res.aborted).toBe(false);
    // 醉酒时管道仍执行，但abilityEffective=false ⇒ 不得写保护
    const target = res.snapshot.seats.find((x: any) => x.id === 1);
    expect(
      monkProtCount(target),
      "醉酒僧侣不得给目标挂保护（否则等于技能未失效）"
    ).toBe(0);
  });
});
