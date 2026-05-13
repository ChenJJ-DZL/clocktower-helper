/**
 * 间谍（Spy）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 间谍条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚，你能查看魔典。
 *    你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。"
 *
 *   → 每个夜晚都能查看完整游戏状态（魔典），即使死亡也可查看。
 *   → 被其他角色探查时可注册为善良/镇民/外来者（由各角色独立处理）。
 *
 * 【角色简介】
 *   "间谍知道所有人的具体角色。间谍看起来像是善良一员，但实际上是邪恶的。
 *    如果任何角色的能力会探查或影响善良玩家，间谍可能会被那名角色当作
 *    善良阵营。如果任何角色的能力会探查或影响镇民角色或外来者角色，
 *    间谍可能会被那名角色当作是一个特定的镇民或外来者角色。"
 *
 *   → 核心实现：本文件输出魔典数据（全量角色信息+状态），
 *     注册干扰效果由各探查角色（共情者/厨师等）在被探查时独立判断。
 *
 * 【运作方式】
 *   "每个夜晚，唤醒间谍并让他按自己意愿的时长来查看魔典。让间谍重新入睡。
 *    每当因游戏规则或角色能力的效果要探查或影响玩家的阵营或角色，
 *    且间谍因此被选中为目标时，由你决定间谍被当作哪种角色和哪种阵营。"
 *
 *   → 魔典数据在 calculate 中从 snapshot 提取。
 *   → postProcess 输出完整结构化数据供 UI 渲染。
 *
 * 【规则细节】
 *   "查看魔典也属于'获取信息'。如果间谍醉酒或中毒，说书人对他展示的
 *    魔典内容可能会是错误的。"
 *   → 醉酒/中毒时，calculate 对魔典数据中的角色进行随机混淆。
 *
 *   "间谍在魔典中，除去角色标记和提示标记之外，还能查看玩家的阵营。
 *    对于非旅行者角色标记，正面放置代表该玩家阵营与其角色初始阵营相同，
 *    倒转放置代表该玩家阵营与其角色初始阵营不同。"
 *   → 输出每个玩家的实际阵营（含阵营转换标记）。
 *
 *   "仅在暗流涌动这一剧本的实体版本中，间谍的夜晚顺序位于投毒者（首夜）
 *    和僧侣（非首夜）之后……当玩家熟悉游戏之后，间谍还是应当参考线上
 *    魔典的顺序，在将近黎明的时候被唤醒。"
 *   → 本实现在夜末尾唤醒（wakePriority 45），确保看到所有夜晚行动结果。
 *
 *   "相克规则：魔术师：当间谍查看魔典时，魔术师和恶魔的角色标记会被
 *    说书人移除。罂粟种植者：如果罂粟种植者在场，直到其死亡前间谍
 *    无法查看魔典。"
 *   → 相克规则由 JinxManager 或 storyteller 手动处理。
 *
 * 【提示与技巧（相关片段）】
 *   "在魔典中，你不止能够看到谁是谁，还能看到说书人在他们角色标记旁
 *    放置的提示标记。"
 *   → 本实现输出所有 statusEffects 和 reminderTokens。
 *
 *   "你不需要在第一晚就记住整个魔典内容。因为你每个晚上都能看魔典，
 *    每晚记几个角色就行了。"
 *   → 每晚都唤醒，查看实时更新的魔典数据。
 *
 * ============================================================
 * 夜晚顺序
 *   首夜：nightOrderOverrides index 87 → priority 88
 *   其他夜：nightOrderOverrides index 209 → priority 210
 *   间谍在接近黎明时唤醒，确保看到所有夜晚行动结果。
 *   wakePriority 45（晚于绝大多数角色）。
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
  alignment?: string;
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  roleName?: string;
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusEffects?: Array<{ type: string; source?: string; [key: string]: any }>;
  statuses?: Array<{ effect: string; [key: string]: any }>;
  statusDetails?: string[];
  charadeRole?: { id: string; name: string; type: string };
  effectiveRole?: { id: string; name: string; type: string };
  markedForDeath?: boolean;
  deathSource?: string;
  [key: string]: any;
}

/** 魔典中单个玩家的条目 */
interface GrimoirePlayerEntry {
  seatId: number;
  playerName: string;
  /** 真实角色 ID */
  roleId: string;
  /** 真实角色名 */
  roleName: string;
  /** 真实角色类型 */
  roleType: string;
  /** 当前阵营 */
  alignment: "good" | "evil";
  /** 角色标记是否倒置（阵营已变化） */
  alignmentFlipped: boolean;
  /** 是否存活 */
  isAlive: boolean;
  /** 状态效果列表 */
  statusEffects: Array<{ type: string; source?: string }>;
  /** 说书人提示标记 */
  reminderTokens: string[];
}

