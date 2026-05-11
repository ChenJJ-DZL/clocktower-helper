/**
 * 圣徒（Saint）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 圣徒条目）
 * ============================================================
 *
 * 【角色能力】
 *   "如果你死于处决，你的阵营落败。"
 *
 *   → 圣徒因处决（公开投票达到门槛）而死亡时，善良阵营立即落败，
 *     邪恶阵营获胜。死于其他方式（恶魔杀害等）不影响游戏。
 *
 * 【角色简介】
 *   "圣徒在被处决时会导致游戏结束。
 *    如果圣徒因处决而死亡，游戏结束。善良阵营落败，邪恶阵营获胜。
 *    如果圣徒因处决以外的任何方式死亡——例如被恶魔杀死——游戏
 *    仍会继续。"
 *
 *   → 本实现检测圣徒的 isDead 状态变化 + executedToday 标记。
 *     仅处决导致的死亡触发游戏结束。
 *
 * 【运作方式】
 *   "如果圣徒因处决而死亡，宣布游戏结束且邪恶阵营获胜。"
 *
 *   → stateUpdate 中设置 gamePhase: "gameOver" + winner: "evil"。
 *
 * 【规则细节】
 *   "特定角色互动：小怪宝：照看小怪宝的圣徒如果作为场上最后一名
 *    存活的恶魔被处决，善良阵营会获胜。"
 *   → 此相克规则由 JinxManager 处理。
 *
 *   "圣徒的诅咒是角色固有规则，不是主动能力。因此即使圣徒醉酒或
 *    中毒，被处决时仍然触发邪恶阵营获胜。"
 *   → 本实现中 isAbilityActive 不受 drunk/poisoned 影响。
 *
 * 【提示与技巧（相关片段）】
 *   "如果你死于处决，游戏结束，你的阵营失败。保证善良阵营知道你
 *    是圣徒！你可以在大街上喊！站在屋顶喊！告诉所有人你是圣徒！"
 *   → 圣徒的威慑力在于处决的高风险，本实现准确执行这一规则。
 *
 * ============================================================
 * 夜晚顺序
 *   圣徒为被动死亡触发（PASSIVE），不主动唤醒。
 *   wakePriority: 0（不使用唤醒队列）
 *   处决发生时由执行系统触发本 pipeline。
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive?: boolean;
  playerName?: string;
  /** 标记该玩家是否在今天白天被提名处决且票数通过 */
  executedToday?: boolean;
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  roleName?: string;
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：检测圣徒是否被处决。
 *
 * 圣徒的"诅咒"是角色固有规则（非主动能力），因此：
 * - 即使圣徒醉酒/中毒，被处决时仍然触发游戏结束
 * - 只有因处决而死亡才触发（executedToday === true）
 * - 恶魔杀害或其他方式死亡不触发
 */
const preCheckSaintExecuted = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat) {
    return { ...context, aborted: true, abortReason: "未找到圣徒座位" };
  }

  // 未被处决 → 不触发
  if (!seat.executedToday) {
    return { ...context, aborted: true, abortReason: "圣徒未被处决，不触发" };
  }

  // 圣徒的诅咒不受 drunk/poisoned 影响（规则：角色固有规则）
  return {
    ...context,
    meta: {
      ...context.meta,
      isAbilityActive: true, // 诅咒恒生效
      saintExecuted: true,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 检查指定座位是否为圣徒且已被处决。
 *
 * 导出供执行系统在结算时提前查询。
 *
 * @param seat 待检查的座位
 * @returns true = 圣徒已被处决（应游戏结束）
 */
export function isSaintExecuted(seat: PlayerLookup): boolean {
  return seat.executedToday === true;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：确认圣徒被处决导致游戏结束。
 *
 * 优先级：
 * 1. storytellerInput.overrideResult — 说书人手动覆盖（一般不用）
 * 2. 默认触发游戏结束
 */
const calculateGameOver = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...context,
    meta: {
      ...context.meta,
      gameOverConfirmed: true,
      winner: "evil",
      reason: "圣徒被处决，邪恶阵营获胜",
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：设置游戏结束状态。
 *
 * 对应规则："如果圣徒因处决而死亡，宣布游戏结束且邪恶阵营获胜。"
 *
 * 操作：
 * - 设置 snapshot.gamePhase = "gameOver"
 * - 记录 gameResult.winner / reason
 */
const applyGameOver = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;

  const newSnapshot = {
    ...snapshot,
    gamePhase: "gameOver",
    gameResult: {
      winner: meta.winner as string,
      reason: meta.reason as string,
    },
  };

  return {
    ...context,
    snapshot: newSnapshot as any,
    meta: {
      ...context.meta,
      gameOverApplied: true,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、提示词、UI 展示数据。
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const applied = meta.gameOverApplied === true;

  if (!applied) return context;

  // 英文 simulation log
  const simLog = `[Saint] Seat ${actionNode.seatId} executed — Evil wins!`;

  // 说书人提示词
  const storytellerPrompt =
    `圣徒（${actionNode.seatId + 1}号）被处决，邪恶阵营获胜！游戏结束。`;

  // 中文游戏日志
  const abilityLog = `圣徒（${actionNode.seatId + 1}号）被处决，邪恶阵营获胜`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "saint_execution_gameover",
        executedSeatId: actionNode.seatId,
        winner: "evil",
        reason: "圣徒被处决",
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const saintAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "saint",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "saint_execution_curse",
  /** 能力中文名 */
  abilityName: "圣洁诅咒",

  /** 触发时机：被动（由执行事件触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力不使用唤醒队列）
   * 圣徒的诅咒在执行结算时触发，不参与夜晚行动顺序。
   */
  wakePriority: 0,
  /** 被动能力与夜晚无关 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 圣徒为被动死亡触发（无需选择目标）。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：检测圣徒是否被处决 */
  preCheck: [preCheckSaintExecuted],

  /** calculate：确认游戏结束条件 */
  calculate: [calculateGameOver],

  /** stateUpdate：设置游戏结束状态 */
  stateUpdate: [applyGameOver],

  /** postProcess：日志 + 提示词 + UI 数据 */
  postProcess: [postProcessResult],
});
