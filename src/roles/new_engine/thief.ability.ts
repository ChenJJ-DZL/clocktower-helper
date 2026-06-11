/**
 * 小偷（Thief）新引擎技能实现
 *
 * 【角色能力】"每夜可以偷取一名玩家的角色。"
 *
 * 每夜选择一名玩家，偷取其角色能力（原角色保留但能力被窃取）。
 * 目标玩家当晚失去其角色能力。
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
  const targetId = ctx.targetIds?.[0] ?? null;
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
        stolenRole: target?.role ?? null,
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
      thiefTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        thief: r,
      },
    },
    meta: { ...ctx.meta, thiefResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[小偷] 偷取${r.targetId + 1}号角色${r.stolenRole ? `（${r.stolenRole}）` : ""}`
      : "[小偷] 未行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【小偷】，选择一名玩家偷取其角色。`,
      abilityLog: log,
    },
  };
};

export const thiefAbility = createRoleAbility({
  roleId: "thief",
  abilityId: "thief_night",
  abilityName: "窃贼",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 50,
  firstNightOnly: false,
  wakePromptId: "role.thief.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
