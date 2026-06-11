/**
 * 诺-达鲺（No Dashii）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   与你邻近的两名镇民中毒。"
 *
 * 每夜杀一人。邻近镇民中毒。
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
  // 标记邻近镇民中毒
  const seats = ctx.snapshot.seats;
  const selfIdx = seats.findIndex((s: any) => s.id === ctx.actionNode.seatId);
  const adjacentIds = [];
  if (selfIdx > 0) adjacentIds.push(seats[selfIdx - 1]?.id);
  if (selfIdx < seats.length - 1) adjacentIds.push(seats[selfIdx + 1]?.id);
  const poisonedAdjacent = adjacentIds.filter((id: number) => {
    const s = seats.find((x: any) => x.id === id);
    return s?.isAlive && s?.role?.type === "townsfolk";
  });
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, killed: true, poisonedAdjacent },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.killed) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: ctx.actionNode.seatId,
        targetId: r.targetId,
        demonRole: "no_dashii",
      },
      noDashiiPoisoned: r.poisonedAdjacent,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        no_dashii: r,
      },
    },
    meta: { ...ctx.meta, noDashiiResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[NoDashii] 击杀${r.targetId + 1}号，邻近${r.poisonedAdjacent?.length ?? 0}名镇民中毒`
      : "[NoDashii] 无目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【诺-达鲺】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const no_dashiiAbility = createRoleAbility({
  roleId: "no_dashii",
  abilityId: "no_dashii_kill",
  abilityName: "毒素杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 51,
  firstNightOnly: false,
  wakePromptId: "role.no_dashii.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
