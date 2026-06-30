/**
 * 向导（Guide）新引擎技能实现
 *
 * 【角色能力】"你可以指引一名玩家如何行动。"
 *
 * 选择一名玩家，给予其行动指引建议。
 * allowSelf: false — 不能指引自己
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
  const guidance = ctx.storytellerInput?.guidance ?? "无具体指引";
  if (targetId == null)
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        guidance,
        guideId: ctx.actionNode.seatId,
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
        guide: r,
      },
    },
    meta: { ...ctx.meta, guideResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[向导] ${ctx.actionNode.seatId + 1}号 指引 ${r.targetId + 1}号: ${r.guidance}`
      : "[向导] 无指引";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【向导】，选择一名玩家给予指引。`,
      abilityLog: log,
    },
  };
};

export const guideAbility = createRoleAbility({
  roleId: "guide",
  abilityId: "guide_instruction",
  abilityName: "向导",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.guide.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
