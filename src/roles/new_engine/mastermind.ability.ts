/**
 * 主谋（Mastermind）新引擎技能实现
 *
 * 【角色能力】"如果恶魔在白天被处决，游戏继续到次日。如果次日无人被处决，邪恶获胜。"
 *
 * PASSIVE 触发，检测恶魔是否在白天被处决
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { isDrunkOrPoisoned } from "../../utils/bmrMechanics";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const demonExecuted = ctx.snapshot.demonExecutedToday === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { demonExecuted, gameExtended: demonExecuted },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  /**
   * ⚠️⚠️ 2026-09-21 修复【醉酒/中毒失效门控缺失】：
   * 官方核心规则：醉酒或中毒的玩家**失去其能力**（说书人只装作其仍有能力、走过场执行）。
   * 主谋：`如果恶魔死于处决而因此导致游戏结束时，再额外进行一个夜晚和一个白天。`
   *   ⇒ 主谋醉酒/中毒时，恶魔死后的游戏**应当正常结束**（不得延长）。
   * 🔴 原实现：本文件全篇**无任何**有效性判定，而 `stateUpdate` 在
   *   `src/utils/middlewarePipeline.ts:91` 被**无条件**执行 ⇒ 醉酒/中毒的主谋依然令效果落地。
   * ✅ 修法：状态落地前用 SST `isDrunkOrPoisoned`（→ `utils/seatDisabled::isSeatDisabled`，
   *   已覆盖 `statusEffects` / `statuses` / 中文 `statusDetails`）判定；受干扰时**只记选择、不写状态**。
   */
  {
    const _seats = (ctx.snapshot.seats ?? []) as any[];
    const _actor = _seats.find((s: any) => s.id === ((ctx.snapshot.seats ?? [] as any[]).find((s: any) => s.role?.id === "mastermind" || s.roleId === "mastermind")?.id));
    if (isDrunkOrPoisoned(_actor, _seats)) {
      return {
        ...ctx,
        meta: {
          ...ctx.meta,
          abilityResult: { ...(ctx.meta.abilityResult as any), suppressedByImpairment: true },
        },
      };
    }
  }

  const r = ctx.meta.abilityResult as any;
  if (!r?.gameExtended) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      mastermindActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        mastermind: r,
      },
    },
    meta: { ...ctx.meta, mastermindResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.gameExtended
    ? "[主谋] 恶魔被处决，游戏延长一天"
    : "[主谋] 恶魔未被处决，不触发";
  if (r?.gameExtended) console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const mastermindAbility = createRoleAbility({
  roleId: "mastermind",
  abilityId: "mastermind_extend",
  abilityName: "恶魔延续",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
