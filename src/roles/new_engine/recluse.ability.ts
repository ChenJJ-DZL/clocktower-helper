/**
 * 陌客（Recluse）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 陌客条目）
 * ============================================================
 *
 * 【角色能力】
 *   "你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。"
 *
 *   → 陌客的阵营/角色注册是可变的：每次被探查时，说书人决定
 *     陌客被当作善良还是邪恶、外来者还是爪牙/恶魔。
 *
 * 【角色简介】
 *   "陌客会看起来像是邪恶一员，但实际上是善良的。
 *    任何时候要探查陌客的阵营时，由说书人来决定陌客被当作善良
 *    还是邪恶。任何时候陌客被影响特定的爪牙或恶魔角色的能力
 *    选择时，由说书人来决定陌客是否会被当作某种特定的爪牙或是
 *    恶魔角色。
 *    陌客能在同一个夜晚的不同能力中分别被当作善良或邪恶阵营，
 *    外来者、爪牙或恶魔角色。由说书人来选择最有趣的结果。
 *    陌客在被当作特定的爪牙或恶魔角色时，不会获得这一角色的
 *    能力。"
 *
 *   → 注册判定是独立的（阵营 vs 角色）且每次探查独立随机。
 *     本实现提供 resolveRecluseRegistration 导出函数，
 *     供各探查角色（共情者/厨师/占卜师等）按需调用。
 *
 * 【运作方式】
 *   "每当因游戏规则或角色能力的效果要探查或影响玩家的阵营或
 *    角色，且陌客因此被选中为目标时，由你决定陌客被当作哪种
 *    角色和哪种阵营。"
 *
 *   → 本文件为被动能力（PASSIVE），在首次执行时为全局缓存
 *     陌客的注册结果。各探查角色应优先使用本文件的导出函数。
 *
 * 【规则细节】
 *   "陌客的互动干扰能力中，阵营与角色是独立判断的。也就是说，
 *    如果有既能探查阵营也能探查角色的能力，那么陌客是有可能
 *    被当作'善良的恶魔'或者是'邪恶的陌客'的（如舞蛇人和食人族）。"
 *   → alignment 和 roleType 独立随机。
 *
 *   "如果陌客醉酒或中毒，他不会有任何变化。属于互动干扰类的
 *    能力不会因为醉酒或中毒失效。"
 *   → 陌客的注册干扰是角色固有属性，不受外部 drunk/poisoned 影响。
 *
 * 【提示与技巧（相关片段）】
 *   "你通常会被当作邪恶玩家——留意那些说你是善良角色的人。"
 *   → 陌客有较高概率被当作邪恶，但每次判定独立。
 *
 * ============================================================
 * 夜晚顺序
 *   陌客为互动干扰（PASSIVE），不主动唤醒。
 *   wakePriority: 0（不使用唤醒队列）
 *   各探查角色在各自 calculate 中调用 resolveRecluseRegistration。
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

/** 陌客注册结果（单次判定） */
export interface RecluseRegistration {
  /** 是否被当作邪恶阵营 */
  registersAsEvil: boolean;
  /** 被当作的角色类型（"minion" | "demon" | null = 不当作特定角色） */
  registersAsRoleType: "minion" | "demon" | null;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck：陌客为被动能力，不需要存活/状态检查。
 * 规则"即使你已死亡"和"不会因为醉酒或中毒失效"
 * 意味着陌客的注册干扰在任何状态下都持续生效。
 */
const preCheckPassive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 陌客的注册干扰是角色固有属性，无条件通过
  return {
    ...context,
    meta: {
      ...context.meta,
      isAbilityActive: true,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 确定陌客在本次探查中的注册结果。
 *
 * 对应规则：
 * - "由说书人来决定陌客被当作善良还是邪恶"
 * - "由说书人来决定陌客是否会被当作某种特定的爪牙或是恶魔角色"
 * - "陌客能在同一个夜晚的不同能力中分别被当作善良或邪恶阵营"
 *
 * 本实现提供一个基线随机策略（50%邪恶，70%爪牙/30%恶魔），
 * 说书人可通过 storytellerInput.recluseOverride 覆盖。
 *
 * @param seatId           陌客座位 ID
 * @param cacheKey         缓存键（同一次能力中保持一致，参考厨师做法）
 * @param meta             中间件 meta（用于缓存）
 * @param storytellerInput 说书人覆盖（可选）
 * @returns RecluseRegistration
 */
export function resolveRecluseRegistration(
  seatId: number,
  cacheKey: string,
  meta: Record<string, any>,
  storytellerInput?: any
): RecluseRegistration {
  // 优先检查缓存（保证单次能力中一致性）
  const cached = meta[cacheKey] as RecluseRegistration | undefined;
  if (cached) return cached;

  // 说书人手动覆盖
  if (storytellerInput?.recluseOverride?.[seatId]) {
    const override = storytellerInput.recluseOverride[
      seatId
    ] as RecluseRegistration;
    meta[cacheKey] = override;
    return override;
  }

  // 生成随机结果
  const registration: RecluseRegistration = {
    registersAsEvil: Math.random() < 0.5, // 50% 被当作邪恶
    registersAsRoleType:
      Math.random() < 0.5
        ? Math.random() < 0.7
          ? "minion" // 70% 爪牙
          : "demon" // 30% 恶魔
        : null, // 50% 不当作特定角色
  };

  meta[cacheKey] = registration;
  return registration;
}

/**
 * 判断陌客在当前探查中是否应被当作邪恶阵营。
 *
 * 便捷包装函数，供探查角色直接调用。
 *
 * @param seatId   陌客座位 ID
 * @param meta     探查角色的 meta（用于缓存）
 * @returns true = 被当作邪恶
 */
export function isRecluseEvil(
  seatId: number,
  meta: Record<string, any>
): boolean {
  const key = `recluse_evil_${seatId}`;
  return resolveRecluseRegistration(seatId, key, meta).registersAsEvil;
}

/**
 * 判断陌客在当前探查中是否应被当作特定邪恶角色。
 *
 * 便捷包装函数，供探查角色直接调用。
 *
 * @param seatId   陌客座位 ID
 * @param meta     探查角色的 meta（用于缓存）
 * @returns "minion" | "demon" | null
 */
export function getRecluseRoleType(
  seatId: number,
  meta: Record<string, any>
): "minion" | "demon" | null {
  const key = `recluse_role_${seatId}`;
  return resolveRecluseRegistration(seatId, key, meta).registersAsRoleType;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：注册陌客干扰效果到 meta。
 *
 * 本能力为被动，实际注册判定由各探查角色通过导出函数完成。
 * 此处仅在运行时预留 meta 空间并记录能力激活状态。
 */
const calculateDisguise = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...context,
    meta: {
      ...context.meta,
      recluseActive: true,
      // 为后续探查缓存预留空间
      recluseRegistrations: {},
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：记录陌客干扰效果到 snapshot 中。
 */
const recordDisguiseStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        recluse: {
          active: true,
          timestamp: Date.now(),
        },
      },
    },
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        recluseActive: true,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志（陌客为被动能力，日志仅记录激活）。
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;

  const simLog = `[Recluse] Passive active for seat ${actionNode.seatId} — may register as evil/minion/demon`;
  const storytellerPrompt = `陌客（${actionNode.seatId + 1}号）的被动干扰已激活，可被当作邪恶阵营/爪牙/恶魔。`;
  const abilityLog = `陌客（${actionNode.seatId + 1}号）被动干扰已激活，可被当作邪恶阵营/爪牙/恶魔`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "recluse_passive",
        seatId: actionNode.seatId,
        active: true,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const recluseAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "recluse",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "recluse_disguise",
  /** 能力中文名 */
  abilityName: "伪装者",

  /** 触发时机：被动（全局持续生效，不主动唤醒） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力不使用唤醒队列）
   * 陌客的注册判定由各探查角色在各自 calculate 中调用。
   */
  wakePriority: 0,
  /** 被动能力与夜晚无关 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 陌客为被动干扰能力（无需选择目标）。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：被动能力无条件通过 */
  preCheck: [preCheckPassive],

  /** calculate：预留注册缓存空间 */
  calculate: [calculateDisguise],

  /** stateUpdate：记录干扰效果到 snapshot */
  stateUpdate: [recordDisguiseStatus],

  /** postProcess：日志 */
  postProcess: [postProcessResult],
});
