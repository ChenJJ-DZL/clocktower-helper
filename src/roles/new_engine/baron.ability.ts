/**
 * 男爵（Baron）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 男爵条目）
 * ============================================================
 *
 * 【角色能力】
 *   "会有额外的外来者在场。[+2 外来者]"
 *
 *   → 方括号表示这是一项"设置调整"（初始设置时生效，游戏中不可逆）。
 *     游戏开始时，移除 2 个镇民角色标记，替换为 2 个外来者角色标记。
 *
 * 【角色简介】
 *   "男爵会改变在场的外来者数量。
 *    外来者的数量变化会发生在初始设置时，且不会因为男爵死亡而恢复
 *    成原本的数量。对角色在初始设置时的更改，而在游戏过程中不产生
 *    影响的能力，都会在角色列表和角色标记上以方括号标注在角色描述
 *    的末尾——就像[这样]。
 *    增加的外来者角色总是会替换掉原本的镇民角色，而不是其他角色类型。"
 *
 *   → 替换规则：镇民 -2，外来者 +2。替换为外来者角色（说书人可选择
 *     具体角色，如酒鬼等）。仅影响角色计数，不绑定男爵生死。
 *
 * 【运作方式】
 *   "在游戏设置时，移除任意两个镇民角色标记，并添加任意两个外来者
 *    角色标记。（如果你添加了酒鬼，请记得同样需要依照酒鬼的初始设置
 *    方法进行设置步骤。）"
 *
 *   → 本实现在 setupConfig 中调整 outsiderCount / townsfolkCount。
 *     storytellerInput.removedTownsfolk / storyellerInput.addedOutsiders
 *     支持说书人指定具体替换角色。
 *
 * 【规则细节】
 *   "相克规则：瘟疫医生：如果说书人获得了男爵的能力，至多两名玩家
 *    会变成不在场的外来者。异端分子：如果异端分子在剧本中，男爵的
 *    效果可能会只增加一个而非两个外来者。"
 *   → 相克规则由 JinxManager 或说书人手动处理。
 *
 * 【提示与技巧（相关片段）】
 *   "你的能力甚至在游戏还未开始的时候就已经生效了。这意味着你除了
 *    帮恶魔获胜之外，绝对没有其他任何责任了！"
 *   → 男爵是纯设置调整角色，无夜间/白天主动能力。
 *
 * ============================================================
 * 夜晚顺序
 *   男爵为设置调整能力（PASSIVE），不主动唤醒。
 *   wakePriority: 0（不使用唤醒队列）
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
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  roleName?: string;
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  [key: string]: any;
}

/** 设置阶段配置 */
interface SetupConfig {
  townsfolkCount: number;
  outsiderCount: number;
  minionCount: number;
  demonCount: number;
  /** 说书人手动指定的被移除的镇民角色名列表 */
  removedTownsfolk?: string[];
  /** 说书人手动指定的新增外来者角色名列表 */
  addedOutsiders?: string[];
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 男爵死亡或醉酒/中毒时能力仍然生效（"[设置调整]"在初始设置时已固定），
 * 但运行时出错时不应错误触发后续逻辑。此 preCheck 记录状态供参考。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  const effects =
    seat?.statusEffects ?? snapshot.statusEffects?.[actionNode.seatId] ?? [];
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

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 从 snapshot 中安全的获取 setupConfig。
 */
function getSetupConfig(snapshot: any): SetupConfig {
  return (snapshot.setupConfig ?? {}) as SetupConfig;
}

/**
 * 计算调整后的角色人数。
 *
 * 规则："增加的外来者角色总是会替换掉原本的镇民角色"
 * → townsfolk - 2, outsider + 2
 */
function calculateAdjustedCounts(config: SetupConfig): {
  townsfolkCount: number;
  outsiderCount: number;
} {
  return {
    townsfolkCount: Math.max(0, (config.townsfolkCount ?? 0) - 2),
    outsiderCount: (config.outsiderCount ?? 0) + 2,
  };
}

/**
 * 生成替换摘要。
 */
function buildReplacementSummary(
  config: SetupConfig,
  adjusted: { townsfolkCount: number; outsiderCount: number },
  storytellerInput?: any
): { removedTownsfolk: string[]; addedOutsiders: string[] } {
  const removedTownsfolk =
    storytellerInput?.removedTownsfolk ?? config.removedTownsfolk ?? [];
  const addedOutsiders =
    storytellerInput?.addedOutsiders ?? config.addedOutsiders ?? [];
  return { removedTownsfolk, addedOutsiders };
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：验证设置调整条件并计算替换配置。
 *
 * 优先级：
 * 1. storytellerInput.removedTownsfolk / addedOutsiders — 说书人手动指定
 * 2. 按规则自动计算（townsfolk - 2, outsider + 2）
 */
const calculateSetupAdjustment = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, storytellerInput } = context;

