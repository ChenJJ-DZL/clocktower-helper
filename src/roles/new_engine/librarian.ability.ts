/**
 * 图书管理员（Librarian）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 图书管理员条目）
 * ============================================================
 *
 * 【角色能力】
 *   "在你的首个夜晚，你会得知两名玩家和一个外来者角色：这两名玩家之一是该角色
 *   （或者你会得知没有外来者在场）。"
 *
 * 【角色简介】
 *   "图书管理员会得知一个特定的在场外来者角色，但不知道是谁在扮演该角色。
 *   在第一个夜晚，图书管理员会得知两名玩家其中一人的外来者角色。
 *   图书管理员只会得知一次信息，之后便无法获取更多信息。
 *   酒鬼是外来者。如果图书管理员得知两名玩家中有酒鬼，他不会得知酒鬼玩家以为
 *   的那个镇民角色。"
 *
 * 【运作方式】
 *   "在为首个夜晚进行准备时，将图书管理员的'外来者'提示标记放置在任意一个
 *   外来者角色标记旁，然后将图书管理员的'错误'提示标记放置在任意其他角色标记旁。
 *   在首个夜晚里，唤醒图书管理员，并指向标记有'外来者'和'错误'的玩家。
 *   将有'外来者'的玩家的角色标记展示给图书管理员。或者，如果说书人由于场上无
 *   外来者而未放置这两个标记，则对图书管理员展示手势'0'。"
 *
 * 【提示标记】
 *   "放置条件：放置在一个对应外来者角色或能被当作外来者角色的角色标记旁边。"
 *   → 间谍（spy）和陌客（recluse）可被当作外来者。
 *
 * 【规则细节】
 *   "如果在首夜就中毒或醉酒，图书管理员可能会得知错误的玩家（没有放置他的
 *   提示标记的玩家），或得知错误的角色，或两者兼而有之。但即使如此，说书人也
 *   应该让图书管理员得知外来者角色，否则等同于在明示图书管理员他自己醉酒中毒了。
 *   ... 特定角色互动：陌客：在仅有一名外来者且为陌客的情况下，图书管理员可能会将
 *   陌客当作非外来者角色，从而得知没有外来者在场。
 *   间谍：图书管理员能将间谍当作外来者，并得知间谍和任意其他玩家之中有一个
 *   任意外来者角色。"
 *
 * 【提示与技巧（相关片段）】
 *   "找出两位玩家当中哪一位是你所知道的那位外来者非常重要。"
 *   → 作为信息类角色，图书管理员获知的信息可用于锁定外来者身份。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 52：洗衣妇    → wakePriority = 10（52 - 42）
 *   序号 53：图书管理员 → wakePriority = 11（53 - 42）
 *   序号 54：调查员    → wakePriority = 12（54 - 42）
 *   序号 55：厨师      → wakePriority = 13（55 - 42）
 *   公式：wakePriority = 官方序号 - 42
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface LibrarianInfo {
  seat1: number;
  seat2: number;
  roleName: string;
}

/** 兼容 snapshot.seats 中各种可能的数据结构 */
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
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：只有存活且未被干扰的图书管理员才能获取正确信息。
 * 醉酒/中毒时仍允许技能触发，但效果在 calculate 阶段被替换为假信息。
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
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

/**
 * preCheck 第 2 步：首夜限制
 *
 * 对应规则：图书管理员仅在首个夜晚获得信息（仅一次，之后不再唤醒）。
 */
