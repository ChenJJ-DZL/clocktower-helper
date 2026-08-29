/**
 * 舞蛇人（Snake Charmer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名存活的玩家：如果你选中了恶魔，
 *   你和他交换角色和阵营，然后他中毒。"
 *
 * - 每夜选一名存活玩家（不能选自己）。
 * - 选中恶魔 → 舞蛇人与恶魔**交换角色和阵营**（舞蛇人变恶魔、恶魔变舞蛇人），
 *   然后恶魔（变舞蛇人的玩家）中毒。
 * - 未选中恶魔 → 无效果。
 *
 * 网页版适配：角色交换 = 双方座位 role 互换 + 阵营标记互换；中毒 = statusEffects
 * 加 poisoned 标记（UI 层按中毒渲染）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
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
  const isDemon =
    target?.role?.type === "demon" || target?.isDemonSuccessor === true;
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
  const r = ctx.meta.abilityResult as any;
  if (!r?.swapTriggered || r.targetId == null) {
    return { ...ctx, meta: { ...ctx.meta, snakeCharmerResult: r } };
  }

  const selfId = ctx.actionNode.seatId;
  const seats = (ctx.snapshot.seats ?? []) as any[];
  const selfSeat = seats.find((s) => s.id === selfId);
  const targetSeat = seats.find((s: any) => s.id === r.targetId);
  if (!selfSeat || !targetSeat) return ctx;

  // 交换角色与阵营：舞蛇人 → 恶魔角色；原恶魔 → 舞蛇人角色（并中毒）
  const nextSeats = seats.map((s: any) => {
    if (s.id === selfId) {
      return {
        ...s,
        role: { ...targetSeat.role },
        isEvilConverted: true,
        isGoodConverted: false,
      };
    }
    if (s.id === r.targetId) {
      const effects = [...(s.statusEffects ?? [])];
      if (!effects.some((e: any) => e.type === "poisoned")) {
        effects.push({
          type: "poisoned",
          source: "snake_charmer",
          sourceSeatId: selfId,
        });
      }
      return {
        ...s,
        role: { ...selfSeat.role },
        isEvilConverted: false,
        isGoodConverted: true,
        isPoisoned: true,
        statusEffects: effects,
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      snakeCharmerSwapped: { selfId, demonId: r.targetId },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        snake_charmer: r,
      },
    },
    meta: { ...ctx.meta, snakeCharmerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  // 🔧 受干扰标记：舞蛇人中毒/醉酒时能力不生效，结果必须标 isCorrupted（I4 不变式）
  const isCorrupted = ctx.meta.abilityEffective === false;
  const tag = isCorrupted ? "【受干扰】" : "";
  const log = r?.swapTriggered
    ? `[SnakeCharmer]${tag} ${ctx.actionNode.seatId + 1}号舞蛇人与${(r.targetId ?? -1) + 1}号恶魔交换了角色和阵营，恶魔中毒！`
    : `[SnakeCharmer]${tag} ${ctx.actionNode.seatId + 1}号舞蛇人查验${(r?.targetId ?? -1) + 1}号，不是恶魔`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      isCorrupted,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【舞蛇人】，选择一名存活玩家。${
        r?.swapTriggered
          ? `他与${(r.targetId ?? -1) + 1}号恶魔交换了角色和阵营，恶魔中毒。`
          : ""
      }${isCorrupted ? "（该角色处于醉酒/中毒状态，能力不生效）" : ""}`,
      displayInfo: {
        type: r?.swapTriggered ? "snake_charmer_swap" : "snake_charmer_inspect",
        selfId: ctx.actionNode.seatId,
        demonId: r?.targetId ?? null,
        isCorrupted,
        note: r?.swapTriggered ? "交换角色与阵营，恶魔中毒" : "未选中恶魔",
      },
    },
  };
};

export const snakeCharmerAbility = createRoleAbility({
  roleId: "snake_charmer",
  effectSemantics: "swap",
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