/** 魔典数据（完整游戏状态快照） */
interface GrimoireData {
  /** 当前夜晚编号 */
  nightCount: number;
  /** 所有玩家的魔典条目 */
  players: GrimoirePlayerEntry[];
  /** 全局效果列表 */
  globalEffects: string[];
  /** 最近夜晚行动日志 */
  recentActions: string[];
  /** 数据是否受醉酒/中毒影响 */
  isCorrupted: boolean;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：状态标记（不检查存活）。
 *
 * 对应规则："每个夜晚，你能查看魔典。即使你已死亡。"
 * 间谍死亡后仍然可以查看魔典，因此 preCheck 不 abort 死亡。
 * 但醉酒/中毒时魔典内容可能错误（由 calculate 处理）。
 */
const preCheckStatusOnly = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  // 死亡不中断（规则允许死后查看魔典），仅标记状态
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
      isDead: !seat?.isAlive,
    },
  };
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 从座位对象安全获取角色 ID。
 */
function getRoleId(seat: PlayerLookup): string {
  return seat.role?.id ?? seat.roleId ?? "";
}

/**
 * 从座位对象安全获取角色名。
 */
function getRoleName(seat: PlayerLookup): string {
  return seat.role?.name ?? seat.roleName ?? "";
}

/**
 * 从座位对象安全获取角色类型。
 */
function getRoleType(seat: PlayerLookup): string {
  return seat.role?.type ?? seat.roleType ?? "";
}

/**
 * 判断玩家当前阵营是否为邪恶。
 *
 * 判定优先级：
 * 1. isGoodConverted → 善良
 * 2. isEvilConverted → 邪恶
 * 3. role.type === "demon" / "minion" → 邪恶
 * 4. seat.alignment === "evil" → 邪恶（兼容预计算快照）
 * 5. isDemonSuccessor → 邪恶
 * 6. 其余 → 善良
 */
function isEvilAlignment(seat: PlayerLookup): boolean {
  if (seat.isGoodConverted) return false;
  if (seat.isEvilConverted) return true;

  const roleType = getRoleType(seat);
  if (roleType === "demon" || roleType === "minion") return true;
  if (seat.alignment === "evil") return true;
  if (seat.isDemonSuccessor) return true;

  return false;
}

/**
 * 判断角色的初始阵营是否与当前阵营一致（角色标记是否倒置）。
 *
 * 非旅行者：初始邪恶（demon/minion）= 邪恶阵营；初始善良 = 善良阵营。
 * 如果当前阵营与初始阵营不同 → 标记倒置（alignmentFlipped = true）。
 */
function isAlignmentFlipped(seat: PlayerLookup): boolean {
  const initialRoleType = getRoleType(seat);
  const initiallyGood =
    initialRoleType !== "demon" && initialRoleType !== "minion";
  const currentlyEvil = isEvilAlignment(seat);

  return initiallyGood ? currentlyEvil : !currentlyEvil;
}

/**
 * 提取座位的状态效果列表。
 */
function extractStatusEffects(
  seat: PlayerLookup
): Array<{ type: string; source?: string }> {
  const effects: Array<{ type: string; source?: string }> = [];
  const raw = seat.statusEffects ?? [];

  for (const e of raw) {
    effects.push({ type: e.type ?? "", source: e.source });
  }

  return effects;
}

/**
 * 提取座位的提示标记（从 statusDetails 或其他字段）。
 */
function extractReminderTokens(seat: PlayerLookup): string[] {
  return seat.statusDetails ?? [];
}

/**
 * 构建单个玩家的魔典条目。
 */
function buildGrimoireEntry(seat: PlayerLookup): GrimoirePlayerEntry {
  return {
    seatId: seat.id,
    playerName: seat.playerName ?? `${seat.id + 1}号`,
    roleId: getRoleId(seat),
    roleName: getRoleName(seat),
    roleType: getRoleType(seat),
    alignment: isEvilAlignment(seat) ? "evil" : "good",
    alignmentFlipped: isAlignmentFlipped(seat),
    isAlive: !seat.isDead && seat.isAlive !== false,
    statusEffects: extractStatusEffects(seat),
    reminderTokens: extractReminderTokens(seat),
  };
}

