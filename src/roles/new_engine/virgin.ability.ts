/**
 * 贞洁者（Virgin）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 贞洁者条目）
 * ============================================================
 *
 * 【角色能力】
 *   "当你首次被提名时，如果提名你的玩家是镇民，他立刻被处决。"
 *
 * 【角色简介】
 *   "贞洁者不会被处决……也许吧。提名贞洁者的玩家通常会死亡。
 *    如果一名镇民提名了贞洁者，那名镇民会立即被处决。
 *    只有镇民才会被贞洁者的能力处决。如果外来者，爪牙或恶魔
 *    提名了贞洁者，无事发生，并且提名流程会继续。"
 *
 * 【运作方式】
 *   "如果首次提名贞洁者的玩家是镇民，立即宣布那名发起提名的玩家
 *    被处决。那名玩家死亡——在魔典中将帷幕标记放置在其角色标记上。
 *    贞洁者失去他的能力——将贞洁者的'失去能力'提示标记放置在其
 *    角色标记旁。终止提名流程并推进至夜晚阶段。
 *    如果首次提名贞洁者的玩家不是镇民，照常继续进行投票。贞洁者
 *    失去他的能力——将贞洁者的'失去能力'提示标记放置在其角色标记旁。"
 *
 * 【提示标记】
 *   "放置时机：在贞洁者被首次提名时。
 *    放置条件：在贞洁者角色标记旁放置。不论贞洁者是否醉酒中毒，
 *    都要放置该标记。
 *    移除时机：贞洁者死亡或离场时。"
 *   → 能力消耗（abilityUsed）与醉酒/中毒无关：无论是否有效，
 *     首次提名后贞洁者永久失去能力。
 *
 * 【规则细节】
 *   "如果提名贞洁者的玩家其镇民角色不会因为处决而死亡（如弄臣、
 *    水手或被魔鬼代言人保护的玩家），则说书人会宣布该玩家被处决
 *    但没有死亡（不会说明具体原因），然后因为有处决发生，所以
 *    白天阶段依然会立即结束。"
 *   → 处决发生但目标可能不死亡（受保护）。本实现标记执行处决
 *     动作，由保护层决定实际死亡。
 *
 *   "如果提名贞洁者的玩家是镇民，他立刻被处决。"
 *   → 提名者是间谍时也可以触发（间谍可被当作镇民）。
 *   → 隐士有 50% 概率被当作镇民触发。
 *   → 提名自己时无效果（但能力仍消耗）。
 *
 * ============================================================
 * 夜晚顺序：PASSIVE（白天提名时触发，无固定夜晚顺序）
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
 * preCheck 第 1 步：存活检测 + 是否已使用 + 醉酒/中毒标记
 *
 * 对应规则：
 * - 只有存活且能力未被使用的贞洁者才能触发本能力
 * - 醉酒/中毒会使能力无效，但能力仍被消耗（规则：不论是否醉酒中毒
 *   都要放置"失去能力"标记）
 * - 提名者信息通过 meta.nominatorId 传入
 */
const preCheckAliveAndUnused = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  if (seat.abilityUsed) {
    return {
      ...context,
      aborted: true,
      abortReason: "贞洁者技能已使用过，无法再次触发",
    };
  }

  const effects =
    seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  const nominatorId = context.meta.nominatorId as number | undefined;
  const nominator: PlayerLookup | undefined =
    nominatorId !== undefined
      ? snapshot.seats.find((s: any) => s.id === nominatorId)
      : undefined;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      nominator,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 判断提名者是否能触发贞洁者的处决效果。
 *
 * 规则：
 * - 镇民（role.type === "townsfolk"）必然触发
 * - 间谍（spy）可被当作镇民 → 必然触发
 * - 隐士（recluse）有 50% 概率被当作镇民
 * - 提名自己（self-nomination）→ 不触发
 */
