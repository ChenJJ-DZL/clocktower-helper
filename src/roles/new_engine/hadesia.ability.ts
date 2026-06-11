/**
 * 哈德西亚（Hadesia）新引擎技能实现
 *
 * 【角色能力】"每夜，选择一名死亡玩家。该玩家复活并变成爪牙。"
 *
 * 每夜选择一名已死亡的玩家，让其复活并转化为爪牙阵营。
 * allowDead: true — 必须选择已死亡的玩家
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 哈德西亚死亡时技能不应触发。
 */
const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：确定目标玩家
 *
 * 哈德西亚必须选择一名已死亡的玩家。
 * 目标通过 targetIds[0] 传入。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "哈德西亚未选择目标" };
  }

  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  if (target?.isAlive !== false) {
    return { ...ctx, aborted: true, abortReason: "目标玩家尚未死亡，技能无效" };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, resurrected: true, convertedToMinion: true },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：执行复活和转化
 *
 * 1. 目标玩家复活（isDead: false, markedForDeath: false）
 * 2. 目标玩家转化为爪牙（role.type = "minion"）
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number; resurrected: boolean; convertedToMinion: boolean }
    | undefined;

  if (!abilityResult) return ctx;

  const { targetId } = abilityResult;
  const updatedSeats = [...ctx.snapshot.seats];
  const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);

  if (targetIdx !== -1) {
    updatedSeats[targetIdx] = {
      ...updatedSeats[targetIdx],
      isDead: false,
      isAlive: true,
      markedForDeath: false,
      deathSource: undefined,
      deathSourceSeatId: undefined,
      role: {
        ...(updatedSeats[targetIdx].role ?? {}),
        type: "minion",
      },
      roleType: "minion",
      statusDetails: [
        ...(updatedSeats[targetIdx].statusDetails ?? []),
        "被哈德西亚复活并转化为爪牙",
      ],
    };
  }

  const record = {
    targetId,
    resurrected: true,
    convertedToMinion: true,
    nightCount: ctx.snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        hadesia: record,
      },
    },
    meta: {
      ...ctx.meta,
      hadesiaResult: record,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

/**
 * postProcess：生成日志和说书人提示词
 */
const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.hadesiaResult as
    | { targetId: number; resurrected: boolean }
    | undefined;

  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;

  const simLog = `[哈德西亚] 复活了 ${targetLabel} 并转化为爪牙`;
  const storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【哈德西亚】，选择一名已死亡的玩家。该玩家将复活并变成爪牙。（选择了${targetLabel}，已复活转化）`;
  const abilityLog = `哈德西亚复活了【${targetLabel}】并将其转化为爪牙`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "hadesia_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        resurrected: true,
        convertedToMinion: true,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const hadesiaAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "hadesia",
  /** 能力标识符 */
  abilityId: "hadesia_resurrect",
  /** 能力中文名 */
  abilityName: "复活与转化",

  /** 触发时机：每晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔级别，与 imp 一致） */
  wakePriority: 40,
  /** 首夜可行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.hadesia.wake",

  /**
   * 目标选择配置
   * 必须选择一名已死亡的玩家。
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },

  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