/**
 * Fisher-Yates 洗牌算法。
 */
function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 交换 players 中两个索引处的角色信息（保留阵营/存活/状态等字段不变）。
 */
function swapRoles(
  players: GrimoirePlayerEntry[],
  i: number,
  j: number
): void {
  const tempId = players[i].roleId;
  const tempName = players[i].roleName;
  const tempType = players[i].roleType;

  players[i] = { ...players[i], roleId: players[j].roleId, roleName: players[j].roleName, roleType: players[j].roleType };
  players[j] = { ...players[j], roleId: tempId, roleName: tempName, roleType: tempType };
}

/**
 * 醉酒/中毒时对魔典数据进行混淆。
 *
 * 规则："如果间谍醉酒或中毒，说书人对他展示的魔典内容可能会是错误的。"
 * 混淆策略：
 * - 随机交换 ⌊N/2⌋ 对玩家的 roleId/roleName/roleType（不改变阵营标记/状态）
 * - 每对玩家只参与一次交换（Fisher-Yates 打乱后按相邻配对）
 * - 每次调用均重新随机，连续醉酒时每晚的交换对完全不同
 */
function corruptGrimoireData(data: GrimoireData): GrimoireData {
  const players = [...data.players];
  const count = players.length;
  const pairCount = Math.floor(count / 2);

  if (pairCount >= 1) {
    // Fisher-Yates 打乱索引，然后每相邻两个为一对进行交换
    const indices = shuffleIndices(count);

    for (let p = 0; p < pairCount; p++) {
      const i = indices[p * 2];
      const j = indices[p * 2 + 1];
      swapRoles(players, i, j);
    }
  }

  return { ...data, players, isCorrupted: true };
}

/**
 * 从 snapshot 中提取最近的对局记录。
 * 目前通过 _abilityResults 和其他元数据构建摘要。
 */
function extractRecentActions(snapshot: any, nightCount: number): string[] {
  const actions: string[] = [];
  const results = snapshot._abilityResults as Record<string, any> | undefined;

  if (results) {
    if (results.chef !== undefined) {
      actions.push(`厨师得知有 ${results.chef} 对相邻邪恶玩家`);
    }
    if (results.washerwoman) {
      actions.push(
        `洗衣妇得知 ${results.washerwoman.seat1 + 1}号和${
          results.washerwoman.seat2 + 1
        }号中有${results.washerwoman.roleName}`
      );
    }
    if (results.fortune_teller) {
      actions.push(
        `占卜师得知两名目标中${results.fortune_teller.result ? "有恶魔" : "没有恶魔"}`
      );
    }
    if (results.fortune_teller?.nightCount === nightCount) {
      // 占卜师的结果
    }
  }

  // 标记为死亡的玩家
  const deathActions = (snapshot.seats as PlayerLookup[])
    .filter((s: PlayerLookup) => s.markedForDeath)
    .map(
      (s: PlayerLookup) =>
        `${s.playerName ?? s.id + 1}号被标记为死亡（来源: ${s.deathSource ?? "未知"}）`
    );
  actions.push(...deathActions);

  return actions;
}

/**
 * 构建完整魔典数据。
 */
