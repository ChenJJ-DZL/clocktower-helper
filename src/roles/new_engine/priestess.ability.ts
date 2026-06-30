/**
 * 女祭司（High Priestess）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知一名说书人认为你最应该与其交流的玩家。"
 *
 * 每夜得知一名玩家（由说书人决定，或随机选择）。
 * 得知的玩家可以是存活或死亡，善良或邪恶。
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
  const candidates = ctx.snapshot.seats.filter(
    (s: any) => s.id !== ctx.actionNode.seatId
  );
  // prefer storyteller input, fallback to random
  const target = ctx.storytellerInput?.targetId
    ? candidates.find((s: any) => s.id === ctx.storytellerInput.targetId)
    : candidates[Math.floor(Math.random() * candidates.length)];
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId: target?.id ?? candidates[0]?.id ?? 0 },
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
    meta: { ...ctx.meta, priestessResult: r },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        priestess: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  const log = `[Priestess] 告知 ${r.targetId + 1}号玩家最值得交流`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【女祭司】，告知${r.targetId + 1}号是最值得交流的玩家。`,
      abilityLog: log,
      displayInfo: { type: "priestess_info", player: r.targetId, log },
    },
  };
};

export const priestessAbility = createRoleAbility({
  roleId: "priestess",
  abilityId: "priestess_nightly_ability",
  abilityName: "神谕指引",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.priestess.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
