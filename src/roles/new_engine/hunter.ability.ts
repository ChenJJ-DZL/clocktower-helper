/**
 * 猎手（Hunter）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自角色规则 — 猎手条目）
 * ============================================================
 *
 * 【角色能力】
 *   "如果你在夜晚死亡，你可以在当晚立刻杀死一名玩家。"
 *
 * 【角色简介】
 *   "猎手在夜晚被杀死时，可以拉一个垫背的。
 *    当猎手在夜晚因恶魔或其他原因死亡时，他可以选择一名存活玩家，
 *    该玩家立刻死亡。如果猎手被处决，能力不会触发。
 *    猎手的能力每局游戏只能使用一次。"
 *
 * 【运作方式】
 *   "在夜晚，如果猎手死亡，唤醒猎手。让猎手选择一名存活的玩家。
 *    被选择的玩家死亡——在魔典中将帷幕标记放置在其角色标记上。
 *    如果猎手处于醉酒或中毒状态，他的能力可能无法正常工作。"
 *
 * 【规则细节】
 *   "猎手只能在夜晚死亡时触发能力，白天被处决不会触发。
 *    如果猎手在夜晚因任何原因死亡（被恶魔杀死、被刺客刺杀、被
 *    投毒者毒死等），他都可以选择一名玩家带走。
 *    猎手不能选择已经死亡的玩家。"
 *   → 触发条件：夜晚死亡（不限死亡原因），限一次
 *   → 目标：一名存活玩家
 *
 *   "醉酒或中毒的猎手死亡时，能力可能无法触发，或者目标不会死亡。"
 *   → 能力失效时，猎手无法带走任何人
 *
 * ============================================================
 * 夜晚顺序：PASSIVE（由死亡事件触发，在死亡结算后立即处理）
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
  role?: { id: string; name: string; type: string };
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string }>;
  abilityUsed?: boolean;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：死亡检测 + 是否已使用 + 醉酒/中毒标记
 *
 * 对应规则：
 * - 猎手在夜晚死亡时触发（由 meta.isKilledAtNight 标志位指示）
 * - 能力仅可使用一次
 * - 醉酒/中毒时能力可能不触发
 */
const preCheckDeathAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat) {
    return { ...context, aborted: true, abortReason: "未找到猎手座位" };
  }

  if (seat.abilityUsed) {
    return {
      ...context,
      aborted: true,
      abortReason: "猎手技能已使用过，无法再次触发",
    };
  }

  // 检查猎手是否在夜晚死亡（由系统注入 meta.isKilledAtNight）
  const isKilledAtNight = context.meta.isKilledAtNight === true;

  if (!isKilledAtNight) {
    return {
      ...context,
      aborted: true,
      abortReason: "猎手未在夜晚死亡，技能不触发",
    };
  }

  const effects = seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      isKilledAtNight,
    },
  };
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：判断猎手复仇是否生效。
 *
 * 优先级：
 * 1. storytellerInput.overrideResult — 说书人手动覆盖（决定目标是否死亡）
 * 2. 能力有效（abilityEffective）且目标有效 → 目标死亡
 * 3. 能力失效 → 无事发生
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件自动计算。
 * 目标 ID 由 targetIds 传入（min 1, max 1）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, storytellerInput, targetIds, snapshot } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  let targetDies = false;
  let targetSeatId: number | undefined;

  if (storytellerInput?.overrideResult !== undefined) {
    targetDies = Boolean(storytellerInput.overrideResult);
    if (targetDies && targetIds?.[0] !== undefined) {
      targetSeatId = targetIds[0];
    }
  } else if (abilityEffective && targetIds?.[0] !== undefined) {
    const targetSeat = snapshot.seats.find((s: any) => s.id === targetIds[0]);
    if (targetSeat && targetSeat.isAlive) {
      targetSeatId = targetIds[0];
      targetDies = true;
    }
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        targetDies,
        targetSeatId,
        abilityConsumed: true,
      },
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：应用猎手复仇效果。
 *
 * 执行操作：
 * 1. 标记猎手能力已使用（seat.abilityUsed = true）
 * 2. 如果目标应死亡：标记目标死亡
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const result = meta.abilityResult as
    | {
        targetDies: boolean;
        targetSeatId?: number;
        abilityConsumed: boolean;
      }
    | undefined;

  if (!result) return context;

  const selfSeatId = actionNode.seatId;

  const seats = snapshot.seats.map((seat: any) => {
    if (seat.id === selfSeatId) {
      return { ...seat, abilityUsed: true };
    }
    if (
      result.targetDies &&
      result.targetSeatId !== undefined &&
      seat.id === result.targetSeatId
    ) {
      return {
        ...seat,
        isAlive: false,
        deathReason: "被猎手复仇杀死",
        deathPhase: "night",
      };
    }
    return seat;
  });

  const newSnapshot = {
    ...snapshot,
    seats,
  };

  const persistedRecord = {
    targetDies: result.targetDies,
    targetSeatId: result.targetSeatId,
    abilityConsumed: true,
    timestamp: Date.now(),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        hunterResult: persistedRecord,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 *
 * 输出内容：
 * 1. console.log — 英文 simulation log
 * 2. meta.prompt — 说书人唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const result = meta.abilityResult as
    | {
        targetDies: boolean;
        targetSeatId?: number;
        abilityConsumed: boolean;
      }
    | undefined;

  if (!result) return context;

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const selfLabel = findLabel(actionNode.seatId);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  let simLog: string;
  let storytellerPrompt: string;
  let abilityLog: string;

  if (result.targetDies && result.targetSeatId !== undefined) {
    const targetLabel = findLabel(result.targetSeatId);
    simLog = `[Hunter]${tag} ${selfLabel} killed at night → revenge kill: ${targetLabel}`;
    storytellerPrompt = `猎手在夜晚死亡！请选择一名玩家与你一同死去。你选择了 ${result.targetSeatId + 1} 号。`;
    abilityLog = `猎手${tag}在夜晚死亡，带走了${targetLabel}`;
  } else {
    simLog = `[Hunter]${tag} ${selfLabel} killed at night → no revenge kill (no target / ineffective)`;
    storytellerPrompt =
      "猎手在夜晚死亡，但未能带走任何人（能力无效或无目标）。";
    abilityLog = `猎手${tag}在夜晚死亡，但未能带走任何人`;
  }

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "hunter_revenge",
        targetDies: result.targetDies,
        targetSeatId: result.targetSeatId,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const hunterAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "hunter",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "hunter_death_revenge",
  /** 能力中文名 */
  abilityName: "临死反击",

  /** 触发时机：被动（由夜晚死亡事件触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力，在死亡结算后立即处理）
   * 高于普通夜间行动以在死亡后立即生效
   */
  wakePriority: 0,
  /** 非首夜特定能力 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.hunter.wake",

  /**
   * 目标选择配置
   * 猎手需要选择 1 名存活玩家作为复仇目标
   * min: 1, max: 1 — 必须选择恰好一名存活玩家
   * allowSelf: false — 不能选自己
   * allowDead: false — 只能选择存活玩家
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────

  /** preCheck：前置条件检查（死亡检测 + 是否已使用 + 状态标记） */
  preCheck: [preCheckDeathAndStatus],

  /** calculate：核心效果计算（复仇是否生效） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（标记能力已用 + 目标死亡） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
