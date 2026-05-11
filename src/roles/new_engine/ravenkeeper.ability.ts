/**
 * 守鸦人（Ravenkeeper）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 守鸦人条目）
 * ============================================================
 *
 * 【角色能力】
 *   "如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。"
 *
 * 【运作方式】
 *   "如果守鸦人在夜晚死去，唤醒他。让守鸦人指向任意一名玩家。
 *    对守鸦人展示那名玩家的角色标记。让守鸦人重新入睡。"
 *   → 守鸦人死亡的当晚触发，选择一名玩家并得知其角色。
 *
 * 【规则细节】
 *   "只要守鸦人死在夜晚，不论因什么原因而死，他都能被唤醒并使用能力。"
 *   → 任何夜晚死亡原因均可触发（恶魔杀害、刺客刺杀等）。
 *
 *   "醉酒或中毒的守鸦人，或是以为自己是守鸦人的酒鬼或提线木偶
 *    如果在夜晚死亡，仍然会被唤醒并使用能力。"
 *   → 醉酒/中毒不影响触发，但信息可能错误。
 *
 *   "守鸦人只会得知玩家的角色，不会得知玩家的阵营。"
 *   → 仅返回角色名，不返回阵营信息。
 *
 *   "守鸦人在得知信息时会受到互动干扰类能力的影响而可能得知错误的角色。"
 *   → Recluse/Spy 可注册为其它角色。
 *
 *   "如果守鸦人愿意，他可以选择一名已死亡的玩家。"
 *   → 允许选择死亡玩家。
 *
 * 【提示与技巧（相关片段）】
 *   "选存活的玩家通常比选已经死亡的玩家更能带来收益。"
 *   "当心间谍和陌客。如果你认为某名玩家是间谍，在你选择他时
 *    不大可能会得知他的真实角色。"
 *   "记住，你只有死在夜晚才会得到信息。死在白天你将不会得知任何事情。"
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（其他夜晚）.json）
 *   序号 80：守鸦人 → wakePriority = 38（80 - 42）
 *   在死亡触发类角色中：
 *     守鸦人 38 (80) < 贤者 39 (81) < 秉笔 40 (82) < 瘟疫医生 41 (83)
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface RavenkeeperInfo {
  targetId: number;
  roleName: string;
}

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
  diedAtNight?: number;
  markedForDeath?: boolean;
  role?: { id: string; name: string; type: string };
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：死亡检测 + 醉酒/中毒标记
 *
 * 对应规则：守鸦人只有在今晚死亡时才会触发技能。
 * 检测 diedAtNight 是否等于当前 nightCount，或 markedForDeath 是否为 true。
 * 醉酒/中毒不影响触发，但会影响计算结果（在 calculate 中处理）。
 */
const preCheckDeathAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat) {
    return { ...context, aborted: true, abortReason: "未找到守鸦人座位" };
  }

  const diedTonight =
    seat.diedAtNight === nightCount || seat.markedForDeath === true;

  if (!diedTonight) {
    return {
      ...context,
      aborted: true,
      abortReason: "守鸦人今晚未死亡，技能不触发",
    };
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
 * 获取目标玩家的角色名，考虑 Recluse/Spy 等注册效果。
 *
 * 规则细节：
 * - Recluse（陌客）：50% 概率被当作邪恶角色（minion/demon）。
 * - Spy（间谍）：可注册为善良角色，但对守鸦人展示的角色名无直接影响。
 *   按实际调用 effectiveRole / charadeRole 后的显示名返回。
 * - 酒鬼：展示酒鬼角色标记而非其以为的角色标记。
 */
function resolveTargetRole(
  targetSeat: PlayerLookup,
  seats: PlayerLookup[]
): string {
  const realRole = targetSeat.role;
  const displayRole =
    targetSeat.effectiveRole ?? targetSeat.charadeRole ?? realRole;

  if (realRole?.id === "recluse" && Math.random() < 0.5) {
    const evilRoles = seats.filter(
      (s: any) => s.role?.type === "minion" || s.role?.type === "demon"
    );
    if (evilRoles.length > 0) {
      const randomEvil =
        evilRoles[Math.floor(Math.random() * evilRoles.length)];
      return randomEvil.role?.name ?? displayRole?.name ?? "未知角色";
    }
  }

  return displayRole?.name ?? realRole?.name ?? "未知角色";
}

/**
 * 醉酒/中毒时生成虚假角色名。
 *
 * 规则：醉酒/中毒的守鸦人仍然被唤醒，但获得的信息可能是错误的。
 * 从场上其他玩家中随机取一个角色名作为虚假结果。
 */
function generateFakeRoleName(seats: PlayerLookup[]): string {
  const validSeats = seats.filter((s: any) => s.role);
  if (validSeats.length === 0) return "洗衣妇";
  const random = validSeats[Math.floor(Math.random() * validSeats.length)];
  return random.role?.name ?? "洗衣妇";
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成守鸦人能力结果
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 返回目标玩家的真实角色
 * - false → 返回虚假角色名
 *
 * 优先级：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖
 * 2. storytellerInput.fakeResult        — 说书人预设假信息（仅 !abilityEffective）
 * 3. 动态生成（resolveTargetRole / generateFakeRoleName）
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const targetId = targetIds?.[0];

  if (targetId === undefined) {
    return { ...context, aborted: true, abortReason: "守鸦人未选择目标" };
  }

  // 优先级 1：说书人手动覆盖
  if (storytellerInput?.overrideResult) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: storytellerInput.overrideResult as RavenkeeperInfo,
        isCorrupted: !abilityEffective,
      },
    };
  }

  // 优先级 2：说书人预设假信息
  if (!abilityEffective && storytellerInput?.fakeResult) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: storytellerInput.fakeResult as RavenkeeperInfo,
        isCorrupted: true,
      },
    };
  }

  // 优先级 3：动态计算
  const targetSeat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === targetId
  );

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "目标玩家不存在" };
  }

  const roleName = abilityEffective
    ? resolveTargetRole(targetSeat, snapshot.seats)
    : generateFakeRoleName(snapshot.seats);

  const result: RavenkeeperInfo = {
    targetId,
    roleName,
  };

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: result,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将守鸦人信息持久化到 actionNode 和 snapshot 中
 *
 * 存储位置：
 * - actionNode.meta.ravenkeeperResult — 当前行动节点元数据
 * - snapshot._abilityResults.ravenkeeper — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as RavenkeeperInfo | undefined;

  if (!result?.roleName) return context;

  const persistedRecord = {
    targetId: result.targetId,
    roleName: result.roleName,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        ravenkeeperResult: persistedRecord,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        ravenkeeper: result,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据
 *
 * 输出内容：
 * 1. console.log — 详细 simulation log（含干扰标记）
 * 2. meta.prompt — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as RavenkeeperInfo | undefined;

  if (!result?.roleName) return context;

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label = findLabel(result.targetId);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 详细 simulation log
  const simLog = `[Ravenkeeper]${tag} Sees: ${label} → ${result.roleName}`;

  // 说书人提示词
  const storytellerPrompt =
    `守鸦人，请睁眼。今晚你已死亡，可以选择一名玩家得知其角色。` +
    `（${result.targetId + 1} 号玩家的角色是【${result.roleName}】）`;

  // 中文日志
  const abilityLog =
    `守鸦人${tag}在死亡前夜得知：${label} 的角色是【${result.roleName}】`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "ravenkeeper_info",
        targetId: result.targetId,
        roleName: result.roleName,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const ravenkeeperAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "ravenkeeper",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "ravenkeeper_death_ability",
  /** 能力中文名 */
  abilityName: "亡者低语",

  /** 触发时机：死亡时触发 */
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方其他夜晚顺序 #80（80 - 42 = 38）
   *   守鸦人 38 (80) < 贤者 39 (81) < 秉笔 40 (82)
   */
  wakePriority: 38,
  /** 非首夜生效 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.ravenkeeper.trigger",

  /**
   * 目标选择配置
   * 守鸦人可选择任意一名玩家（含已死亡玩家）查看角色
   * min: 1, max: 1 — 必须且只能选择一名玩家
   * allowSelf: false — 不能选择自己（规则：查看其他玩家的角色）
   * allowDead: true — 可以选择已死亡的玩家（规则明确允许）
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（死亡检测 + 状态标记） */
  preCheck: [preCheckDeathAndStatus],

  /** calculate：核心效果计算（获取目标玩家的角色名） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
