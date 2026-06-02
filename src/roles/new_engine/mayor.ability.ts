/**
 * 镇长（Mayor）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 镇长条目）
 * ============================================================
 *
 * 【角色能力】
 *   "如果只有三名玩家存活且白天没有人被处决，你的阵营获胜。
 *    如果你在夜晚即将死亡，可能会有一名其他玩家代替你死亡。"
 *
 * 【角色简介】
 *   "镇长可以在最后一天通过和平的方式获得胜利。
 *    为了生存，镇长偶尔会让其他玩家'意外地'被杀死。如果镇长被攻击
 *    且即将死去时，说书人可以选择另一名玩家死亡。没有人会得知该玩家
 *    的死亡原因，仅仅只是得知该玩家死亡了。
 *    如果在某个白天结束时只有三名玩家存活，并且那个白天没有人被处决，
 *    那么游戏结束且善良阵营获胜。"
 *
 * 【运作方式】
 *   "在夜晚时，如果镇长即将死去，由你来选择镇长会真正死去，或是镇长
 *    仍然存活但有其他角色代替他死亡——将恶魔的'死亡'提示标记放置在
 *    镇长或代替镇长死亡的角色标记旁，并在对应的角色标记上放置帷幕标记。
 *    在黎明时，宣布被标记了'死亡'标记的玩家在当晚死亡。
 *    （不要说出他的死亡原因。）
 *    在黄昏时，如果正好有三名玩家存活，且当天没有玩家被处决，宣布
 *    游戏结束且善良阵营获胜。"
 *
 * 【规则细节】
 *   "如果镇长的替死能力被触发，代替镇长死亡的角色，其死亡原因会与
 *    镇长保持一致。也就是说，如果恶魔攻击了镇长且贤者代替了镇长死亡，
 *    贤者能够触发他的能力。"
 *   → 替死传递死亡原因，能力触发角色（如贤者）可以正常触发。
 *
 *   "虽然镇长的特殊胜利在黄昏时宣布，但镇长的特殊胜利能力触发是在
 *    白天，因此投毒者或者其他能让镇长醉酒或中毒的角色仍然会阻止
 *    镇长因为自己的能力而以特殊方式获胜。"
 *   → 特殊胜利受醉酒/中毒影响。
 *
 * ============================================================
 * 夜晚顺序：PASSIVE（由处决/攻击事件触发，无固定顺序）
 *   和平胜利在黄昏时由游戏引擎检查
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
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活/死亡检测 + 醉酒/中毒标记
 *
 * 对应规则：
 * - 替死能力在镇长即将死亡时触发（此时镇长可能已被标记为死亡）
 * - 醉酒/中毒时替死能力可能失效
 * - 和平胜利条件在白天结束时由引擎单独检查，此处处理替死能力
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  // 镇长可能已被标记为死亡（即将死亡状态），所以检查 seat 是否存在
  if (!seat) {
    return { ...context, aborted: true, abortReason: "未找到镇长座位" };
  }

  // 检查是否被触发（由系统注入：meta.isMayorDying）
  const isMayorDying = context.meta.isMayorDying === true;

  if (!isMayorDying) {
    return {
      ...context,
      aborted: true,
      abortReason: "镇长未被攻击或提名，无需触发替死能力",
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
    },
  };
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：判断镇长替死能力是否生效。
 *
 * 优先级：
 * 1. storytellerInput.overrideResult — 说书人手动覆盖（决定是否替死）
 * 2. 能力有效（abilityEffective）且目标有效 → 替死生效
 * 3. 能力失效 → 替死失败，镇长正常死亡
 *
 * 注意：abilityEffective 由 abilityPriorityCalculation 中间件自动计算。
 * 当镇长需要选择替死目标时，目标ID由 targetIds 传入（min 1, max 1）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, storytellerInput, targetIds, snapshot } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  let substituteSeatId: number | undefined;
  let substitutionHappens = false;

  if (storytellerInput?.overrideResult !== undefined) {
    substitutionHappens = Boolean(storytellerInput.overrideResult);
    if (substitutionHappens && targetIds?.[0] !== undefined) {
      substituteSeatId = targetIds[0];
    }
  } else if (abilityEffective && targetIds?.[0] !== undefined) {
    const targetSeat = snapshot.seats.find((s: any) => s.id === targetIds[0]);
    if (targetSeat && targetSeat.isAlive) {
      substituteSeatId = targetIds[0];
      substitutionHappens = true;
    }
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        substitutionHappens,
        substituteSeatId,
      },
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：应用替死效果。
 *
 * 当替死生效时：
 * - 镇长恢复存活状态（清除死亡标记）
 * - 替死目标被标记为死亡
 * - 记录替死事件到 actionNode.meta.mayorResult
 *
 * 替死目标继承镇长的死亡原因（规则细则：死亡原因保持一致）。
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const result = meta.abilityResult as
    | {
        substitutionHappens: boolean;
        substituteSeatId?: number;
      }
    | undefined;

  if (!result?.substitutionHappens || result.substituteSeatId === undefined) {
    return context;
  }

  const selfSeatId = actionNode.seatId;
  const originalDeathReason =
    snapshot.seats.find((s: any) => s.id === selfSeatId)?.deathReason ??
    "被恶魔杀死";

  const seats = snapshot.seats.map((seat: any) => {
    if (seat.id === selfSeatId) {
      return {
        ...seat,
        isAlive: true,
        deathReason: undefined,
        deathPhase: undefined,
        executedToday: undefined,
      };
    }
    if (seat.id === result.substituteSeatId) {
      return {
        ...seat,
        isAlive: false,
        deathReason: originalDeathReason,
        deathPhase: seat.deathPhase ?? "night",
        substitutedForMayor: true,
      };
    }
    return seat;
  });

  const newSnapshot = {
    ...snapshot,
    seats,
  };

  const persistedRecord = {
    substitutionHappens: true,
    substituteSeatId: result.substituteSeatId,
    originalDeathReason,
    timestamp: Date.now(),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        mayorResult: persistedRecord,
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
 * 2. meta.prompt — 说书人提示词（替死选择）
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const result = meta.abilityResult as
    | {
        substitutionHappens: boolean;
        substituteSeatId?: number;
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

  if (result.substitutionHappens && result.substituteSeatId !== undefined) {
    const subLabel = findLabel(result.substituteSeatId);
    simLog = `[Mayor]${tag} ${selfLabel} → substitution: ${subLabel} dies instead`;
    storytellerPrompt = `镇长本该死亡，但替死能力触发！${result.substituteSeatId + 1} 号玩家代替镇长死亡。`;
    abilityLog = `镇长${tag}本该死亡，${subLabel}代替镇长死亡`;
  } else {
    simLog = `[Mayor]${tag} ${selfLabel} no substitution (ability ineffective or no target)`;
    storytellerPrompt = "镇长替死能力未触发，镇长正常死亡。";
    abilityLog = `镇长${tag}替死能力未触发`;
  }

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "mayor_substitution",
        substitutionHappens: result.substitutionHappens,
        substituteSeatId: result.substituteSeatId,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const mayorAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "mayor",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "mayor_passive_ability",
  /** 能力中文名 */
  abilityName: "替死与和平胜利",

  /** 触发时机：被动（由处决/攻击事件触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力，无实际唤醒顺序）
   * 由处决/攻击处理系统在镇长即将死亡时触发
   */
  wakePriority: 0,
  /** 非首夜特定能力 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.mayor.wake",

  /**
   * 目标选择配置
   * 镇长需要选择 1 名存活玩家代替死亡（替死目标）
   * min: 1, max: 1 — 必须选择恰好一名玩家
   * allowSelf: false — 不能选自己（代替死亡意味着其他人死）
   * allowDead: false — 只能选择存活玩家
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────

  /** preCheck：前置条件检查（存活 + 状态标记 + 触发条件） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心效果计算（替死是否生效） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（恢复镇长 + 标记替死目标死亡） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
