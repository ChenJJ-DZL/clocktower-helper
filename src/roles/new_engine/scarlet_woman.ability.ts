/**
 * 红唇女郎（Scarlet Woman）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 红唇女郎条目）
 * ============================================================
 *
 * 【角色能力】
 *   "如果大于等于五名玩家存活时（旅行者不计算在内）恶魔死亡，
 *    你变成那个恶魔。"
 *
 *   → 被动触发条件：
 *     1. 当前存活玩家数 ≥ 5（排除旅行者）
 *     2. 恶魔死亡
 *     3. 红唇女郎自身存活且未醉酒/中毒
 *
 * 【角色简介】
 *   "红唇女郎会在恶魔死亡时变成恶魔。
 *    如果在恶魔死前有五名或更多的玩家存活；或者说，如果
 *    在恶魔死后有四名或更多的玩家存活，那么红唇女郎会立刻
 *    变成恶魔，游戏会如同恶魔尚未死亡一样继续进行。
 *    当红唇女郎的能力触发时，旅行者的数量不会计算在内。
 *    如果在小恶魔选择自杀时，有五名或更多的玩家存活，必须
 *    是由红唇女郎来变成新的小恶魔。
 *    如果红唇女郎变成了恶魔，她在各种意义上都会成为恶魔。"
 *
 *   → 存活玩家计数排除旅行者（role.type === "traveler"）。
 *   → 本实现转化为对应恶魔类型（暗流涌动 = Imp）。
 *
 * 【运作方式】
 *   "如果恶魔死亡，且在恶魔死前有五名或更多的存活玩家，
 *    在魔典中用闲置的小恶魔标记替换红唇女郎的标记，也意味
 *    着那名玩家的角色从红唇女郎变成了小恶魔。
 *    在当晚，唤醒新的小恶魔，向她展示'你是'信息标记，然后
 *    向她展示小恶魔角色标记。"
 *
 *   → stateUpdate 中替换角色：
 *     seat.role → { id: "imp", name: "小恶魔", type: "demon" }
 *     并清除负面状态（醉酒/中毒在新身份下不继承）。
 *
 * 【提示标记】
 *   "放置时机：当红唇女郎因自己的能力变成恶魔时。
 *    放置条件：当红唇女郎变成恶魔，且没有多余的恶魔角色标记
 *    用于替换红唇女郎角色标记时，在红唇女郎角色标记旁边放置。"
 *
 * 【规则细节】
 *   "旅行者的数量不会计算在内"
 *   → alivePlayersCount 过滤 role.type === "traveler"。
 *
 *   "如果在小恶魔选择自杀时，有五名或更多的玩家存活，必须
 *    是由红唇女郎来变成新的小恶魔。（前提是，红唇女郎此时
 *    能力正常生效）"
 *   → 红唇女郎在 Imp 自杀传刀时有最高优先级。
 *     此优先逻辑在 imp.ability.ts 的 findAliveMinions 中
 *     优先选择 scarlet_woman 角色 ID。
 *
 * 【提示与技巧（相关片段）】
 *   "与其他爪牙不同，在游戏前期你更需要'活下来'。"
 *   → 红唇女郎需要存活到恶魔死亡才能触发能力。
 *
 * ============================================================
 * 夜晚顺序
 *   红唇女郎为被动触发（PASSIVE），不主动唤醒。
 *   nightOrderOverrides: only in otherNightOrderList, index 138
 *   恶魔死亡事件触发时由能力优先级中间件执行。
 *   wakePriority: 0（被动能力，不使用唤醒队列排序）
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
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusEffects?: Array<{ type: string; source?: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：红唇女郎死亡时无法触发；自身醉酒/中毒时能力失效
 * （"前提是，红唇女郎此时能力正常生效"）。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "红唇女郎已死亡，技能失效" };
  }

  const effects =
    seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
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

/**
 * preCheck 第 2 步：检测恶魔死亡条件。
 *
 * 检查：
 * 1. 是否有恶魔已死亡
 * 2. 存活玩家（排除旅行者）是否 ≥ 5
 */
