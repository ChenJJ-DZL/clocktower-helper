/**
 * 穷奇（Qiongqi）新引擎技能实现
 *
 * 【角色能力】"中国神话恶魔。每夜，选择一名玩家。该玩家将会在当夜或次日死亡。"
 *
 * 每夜选择一名玩家，将其标记为死亡目标。
 * 由黎明/次日结算系统决定实际死亡时机。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 穷奇死亡时技能不应触发。
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
 * calculate：确定杀戮目标
 *
 * 穷奇选择一名玩家，该玩家将被标记为死亡目标。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "穷奇未选择目标" };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        markedForDeath: true,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：标记目标为死亡
 *
 * 将目标玩家标记为 markedForDeath，由结算系统在黎明或次日执行死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number; markedForDeath: boolean }
    | undefined;

  if (!abilityResult) return ctx;

  const { targetId } = abilityResult;
  const updatedSeats = [...ctx.snapshot.seats];
  const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);

  if (targetIdx !== -1) {
    updatedSeats[targetIdx] = {
      ...updatedSeats[targetIdx],
      markedForDeath: true,
      deathSource: "qiongqi_kill",
      deathSourceSeatId: ctx.actionNode.seatId,
    };
  }

  const record = {
    targetId,
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
        qiongqi: record,
      },
    },
    meta: {
      ...ctx.meta,
      qiongqiResult: record,
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
  const record = ctx.meta.qiongqiResult as { targetId: number } | undefined;

  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;
  const simLog = `[穷奇] 标记 ${targetLabel} 为死亡目标`;
  const storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【穷奇】，选择一名玩家。该玩家将在当夜或次日死亡。（选择了${targetLabel}）`;
  const abilityLog = `穷奇标记了【${targetLabel}】，将在当夜或次日死亡`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "qiongqi_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const qiongqiAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "qiongqi",
  /** 能力标识符 */
  abilityId: "qiongqi_night_kill",
  /** 能力中文名 */
  abilityName: "凶兽噬杀",

  /** 触发时机：每晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔级别） */
  wakePriority: 40,
  /** 首夜可行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.qiongqi.wake",

  /**
   * 目标选择配置
   * 必须选择一名玩家作为杀戮目标。
   */
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
