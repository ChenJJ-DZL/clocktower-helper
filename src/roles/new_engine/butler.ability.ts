/**
 * 管家（Butler）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 管家条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚，你要选择除你以外的一名玩家：明天白天，只有他投票时
 *    你才能投票。"
 *
 *   → 每晚选择一名主人（非自己）。
 *   → 次日白天：主人投票时管家才能投票（否则票无效）。
 *   → 醉酒/中毒时"不放置该标记"（即无主人限制）。
 *
 * 【角色简介】
 *   "管家只能在他的主人投票时才能投票。
 *    每个夜晚，管家需要选择一名玩家来成为自己的主人。这名玩家可以
 *    是与前一夜相同的，也可以是与前一夜不同的。
 *    如果主人在投票时举手，或主人的投票已经被统计时，管家可以举手
 *    参与投票。
 *    如果主人放下了他的手，管家也必须将自己的手放下。
 *    因为角色能力不能以任何形式影响流放流程，管家可以在流放表决中
 *    自由参与表决。"
 *
 *   → 投票合法性由 `isButlerVoteLegal()` 检查。
 *   → 流放（exile）不受限制。
 *
 * 【运作方式】
 *   "每个夜晚，唤醒管家。让管家指向除自己外的任意一名玩家。
 *    用'主人'提示标记来标记这名玩家。让管家重新入睡。
 *    在一次提名中，管家只能在主人举手投票，或主人的投票已经被统计
 *    时，才能举手投票。"
 *
 *   → 标记存储方式：seat.statusEffects 中 type === "butler_master"
 *     记录 masterId。
 *
 * 【提示标记】
 *   "放置条件：在管家选择的玩家角色标记旁放置。管家无法选择自己。
 *    若此时管家醉酒中毒，不放置该标记。"
 *   → 醉酒/中毒时但管家不受限（abilityEffective = false 时不存储 master）。
 *
 * 【规则细节】
 *   "已死亡的玩家只能在拥有投票标记时才能举手投票。如果管家选择了
 *    一名已死亡玩家作为主人，这种情况仍然适用。"
 *   → 主人是死亡玩家时，主人有 ghost vote 才能投票 → 管家才能跟投。
 *
 *   "管家的能力从不会被强制必须投票。"
 *   → 主人投票时管家可以投票但不是必须。
 *
 *   "流放流程不受影响"
 *   → 流放投票时管家自由参与，`isButlerVoteLegal` 返回 true。
 *
 * 【提示与技巧（相关片段）】
 *   "被你选为'主人'的那名玩家非常重要。你的投票依然按照正常的
 *    投票计数，只不过在你的主人不举手的情况下你不能投票。"
 *   → 投票权受主人控制，但计票权重不变。
 *
 * ============================================================
 * 夜晚顺序
 *   首夜 #20 → wakePriority 20
 *   其他夜：nightOrderOverrides index 193 → priority 194
 *   管家在夜晚较早行动（在信息类角色之后，恶魔之前）
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
  /** 管家当前的主人（由 night 能力设置） */
  masterId?: number;
  statusEffects?: Array<{ type: string; source?: string; masterId?: number; [key: string]: any }>;
  statuses?: Array<{ effect: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：管家死亡时技能不应触发；自身醉酒/中毒时"不放置该标记"
 * （即无主人限制，次日可自由投票）。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "管家已死亡，技能失效" };
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

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 提取管家当前主人的 ID。
 *
 * 优先从 seat.masterId 读取（stateUpdate 中设臵的扁平字段），
 * 兜底从 statusEffects 中查找 type === "butler_master"。
 *
 * @param seat 管家座位
 * @returns 主人 ID（无主人时返回 null）
 */
export function getButlerMasterId(seat: PlayerLookup): number | null {
  if (seat.masterId !== undefined && seat.masterId !== null) {
    return seat.masterId;
  }

  const masterEffect = (seat.statusEffects ?? []).find(
    (e: any) => e.type === "butler_master"
  );
  return masterEffect?.masterId ?? null;
}

/**
 * 判断管家在当前提名/投票中是否允许投票。
 *
 * 对应规则：
 * - "管家只能在他的主人投票时才能投票。"
 * - "如果主人放下了他的手，管家也必须将自己的手放下。"
 * - "管家可以在流放表决中自由参与表决。"
 * - "若此时管家醉酒中毒，不放置该标记。"（即无限制）
 *
 * @param butlerSeat   管家座位
 * @param masterVoting 主人当前是否在投票 true/false
 * @param isExile      是否为流放表决（不受主人限制）
 * @param isDrunkOrPoisoned 管家是否醉酒/中毒（不受限制）
 * @returns true = 允许投票, false = 不允许
 */
export function isButlerVoteLegal(
  butlerSeat: PlayerLookup,
  masterVoting: boolean,
  isExile: boolean,
  isDrunkOrPoisoned: boolean
): boolean {
  // 流放不受限制
  if (isExile) return true;

  // 醉酒/中毒不受限制
  if (isDrunkOrPoisoned) return true;

  // 没有主人 → 管家本人不受限（理论上不存在这种情况，但防御性处理）
  const masterId = getButlerMasterId(butlerSeat);
  if (masterId === null) return true;

  // 主人投票时管家才能投票
  return masterVoting;
}

