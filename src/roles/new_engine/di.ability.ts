/**
 * 帝（Di）新引擎技能实现
 *
 * 【角色能力】"每局一次，选择一名玩家，该玩家获得特殊能力。"
 *
 * 每局游戏仅可使用一次。选择一名存活玩家赋予特殊能力标记。
 * allowSelf: true — 可以选择自己
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
  // 检查是否已使用
  const used = (ctx.snapshot as any)._abilityResults?.di?.used ?? false;
  if (used) return { ...ctx, aborted: true, abortReason: "能力已使用" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  if (targetId == null)
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        used: true,
        empowered: true,
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
        di: r,
      },
    },
    meta: { ...ctx.meta, diResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[帝] ${ctx.actionNode.seatId + 1}号 赋予 ${r.targetId + 1}号 特殊能力`
      : "[帝] 未使用";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【帝】，选择一名玩家赋予其特殊能力。`,
      abilityLog: log,
    },
  };
};

export const diAbility = createRoleAbility({
  roleId: "di",
  abilityId: "di_empower",
  abilityName: "帝",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.di.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