function buildGrimoireData(
  seats: PlayerLookup[],
  snapshot: any,
  nightCount: number,
  isCorrupted: boolean
): GrimoireData {
  const playerEntries = seats.map(buildGrimoireEntry);
  const globalEffects: string[] = [];

  if (snapshot.globalEffects?.vortoxWorld) {
    globalEffects.push("涡流在场");
  }

  const data: GrimoireData = {
    nightCount,
    players: playerEntries,
    globalEffects,
    recentActions: extractRecentActions(snapshot, nightCount),
    isCorrupted: false,
  };

  if (isCorrupted) {
    return corruptGrimoireData(data);
  }

  return data;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：构建魔典数据。
 *
 * 从 snapshot.seats 提取所有玩家的完整信息，构建结构化魔典视图。
 * 醉酒/中毒时对数据进行混淆。
 *
 * 优先级：
 * 1. storytellerInput.overrideResult — 说书人手动覆盖魔典数据
 * 2. 动态构建（buildGrimoireData）
 */
const calculateGrimoire = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const nightCount = snapshot.nightCount ?? 0;
  const seats: PlayerLookup[] = snapshot.seats ?? [];

  if (seats.length === 0) {
    return { ...context, aborted: true, abortReason: "无座位数据" };
  }

  // 优先级 1：说书人手动覆盖魔典数据
  if (storytellerInput?.overrideResult) {
    return {
      ...context,
      meta: {
        ...context.meta,
        grimoireData: storytellerInput.overrideResult as GrimoireData,
        isCorrupted: !abilityEffective,
      },
    };
  }

  // 优先级 2：动态构建
  const grimoireData = buildGrimoireData(
    seats,
    snapshot,
    nightCount,
    !abilityEffective
  );

  return {
    ...context,
    meta: {
      ...context.meta,
      grimoireData,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：记录间谍查看魔典事件。
 */
const recordGrimoireView = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const grimoireData = meta.grimoireData as GrimoireData | undefined;

  if (!grimoireData) return context;

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        spyGrimoireView: {
          nightCount: grimoireData.nightCount,
          viewedAt: Date.now(),
          isCorrupted: meta.isCorrupted ?? false,
        },
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        spy: {
          lastViewedNight: grimoireData.nightCount,
          isCorrupted: meta.isCorrupted ?? false,
        },
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、魔典数据、UI 展示结构。
 *
 * 魔典数据（displayInfo.grimoire）包含 UI 渲染所需的完整信息：
 * - players: 每位玩家的角色/阵营/状态
 * - globalEffects: 全局效果
 * - recentActions: 最近夜间行动日志
 */
const postProcessGrimoire = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const grimoireData = meta.grimoireData as GrimoireData | undefined;

  if (!grimoireData) return context;

  const tag = meta.isCorrupted ? "【受干扰】" : "";
  const isDeadTag = meta.isDead ? "【已死亡】" : "";
  const playerCount = grimoireData.players.length;

  // 魔典摘要统计
  const evilCount = grimoireData.players.filter(
    (p) => p.alignment === "evil"
  ).length;
  const flippedCount = grimoireData.players.filter(
    (p) => p.alignmentFlipped
  ).length;

  // 英文 simulation log
  const simLog =
    `[Spy]${tag}${isDeadTag} Viewed grimoire (night ${grimoireData.nightCount}): ` +
    `${playerCount} players, ${evilCount} evil, ${flippedCount} alignment-flipped`;

  const selfSeatId = context.actionNode.seatId;

  // 说书人提示词
  const storytellerPrompt =
    `唤醒${selfSeatId + 1}号【间谍】，让他查看魔典。` +
    `（当前共 ${playerCount} 名玩家，其中 ${evilCount} 名邪恶阵营）`;

  // 中文日志
  const abilityLog =
    `间谍${tag}${isDeadTag}查看了魔典` +
    `（第 ${grimoireData.nightCount} 夜，${playerCount} 人，${evilCount} 邪恶）`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化魔典数据
      displayInfo: {
        type: "spy_grimoire",
        grimoire: grimoireData,
        isCorrupted: meta.isCorrupted ?? false,
        isDead: meta.isDead ?? false,
        nightCount: grimoireData.nightCount,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const spyAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "spy",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "spy_night_ability",
  /** 能力中文名 */
  abilityName: "查看魔典",

  /** 触发时机：每晚（首夜 + 其他夜） */
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 首夜：nightOrderOverrides index 87 → priority 88
   * 其他夜：nightOrderOverrides index 209 → priority 210
   * 在接近黎眀时唤醒，确保看到所有夜晚行动结果。
   */
  wakePriority: 45,
  /** 每晚都唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.spy.wake",

  /**
   * 目标选择配置
   * 间谍不需要选择目标（查看魔典是全局信息）。
   * min: 0, max: 0 表示无需选择目标。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（仅状态标记，死亡不阻断） */
  preCheck: [preCheckStatusOnly],

  /** calculate：核心计算（构建魔典数据） */
  calculate: [calculateGrimoire],

  /** stateUpdate：状态持久化（记录查看事件） */
  stateUpdate: [recordGrimoireView],

  /** postProcess：后处理（日志 + 魔典数据 + UI 展示结构） */
  postProcess: [postProcessGrimoire],
});
