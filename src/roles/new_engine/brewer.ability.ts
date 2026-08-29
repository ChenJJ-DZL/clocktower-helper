/**
 * 酿酒师（Brewer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一个镇民角色：当他下一次通过自身能力获取信息时，
 *   改为得知你给出的信息。"
 *
 * - 说书人选择一个"镇民角色"（不是玩家），并给出一个信息文本。
 * - 该角色下一次通过自身能力获取信息时，得知酿酒师给出的信息（即使该角色醉酒/中毒）。
 * - 信息替换一次后失效（可每晚重新设置，覆盖旧效果）。
 * - 说书人解释的规则等信息（非角色能力所得）不受影响。
 *
 * 网页版适配：效果数据写入 snapshot.brewerEffect，全局钩子 applyBrewerEffect
 * 在信息角色结算时替换其信息产物（displayInfo/abilityResult），UI 弹窗直接展示。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const input = ctx.storytellerInput ?? {};
  const targetRoleId: string | null =
    input.targetRoleId ?? input.roleId ?? null;
  const message: string | null = input.message ?? input.info ?? null;

  if (!targetRoleId || !message) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "等待说书人输入：镇民角色 + 信息",
    };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetRoleId,
        message,
        brewerActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetRoleId) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      // 每晚覆盖旧效果（酿酒师影响持续到该角色下次获取信息）
      brewerEffect: { roleId: r.targetRoleId, message: r.message },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        brewer: r,
      },
    },
    meta: { ...ctx.meta, brewerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Brewer] 选择镇民角色【${r.targetRoleId}】，下次其获取信息时告知："${r.message}"`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【酿酒师】：选择一名镇民角色并给出信息。已设置：${r.targetRoleId} → "${r.message}"`,
      displayInfo: {
        type: "brewer_set",
        targetRoleId: r.targetRoleId,
        message: r.message,
      },
      abilityLog: log,
    },
  };
};

export const brewerAbility = createRoleAbility({
  roleId: "brewer",
  abilityId: "brewer_info_override",
  abilityName: "酿酒师",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 35,
  otherNightPriority: 35,
  firstNightOnly: false,
  wakePromptId: "role.brewer.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
  // 全局机制声明：信息替换（管线 after_calculate 阶段自动应用）
  globalRules: [
    {
      id: "brewer_override",
      type: "info_override",
      phase: "after_calculate",
      order: 10,
    },
  ],
});
