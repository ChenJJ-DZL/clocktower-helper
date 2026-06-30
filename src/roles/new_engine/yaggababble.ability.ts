/**
 * 亚加巴布（Yaggababble）新引擎技能实现
 *
 * 【角色能力】"每夜，选择一名玩家。如果有咒语句被说出，该玩家死亡。"
 *
 * 每夜选择一名玩家作为目标。
 * 如果白天有咒语句（curse phrase）被玩家说出，该玩家在夜晚死亡。
 * 咒语句由说书人在 storytellerInput.curseSpoken 中传入。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 亚加巴布死亡时技能不应触发。
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
 * calculate：检测咒语句是否说出并确定目标
 *
 * 从 storytellerInput.curseSpoken 获取咒语句状态。
 * 如果咒语句已被说出，目标玩家死亡。
 * 即使咒语句未被说出，亚加巴布仍可选择目标（为后续轮次做准备）。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "亚加巴布未选择目标" };
  }

  const curseSpoken = !!(ctx.storytellerInput as any)?.curseSpoken;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        curseSpoken,
        willDie: curseSpoken,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：执行诅咒杀戮
 *
 * 如果咒语句已被说出，标记目标玩家为死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number; curseSpoken: boolean; willDie: boolean }
    | undefined;

  if (!abilityResult) return ctx;

  const { targetId, curseSpoken } = abilityResult;
  const updatedSeats = [...ctx.snapshot.seats];

  if (curseSpoken) {
    const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);
    if (targetIdx !== -1) {
      updatedSeats[targetIdx] = {
        ...updatedSeats[targetIdx],
        markedForDeath: true,
        deathSource: "yaggababble_curse",
        deathSourceSeatId: ctx.actionNode.seatId,
      };
    }
  }

  const record = {
    targetId,
    curseSpoken,
    willDie: curseSpoken,
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
        yaggababble: record,
      },
    },
    meta: {
      ...ctx.meta,
      yaggaResult: record,
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
  const record = ctx.meta.yaggaResult as
    | { targetId: number; curseSpoken: boolean; willDie: boolean }
    | undefined;

  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;
  const curseStatus = record.curseSpoken ? "已说出" : "未说出";

  const simLog = `[亚加巴布] ${record.curseSpoken ? `诅咒触发 — ${targetLabel} 将死亡` : `咒语句未说出 — ${targetLabel} 存活`}`;
  const storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【亚加巴布】，选择一名玩家。（咒语句${curseStatus}，${record.curseSpoken ? `${targetLabel}将死亡` : "今夜无人因诅咒死亡"}）`;
  const abilityLog = `亚加巴布选中【${targetLabel}】，咒语句${curseStatus}${record.curseSpoken ? `，【${targetLabel}】将死亡` : ""}`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "yaggababble_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        curseSpoken: record.curseSpoken,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const yaggababbleAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "yaggababble",
  /** 能力标识符 */
  abilityId: "yaggababble_night_curse",
  /** 能力中文名 */
  abilityName: "诅咒咒杀",

  /** 触发时机：每晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔级别） */
  firstNightPriority: 46,
  otherNightPriority: 59,
  /** 首夜可行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.yaggababble.wake",

  /**
   * 目标选择配置
   * 必须选择一名玩家作为诅咒目标。
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
