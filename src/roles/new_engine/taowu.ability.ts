/**
 * 梼杌（Taowu）新引擎技能实现
 *
 * 【角色能力】"中国神话恶魔。每夜，选择一名玩家。该玩家本夜不可被杀。"
 *
 * 反直觉设计：恶魔保护一名玩家。
 * 被保护的玩家本夜免疫死亡（包括恶魔杀戮、处决等）。
 * 选择的玩家获得 protected 标记，结算系统据此跳过其死亡。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 梼杌死亡时技能不应触发。
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
 * calculate：确定受保护的玩家
 *
 * 梼杌选择一名玩家进行保护。该玩家本夜免疫死亡。
 */
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
        protected: true,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：标记目标为受梼杌保护
 *
 * 被梼杌保护的玩家获得 immunitySource: "taowu" 标记。
 * 结算系统在黎明时将检查此标记，跳过该玩家的死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number; protected: boolean }
    | undefined;

  if (!abilityResult) return ctx;

  const { targetId } = abilityResult;
  const updatedSeats = [...ctx.snapshot.seats];

  // 清除该玩家可能已有的死亡标记
  const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);
  if (targetIdx !== -1) {
    updatedSeats[targetIdx] = {
      ...updatedSeats[targetIdx],
      markedForDeath: false,
      // 添加免疫标记，结算系统识别
      immunitySource: "taowu",
      statusDetails: [
        ...(updatedSeats[targetIdx].statusDetails ?? []),
        "被梼杌保护，本夜免疫死亡",
      ],
    };
  }

  const record = {
    targetId,
    protected: true,
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
        taowu: record,
      },
    },
    meta: {
      ...ctx.meta,
      taowuResult: record,
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
  const record = ctx.meta.taowuResult as
    | { targetId: number; protected: boolean }
    | undefined;

  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;
  const simLog = `[梼杌] 保护了 ${targetLabel}，本夜免疫死亡`;
  const storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【梼杌】，选择一名玩家。该玩家本夜不可被杀。（选择了${targetLabel}，已标记为保护状态）`;
  const abilityLog = `梼杌保护了【${targetLabel}】，该玩家本夜免疫死亡`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "taowu_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        protected: true,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const taowuAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "taowu",
  /** 能力标识符 */
  abilityId: "taowu_night_protect",
  /** 能力中文名 */
  abilityName: "梼杌庇护",

  /** 触发时机：每晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔级别） */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜可行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.taowu.wake",

  /**
   * 目标选择配置
   * 必须选择一名玩家进行保护。
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },

  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
