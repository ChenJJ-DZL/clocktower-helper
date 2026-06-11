/**
 * 医生（Doctor）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：该玩家今晚不会死亡。"
 *
 * 每夜选择一名玩家保护，使其免受夜间死亡。
 * allowSelf: true — 可以保护自己
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
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        protected: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      protectedTonight: [
        ...((ctx.snapshot as any).protectedTonight ?? []),
        r.targetId,
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        doctor: r,
      },
    },
    meta: { ...ctx.meta, doctorResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.targetId != null ? `保护${r.targetId + 1}号` : "未行动";
  const log = `[Doctor] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【医生】，选择一名玩家保护。`,
      abilityLog: log,
    },
  };
};

export const doctorAbility = createRoleAbility({
  roleId: "doctor",
  abilityId: "doctor_protect",
  abilityName: "医疗保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 23,
  firstNightOnly: false,
  wakePromptId: "role.doctor.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