const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return { ...context, aborted: true, abortReason: "非首夜，图书管理员不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 获取可注册为外来者的座位列表（排除自身和死亡玩家）
 *
 * 对应规则：
 * - 正常外来者（role.type === "outsider"）是主要候选
 * - 间谍（"spy"）可被当作外来者（规则细节明确说明）
 * - 陌客（"recluse"）可被当作外来者（提示标记说明"能被当作外来者角色"）
 *   但陌客也有概率不被当作外来者（导致图书管理员得知 0）
 * - 酒鬼（"drunk"）使用其 charadeRole 显示的角色名
 */
function getOutsiderCandidates(
  seats: PlayerLookup[],
  selfSeatId: number
): Array<{ seat: PlayerLookup; roleName: string }> {
  const candidates: Array<{ seat: PlayerLookup; roleName: string }> = [];

  for (const seat of seats) {
    if (seat.id === selfSeatId || seat.isDead || !seat.role) continue;

    const realRole = seat.role;
    const displayRole = seat.effectiveRole ?? seat.charadeRole ?? realRole;

    const canRegisterAsOutsider =
      realRole.id === "spy";

    if (realRole.type === "outsider" || canRegisterAsOutsider) {
      candidates.push({ seat, roleName: displayRole.name ?? realRole.name });
    }
  }

  return candidates;
}

/**
 * 获取场上所有外来者角色的名称列表（用于醉酒/中毒时生成合理的假角色）
 */
function getScriptOutsiderRoles(seats: PlayerLookup[]): string[] {
  const roleNames = new Set<string>();
  for (const seat of seats) {
    if (seat.role?.type === "outsider") {
      roleNames.add(seat.role.name);
    }
  }
  return Array.from(roleNames);
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 正常情况生成真实信息
 *
 * 模拟说书人的"外来者"标记和"错误"标记放置行为：
 * 1. 从外来者候选池中随机选一名玩家作为"真实外来者"
 * 2. 从剩余玩家中随机选一名作为"干扰项"
 * 3. 随机打乱顺序
 *
 * 无外来者候选时返回手势"0"（对应 roleName === "" 或特殊标记）。
 */
function generateRealInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): LibrarianInfo {
  const outsiderCandidates = getOutsiderCandidates(seats, selfSeatId);

  if (outsiderCandidates.length === 0) {
    return { seat1: 0, seat2: 0, roleName: "" };
  }

  const targetIdx = Math.floor(Math.random() * outsiderCandidates.length);
  const { seat: targetSeat, roleName: targetRoleName } =
    outsiderCandidates[targetIdx];

  const decoyPool = seats.filter(
    (s: any) =>
      s.id !== targetSeat.id && s.id !== selfSeatId && !s.isDead && s.role
  );
  const decoySeat =
    decoyPool.length > 0
      ? decoyPool[Math.floor(Math.random() * decoyPool.length)]
      : targetSeat;

  const ids =
    Math.random() < 0.5
      ? [targetSeat.id, decoySeat.id]
      : [decoySeat.id, targetSeat.id];

  return { seat1: ids[0], seat2: ids[1], roleName: targetRoleName };
}

/**
 * 醉酒/中毒时生成虚假信息
 *
 * 对应规则："说书人也应该让图书管理员得知外来者角色，否则等同于在明示
 * 图书管理员他自己醉酒中毒了"。但也可能给出"0"以混淆。
 */
function generateFakeInfo(
  seats: PlayerLookup[],
  selfSeatId: number
): LibrarianInfo {
  const outsiderRoles = getScriptOutsiderRoles(seats);
  const others = seats.filter(
    (s: any) => s.id !== selfSeatId && !s.isDead && s.role
  );

  if (others.length === 0) {
    return { seat1: 0, seat2: 0, roleName: "" };
  }

  const shuffled = shuffleArray(others);
  const seat1 = shuffled[0]?.id ?? selfSeatId;
  const seat2 = shuffled[1]?.id ?? seat1;

  const roleName =
    outsiderRoles.length > 0
      ? outsiderRoles[Math.floor(Math.random() * outsiderRoles.length)]
      : "";

  return { seat1, seat2, roleName };
}

// ─── 核心解析器 ──────────────────────────────────────────────────────

/**
 * 解析图书管理员最终获得的信息，按以下优先级：
 *
 * 1. storytellerInput.overrideResult    — 说书人手动完全覆盖
 * 2. storytellerInput.fakeResult        — 说书人指定的假信息（醉酒/中毒时）
 * 3. meta.initialNightInfo.librarianInfo — 预置首夜信息
 * 4. 动态生成（generateRealInfo / generateFakeInfo）
 *
 * 注意：abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动计算（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
function resolveLibrarianInfo(
  snapshot: any,
  selfSeatId: number,
  abilityEffective: boolean,
  storytellerInput?: any,
  initialNightInfo?: any
): LibrarianInfo {
  if (storytellerInput?.overrideResult) {
    return storytellerInput.overrideResult as LibrarianInfo;
  }

  if (!abilityEffective && storytellerInput?.fakeResult) {
    return storytellerInput.fakeResult as LibrarianInfo;
  }

  if (initialNightInfo?.librarianInfo) {
    const info = initialNightInfo.librarianInfo as LibrarianInfo;
    if (!abilityEffective) {
      const allOutsiders = getScriptOutsiderRoles(snapshot.seats);
      const others = allOutsiders.filter((r) => r !== info.roleName);
      return {
        seat1: info.seat1,
        seat2: info.seat2,
        roleName:
          others.length > 0
            ? others[Math.floor(Math.random() * others.length)]
            : info.roleName,
      };
    }
    return info;
  }

  return abilityEffective
    ? generateRealInfo(snapshot.seats, selfSeatId)
    : generateFakeInfo(snapshot.seats, selfSeatId);
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成图书管理员能力结果
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 返回真实信息
 * - false → 返回虚假信息（替换玩家/角色，但保持外来者角色类型）
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;

  const selfSeat = snapshot.seats.find((s: any) => s.id === selfSeatId);
  if (!selfSeat) {
    return { ...context, aborted: true, abortReason: "未找到图书管理员座位" };
  }

  const info = resolveLibrarianInfo(
    snapshot,
    selfSeatId,
    abilityEffective,
    storytellerInput,
    meta.initialNightInfo
  );

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: info,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将图书管理员信息持久化到 actionNode 和 snapshot 中
 *
 * 存储位置：
 * - actionNode.meta.librarianResult
 * - snapshot._abilityResults.librarian
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as LibrarianInfo | undefined;

  if (!result?.roleName && result?.seat1 === 0 && result?.seat2 === 0) {
    return context;
  }

  const persistedRecord = {
    seat1: result?.seat1,
    seat2: result?.seat2,
    roleName: result?.roleName ?? "",
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        librarianResult: persistedRecord,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        librarian: result,
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据
 *
 * 输出内容：
 * 1. console.log — 详细 simulation log（含玩家名 + 座位号 + 干扰标记）
 * 2. meta.prompt — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as LibrarianInfo | undefined;

  if (!result?.roleName && result?.seat1 === 0 && result?.seat2 === 0) {
    console.log("[Librarian] 无外来者在场（0）");
    return {
      ...context,
      meta: {
        ...context.meta,
        prompt: "图书管理员，请睁眼。场上没有外来者在场。（手势 0）",
        abilityLog: "图书管理员得知：场上没有外来者在场。",
        displayInfo: {
          type: "librarian_info",
          hasOutsider: false,
          isCorrupted: meta.isCorrupted ?? false,
          log: "图书管理员得知：场上没有外来者在场。",
        },
      },
    };
  }

  if (!result?.roleName) return context;

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label1 = findLabel(result.seat1);
  const label2 = findLabel(result.seat2);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  const simLog = `[Librarian]${tag} ${label1} & ${label2} → ${result.roleName}`;

  const storytellerPrompt =
    `图书管理员，请睁眼。请查看 ${result.seat1 + 1} 号` +
    `和 ${result.seat2 + 1} 号玩家，其中有一名是【${result.roleName}】`;

  const abilityLog = `图书管理员${tag}获得信息：${label1}和${label2}之中有一名是【${result.roleName}】`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "librarian_info",
        players: [result.seat1, result.seat2],
        roleName: result.roleName,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const librarianAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "librarian",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "librarian_first_night_ability",
  /** 能力中文名 */
  abilityName: "外来者识别",

  /** 触发时机：仅首夜 */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方首夜顺序 #53（53 - 42 = 11）
   * 在同类信息角色中：
   *   洗衣妇 10 (52) < 图书管理员 11 (53) < 调查员 12 (54) < 厨师 13 (55)
   */
  wakePriority: 11,
  /** 仅首夜生效，非首夜不唤醒 */
  firstNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.librarian.wake",

  /**
   * 目标选择配置
   * 图书管理员是信息类角色（无需主动选择目标），由说书人/引擎自动分配信息
   * min: 0, max: 0 表示无需玩家选择目标
   * allowSelf: false — 图书管理员不能选择自己
   * allowDead: false — 只能探查存活玩家
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 首夜 + 状态标记） */
  preCheck: [preCheckAliveAndStatus, firstNightOnlyCheck],

  /** calculate：核心效果计算（信息生成） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
