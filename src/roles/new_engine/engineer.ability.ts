/**
 * 工程师（Engineer）新引擎技能实现
 *
 * 【角色能力】"首夜，你可以选择让所有爪牙变成不在场的新爪牙角色。"
 *
 * 首夜全局开关：说书人执行爪牙角色替换。
 * min:0, max:0 — 不选目标玩家，是全局开关。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const used = ctx.storytellerInput?.swapped ?? false;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        swappedMinions: used,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.swappedMinions) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      minionsReplaced: true,
      engineerUsed: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        engineer: r,
      },
    },
    meta: { ...ctx.meta, engineerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Engineer] ${r?.swappedMinions ? "发动能力：所有爪牙被替换" : "未使用能力"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【工程师】，确认是否发动爪牙替换能力。`,
      abilityLog: log,
    },
  };
};

export const engineerAbility = createRoleAbility({
  roleId: "engineer",
  abilityId: "engineer_first_night",
  abilityName: "爪牙改造",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 24,
  otherNightPriority: 9,
  firstNightOnly: true,
  wakePromptId: "role.engineer.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