/**
 * 生成管家的主人选择摘要。
 */
function buildMasterSummary(
  masterId: number,
  masterName: string,
  nightCount: number
): string {
  return `管家选择${masterName}（${masterId + 1}号）作为第 ${nightCount} 夜后的主人`;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：验证目标合法性。
 *
 * 管家必须选择一名除自己以外的玩家作为主人。
 * 优先级：
 * 1. storytellerInput.overrideTarget — 说书人手动覆盖目标
 * 2. targetIds[0] — 玩家正常选择
 */
const calculateTarget = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { targetIds, storytellerInput, actionNode } = context;
  const abilityEffective = context.meta.abilityEffective ?? true;

  const targetId = storytellerInput?.overrideTarget ?? targetIds?.[0];

  if (targetId === undefined || targetId === null) {
    return {
      ...context,
      aborted: true,
      abortReason: "管家未选择主人",
    };
  }

  if (targetId === actionNode.seatId) {
    return {
      ...context,
      aborted: true,
      abortReason: "管家不能选择自己作为主人",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      masterTargetId: targetId,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：记录管家选定的主人。
 *
 * 对应规则：
 * - "用'主人'提示标记来标记这名玩家。"
 * - "若此时管家醉酒中毒，不放置该标记。"
 *   规则要求管家仍然正常唤醒、正常选择、正常交互，
 *   只是实际的主人标记不放置（次日可自由投票）。
 *
 * 实现：
 * - 正常时：存储 masterId + statusEffects 主人标记
 * - 醉酒/中毒时：选择仍然记录，但不存储主人标记（自由投票）
 *
 * 存储方式：
 * - seat.masterId（扁平字段，供 isButlerVoteLegal 快速读取）
 * - seat.statusEffects 中 type === "butler_master" 的条目
 *
 * 同一目标上已有的管家主人标记会被替换（重新选择覆盖旧主人）。
 */
const updateMasterStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const masterId = meta.masterTargetId as number | undefined;

  if (masterId === undefined) {
    return context;
  }

  // 醉酒/中毒：正常交互已发生，但不放置主人标记（自由投票）
  if (!abilityEffective) {
    return {
      ...context,
      meta: { ...context.meta, masterSet: false },
    };
  }

  const currentNight = snapshot.nightCount ?? 0;

  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === actionNode.seatId) {
        const currentEffects = seat.statusEffects ?? [];
        // 移除该管家上已有的主人标记
        const filteredEffects = currentEffects.filter(
          (e: any) => e.type !== "butler_master"
        );
        // 添加新的主人标记
        return {
          ...seat,
          masterId,
          statusEffects: [
            ...filteredEffects,
            {
              type: "butler_master",
              source: "butler",
              masterId,
              sourceSeatId: actionNode.seatId,
              appliedAtNight: currentNight,
              expiresAtNight: currentNight + 1, // 每天黄昏移除
            },
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
      masterSet: true,
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
  const masterId = meta.masterTargetId as number | undefined;

  if (masterId === undefined) return context;

  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 查找玩家显示名称
  const findLabel = (seatId: number): string => {
    const seat = context.snapshot.seats.find((s: any) => s.id === seatId);
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const masterLabel = findLabel(masterId);
  const masterSet = meta.masterSet === true;

  // 英文 simulation log
  const simLog = masterSet
    ? `[Butler]${tag} Master: ${masterLabel} (night ${context.snapshot.nightCount})`
    : `[Butler]${tag} No master set (drunk/poisoned) — free vote tomorrow`;

  // 说书人提示词
  const storytellerPrompt = masterSet
    ? `管家，请睁眼。你选择了 ${masterId + 1} 号玩家作为明天的主人，他投票时你才能投票。`
    : `管家，请睁眼。但由于你醉酒/中毒，今夜未选择主人，明天你可以自由投票。`;

  // 中文游戏日志
  const abilityLog = masterSet
    ? `管家（${actionNode.seatId + 1}号）选择【${masterLabel}】作为主人`
    : `管家${tag}未选择主人（醉酒/中毒），明日可自由投票`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "butler_master_selection",
        masterId,
        masterLabel: masterId + 1,
        masterSet,
        isCorrupted: meta.isCorrupted ?? false,
        nightCount: context.snapshot.nightCount ?? 0,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const butlerAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "butler",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "butler_night_ability",
  /** 能力中文名 */
  abilityName: "仆从效忠",

  /** 触发时机：每晚（首夜 + 其他夜） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 首夜 #20 → wakePriority 20
   * 其他夜：nightOrderOverrides index 193 → priority 194
   */
  wakePriority: 20,
  /** 每晚都唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.butler.wake",

  /**
   * 目标选择配置
   * 管家每晚必须选择一名除自己以外的玩家作为主人。
   * min: 1, max: 1 — 必须选恰好一名
   * allowSelf: false — 不能选自己
   * allowDead: true — 可选已死亡玩家（规则："已死亡的玩家...如果管家
   *   选择了一名已死亡玩家作为主人，这种情况仍然适用"）
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心计算（验证目标合法性） */
  calculate: [calculateTarget],

  /** stateUpdate：状态持久化（记录主人标记） */
  stateUpdate: [updateMasterStatus],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
