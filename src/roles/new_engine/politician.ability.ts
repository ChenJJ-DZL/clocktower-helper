/**
 * 政客（Politician）新引擎技能实现
 *
 * 【角色能力】"白天结束时，如果有至少3名玩家提名了你，且你存活，你变成邪恶。"
 *
 * PASSIVE 触发，不唤醒。
 * 检查本日提名列表中是否有至少3次针对政客的提名。
 * 若条件满足且政客存活，将其转化为邪恶阵营。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测
 * 政客死亡时技能不应触发。
 */
const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "玩家已死亡，政客技能失效" };
  }
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：检查本日提名次数
 *
 * 从 snapshot.dayHistory 或 nominations 列表中统计针对政客的提名。
 * 如果有至少3名不同的玩家提名了政客，则触发转化。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seatId = ctx.actionNode.seatId;
  const nominations: Array<{ nominatorId: number; targetId: number }> =
    ctx.snapshot.nominations ?? ctx.snapshot.dayVotes ?? [];

  const uniqueNominators = new Set<number>();
  for (const n of nominations) {
    if (n.targetId === seatId) {
      uniqueNominators.add(n.nominatorId);
    }
  }

  const nominationCount = uniqueNominators.size;
  const converted = nominationCount >= 3;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        nominationCount,
        converted,
        seatId,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：执行阵营转化
 *
 * 如果条件满足（>=3 次提名且存活），将政客的角色类型改为 evil。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { nominationCount: number; converted: boolean; seatId: number }
    | undefined;

  if (!abilityResult?.converted) return ctx;

  const updatedSeats = [...ctx.snapshot.seats];
  const idx = updatedSeats.findIndex((s: any) => s.id === abilityResult.seatId);

  if (idx !== -1) {
    updatedSeats[idx] = {
      ...updatedSeats[idx],
      role: {
        ...(updatedSeats[idx].role ?? {}),
        type: "evil",
      },
      roleType: "evil",
      isEvilConverted: true,
      statusDetails: [
        ...(updatedSeats[idx].statusDetails ?? []),
        "因被累计3次提名已转化为邪恶",
      ],
    };
  }

  const record = {
    ...abilityResult,
    timestamp: Date.now(),
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        politician: record,
      },
    },
    meta: {
      ...ctx.meta,
      politicianResult: record,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

/**
 * postProcess：生成日志和说书人通知
 */
const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.politicianResult as
    | { nominationCount: number; converted: boolean }
    | undefined;

  if (!record) return ctx;

  if (record.converted) {
    const simLog = `[政客] 已转化为邪恶阵营 (被 ${record.nominationCount} 名玩家提名)`;
    const abilityLog = `政客被 ${record.nominationCount} 名玩家提名，已转化为邪恶阵营`;

    console.log(simLog);

    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityLog,
        displayInfo: {
          type: "politician_conversion",
          nominationCount: record.nominationCount,
          converted: true,
          log: abilityLog,
        },
      },
    };
  }

  const simLog = `[政客] 未转化 (被提名 ${record.nominationCount} 次, 需要 >=3 次)`;
  const abilityLog = `政客被提名 ${record.nominationCount} 次，未满足转化条件`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog,
      displayInfo: {
        type: "politician_check",
        nominationCount: record.nominationCount,
        converted: false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const politicianAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "politician",
  /** 能力标识符 */
  abilityId: "politician_conversion_check",
  /** 能力中文名 */
  abilityName: "民选堕落",

  /** 触发时机：被动（白天结束时触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /** 被动机无唤醒优先级 */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜不触发 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 政客不需要选择目标，由系统被动触发。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
