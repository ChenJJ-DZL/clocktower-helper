/**
 * 风琴手（Organ Grinder）新引擎技能实现
 *
 * 【角色能力】"当风琴手存活时，好人不能确定谁投了谁的票。"
 *
 * PASSIVE 触发，标记 organGrinderActive 到 snapshot，效果由 UI 层实现隐藏投票。
 * 风琴手死亡后 organGrinderActive 消失。
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        organGrinderActive: true,
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
      organGrinderActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        organGrinder: r,
      },
    },
    meta: { ...ctx.meta, organGrinderResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[风琴手] 风琴手存活，投票显示已隐藏";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【风琴手】，投票信息已对好人隐藏。",
      abilityLog: log,
    },
  };
};

export const organ_grinderAbility = createRoleAbility({
  roleId: "organ_grinder",
  abilityId: "organ_vote_hide",
  abilityName: "风琴手",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 36,
  otherNightPriority: 27,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
