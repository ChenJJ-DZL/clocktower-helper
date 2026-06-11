/**
 * 罂粟种植者（Poppy Grower）新引擎技能实现
 *
 * 【角色能力】"当罂粟种植者存活时，邪恶玩家互不认识。"
 *
 * PASSIVE 触发，不唤醒。
 * 存活时设置 poppyGrowerActive 标记，引擎据此隐藏邪恶玩家之间的身份信息。
 * 死亡时清除该标记。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：罂粟种植者始终可以触发，无需条件。
 */
const preCheckTrivial = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：检测罂粟种植者当前是否存活
 *
 * 从 snapshot.seats 中找到罂粟种植者的座位，检查 isAlive 状态。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const poppySeat = ctx.snapshot.seats.find(
    (s: any) => s.roleId === "poppy_grower" || s.role?.id === "poppy_grower"
  );

  const isAlive = poppySeat?.isAlive !== false; // 未找到时认为已死亡
  const poppyGrowerActive = !!poppySeat && isAlive;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        poppyGrowerActive,
        poppySeatId: poppySeat?.id ?? null,
        isAlive,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：设置 / 清除 poppyGrowerActive 标记
 *
 * 罂粟种植者存活时，snapshot.evilHidden = true，引擎据此隐藏邪恶玩家互识信息。
 * 死亡时，snapshot.evilHidden = false 或移除该标记。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | {
        poppyGrowerActive: boolean;
        poppySeatId: number | null;
        isAlive: boolean;
      }
    | undefined;

  if (!abilityResult) return ctx;

  const record = {
    poppyGrowerActive: abilityResult.poppyGrowerActive,
    nightCount: ctx.snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      evilHidden: abilityResult.poppyGrowerActive,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        poppy_grower: record,
      },
    },
    meta: {
      ...ctx.meta,
      poppyResult: record,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

/**
 * postProcess：生成日志
 */
const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.poppyResult as
    | { poppyGrowerActive: boolean }
    | undefined;

  if (!record) return ctx;

  const status = record.poppyGrowerActive ? "激活（存活）" : "失效（死亡）";
  const simLog = `[罂粟种植者] ${status}`;
  const abilityLog = `罂粟种植者${status}，邪恶阵营互识${record.poppyGrowerActive ? "已隐藏" : "已恢复"}`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog,
      displayInfo: {
        type: "poppy_grower_status",
        active: record.poppyGrowerActive,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const poppy_growerAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "poppy_grower",
  /** 能力标识符 */
  abilityId: "poppy_hide_evil",
  /** 能力中文名 */
  abilityName: "罂粟迷雾",

  /** 触发时机：被动（持续生效） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /** 被动机无唤醒优先级 */
  wakePriority: 0,
  /** 首夜有效 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 罂粟种植者不需要选择目标。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  preCheck: [preCheckTrivial],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
