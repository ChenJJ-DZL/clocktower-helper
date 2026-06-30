/**
 * 旅馆服务员（Inn Attendant）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以保护一名玩家免受伤害。"
 *
 * 每夜选择一名玩家施加保护效果，使其免疫夜间死亡。
 * allowSelf: true — 可以保护自己
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
  if (targetId == null)
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        protected: true,
        innAttendantId: ctx.actionNode.seatId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  // 为目标添加保护状态
  const updatedSeats = ctx.snapshot.seats.map((s: any) =>
    s.id === r?.targetId
      ? {
          ...s,
          statusEffects: [
            ...(s.statusEffects ?? []),
            { type: "protected", source: "inn_attendant" },
          ],
        }
      : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        inn_attendant: r,
      },
    },
    meta: { ...ctx.meta, innAttendantResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[旅馆服务员] ${ctx.actionNode.seatId + 1}号 保护 ${r.targetId + 1}号`
      : "[旅馆服务员] 未保护";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【旅馆服务员】，选择一名玩家保护。`,
      abilityLog: log,
    },
  };
};

export const inn_attendantAbility = createRoleAbility({
  roleId: "inn_attendant",
  abilityId: "inn_attendant_protect",
  abilityName: "旅馆服务员",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.inn_attendant.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
