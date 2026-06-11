/**
 * 笨蛋（Klutz）新引擎技能实现
 *
 * 【角色能力】"当你第一次死亡时，随机一名善良玩家死亡。"
 *
 * 被动检测笨蛋首次死亡。从存活善良玩家中随机选择一名标记死亡。
 * 若无可杀目标（全场无善良存活），则跳过。
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
  if (seat?.isAlive) return { ...ctx, aborted: true, abortReason: "尚未死亡" };
  // 已触发过则不再触发
  if ((ctx.snapshot as any).klutzTriggered)
    return { ...ctx, aborted: true, abortReason: "已触发过" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 找存活的善良阵营玩家（排除魔鬼、爪牙和自己）
  const goodAlive = ctx.snapshot.seats.filter(
    (s: any) =>
      s.isAlive &&
      s.id !== ctx.actionNode.seatId &&
      s.role?.team !== "minion" &&
      s.role?.team !== "demon"
  );
  const target =
    goodAlive.length > 0
      ? goodAlive[Math.floor(Math.random() * goodAlive.length)]
      : null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId: target?.id ?? null,
        killed: target != null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.killed) return ctx;
  // 标记目标玩家死亡
  const updatedSeats = ctx.snapshot.seats.map((s: any) =>
    s.id === r.targetId ? { ...s, isAlive: false } : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      klutzTriggered: true,
      klutzKill: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        klutz: r,
      },
    },
    meta: { ...ctx.meta, klutzResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.killed
    ? `随机杀死 ${(r.targetId ?? 0) + 1} 号玩家`
    : "无可杀目标";
  const log = `[笨蛋] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测笨蛋死亡效果。",
      abilityLog: log,
    },
  };
};

export const klutzAbility = createRoleAbility({
  roleId: "klutz",
  abilityId: "klutz_death",
  abilityName: "笨手笨脚",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
