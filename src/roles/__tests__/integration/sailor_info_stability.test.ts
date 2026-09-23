import { describe, expect, it } from "vitest";

import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { sailorAbility } from "../../new_engine/sailor.ability";

/**
 * 水手：**提示预演 ≡ 实际结算**（确定性） + 能力失效时的官方契约
 * ==================================================================
 * 🔴 2026-09-22 重写（原文件有 2 条用例断言的是**已被删除的错误行为**）
 * ------------------------------------------------------------------
 * 旧版直接测 `pickDrunkIdWhenInactive(self, target, rng)`
 * —— 一个「水手醉酒/中毒时，在『自己 / 目标』之间**随机挑一个**让他醉酒」的辅助函数。
 *
 * 🔎 该行为**与官方原文直接矛盾**（`src/data/officialRoleDocs.json` 逐字引用）：
 *   【水手】→【提示标记】→「醉酒」→ 放置条件：
 *     「…由说书人来选择水手醉酒还是水手选择的玩家醉酒，并在对应角色标记旁放置醉酒
 *       提示标记。水手无法选择已死亡的玩家。**若此时水手醉酒中毒，不放置该标记。**」
 * ⇒ 中毒/醉酒的水手**不得让任何人（含自己）醉酒**。
 *
 * ⇒ 生产已删除该辅助函数（删后无调用点 = 死代码），本文件同步改为**官方契约**：
 *   · 失效 ⇒ `drunkId === null` + **任何人**都不得出现 drunk 效果 + 不写 `stateUpdates`
 *   · 正常 ⇒ 目标为**镇民**则目标醉酒；目标为**外来者/爪牙/恶魔**则水手自己醉酒
 *     （官方【角色简介】：「如果水手选择了一个镇民，说书人通常会让该镇民醉酒，
 *        但如果选择了外来者、爪牙或是恶魔，那么说书人通常会让水手自己醉酒。」）
 *
 * ⚠️ 保留原文件的**核心资产**：`preview`（提示预演）与真实结算必须**完全一致**
 *    —— 与上述缺陷无关，是「提示 ≠ 结算」类根因（本项目已复发 3 次）的护栏。
 */

/** 最小 5 人局：水手 0 / 厨师 1（镇民）/ 士兵 2（镇民）/ 圣徒 3（外来者）/ 小恶魔 4（恶魔） */
const seats: any[] = [
  { id: 0, playerName: "水手", isDead: false, role: { id: "sailor", name: "水手", type: "townsfolk" }, statusEffects: [] },
  { id: 1, playerName: "厨师", isDead: false, role: { id: "chef", name: "厨师", type: "townsfolk" }, statusEffects: [] },
  { id: 2, playerName: "士兵", isDead: false, role: { id: "soldier", name: "士兵", type: "townsfolk" }, statusEffects: [] },
  { id: 3, playerName: "圣徒", isDead: false, role: { id: "saint", name: "圣徒", type: "outsider" }, statusEffects: [] },
  { id: 4, playerName: "小恶魔", isDead: false, role: { id: "imp", name: "小恶魔", type: "demon" }, statusEffects: [] },
];

/**
 * 造上下文。
 *
 * ⚠️⚠️ 门控必须走**座位状态**（`statusEffects: [{type:"poisoned"}]`），
 *   **不要**写 `meta.abilityEffective` —— `abilityPriorityCalculation`
 *   （`middlewarePipeline.ts`，注入每个能力 calculate 最前）会**无条件覆写**它，
 *   直接写 meta 等于没写 ⇒ 测出来的是"未中毒"路径（假绿）。
 */
function makeContext(
  preview: boolean,
  opts: { nightCount?: number; targetId?: number; poisoned?: boolean } = {}
): MiddlewareContext {
  const { nightCount = 2, targetId = 1, poisoned = false } = opts;
  const sceneSeats = seats.map((s) => ({ ...s, statusEffects: [...s.statusEffects] }));
  if (poisoned) sceneSeats[0].statusEffects = [{ type: "poisoned" }];
  return {
    snapshot: {
      nightCount,
      gamePhase: nightCount === 1 ? "firstNight" : "night",
      seats: sceneSeats,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "sailor",
      roleName: "1号-水手",
      priority: 23,
      isFirstNightOnly: false,
      abilityId: "sailor_night_ability",
      wakeMessage: "水手，请睁眼",
      firstNightPriority: 23,
      otherNightPriority: 8,
      targetIds: [targetId],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [targetId],
    meta: {},
    aborted: false,
    preview,
  } as any;
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: sailorAbility.preCheck,
      calculate: sailorAbility.calculate,
      stateUpdate: sailorAbility.stateUpdate,
      postProcess: sailorAbility.postProcess,
    },
    ctx
  );

