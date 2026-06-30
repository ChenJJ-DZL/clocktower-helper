/**
 * 饕餮（Taotie）新引擎技能实现
 *
 * 【角色能力】"中国神话恶魔。每夜，你可以选择吃掉一名玩家，但你会获得其角色标识。"
 *
 * 每夜选择一名玩家将其"吃掉"（杀死），但饕餮会获得该玩家的角色标识信息。
 * 被吃掉的玩家死亡，饕餮知道其角色身份。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 饕餮死亡时技能不应触发。
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
 * calculate：确定被吃掉的目标玩家
 *
 * 饕餮选择一名玩家，将其标记为 consumedTarget。
 * 被吃掉的玩家死亡，饕餮获得其角色标识。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "饕餮未选择目标" };
  }

  // 获取目标玩家的角色信息
  const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const consumedRoleId = target?.role?.id ?? target?.roleId ?? null;
  const consumedRoleName = target?.role?.name ?? target?.roleName ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        consumed: true,
        consumedRoleId,
        consumedRoleName,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：执行吞噬
 *
 * 1. 目标玩家标记为死亡
 * 2. 饕餮获得其角色标识（存储在 taotie.consumedRoles 中）
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | {
        targetId: number;
        consumed: boolean;
        consumedRoleId: string | null;
        consumedRoleName: string | null;
      }
    | undefined;

  if (!abilityResult) return ctx;

  const { targetId, consumedRoleId, consumedRoleName } = abilityResult;
  const updatedSeats = [...ctx.snapshot.seats];

  // 标记目标为死亡（被吃掉）
  const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);
  if (targetIdx !== -1) {
    updatedSeats[targetIdx] = {
      ...updatedSeats[targetIdx],
      markedForDeath: true,
      deathSource: "taotie_consume",
      deathSourceSeatId: ctx.actionNode.seatId,
    };
  }

  // 存储饕餮获得的角色信息
  const consumedTarget = {
    targetId,
    roleId: consumedRoleId,
    roleName: consumedRoleName,
  };

  const record = {
    targetId,
    consumed: true,
    consumedRoleId,
    consumedRoleName,
    nightCount: ctx.snapshot.nightCount ?? 0,
    timestamp: Date.now(),
    // 已吞噬的角色列表（可累积多个）
    consumedRoles: [
      ...(((ctx.snapshot as any)._abilityResults?.taotie as any)
        ?.consumedRoles ?? []),
      consumedTarget,
    ],
  };

  return {
    ...ctx,
    actionNode: {
      ...ctx.actionNode,
      meta: {
        ...ctx.actionNode.meta,
        taotieResult: record,
      },
    },
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        taotie: record,
      },
    },
    meta: {
      ...ctx.meta,
      taotieResult: record,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

/**
 * postProcess：生成日志和说书人提示词
 *
 * 说书人需要知道饕餮获得了什么角色信息。
 */
const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.taotieResult as
    | {
        targetId: number;
        consumedRoleName: string | null;
        consumedRoles: Array<{ targetId: number; roleName: string | null }>;
      }
    | undefined;

  if (!record) return ctx;

  const targetLabel = `${record.targetId + 1}号`;
  const roleInfo = record.consumedRoleName ?? "未知角色";
  const simLog = `[饕餮] 吞噬了 ${targetLabel} (${roleInfo})`;
  const storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【饕餮】，选择一名玩家吃掉。（选择了${targetLabel}，获得了【${roleInfo}】的角色标识）`;
  const abilityLog = `饕餮吃掉了【${targetLabel}】，获得了【${roleInfo}】的角色标识`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "taotie_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        consumedRoleName: record.consumedRoleName,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const taotieAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "taotie",
  /** 能力标识符 */
  abilityId: "taotie_night_consume",
  /** 能力中文名 */
  abilityName: "饕餮吞噬",

  /** 触发时机：每晚 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔级别） */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜可行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.taotie.wake",

  /**
   * 目标选择配置
   * 必须选择一名玩家作为吞噬目标。
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
