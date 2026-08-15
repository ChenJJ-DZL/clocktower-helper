/**
 * 梼杌（Taowu）新引擎技能实现
 *
 * 【角色能力】（官方 Wiki，2026-08-15 对齐）
 *   "每个夜晚*，你要选择一名玩家：他死亡。当你将要死亡时，改为一名存活且
 *   具有能力的爪牙失去能力。你不会得知恶魔信息。"
 *
 * 【角色简介】
 *   - 梼杌能够从自己的爪牙处汲取力量并延长生命。
 *   - 梼杌即将死亡时，若有存活且具有能力的爪牙 → 梼杌不死亡，其中一名爪牙失去能力。
 *   - 若所有存活爪牙都不具有能力 → 梼杌仍然死亡。
 *   - "具有能力" = 未被中毒/醉酒/失去能力。
 *   - 梼杌不会得知恶魔信息（网页版：不展示恶魔同伴信息）。
 *
 * 【网页版适配】替死由击杀方路径调用 taowuImmunity.tryTaowuSubstitute。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { isImmuneToDemonKill } from "../../utils/soldierImmunity";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "梼杌已死亡，技能失效" };
  }
  if ((ctx.snapshot.nightCount ?? 1) === 1) {
    return { ...ctx, aborted: true, abortReason: "首夜，梼杌不行动" };
  }
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "梼杌未选择目标" };
  }
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isCorrupted: ctx.meta.isCorrupted ?? false,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number }
    | undefined;
  if (!abilityResult) return ctx;

  const { targetId } = abilityResult;
  const nightCount = ctx.snapshot.nightCount ?? 0;
  const seats = [...(ctx.snapshot.seats as any[])];
  const targetIdx = seats.findIndex((s: any) => s.id === targetId);

  const record: Record<string, any> = {
    targetId,
    nightCount,
    timestamp: Date.now(),
  };

  if (targetIdx !== -1) {
    const target = seats[targetIdx];
    const protected_ =
      target.statusEffects?.some((e: any) => e.type === "protected") ||
      (target as any).isProtected;
    // 士兵/镇长免疫
    const aliveCount = seats.filter((s: any) => !s.isDead).length;
    const immune = isImmuneToDemonKill(target, true, aliveCount);

    if (protected_ || immune) {
      record.blocked = true;
    } else {
      seats[targetIdx] = {
        ...target,
        markedForDeath: true,
        diedAtNight: nightCount,
        killedBy: "taowu",
        deathSource: "taowu_kill",
        deathSourceSeatId: ctx.actionNode.seatId,
      };
      record.killed = true;
    }
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        taowu: record,
      },
    },
    meta: { ...ctx.meta, taowuResult: record },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.taowuResult as Record<string, any> | undefined;
  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;
  let abilityLog: string;
  if (record.blocked) {
    abilityLog = `梼杌选择【${targetLabel}】，但目标受保护或免疫，未死亡`;
  } else {
    abilityLog = `梼杌杀死【${targetLabel}】`;
  }
  console.log(`[Taowu] ${abilityLog}`);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【梼杌】，选择一名玩家。（${abilityLog}）`,
      abilityLog,
      displayInfo: {
        type: "taowu_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        killed: !record.blocked,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const taowuAbility = createRoleAbility({
  roleId: "taowu",
  effectSemantics: "kill",
  abilityId: "taowu_night_kill",
  abilityName: "梼杌噬杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 46,
  firstNightOnly: false,
  wakePromptId: "role.taowu.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
