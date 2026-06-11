/**
 * 国王（King）新引擎技能实现
 *
 * 【角色能力】"如果你被处决，你会得知所有爪牙玩家。"
 *
 * PASSIVE 触发：被处决时找出所有 minion 类型角色并告知说书人。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const minions = ctx.snapshot.seats.filter(
    (s: any) => s.role?.type === "minion"
  );
  const targetIds = minions.map((s: any) => s.id);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetIds, found: targetIds.length > 0 },
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
        king: r,
      },
    },
    meta: { ...ctx.meta, kingResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.found
    ? `[国王] 得知爪牙: ${r.targetIds.map((id: number) => `${id + 1}号`).join("、")}`
    : "[国王] 无处决或无爪牙";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "国王被处决，告知其所有爪牙身份。",
      abilityLog: log,
    },
  };
};

export const kingAbility = createRoleAbility({
  roleId: "king",
  abilityId: "king_execution",
  abilityName: "被处决得知爪牙",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