const drunkFxOf = (res: any, id: number): any[] =>
  (((res.snapshot.seats as any[]).find((s: any) => s.id === id)?.statusEffects ??
    []) as any[]).filter((e: any) => e.type === "drunk");

describe("水手：官方契约（失效不放置标记）+ 提示预演 ≡ 实际结算", () => {
  /**
   * ⭐⭐ 本轮修的 P1 —— 官方【提示标记】：「**若此时水手醉酒中毒，不放置该标记。**」
   */
  it("⭐⭐ 中毒 ⇒ drunkId 必须为 null，且**任何人**都不得获得 drunk 效果（官方：不放置标记）", async () => {
    const res = await run(makeContext(false, { poisoned: true, targetId: 1 }));
    expect(res.aborted, "❌ 中毒只是能力失效，不应中止（说书人仍要走过场）").toBe(false);
    expect(
      res.meta.abilityResult.drunkId,
      "❌ 中毒水手仍指定了醉酒者 —— 官方明确「不放置醉酒标记」"
    ).toBeNull();
    expect(
      res.meta.abilityResult.isDrunk,
      "ℹ️ isDrunk 应保留 true（用于向说书人标注本次失效）"
    ).toBe(true);
    // 不得让**任何人**醉酒：目标与水手自己都要检查
    for (const id of [0, 1]) {
      expect(
        drunkFxOf(res, id).length,
        "❌ " + (id + 1) + "号在中毒水手的结算里被施加了 drunk —— 违反官方「不放置标记」"
      ).toBe(0);
    }
    expect(res.meta.stateUpdates, "❌ 不得写出 stateUpdates（没有醉酒要落地）").toBeUndefined();
  });

  /** 官方【角色简介】：目标为镇民 ⇒ 目标醉酒 */
  it("⭐ 正常 + 目标为**镇民** ⇒ 目标醉酒（水手自己不清醒地醉酒）", async () => {
    const res = await run(makeContext(false, { poisoned: false, targetId: 1 }));
    expect(res.meta.abilityResult.drunkId, "❌ 选中镇民时应让镇民醉酒").toBe(1);
    expect(drunkFxOf(res, 1).length, "❌ 目标未落地 drunk 效果").toBe(1);
    expect(drunkFxOf(res, 0).length, "❌ 水手不应同时被自己弄醉").toBe(0);
  });

  /** 官方【角色简介】：目标为外来者/爪牙/恶魔 ⇒ 水手自己醉酒 */
  it("⭐ 正常 + 目标为**外来者** ⇒ 水手自己醉酒（官方：非镇民则说书人通常让水手醉酒）", async () => {
    const res = await run(makeContext(false, { poisoned: false, targetId: 3 }));
    expect(res.meta.abilityResult.drunkId, "❌ 选中外来者时应让水手自己醉酒").toBe(0);
    expect(drunkFxOf(res, 0).length, "❌ 水手未落地 drunk 效果").toBe(1);
    expect(drunkFxOf(res, 3).length, "❌ 目标（外来者）不该被弄醉").toBe(0);
  });

  /**
   * ⚠️ 保留原文件的核心资产：**提示预演 ≡ 实际结算**。
   * 覆盖两条路径（正常 / 失效），防止「说书人照提示念，结果对不上」（同类根因已复发 3 次）。
   */
  it("⭐⭐ 管道预演（preview）与真实结算必须完全一致（正常路径 + 失效路径）", async () => {
    for (const poisoned of [false, true]) {
      const preview = await run(makeContext(true, { poisoned, targetId: 1 }));
      const execute = await run(makeContext(false, { poisoned, targetId: 1 }));
      expect(
        execute.meta.abilityResult,
        "❌ poisoned=" + poisoned + " 时预演与结算的 abilityResult 不一致"
      ).toEqual(preview.meta.abilityResult);

      if (poisoned) {
        // 失效路径：两边都不该写出 stateUpdates
        expect(execute.meta.stateUpdates).toBeUndefined();
        expect(preview.meta.stateUpdates).toBeUndefined();
      } else {
        expect(
          execute.meta.stateUpdates?.targetId,
          "❌ 结算的 stateUpdates 目标与预演给出的 drunkId 不一致"
        ).toBe(preview.meta.abilityResult.drunkId);
      }
    }
  });
});
