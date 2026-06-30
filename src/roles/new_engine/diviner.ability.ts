/**
 * 预言家（Diviner）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以选择一名玩家，查验其阵营。"
 *
 * 每夜选择一名玩家，预言家得知该玩家的所属阵营（善良或邪恶）。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  if (!target)
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { targetId: null, alignment: "未知" },
      },
    };
  const alignment =
    target.role?.type === "townsfolk" || target.role?.type === "outsider"
      ? "善良"
      : "邪恶";
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetId, alignment } },
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
        diviner: r,
      },
    },
    meta: { ...ctx.meta, divinerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[Diviner] 预言家查验${r.targetId + 1}号：${r.alignment}阵营`
      : "[Diviner] 预言家未查验";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【预言家】，选择一名玩家查验阵营。`,
    },
  };
};

export const divinerAbility = createRoleAbility({
  roleId: "diviner",
  abilityId: "diviner_detect",
  abilityName: "阵营预知",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.diviner.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
