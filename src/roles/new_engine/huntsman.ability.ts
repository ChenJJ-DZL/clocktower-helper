/**
 * 猎人（Huntsman）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以追捕一名指定玩家。"
 *
 * 每夜选择一名玩家作为追捕目标。
 * allowSelf: false — 不能追捕自己
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isVortoxWorldActive } from "../../utils/vortoxWorld";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  if (targetId == null)
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const trueRoleId = target?.roleId ?? target?.role?.id ?? "unknown";

  /**
   * ⭐ 2026-10-20 修复（用户实测：涡流局信息并非 100% 错）：
   * 猎人的追捕结果会告知目标角色（信息类能力）⇒ 受干扰时**必须给假角色**。
   * 旧实现无论干扰与否都直接回显真实 targetRole ⇒ 涡流下真值直漏。
   */
  const hasVortox =
    isVortoxWorldActive(ctx.snapshot.seats as any) ||
    Boolean((ctx.snapshot as any).isVortoxWorld);
  const isCorrupted =
    hasVortox ||
    ctx.meta?.isAbilityActive === false ||
    ctx.meta?.abilityEffective === false;

  let targetRole = trueRoleId;
  if (isCorrupted) {
    // 从在场角色里挑一个 ≠ 真角色的（保持确定性：按 id 排序后取第一个可选）
    const pool = (ctx.snapshot.seats as any[])
      .map((s) => s.role?.id ?? s.roleId)
      .filter((id): id is string => !!id && id !== trueRoleId)
      .sort();
    if (pool.length > 0) targetRole = pool[0];
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isCorrupted,
      hasVortox,
      abilityResult: {
        targetId,
        targetRole,
        huntsmanId: ctx.actionNode.seatId,
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
        huntsman: r,
      },
    },
    meta: { ...ctx.meta, huntsmanResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[猎人] ${ctx.actionNode.seatId + 1}号 追捕 ${r.targetId + 1}号`
      : "[猎人] 未选择目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【猎人】，选择一名玩家追捕。`,
      abilityLog: log,
    },
  };
};

export const huntsmanAbility = createRoleAbility({
  roleId: "huntsman",
  abilityId: "huntsman_night",
  abilityName: "猎人",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 51,
  otherNightPriority: 88,
  firstNightOnly: false,
  wakePromptId: "role.huntsman.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
