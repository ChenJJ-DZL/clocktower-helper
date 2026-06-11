/**
 * 魔眼（Ojo）新引擎技能实现
 *
 * 【角色能力】"可以看到一名玩家的真实角色。"
 *
 * 被动能力：魔眼可以窥视一名玩家的真实角色信息。
 * 不主动唤醒，由说书人手动触发查看。
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
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        roleName: target?.role?.name ?? "未知",
        roleId: target?.role?.id ?? "未知",
        roleType: target?.role?.type ?? "未知",
        ojoActive: true,
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
        ojo: r,
      },
    },
    meta: { ...ctx.meta, ojoResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Ojo] ${r?.targetId != null ? `${r.targetId + 1}号真实角色为${r.roleName}（${r.roleType}）` : "无目标"}`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const ojoAbility = createRoleAbility({
  roleId: "ojo",
  abilityId: "ojo_passive",
  abilityName: "魔眼",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
