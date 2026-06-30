/**
 * 士兵（Soldier）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 士兵条目）
 * ============================================================
 *
 * 【角色能力】
 *   "恶魔的负面能力对你无效。"
 *
 * 【角色简介】
 *   "士兵无法被恶魔杀死。
 *    士兵无法因为恶魔的能力而死去。因此，如果小恶魔在夜晚攻击士兵，
 *    无事发生。没有任何人会死亡。小恶魔也不能再去选择攻击另外一名玩家。
 *    即使发起提名的玩家是恶魔，士兵仍然会因为处决而死亡。士兵的能力
 *    会保护自己不被恶魔的能力杀死，但无法保护自己被恶魔玩家的其他
 *    行为杀死。"
 *
 * 【运作方式】
 *   "在夜晚时，如果恶魔攻击了士兵，士兵仍然存活。
 *    （在黎明时，宣布当晚没有人死亡。）"
 *
 * 【规则细节】
 *   "与僧侣的能力相似，士兵能够免疫的有害效果包括：死亡，醉酒，中毒，
 *    疯狂，阵营变化，来自与自身阵营不同的恶魔对他进行的角色变化，等等。
 *    士兵无法免疫的效果包括：来自与该玩家（保护目标）阵营相同的恶魔
 *    对他进行的角色变化，照看小怪宝，成为痢蛭的寄生对象..."
 *   → 核心：免疫恶魔的杀戮效果。执行抗性不由本能力处理。
 *
 *   "如果恶魔攻击了士兵，这个夜晚就没人会死。"
 *   → 恶魔攻击士兵后，攻击被抵消，当晚无人死亡。
 *
 * ============================================================
 * 夜晚顺序：PASSIVE（由攻击/死亡事件触发，无固定顺序）
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

/** 恶魔角色 ID 列表（所有可能造成杀戮的恶魔） */
const DEMON_ROLE_IDS = new Set([
  "imp",
  "pukka",
  "zombuul",
  "shabaloth",
  "po",
  "vortox",
  "fang_gu",
  "no_dashii",
  "vigormortis",
  "ojo",
  "alhadikhia",
  "lleech",
  "lilmonsta",
  "yaggababble",
  "kazali",
  "legion",
  "leviathan",
  "ripper",
  "runsai",
]);

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记 + 杀手判定
 *
 * 对应规则：士兵必须存活才能免疫；醉酒/中毒时免疫可能失效。
 * 杀手角色信息通过 meta.killerRoleId 传入（由攻击处理系统设置）。
 * 恶魔列表包括所有官方恶魔及实验性恶魔。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const effects = seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  const killerRoleId = (context.meta.killerRoleId as string) ?? "";
  const isDemonKill = DEMON_ROLE_IDS.has(killerRoleId);

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      isDemonKill,
      killerRoleId,
    },
  };
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：判断士兵是否免疫本次杀戮。
 *
 * 规则：
 * - 如果能力有效（abilityEffective）且杀手是恶魔 → 免疫
 * - 能力失效（醉酒/中毒/Vortox）→ 不免疫
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件自动计算。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const isDemonKill = meta.isDemonKill === true;

  let isImmune = false;

  if (storytellerInput?.overrideResult !== undefined) {
    isImmune = Boolean(storytellerInput.overrideResult);
  } else if (abilityEffective && isDemonKill) {
    isImmune = true;
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: isImmune,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：应用免疫效果。
 *
 * 当士兵免疫恶魔杀戮时，取消即将发生的死亡效果：
 * - 恢复 isAlive、清除 deathReason/deathPhase
 * - 记录免疫事件到 actionNode.meta.soldierResult
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isImmune = meta.abilityResult === true;

  if (!isImmune) return context;

  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          isAlive: true,
          deathReason: undefined,
          deathPhase: undefined,
          executedToday: undefined,
        };
      }
      return seat;
    }),
  };

  const persistedRecord = {
    isImmune: true,
    killerRoleId: meta.killerRoleId,
    timestamp: Date.now(),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        soldierResult: persistedRecord,
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
 * 2. meta.prompt — 说书人看到的提示（无人死亡宣言）
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const isImmune = meta.abilityResult === true;

  if (!isImmune) return context;

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

  const simLog = `[Soldier]${tag} ${selfLabel} immune to demon kill (killer: ${meta.killerRoleId})`;

  const storytellerPrompt = "士兵免疫了恶魔的杀戮，今晚无人死亡。";

  const abilityLog = `士兵${tag}免疫了恶魔的攻击，存活了下来`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "soldier_immunity",
        isImmune: true,
        killerRoleId: meta.killerRoleId,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const soldierAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "soldier",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "soldier_passive_immunity",
  /** 能力中文名 */
  abilityName: "坚韧不拔",

  /** 触发时机：被动（由攻击事件触发） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力，无实际唤醒顺序）
   * 由攻击处理系统在检测到士兵被恶魔攻击时触发
   */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 非首夜特定能力 */
  firstNightOnly: false,
  /** 士兵免疫不涉及说书人唤醒，无提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 士兵是纯被动免疫角色，无需选择目标
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────

  /** preCheck：前置条件检查（存活 + 状态标记 + 杀手阵营判定） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心效果计算（是否免疫本次恶魔杀戮） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（取消死亡效果） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