  const config = getSetupConfig(snapshot);
  const adjusted = calculateAdjustedCounts(config);
  const replacement = buildReplacementSummary(
    config,
    adjusted,
    storytellerInput
  );

  return {
    ...context,
    meta: {
      ...context.meta,
      adjustedTownsfolkCount: adjusted.townsfolkCount,
      adjustedOutsiderCount: adjusted.outsiderCount,
      removedTownsfolk: replacement.removedTownsfolk,
      addedOutsiders: replacement.addedOutsiders,
      adjustmentApplied: false, // 由 stateUpdate 设为 true
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将调整后的配置写入 snapshot.setupConfig。
 *
 * 对应规则：
 * - "移除任意两个镇民角色标记，并添加任意两个外来者角色标记"
 * - "不会因为男爵死亡而恢复成原本的数量"
 *
 * 操作：
 * - 更新 setupConfig.townsfolkCount / outsiderCount
 * - 记录替换摘要（removedTownsfolk / addedOutsiders）
 * - 标记 adjustmentApplied = true
 */
const applySetupAdjustment = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;

  const newConfig: SetupConfig = {
    ...getSetupConfig(snapshot),
    townsfolkCount: meta.adjustedTownsfolkCount as number,
    outsiderCount: meta.adjustedOutsiderCount as number,
    removedTownsfolk: meta.removedTownsfolk as string[],
    addedOutsiders: meta.addedOutsiders as string[],
    baronAdjusted: true,
  };

  return {
    ...context,
    snapshot: {
      ...snapshot,
      setupConfig: newConfig,
    } as any,
    meta: {
      ...context.meta,
      adjustmentApplied: true,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const applied = meta.adjustmentApplied === true;

  // 英文 simulation log
  const simLog = applied
    ? `[Baron] Setup adjustment applied: townsfolk ${meta.adjustedTownsfolkCount}, outsiders ${meta.adjustedOutsiderCount}`
    : "[Baron] No setup adjustment (skipped)";

  // 说书人提示词
  const storytellerPrompt = applied
    ? `男爵在场，游戏设置已调整：镇民 -2 → ${meta.adjustedTownsfolkCount}，外来者 +2 → ${meta.adjustedOutsiderCount}。${(meta.removedTownsfolk as string[])?.length ? `移除镇民: ${(meta.removedTownsfolk as string[]).join(", ")}。` : ""}${(meta.addedOutsiders as string[])?.length ? `新增外来者: ${(meta.addedOutsiders as string[]).join(", ")}。` : ""}`
    : "";

  // 中文游戏日志
  const abilityLog = applied
    ? `男爵设置调整：镇民 -2（当前 ${meta.adjustedTownsfolkCount}），外来者 +2（当前 ${meta.adjustedOutsiderCount}）`
    : "男爵未触发设置调整";

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "baron_setup_adjustment",
        applied,
        townsfolkCount: meta.adjustedTownsfolkCount as number,
        outsiderCount: meta.adjustedOutsiderCount as number,
        removedTownsfolk: meta.removedTownsfolk as string[],
        addedOutsiders: meta.addedOutsiders as string[],
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const baronAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "baron",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "baron_outsider_boost",
  /** 能力中文名 */
  abilityName: "外来者增幅",

  /** 触发时机：被动（设置阶段触发，非夜间主动唤醒） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力不使用唤醒队列）
   * 男爵仅在游戏初始设置时生效，不参与夜晚行动顺序。
   */
  wakePriority: 0,
  /** 设置调整在游戏开始时生效，与夜晚无关 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 男爵是纯设置调整能力（无需选择目标）。
   * 说书人可通过 storytellerInput.removedTownsfolk / addedOutsiders
   * 指定具体替换角色。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（状态标记） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心计算（设置调整参数计算） */
  calculate: [calculateSetupAdjustment],

  /** stateUpdate：状态持久化（写入 setupConfig） */
  stateUpdate: [applySetupAdjustment],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
