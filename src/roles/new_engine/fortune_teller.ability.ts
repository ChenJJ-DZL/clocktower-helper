/**
 * 占卜师（Fortune Teller）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 占卜师条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。
 *    会有一名善良玩家始终被你的能力当作恶魔。"
 *
 * 【角色简介】
 *   "占卜师能探查谁是恶魔，但某些时候也会误以为善良玩家是恶魔。
 *    每个夜晚，占卜师需要选择两名玩家，得知其中是否有恶魔。他
 *    不会得知具体哪一名玩家是恶魔，只知道两名玩家之中有恶魔。
 *    如果两名玩家均不是恶魔，他会得知'否'。
 *    不幸的是，会有一名被称作'干扰项'的玩家，会被占卜师在选中
 *    时当作恶魔。'干扰项'在一整场游戏中只会是同一名玩家。这名
 *    玩家可以是任何善良玩家，甚至是占卜师自己。占卜师不会知道
 *    哪一名玩家是他的'干扰项'。
 *    占卜师可以选择任意两名玩家——无论他们存活与否，甚至可以选择
 *    自己。如果占卜师选中了已死亡的恶魔，仍然会得知'是'。"
 *
 *   → 核心机制：
 *     - 每晚选择两名玩家（可重复、可选自己、可选死亡）
 *     - 返回 boolean true/false — 两名玩家中"是否有恶魔或干扰项"
 *     - 干扰项（Boon）：一名善良玩家始终被能力当作恶魔
 *
 * 【运作方式】
 *   "在为首个夜晚进行准备时，将占卜师的'干扰项'提示标记放置在
 *    任意善良角色标记旁，标记那名玩家为'干扰项'。
 *    每个夜晚，唤醒占卜师。让占卜师指向任意两名玩家。如果这两名
 *    玩家中任意一名是恶魔或'干扰项'，对占卜师点头表示'是'。否则，
 *    摇头表示'否'。让占卜师重新入睡。"
 *
 * 【提示标记】
 *   "放置时机：在为首个夜晚做准备时放置。
 *    放置条件：放置在任意一个善良玩家的角色标记旁边，可以
 *    是占卜师自己。
 *    移除时机：占卜师死亡或离场时。"
 *
 * 【规则细节】
 *   "一旦被他标记为'干扰项'的那名玩家变为邪恶阵营，说书人就
 *    需要重新选择另一名善良玩家并放置'干扰项'标记。"
 *   → 本实现复用 FortuneTellerBoonManager，支持干扰项自动转移。
 *
 *   "以为自己是占卜师的酒鬼因为不具有占卜师的能力，也就因此
 *    不会有'干扰项'这个标记。提线木偶同理。"
 *   → 只有真占卜师的执行才会管理 Boon；醉酒占卜师仍然会触发
 *     能力（但返回假结果），Boon 管理器不受影响。
 *
 *   "占卜师因为选择'干扰项'而得知'是'不会计入到数学家的能力
 *    检测中，因为这是他自身能力让自己获取的信息出错。"
 *   → 干扰项导致的 "yes" 属于能力固有缺陷，不计入数学家。
 *
 *   "涡流：如果涡流在场，占卜师仅仅选中了'干扰项'会得知'是'，
 *    这是因为占卜师的获取信息只判断'是否选中了恶魔'，而这次
 *    选择他没有选中恶魔，因此得知'是'。"
 *   → 干扰项的"被当作恶魔"效果与 Vortox 独立。
 *     abilityPriorityCalculation 中 Vortox 会设 abilityEffective
 *     = false，此时 calculate 按能力失效逻辑返回假结果。
 *
 *   "咖啡师的'获取正确信息'效果对占卜师生效的期间里，会让
 *    占卜师不再把'干扰项'错认成恶魔。"
 *   → 咖啡师效果下，checkBoon = false，干扰项不被计入。
 *
 * 【提示与技巧（相关片段）】
 *   "当心陌客，他可能会被你当做恶魔。这和'干扰项'不是一回事。"
 *   → Recluse 可以独立于干扰项被当作恶魔（额外误报源）。
 *
 *   "你可以选择查验你自己和另一位玩家。因为你已经知道自己不是
 *    恶魔了，这样你就能去确认某一位玩家的角色。尽管是这样你也
 *    还是要小心，说书人可能让你自己作为那个'干扰项'。"
 *   → allowSelf: true，占卜师可以选自己。
 *
 * ============================================================
 * 夜晚顺序
 *   首夜 #57 → wakePriority 30（公式: 57 - 27 = 30）
 *   共情者 #56 → wakePriority 20 < 占卜师 30
 *   其他夜：nightOrderOverrides 中 fortune_teller 在信息类末尾
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { fortuneTellerBoonManager } from "../../utils/FortuneTellerBoonManager";

// ─── 辅助类型 ────────────────────────────────────────────────────────

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive?: boolean;
  playerName?: string;
  alignment?: string;
  role?: {
    id: string;
    name: string;
    type: string;
    alignment?: string;
  };
  roleId?: string;
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：占卜师死亡时技能不应触发；醉酒/中毒时允许触发，
 * 但结果在 calculate 中被替换为假信息。
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

  // 检查 statusEffects（兼容 seat 自身和 snapshot 顶层两种存储位置）
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
 * 判断给定玩家在占卜师探查中是否应被视为"恶魔"。
 *
 * 判定逻辑（优先级从高到低）：
 *  1. role.type === "demon"                          → 真恶魔（含已死亡恶魔）
 *  2. isDemonSuccessor && role.type === "demon"       → 红唇女郎继任恶魔
 *  3. 干扰项（Boon）&& checkBoon === true             → 被当作恶魔
 *  4. role.id === "recluse"                          → 额外误报源：50% 被当作恶魔
 *  5. role.id === "spy"                              → 额外误报源：50% 被当作善良（不计恶魔）
 *  6. 其余情况                                       → 非恶魔
 *
 * 注意：
 * - Boon 仅在 checkBoon = true 时计入（咖啡师效果下 checkBoon = false）
 * - Recluse/Spy 的判定结果在单次技能中一致（首次判定后缓存至 meta）
 */