const checkDemonDeathCondition = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const seats: PlayerLookup[] = snapshot.seats ?? [];

  // 存活玩家计数（排除旅行者 — 规则："旅行者的数量不会计算在内"）
  const aliveNonTravelerCount = seats.filter((s: PlayerLookup) => {
    if (s.isDead || s.isAlive === false) return false;
    const roleType = s.role?.type ?? s.roleType ?? "";
    return roleType !== "traveler";
  }).length;

  // 检测是否有恶魔死亡
  const demonDead = seats.some((s: PlayerLookup) => {
    const roleType = s.role?.type ?? s.roleType ?? "";
    return roleType === "demon" && (s.isDead || s.isAlive === false);
  });

  return {
    ...context,
    meta: {
      ...context.meta,
      demonDead,
      aliveNonTravelerCount,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 从座位对象安全获取角色类型。
 */
function getRoleType(seat: PlayerLookup): string {
  return seat.role?.type ?? seat.roleType ?? "";
}

/**
 * 从座位对象安全获取角色 ID。
 */
function getRoleId(seat: PlayerLookup): string {
  return seat.role?.id ?? seat.roleId ?? "";
}

/**
 * 获取已死亡恶魔的角色 ID（用于决定红唇女郎变成哪种恶魔）。
 * 在暗流涌动中始终为 "imp"，但混合剧本中可能不同。
 */
function findDeadDemonRoleId(seats: PlayerLookup[]): string {
  const deadDemon = seats.find((s: PlayerLookup) => {
    const roleType = s.role?.type ?? s.roleType ?? "";
    return roleType === "demon" && (s.isDead || s.isAlive === false);
  });
  return deadDemon
    ? getRoleId(deadDemon) || "imp"
    : "imp";
}

/**
 * 判断红唇女郎是否应触发变身。
 *
 * 条件：
 * 1. 能力生效（abilityEffective）
 * 2. 恶魔已死亡
 * 3. 存活玩家（排除旅行者）≥ 5
 */
function shouldTransform(
  meta: Record<string, any>
): boolean {
  const abilityEffective = meta.abilityEffective ?? true;
  const demonDead = meta.demonDead ?? false;
  const aliveNonTravelerCount = meta.aliveNonTravelerCount ?? 0;

  return abilityEffective && demonDead && aliveNonTravelerCount >= 5;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：验证变身条件是否满足。
 *
 * 对应规则："如果大于等于五名玩家存活时（旅行者不计算在内）
 * 恶魔死亡，你变成那个恶魔。"
 */
const calculateTransformCondition = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;

  if (!shouldTransform(meta)) {
    return {
      ...context,
      aborted: true,
      abortReason: `变身条件不满足（恶魔已死: ${meta.demonDead}, 存活(非旅行者): ${meta.aliveNonTravelerCount}）`,
    };
  }

  // 确定要变成的恶魔类型
  const seats: PlayerLookup[] = snapshot.seats ?? [];
  const demonRoleId = findDeadDemonRoleId(seats);

  // 尝试获取恶魔的中文名
  const deadDemonSeat = seats.find((s: PlayerLookup) => {
    const roleType = s.role?.type ?? s.roleType ?? "";
    return roleType === "demon" && (s.isDead || s.isAlive === false);
  });
  const demonName = deadDemonSeat?.role?.name ?? deadDemonSeat?.roleName ?? "小恶魔";

  return {
    ...context,
    meta: {
      ...context.meta,
      demonRoleId,
      demonName,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将红唇女郎的角色替换为恶魔。
 *
 * 对应规则："在魔典中用闲置的小恶魔标记替换红唇女郎的标记，
 * 也意味着那名玩家的角色从红唇女郎变成了小恶魔。"
 *
 * 操作：
 * - 将 seat.role / seat.roleId / seat.roleType / seat.roleName 更新为恶魔
 * - 设置 isDemonSuccessor: true
 * - 清除已有中毒/醉酒状态（新身份下不继承）
 * - 重置 abilityUsed 为 false（新恶魔可以重新使用能力）
 */
const transformToDemon = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const demonRoleId = meta.demonRoleId as string ?? "imp";
  const demonName = meta.demonName as string ?? "小恶魔";

  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          role: {
            ...(seat.role ?? {}),
            id: demonRoleId,
            name: demonName,
            type: "demon",
          },
          roleId: demonRoleId,
          roleType: "demon",
          roleName: demonName,
          isDemonSuccessor: true,
          abilityUsed: false,
          // 清除中毒/醉酒状态（新恶魔身份清醒）
          statusEffects: (seat.statusEffects ?? []).filter(
            (e: any) => e.type !== "poisoned" && e.type !== "drunk"
          ),
          statusDetails: [
            ...(seat.statusDetails ?? []),
            `红唇女郎变为${demonName}`,
          ],
        };
      }
      return seat;
    }),
  };

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      transformed: true,
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
  const { meta, actionNode } = context;
  const transformed = meta.transformed === true;
  const demonName = meta.demonName as string ?? "小恶魔";

  // 英文 simulation log
  const simLog = transformed
    ? `[ScarletWoman] Transformed into ${demonName} (seat ${actionNode.seatId}) — alive non-travelers: ${meta.aliveNonTravelerCount}`
    : `[ScarletWoman] No transformation (demonDead:${meta.demonDead}, alive:${meta.aliveNonTravelerCount})`;

  // 说书人提示词
  const storytellerPrompt = transformed
    ? `红唇女郎的变身已被触发。${actionNode.seatId + 1} 号玩家现在是${demonName}。请唤醒她并告知她的新角色。`
    : ``;

  // 中文游戏日志
  const abilityLog = transformed
    ? `红唇女郎（${actionNode.seatId + 1}号）因恶魔死亡且存活玩家≥5，变身为${demonName}`
    : `红唇女郎未触发变身（恶魔已死: ${meta.demonDead}, 存活(非旅行者): ${meta.aliveNonTravelerCount}）`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "scarlet_woman_transform",
        transformed,
        demonRoleId: meta.demonRoleId as string ?? "imp",
        demonName,
        aliveNonTravelerCount: meta.aliveNonTravelerCount ?? 0,
        demonDead: meta.demonDead ?? false,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const scarletWomanAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "scarlet_woman",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "scarlet_woman_demon_successor",
  /** 能力中文名 */
  abilityName: "恶魔继承者",

  /** 触发时机：被动（由恶魔死亡事件触发，非主动唤醒） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /**
   * 唤醒优先级（被动能力不使用唤醒队列）
   * nightOrderOverrides: otherNightOrderList index 138 → priority 139
   */
  wakePriority: 0,
  /** 非首夜唤醒（被动触发与夜晚无关） */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 红唇女郎是纯被动触发能力（无需选择目标）。
   * min: 0, max: 0 表示无需玩家选择目标。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记 + 恶魔死亡条件检测） */
  preCheck: [preCheckAliveAndStatus, checkDemonDeathCondition],

  /** calculate：核心计算（验证变身条件 + 确定恶魔类型） */
  calculate: [calculateTransformCondition],

  /** stateUpdate：状态持久化（角色替换为恶魔） */
  stateUpdate: [transformToDemon],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
