/**
 * 末日预言者（Doomsayer）新引擎技能实现
 *
 * 【角色能力】"猜一个角色，如果猜对则该玩家死亡。"
 *
 * 白天选择一名玩家并猜测其角色。若猜测正确，该玩家立即死亡。
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
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const guessedRole =
    ctx.storytellerInput?.guessedRole ??
    (ctx.actionNode as any).guessedRole ??
    null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;
  const isCorrect = guessedRole != null && target?.role === guessedRole;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        guessedRole,
        isCorrect,
        targetDies: isCorrect,
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
      doomsdayActive: r?.isCorrect ?? false,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        doomsayer: r,
      },
    },
    meta: { ...ctx.meta, doomsayerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.isCorrect
    ? `猜中${r.targetId + 1}号身份 → 该玩家死亡`
    : "猜测错误";
  const log =
    r?.targetId != null
      ? `[末日预言者] ${r.targetId + 1}号，猜${r.guessedRole ?? "未知"}：${status}`
      : "[末日预言者] 未行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【末日预言者】，选择一名玩家并猜测其角色。`,
      abilityLog: log,
    },
  };
};

export const doomsayerAbility = createRoleAbility({
  roleId: "doomsayer",
  abilityId: "doomsayer_countdown",
  abilityName: "末日预言",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.doomsayer.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