function isEffectivelyDemon(
  seat: PlayerLookup,
  isBoon: boolean,
  checkBoon: boolean,
  meta: Record<string, any>
): boolean {
  const roleId = seat.role?.id ?? seat.roleId ?? "";
  const roleType = seat.role?.type ?? "";

  // 1. 真恶魔（含死亡恶魔 — 规则："选中已死亡恶魔仍得知'是'"）
  if (roleType === "demon") return true;

  // 2. 恶魔继任者（红唇女郎变身后）
  if (seat.isDemonSuccessor && roleType === "demon") return true;

  // 3. 干扰项（仅在 abilityEffective 时计入；咖啡师效果下 checkBoon = false）
  if (checkBoon && isBoon) return true;

  // 4. Recluse：50% 概率被当作恶魔（独立于干扰项）
  //    "当心陌客，他可能会被你当做恶魔。这和'干扰项'不是一回事。"
  if (roleId === "recluse") {
    const key = `ft_recluse_${seat.id}`;
    if (meta[key] === undefined) {
      meta[key] = Math.random() < 0.5;
    }
    return meta[key] as boolean;
  }

  // 5. Spy：50% 概率被当作善良（不记为恶魔）
  //    （与 Chef 中 Spy 的角色能力一致）
  if (roleId === "spy") {
    const key = `ft_spy_${seat.id}`;
    if (meta[key] === undefined) {
      meta[key] = Math.random() < 0.5; // true = 被当作善良
    }
    if (meta[key]) return false;
  }

  // 6. 其余情况 → 非恶魔
  return false;
}

/**
 * 首夜：初始化占卜师干扰项（Boon）。
 *
 * 对应规则："在为首个夜晚进行准备时，将占卜师的'干扰项'提示标记
 * 放置在任意善良角色标记旁，标记那名玩家为'干扰项'。"
 *
 * 实现：从非占卜师、非邪恶的存活玩家中随机选一名。
 * 如果不存在（极端情况），则选占卜师自身作为干扰项。
 *
 * 复用项目中已有的 FortuneTellerBoonManager。
 */
function initializeBoon(
  seats: PlayerLookup[],
  fortuneTellerSeatId: number,
  gameId: string
): void {
  // 已初始化则跳过
  if (fortuneTellerBoonManager.getCurrentBoon(gameId) !== null) return;

  // 筛选候选：存活、非占卜师、非邪恶
  const candidates = seats.filter((s: PlayerLookup) => {
    if (s.id === fortuneTellerSeatId) return false;
    if (s.isDead) return false;
    const roleType = s.role?.type ?? "";
    if (roleType === "demon" || roleType === "minion") return false;
    if (s.alignment === "evil") return false;
    if (s.isEvilConverted) return false;
    return true;
  });

  const boonSeatId =
    candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)].id
      : fortuneTellerSeatId; // 极端情况：选自身

  fortuneTellerBoonManager.initializeBoon(
    gameId,
    fortuneTellerSeatId,
    boonSeatId
  );

  console.log(
    `[FortuneTeller] Boon initialized: FT=${fortuneTellerSeatId}, boon=${boonSeatId}`
  );
}

/**
 * 生成醉酒/中毒时的虚假结果。
 *
 * 规则：说书人应返回一个看似合理的结果。随机 true/false。
 */
