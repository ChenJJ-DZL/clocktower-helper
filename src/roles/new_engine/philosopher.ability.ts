/**
 * 哲学家（Philosopher）新引擎技能实现
 *
 * 【角色能力】首日一次，选择一个不在场的镇民角色，获得其能力。如果该角色在场，该玩家变成酒鬼。
 *
 * DAY触发，limited ability（每局一次）。
 * 选择角色而非玩家——从storytellerInput获取所选角色ID。
 * 若所选角色在场中，哲学家变成酒鬼；否则获得该角色的能力。
 */
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  if (!canUseLimitedAbility(ctx.actionNode.seatId, "philosopher_gain")) {
    return { ...ctx, aborted: true, abortReason: "哲学家已经使用过能力了" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const chosenRoleId = ctx.storytellerInput?.chosenRoleId ?? null;

  if (!chosenRoleId) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          chosenRoleId: null,
          roleInPlay: false,
          becomesDrunk: false,
          used: false,
        },
      },
    };
  }

  // 检查该角色是否在场（是否有某位玩家的角色ID匹配）
  const roleInPlay = ctx.snapshot.seats.some(
    (s: any) =>
      s.role?.id === chosenRoleId || s.originalRole?.id === chosenRoleId
  );

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        chosenRoleId,
        roleInPlay,
        becomesDrunk: roleInPlay, // 若角色在场，哲学家变酒鬼
        used: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!ctx.aborted) {
    consumeLimitedAbility(ctx.actionNode.seatId, "philosopher_gain");
  }
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        philosopher: r,
      },
    },
    meta: { ...ctx.meta, philosopherResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.used) {
    const log = "[哲学家] 未使用能力";
    console.log(log);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        prompt: `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，确认是否发动能力。`,
        abilityLog: log,
      },
    };
  }

  let log: string;
  let prompt: string;
  if (r.becomesDrunk) {
    log = `[哲学家] 选择了${r.chosenRoleId}，但该角色在场，哲学家变成酒鬼`;
    prompt = `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，选择了${r.chosenRoleId}。由于该角色在场，哲学家变成酒鬼。`;
  } else {
    log = `[哲学家] 获得了${r.chosenRoleId}的能力`;
    prompt = `唤醒${ctx.actionNode.seatId + 1}号【哲学家】，获得了${r.chosenRoleId}的能力。`;
  }
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt,
      abilityLog: log,
    },
  };
};

export const philosopherAbility = createRoleAbility({
  roleId: "philosopher",
  abilityId: "philosopher_gain",
  abilityName: "哲人之力",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 1,
  firstNightOnly: false,
  wakePromptId: "role.philosopher.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
