/**
 * 方古（Fang Gu）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   如果该玩家是外来者，他变成方古且不死亡。在你死后你变成死亡的方古。
 *   [+1外来者]"
 *
 * 每夜杀一人。如目标是外来者，目标变成方古且不死亡。
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
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;
  const isOutsider = target?.role?.type === "outsider";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        killed: !isOutsider,
        becomesFangGu: isOutsider,
        isOutsider,
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
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: r.targetId,
        demonRole: "fang_gu",
      },
      fangGuJump: r.becomesFangGu ? r.targetId : null,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        fang_gu: r,
      },
    },
    meta: { ...ctx.meta, fangGuResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const action = r?.becomesFangGu
    ? "→ 外来者变方古（不死亡）"
    : `击杀${r?.targetId != null ? r.targetId + 1 + "号" : ""}`;
  const log = `[FangGu] ${action}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【方古】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const fang_guAbility = createRoleAbility({
  roleId: "fang_gu",
  abilityId: "fang_gu_kill",
  abilityName: "外来者猎杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 49,
  firstNightOnly: false,
  wakePromptId: "role.fang_gu.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