function generateFakeResult(): boolean {
  return Math.random() < 0.5;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成占卜师探查结果（两名目标中是否有恶魔/干扰项）。
 *
 * 优先级（从高到低）：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖（boolean）
 * 2. storytellerInput.fakeResult       — 说书人预设假信息（仅 !abilityEffective 时）
 * 3. 动态判定                           — isEffectivelyDemon + boon
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件在 calculate
 * 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, storytellerInput, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  const seats: PlayerLookup[] = snapshot.seats ?? [];
  if (seats.length === 0) {
    return { ...context, aborted: true, abortReason: "无座位数据" };
  }

  // 目标必须为恰好两名玩家
  if (!targetIds || targetIds.length !== 2) {
    return {
      ...context,
      aborted: true,
      abortReason: "占卜师需要选择恰好两名玩家",
    };
  }

  // 首夜：初始化干扰项
  const selfSeatId = actionNode.seatId;
  const gameId = (snapshot as any).gameId;
  const isFirstNight = (snapshot.nightCount ?? 0) === 1;
  if (isFirstNight) {
    initializeBoon(seats, selfSeatId, gameId);
  }

  let result: boolean;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    result = Boolean(storytellerInput.overrideResult);
  }
  // 优先级 2：说书人预设假信息（仅能力被干扰时）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    result = Boolean(storytellerInput.fakeResult);
  }
  // 优先级 3：动态判定
  else if (abilityEffective) {
    const target1 = seats.find((s: PlayerLookup) => s.id === targetIds[0]);
    const target2 = seats.find((s: PlayerLookup) => s.id === targetIds[1]);

    // 咖啡师效果下不检查干扰项（规则："不再把干扰项错认成恶魔"）
    const checkBoon = meta.prioritySource !== "barista";
    const boonSeatId = fortuneTellerBoonManager.getCurrentBoon(gameId);

    const t1IsDemon = target1
      ? isEffectivelyDemon(target1, boonSeatId === target1.id, checkBoon, meta)
      : false;
    const t2IsDemon = target2
      ? isEffectivelyDemon(target2, boonSeatId === target2.id, checkBoon, meta)
      : false;

    result = t1IsDemon || t2IsDemon;
  } else {
    // 醉酒/中毒/Vortox → 随机假结果
    result = generateFakeResult();
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: result,
      isCorrupted: !abilityEffective,
      selectedTargets: targetIds,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：将占卜师结果持久化到 actionNode 和 snapshot 中。
 *
 * 存储位置：
 * - actionNode.meta.fortuneTellerResult     — 当前行动节点元数据
 * - snapshot._abilityResults.fortune_teller — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as boolean | undefined;

  if (result === undefined) return context;

  const record = {
    result,
    selectedTargets: meta.selectedTargets as number[] | undefined,
    isCorrupted: meta.isCorrupted ?? false,
    nightCount: context.snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        fortuneTellerResult: record,
      },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        fortune_teller: {
          result,
          nightCount: context.snapshot.nightCount ?? 0,
        },
      },
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 *
 * 输出内容：
 * 1. console.log   — 英文 simulation log（含干扰标记+目标信息）
 * 2. meta.prompt   — 说书人看到的唤醒提示词（点头/摇头）
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as boolean | undefined;

  if (result === undefined) return context;

  const targetIds = (meta.selectedTargets as number[]) ?? [];
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

  const targetLabels = targetIds.map((id: number) => findLabel(id)).join(" 和 ");
  const resultDesc = result ? "有恶魔" : "没有恶魔";

  // 英文 simulation log
  const simLog =
    `[FortuneTeller]${tag} Result: ${result ? "YES" : "NO"} ` +
    `(targets: ${targetLabels})`;

  // 说书人提示词（点头 = 是，摇头 = 否）
  const storytellerPrompt =
    `占卜师，请睁眼。你选择了 ${
      targetIds.map((id: number) => `${id + 1}号`).join(" 和 ")
    }。` +
    (result
      ? "【点头】—— 这两名玩家之中有恶魔。"
      : "【摇头】—— 这两名玩家之中没有恶魔。");

  // 中文游戏日志
  const abilityLog = `占卜师${tag}探查【${targetLabels}】：${resultDesc}`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化数据
      displayInfo: {
        type: "fortune_teller_info",
        result,
        resultText: result ? "YES" : "NO",
        resultDesc,
        targets: targetIds,
        targetLabels: targetIds.map((id: number) => id + 1),
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const fortuneTellerAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "fortune_teller",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "fortune_teller_night_ability",
  /** 能力中文名 */
  abilityName: "占卜",

  /** 触发时机：每晚（首夜 + 其他夜） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 首夜 #57 → wakePriority = 30（57 - 27 = 30）
   * 共情者 #56 → 20 < 占卜师 30
   * 其他夜：nightOrderOverrides 中 fortune_teller 在信息类末尾
   */
  wakePriority: 30,
  /** 每晚都唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.fortune_teller.wake",

  /**
   * 目标选择配置
   * 占卜师每晚必须选择两名玩家。
   * min: 2, max: 2 — 必须选恰好两名
   * allowSelf: true — 可选自己（规则明确允许）
   * allowDead: true — 可选死亡玩家（"选中已死亡恶魔仍得知'是'"）
   */
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: true,
    allowDead: true,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心效果计算（占卜结果判定） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（记录到 actionNode / snapshot） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