function isEligibleNominator(
  nominator: PlayerLookup,
  selfSeatId: number,
  meta: Record<string, any>
): boolean {
  if (!nominator || nominator.id === selfSeatId) return false;

  const roleId = nominator.role?.id ?? "";
  const roleType = nominator.role?.type ?? "";

  if (roleId === "spy") return true;

  if (roleId === "recluse") {
    const key = `virgin_recluse_${nominator.id}`;
    if (meta[key] === undefined) {
      meta[key] = Math.random() < 0.5;
    }
    return meta[key] as boolean;
  }

  return roleType === "townsfolk";
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：判断贞洁者能力是否触发，及处决对象。
 *
 * 优先级：
 * 1. storytellerInput.overrideResult — 说书人手动完全覆盖（boolean）
 * 2. 能力有效（abilityEffective）时动态判定
 * 3. 醉酒/中毒 → 不处决（但能力仍消耗）
 *
 * 注意：abilityEffective 由 abilityPriorityCalculation 中间件自动注入。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;
  const nominator = meta.nominator as PlayerLookup | undefined;

  let shouldExecute = false;
  let executedSeatId: number | undefined;

  if (storytellerInput?.overrideResult !== undefined) {
    shouldExecute = Boolean(storytellerInput.overrideResult);
    if (shouldExecute && nominator) {
      executedSeatId = nominator.id;
    }
  } else if (abilityEffective && nominator) {
    shouldExecute = isEligibleNominator(nominator, selfSeatId, meta);
    if (shouldExecute) {
      executedSeatId = nominator.id;
    }
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        shouldExecute,
        executedSeatId,
        abilityConsumed: true,
      },
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：持久化贞洁者能力结果。
 *
 * 执行操作：
 * 1. 标记贞洁者能力已使用（seat.abilityUsed = true）
 * 2. 如果应处决提名者：标记其死亡（executedToday + deathPhase = "nomination"）
 * 3. 如果处决发生：取消今日提名阶段
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const result = meta.abilityResult as
    | {
        shouldExecute: boolean;
        executedSeatId?: number;
        abilityConsumed: boolean;
      }
    | undefined;

  if (!result) return context;

  const selfSeatId = actionNode.seatId;

  let seats = snapshot.seats.map((seat: any) => {
    if (seat.id === selfSeatId) {
      return { ...seat, abilityUsed: true };
    }
    return seat;
  });

  if (result.shouldExecute && result.executedSeatId !== undefined) {
    seats = seats.map((seat: any) => {
      if (seat.id === result.executedSeatId) {
        return {
          ...seat,
          isAlive: false,
          executedToday: true,
          deathReason: "被贞洁者处决",
          deathPhase: "nomination",
        };
      }
      return seat;
    });
  }

  const newSnapshot = {
    ...snapshot,
    seats,
  };

  if (result.shouldExecute) {
    (newSnapshot as any).votingPhase = {
      ...snapshot.votingPhase,
      isCancelled: true,
      cancelReason: "贞洁者技能触发，今日提名阶段结束",
    };
  }

  const persistedRecord = {
    shouldExecute: result.shouldExecute,
    executedSeatId: result.executedSeatId,
    abilityConsumed: true,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        virginResult: persistedRecord,
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
 * 2. meta.prompt — 说书人提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as
    | {
        shouldExecute: boolean;
        executedSeatId?: number;
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

  const selfSeatId = context.actionNode.seatId;
  const selfLabel = findLabel(selfSeatId);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  let simLog: string;
  let storytellerPrompt: string;
  let abilityLog: string;

  if (result.shouldExecute && result.executedSeatId !== undefined) {
    const targetLabel = findLabel(result.executedSeatId);
    simLog = `[Virgin]${tag} ${selfLabel} nominated → nominator (${targetLabel}) executed`;
    storytellerPrompt =
      `贞洁者被提名！提名者 ${result.executedSeatId + 1} 号是镇民，已被立即处决。`;
    abilityLog = `贞洁者${tag}被提名，提名者${targetLabel}是镇民，已被处决`;
  } else {
    simLog = `[Virgin]${tag} ${selfLabel} nominated → no execution (non-townsfolk)`;
    storytellerPrompt =
      `贞洁者被提名！提名者不是镇民，无事发生（贞洁者能力已消耗）。`;
    abilityLog = `贞洁者${tag}被提名，但提名者不是镇民，无人被处决`;
  }

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "virgin_execution",
        shouldExecute: result.shouldExecute,
        executedSeatId: result.executedSeatId,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const virginAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "virgin",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "virgin_nomination_ability",
  /** 能力中文名 */
  abilityName: "纯洁之身",

  /** 触发时机：被动（由提名事件触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力，无实际唤醒顺序）
   * 由提名系统在提名贞洁者时自动触发
   */
  wakePriority: 0,
  /** 非首夜特定能力 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.virgin.trigger",

  /**
   * 目标选择配置
   * 贞洁者本身无需选择目标；目标（提名者）由系统通过 meta.nominatorId 传入
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────

  /** preCheck：前置条件检查（存活 + 是否已使用 + 状态标记） */
  preCheck: [preCheckAliveAndUnused],

  /** calculate：核心效果计算（是否处决提名者） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（标记能力已用 + 处决提名者） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
