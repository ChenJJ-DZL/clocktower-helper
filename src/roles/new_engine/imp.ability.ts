/**
 * 小恶魔（Imp）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 小恶魔条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚*，你要选择一名玩家：他死亡。如果你以这种方式自杀，
 *    一名爪牙会变成小恶魔。"
 *
 *   → 每个夜晚*（除首夜外）选择一名玩家杀死。
 *   → 如果选择自己（自杀），一名存活爪牙继承恶魔身份。
 *
 * 【角色简介】
 *   "小恶魔会在夜晚杀戮，且能创造自己的分身……以可怕的代价。
 *    除首个夜晚以外的每个夜晚，小恶魔会选择一名玩家进行杀戮。
 *    如果小恶魔选择在夜晚杀死自己，他会死亡并且会有一名存活的
 *    爪牙变成小恶魔。新的小恶魔在当晚无法进行行动，但现在那名
 *    爪牙现在在各种意义上都会成为恶魔。"
 *   → 首夜不行动（otherNightOnly）。
 *   → 新小恶魔当晚不再行动（已过行动时间）。
 *
 * 【运作方式】
 *   "除首个夜晚以外的每个夜晚，唤醒小恶魔。让小恶魔指向任意
 *    一名玩家。让小恶魔重新入睡。被选择的玩家死亡——在那名玩家
 *    的角色标记旁放置小恶魔的'死亡'提示标记并放置帷幕标记。
 *    如果小恶魔选择在夜里自杀，用多出来的小恶魔标记替换一名
 *    存活的爪牙玩家的角色标记，让那名玩家的角色改变为小恶魔。"
 *   → 标记目标为 markedForDeath，由黎明系统结算死亡。
 *   → 自杀时随机选择一名存活爪牙继任恶魔。
 *
 * 【提示标记】
 *   "放置时机：小恶魔选择的玩家当前存活，且能被小恶魔杀死，
 *    且小恶魔未醉酒中毒，那么在该玩家的角色标记旁放置。"
 *   → 小恶魔自身醉酒/中毒时不下杀手（stateUpdate 跳过）。
 *
 * 【提示与技巧（相关片段）】
 *   "如果你不想在夜晚杀死任何人，你可以选择一名已经死亡的玩家。
 *    这也可以帮你伪装成士兵或者僧侣。"
 *   → allowDead: true，允许选已死亡玩家实现"空刀"。
 *
 * 【规则细节】
 *   "小恶魔选择在夜里自杀，用多出来的小恶魔标记替换一名存活的爪牙
 *    玩家的角色标记，让那名玩家的角色改变为小恶魔。"
 *   → 自杀时随机选择一名存活爪牙（role.type === "minion"）继承恶魔。
 *
 *   "新小恶魔在当晚无法进行行动。"
 *   → 传刀发生在小恶魔的行动阶段，新小恶魔当晚不再额外唤醒。
 *
 *   "如果小恶魔选择在夜晚杀死自己，他会死亡并且会有一名存活的爪牙
 *    变成小恶魔。新的小恶魔在当晚无法进行行动。"
 *   → 新恶魔的 `isDemonSuccessor: true` 供引擎识别传刀来源。
 *
 *   "如果你不想在夜晚杀死任何人，你可以选择一名已经死亡的玩家。
 *    这也可以帮你伪装成士兵或者僧侣，因为无人死亡的夜晚看起来就
 *    像是士兵或僧侣的能力生效了。"
 *   → allowDead: true，选已死亡玩家实现"空刀"。
 *
 * ============================================================
 * 夜晚顺序
 *   首夜：小恶魔不行动（nightOrderOverrides 中不包含 imp）
 *   其他夜：nightOrderOverrides index 146 → priority 147
 *   恶魔在夜末尾行动，wakePriority 40（晚于大多数角色）
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
  roleType?: string; // 扁平化字段（某些快照）
  roleName?: string; // 扁平化字段
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusDetails?: string[];
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  markedForDeath?: boolean;
  deathSource?: string;
  deathSourceSeatId?: number;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：小恶魔死亡时技能不应触发；自身醉酒/中毒时不下杀手
 * （"小恶魔未醉酒中毒"才能放置死亡标记）。
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
 * preCheck 第 2 步：非首夜限制
 *
 * 对应规则："除首个夜晚以外的每个夜晚" — 首夜不唤醒。
 */
const otherNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  // 首夜时跳过（nightCount === 1 或 gamePhase === "firstNight"）
  if (nightCount === 1 || gamePhase === "firstNight") {
    return {
      ...context,
      aborted: true,
      abortReason: "首夜，小恶魔不行动",
    };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 从座位对象安全获取角色 ID。
 * 兼容 seat.role.id 和 seat.roleId 两种存储位置。
 */
function getRoleId(seat: PlayerLookup): string {
  return seat.role?.id ?? seat.roleId ?? "";
}

/**
 * 从座位对象安全获取角色类型。
 * 兼容 seat.role.type 和 seat.roleType 两种存储位置。
 */
function getRoleType(seat: PlayerLookup): string {
  return seat.role?.type ?? seat.roleType ?? "";
}

/**
 * 确定存活爪牙候选列表（用于自杀传刀）。
 *
 * 筛选条件：存活、角色类型为 minion、不是小恶魔自己。
 */
function findAliveMinions(
  seats: PlayerLookup[],
  excludeId: number
): PlayerLookup[] {
  return seats.filter((s: PlayerLookup) => {
    if (s.id === excludeId) return false;
    if (s.isDead || s.isAlive === false) return false;
    return getRoleType(s) === "minion";
  });
}

/**
 * 更新座位为目标角色（用于传刀）。
 */
function createSuccessorSeat(
  originalSeat: PlayerLookup,
  newRoleId: string,
  newRoleType: string,
  newRoleName: string
): PlayerLookup {
  return {
    ...originalSeat,
    // 同时设置 seat.role 和扁平字段以保证兼容
    role: {
      ...(originalSeat.role ?? {}),
      id: newRoleId,
      name: newRoleName,
      type: newRoleType,
    },
    roleId: newRoleId,
    roleType: newRoleType,
    roleName: newRoleName,
    isDemonSuccessor: true,
    statusDetails: [
      ...(originalSeat.statusDetails ?? []),
      `被小恶魔传刀，成为新的${newRoleName}`,
    ],
  };
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：验证目标合法性。
 *
 * 小恶魔必须选择一名玩家（可自杀、可选死亡"空刀"）。
 * 优先级：
 * 1. storytellerInput.overrideTarget — 说书人手动覆盖目标
 * 2. targetIds[0] — 玩家正常选择
 */
const calculateTarget = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { targetIds, storytellerInput } = context;
  const abilityEffective = context.meta.abilityEffective ?? true;

  const targetId = storytellerInput?.overrideTarget ?? targetIds?.[0];

  if (targetId === undefined || targetId === null) {
    return {
      ...context,
      aborted: true,
      abortReason: "小恶魔未选择目标",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      killTargetId: targetId,
      isSuicide: targetId === context.actionNode.seatId,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：执行杀戮 / 自杀传刀。
 *
 * 对应规则：
 * - "每个夜晚*，你要选择一名玩家：他死亡。"
 * - "如果你以这种方式自杀，一名爪牙会变成小恶魔。"
 * - "小恶魔未醉酒中毒"才放置死亡标记。
 *   规则要求小恶魔仍然正常唤醒、正常选择目标、正常交互，
 *   只是实际的死亡标记不放置（当晚无人因此死亡）。
 *
 * 实现：
 * - 正常时：标记目标为死亡 / 执行自杀传刀
 * - 醉酒/中毒时：选择仍然记录，但不修改游戏状态（不下杀手）
 *
 * 操作：
 * 1. 如果目标不是自己 → 标记目标为 markedForDeath
 * 2. 如果目标是自己（自杀）→
 *    a. 随机选一名存活爪牙成为新小恶魔
 *    b. 原小恶魔标记为已死亡
 */
const applyKillOrSuccession = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const targetId = meta.killTargetId as number | undefined;
  const isSuicide = meta.isSuicide === true;

  if (targetId === undefined) {
    return context;
  }

  // 醉酒/中毒：正常交互已发生，但不执行杀戮（不放置死亡标记）
  if (!abilityEffective) {
    return {
      ...context,
      meta: { ...context.meta, killExecuted: false },
    };
  }

  let updatedSeats = [...snapshot.seats];

  // ── 自杀传刀 ──
  if (isSuicide) {
    const aliveMinions = findAliveMinions(updatedSeats, actionNode.seatId);

    if (aliveMinions.length > 0) {
      // 随机选一名存活爪牙继任恶魔
      const successor =
        aliveMinions[Math.floor(Math.random() * aliveMinions.length)];
      const successorIdx = updatedSeats.findIndex(
        (s: any) => s.id === successor.id
      );

      if (successorIdx !== -1) {
        updatedSeats[successorIdx] = createSuccessorSeat(
          updatedSeats[successorIdx],
          "imp",
          "demon",
          "小恶魔"
        );
      }
    }
    // 注：如果没有存活爪牙（极端情况），小恶魔自杀后邪恶阵营落败，
    // 但此处理由黎明系统判断。

    // 自杀者（原小恶魔）标记为死亡
    const selfIdx = updatedSeats.findIndex(
      (s: any) => s.id === actionNode.seatId
    );
    if (selfIdx !== -1) {
      updatedSeats[selfIdx] = {
        ...updatedSeats[selfIdx],
        isDead: true,
        markedForDeath: true,
        deathSource: "suicide",
        deathSourceSeatId: actionNode.seatId,
      };
    }
  }
  // ── 正常杀人 ──
  else {
    const targetIdx = updatedSeats.findIndex(
      (s: any) => s.id === targetId
    );
    if (targetIdx !== -1) {
      // 标记死亡（由黎明系统结算）
      updatedSeats[targetIdx] = {
        ...updatedSeats[targetIdx],
        markedForDeath: true,
        deathSource: "imp_kill",
        deathSourceSeatId: actionNode.seatId,
      };
    }
  }

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: updatedSeats,
    },
    meta: {
      ...context.meta,
      killExecuted: true,
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
  const targetId = meta.killTargetId as number | undefined;

  if (targetId === undefined) return context;

  const isSuicide = meta.isSuicide === true;
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 查找玩家显示名称
  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const targetLabel = findLabel(targetId);
  const isDeadTarget = context.snapshot.seats.find(
    (s: any) => s.id === targetId
  )?.isDead;

  // 英文 simulation log
  let simLog: string;
  let storytellerPrompt: string;
  let abilityLog: string;

  if (isSuicide) {
    simLog = `[Imp]${tag} Committed suicide — demon passed to a living minion`;
    storytellerPrompt =
      `小恶魔，请睁眼。你选择了自杀（${targetId + 1}号），已有一名存活爪牙继任恶魔。`;
    abilityLog = `小恶魔${tag}自杀了，恶魔血脉已传递给一名存活爪牙`;
  } else if (isDeadTarget) {
    simLog = `[Imp]${tag} Selected dead player ${targetLabel} — no kill tonight (faking Soldier/Monk)`;
    storytellerPrompt =
      `小恶魔，请睁眼。你选择了 ${targetId + 1} 号（已死亡），今晚无人死亡。`;
    abilityLog = `小恶魔${tag}选择了已死亡的【${targetLabel}】，今晚无人死亡`;
  } else {
    simLog = `[Imp]${tag} Killed: ${targetLabel}`;
    storytellerPrompt =
      `小恶魔，请睁眼。你选择了 ${targetId + 1} 号玩家，他将在今晚死亡。`;
    abilityLog = `小恶魔${tag}杀死了【${targetLabel}】`;
  }

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "imp_action",
        targetId,
        targetLabel: targetId + 1,
        isSuicide,
        isDeadTarget: !!isDeadTarget,
        killExecuted: meta.killExecuted === true,
        isCorrupted: meta.isCorrupted ?? false,
        nightCount: context.snapshot.nightCount ?? 0,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const impAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "imp",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "imp_night_ability",
  /** 能力中文名 */
  abilityName: "恶魔杀人与传刀",

  /** 触发时机：每晚（引擎会在首夜跳过，因 nightOrderOverrides 无 imp） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 恶魔在夜末尾行动（wakePriority 40 晚于大多数角色）。
   * 首夜：引擎通过 nightOrderOverrides 跳过 imp 条目。
   * 其他夜：nightOrderOverrides index 146 → priority 147。
   */
  wakePriority: 40,
  /**
   * 首夜是否唤醒：否。小恶魔规则明确"除首个夜晚以外"。
   * preCheck 中有 otherNightOnlyCheck 作为防御性校验。
   */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.imp.wake",

  /**
   * 目标选择配置
   * 小恶魔必须选择一名玩家。
   * min: 1, max: 1 — 必须选恰好一名
   * allowSelf: true — 可选自己（自杀传刀）
   * allowDead: true — 可选死亡玩家（空刀伪装士兵/僧侣）
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: true,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 非首夜 + 状态标记） */
  preCheck: [preCheckAliveAndStatus, otherNightOnlyCheck],

  /** calculate：核心计算（验证目标合法性） */
  calculate: [calculateTarget],

  /** stateUpdate：状态持久化（标记死亡 / 自杀传刀） */
  stateUpdate: [applyKillOrSuccession],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
