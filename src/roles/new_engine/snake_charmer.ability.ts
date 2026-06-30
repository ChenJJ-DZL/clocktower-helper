/**
 * 弄蛇人（Snake Charmer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以选择一名玩家：如果该玩家是恶魔，则交换角色。"
 *
 * 每夜选择一名玩家，若目标为恶魔则弄蛇人与恶魔交换角色和阵营。
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
  const isDemon = target?.role?.type === "demon";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, isDemon, swapTriggered: isDemon },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, snakeCharmerResult: ctx.meta.abilityResult },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.swapTriggered
    ? `[SnakeCharmer] 弄蛇人与${(r.targetId ?? -1) + 1}号恶魔交换了角色`
    : `[SnakeCharmer] 弄蛇人查验${(r?.targetId ?? -1) + 1}号，不是恶魔`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【弄蛇人】，选择一名玩家。`,
    },
  };
};

export const snakeCharmerAbility = createRoleAbility({
  roleId: "snake_charmer",
  abilityId: "snake_charmer_night",
  abilityName: "蛇惑",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 34,
  otherNightPriority: 23,
  firstNightOnly: false,
  wakePromptId: "role.snake_charmer.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
