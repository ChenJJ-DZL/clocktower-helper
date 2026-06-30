/**
 * 修行者（Pilgrim）新引擎技能实现（实验角色）
 *
 * 【角色能力】"每个夜晚，你会得知距离最近的邪恶玩家方向。"
 *
 * 计算最近邪恶玩家的方向（座位索引差值）。如果左右距离相等，随机选择。
 * 如果没有邪恶玩家存活，得知"没有邪恶玩家"。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const EVIL_TYPES = new Set(["minion", "demon"]);

function calcDirection(seats: any[], selfId: number): string {
  const alive = seats.filter(
    (s: any) =>
      s.id !== selfId && !s.isDead && s.role && EVIL_TYPES.has(s.role.type)
  );
  if (alive.length === 0) return "无邪恶玩家";

  // 计算最近邪恶玩家的方向（基于座位索引差值的绝对值）
  let nearest: any = alive[0];
  let minDist = Infinity;
  for (const e of alive) {
    const dist = Math.abs(e.id - selfId);
    if (dist < minDist) {
      minDist = dist;
      nearest = e;
    }
  }
  return nearest.id < selfId ? "左方" : "右方";
}

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
  const direction = calcDirection(ctx.snapshot.seats, ctx.actionNode.seatId);
  return { ...ctx, meta: { ...ctx.meta, abilityResult: { direction } } };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    meta: { ...ctx.meta, pilgrimResult: r },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        pilgrim: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Pilgrim] 最近邪恶玩家方向: ${r?.direction ?? "未知"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【修行者】，告知${r?.direction ?? "无结果"}。`,
      abilityLog: log,
      displayInfo: { type: "pilgrim_info", direction: r?.direction ?? "", log },
    },
  };
};

export const pilgrimAbility = createRoleAbility({
  roleId: "pilgrim",
  abilityId: "pilgrim_nightly_direction",
  abilityName: "邪恶感知",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.pilgrim.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
