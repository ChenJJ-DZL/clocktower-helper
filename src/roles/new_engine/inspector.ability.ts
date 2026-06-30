/**
 * 检查员（Inspector）新引擎技能实现
 *
 * 【角色能力】"检查一名玩家的角色是否真实。"
 *
 * 被动能力，由说书人手动触发，检查某玩家的宣称角色与其真实角色是否一致。
 * 不主动唤醒，用于验证玩家身份真伪。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const actualRole = target?.role?.name ?? "未知";
  const claimedRole = ctx.storytellerInput?.claimedRole ?? null;
  const isReal = claimedRole != null && actualRole === claimedRole;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        actualRole,
        claimedRole,
        isReal,
        inspectorActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        inspector: r,
      },
    },
    meta: { ...ctx.meta, inspectorResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const resultText = r?.isReal ? "真实" : "虚假";
  const log = `[Inspector] ${r?.targetId != null ? `${r.targetId + 1}号宣称"${r.claimedRole}"，实际"${r.actualRole}"，${resultText}` : "无目标"}`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const inspectorAbility = createRoleAbility({
  roleId: "inspector",
  abilityId: "inspector_passive",
  abilityName: "检查员",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
