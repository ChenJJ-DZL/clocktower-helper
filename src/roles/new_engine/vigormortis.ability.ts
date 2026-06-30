/**
 * 亡骨魔（Vigormortis）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。
 *   [-1外来者]"
 *
 * 每夜杀一人。被杀的爪牙保留能力。邻近镇民中毒。
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
  // 检查目标是否为爪牙
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const isMinion = target?.role?.type === "minion";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, killed: true, minionKeepsAbility: isMinion },
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
        demonRole: "vigormortis",
        minionKeepsAbility: r.minionKeepsAbility,
      },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        vigormortis: r,
      },
    },
    meta: { ...ctx.meta, vigormortisResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const minionNote = r?.minionKeepsAbility ? "（爪牙保留能力）" : "";
  const log =
    r?.targetId != null
      ? `[Vigormortis] 击杀${r.targetId + 1}号${minionNote}`
      : "[Vigormortis] 无目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【亡骨魔】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const vigormortisAbility = createRoleAbility({
  roleId: "vigormortis",
  abilityId: "vigormortis_kill",
  abilityName: "锁魂杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 53,
  firstNightOnly: false,
  wakePromptId: "role.vigormortis.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
