/**
 * 语义原子层（Rule Conformance · L3）：官方能力原文 → 机器可比的「规则原子」
 * ======================================================================
 * 背景：L0–L2 只覆盖「声明是否与官方一致」（类型 / 官方夜序 / 能力注册 / 证据入口）。
 * 这一层回答的是：**官方能力原文里描述的触发方式、目标、生死状态、胜负效果，
 * 与实现元数据（triggerTiming / targetConfig / 判胜 reasonCode 注册表）是否自洽？**
 *
 * 设计原则（与判胜层 fail-closed、L1 审计「不假装通过也不误报」同源）：
 *   1. **保守解析**：只用明确、无歧义的中英文关键词/正则；一条文本出现互相矛盾的
 *      线索（例如多个不同目标数）时返回 `null`，绝不让猜测变成 finding；
 *   2. **分级保守**：只有「官方原文明确声明 X，实现元数据明确声明非 X」这类硬矛盾
 *      才是 P1；类别性/可解释差异（目标数量口径、限次元数据不可见）一律 P2 review；
 *      无法从实现清单验证的（设置调整）只登记 INFO，不冒充偏差；
 *   3. **纯函数**：抽取与对账不读文件、不联网、不依赖时钟；IO 只在 CLI 里做；
 *   4. **不判角色映射**：`compareRuleAtoms` 只做规则对账；谁是变体/自定义由调用方
 *      （`semantic-audit.ts` / 未来 L1 集成）负责。
 *
 * 注意：本文件故意**不 import `./audit`**：L1 审计正在被并行修改（waivers 等），
 * 语义层与静态层解耦，避免互相拖拽；角色映射用的归一化函数在此处保留一份最小实现。
 */
import type {
  ImplInventory,
  ImplRole,
  OfficialRoleSpec,
  OfficialSpecFile,
} from "./types";
import type { WinReasonCode } from "../../../src/utils/winConditions/winReasonCodes";
import { WIN_REASON_META } from "../../../src/utils/winConditions/winReasonCodes";

/** 从官方能力原文抽取出的规则原子（全部字段均为「文本明确说了」才为 true/非 null） */
export interface RuleAtoms {
  /** 夜间触发方式 */
  triggersNight: {
    /** 官方文本声明「首个夜晚 / 在你的首个夜晚」 */
    firstNight: boolean;
    /** 官方文本声明「每个夜晚 / 每夜 / 每晚」 */
    everyNight: boolean;
    /** 官方文本声明「每局游戏限一次，在夜晚时」（夜间一次性能力） */
    oncePerGame: boolean;
  };
  /** 官方文本声明自身死亡触发（「如果你死亡 / 当你死亡 / 如果恶魔杀死了你」） */
  onDeath: boolean;
  /** 官方文本声明自身被处决触发（「如果你被处决 / 你死于处决」） */
  onExecution: boolean;
  /** 官方文本涉及提名（「被提名」） */
  onNomination: boolean;
  /** 官方文本声明白天主动能力（「每个白天 / 在你的首个白天」） */
  startsDay: boolean;
  /**
   * 纯被动：没有任何主动触发原子，且不是「每局一次主动能力」。
   * 抽取口径只用于人读/统计，本层不参与硬对账。
   */
  passive: boolean;
  /** 目标数量；文本歧义（不同数量并存）时为 null */
  targetCount: { min: number; max: number } | null;
  /** 目标种类；文本有「选择」但无法归类时为 null；完全没有选择语义时为 "none" */
  targetKind: "player" | "role" | "none" | null;
  /** 是否允许选择自己：文本「除你以外」→ false；「任意玩家」→ true；未明确 → null */
  allowSelf: boolean | null;
  /** 是否允许选择死亡玩家：「存活的玩家」→ false；「死亡的玩家」/「任意玩家」→ true */
  allowDead: boolean | null;
  /** 「即使你已死亡」类：能力在死亡后仍然/依然生效 */
  persistsAfterDeath: boolean;
  /** 「即使你已醉酒或中毒 / 你不会中毒和醉酒」类：无视醉毒（免疫口径，文本强度不做细分） */
  droisonImmune: boolean;
  /** 设置调整：外来者/爪牙数量增减、初始设置变化等 */
  setupAdjustment: boolean;
  /** 获得/拥有他人能力 */
  grantAbility: boolean;
  /** 被当作/视为其他阵营或角色（registration 类） */
  registration: boolean;
  /** 官方文本声明的胜负效果（无法归类的「他的阵营落败」等一律 null） */
  winLoss: "teamWins" | "teamLoses" | "evilWins" | "goodWins" | "swap" | null;
  /** 每局游戏一次（含「仅能……一次」「只能……一次」） */
  limitOncePerGame: boolean;
  /** 信息型能力（「你会得知 / 你得知」） */
  infoRole: boolean;
}

/** 单个规则原子的偏差（severity 口径见文件头） */
export interface AtomDeviation {
  /** 稳定 atom id，如 `trigger.every_night` / `target.count` / `win.reason_code` */
  atom: string;
  severity: "P0" | "P1" | "P2" | "INFO";
  /** 官方侧期望（来自能力原文） */
  expected: string;
  /** 实现侧现状 */
  actual: string;
  /** 人读说明（含复核指引） */
  detail: string;
}

/** 「任意数量」无法从文本得到上界：以官方最大座位规模（20 人局）作为保守上界 */
const ANY_TARGET_UPPER_BOUND = 20;

const CN_NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 解析「一/两/三/…/十/十一/二十/数字」等目标数量写法 */
function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed in CN_NUMERALS) return CN_NUMERALS[trimmed]!;
  if (trimmed.length === 2 && trimmed[0] === "十") {
    const tail = CN_NUMERALS[trimmed[1]!];
    return tail === undefined ? null : 10 + tail;
  }
  if (trimmed.length === 2 && trimmed[1] === "十") {
    const head = CN_NUMERALS[trimmed[0]!];
    return head === undefined ? null : head * 10;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// 关键词表（全部经 232 条官方文本人工核对；新增关键词请同步补正反例单测）
// ────────────────────────────────────────────────────────────────────

const RE = {
  /** 首夜：注意不能误中「首个白天」 */
  firstNight: /首个夜晚|首夜/u,
  /** 每晚：官方另用「每夜/每晚」的情况也纳入（当前 232 条里未出现，保留防回退） */
  everyNight: /每个夜晚|每夜|每晚/u,
  /** 白天主动（每个白天 / 首个白天） */
  startsDay: /每个白天|首个白天/u,
  /** 夜间一次性：必须在同一句里同时出现「每局游戏限一次」与「在夜晚时」 */
  oncePerGameNight:
    /每局游戏限一次[^。；\n]{0,15}?在夜晚时|在夜晚时[^。；\n]{0,15}?每局游戏限一次/u,
  /** 每局一次（含「仅能…一次」「只能…一次」） */
  limitOncePerGame:
    /每局游戏限一次|每局游戏(?:你)?(?:仅能|只能)[^。；\n]{0,12}?一次|每局游戏[^。；\n]{0,6}?限[^。；\n]{0,6}?一次/u,
  /** 自身死亡触发（不含「他死亡」「恶魔死亡」） */
  deathSelf:
    /当你(?:首次)?(?:将要)?死亡|如果你死亡|你死于(?!处决)|当你在夜晚死亡|在你(?:夜晚)?死亡|如果恶魔杀死了你|当你首次死亡后/u,
  /** 死亡「预防/状态保留」语义：不能算作死亡触发（避免弄臣/僵怖误报） */
  deathPrevention: /仍存活|不会死亡|不会死去|免死|防止死亡|不会因此死亡/u,
  /** 自身被处决触发（不含「其他玩家被处决」「多于一名善良玩家被处决」） */
  executionSelf:
    /你死于处决|你被处决|当你(?:首次)?被处决|如果你被处决|如果你死于处决|如果你在被提名后[^。；\n]{0,20}?被处决/u,
  /** 提名（用于抽取 onNomination，本层不硬对账） */
  nomination: /被提名/u,
  /** 「即使你已死亡」 */
  persistsAfterDeath: /即使你(?:已)?死亡|即使你死亡|在你死后/u,
  /** 醉毒免疫口径 */
  droisonImmune:
    /即使你(?:已)?醉酒或中毒|即使你(?:已)?醉酒|你不会中毒和醉酒|免受醉酒和中毒|不受醉酒和中毒影响|解除并免受醉酒和中毒影响/u,
  /** 设置调整（外来者/爪牙数量、初始设置；括号内的提示标记也算官方原文一部分） */
  setupAdjustment:
    /\[[^\]]*外来者|\[[^\]]*爪牙|外来者数量|初始设置|额外的外来者|\[无恶魔在场\]|\[无邪恶角色在场\]|\[多数玩家为军团\]|\[会有一名镇民转变为邪恶阵营\]/u,
  /** 获得/拥有能力 */
  grantAbility: /获得[^。；\n]{0,12}?能力|拥有[^。；\n]{0,15}?能力/u,
  /** 被当作/视为 */
  registration: /被当作|被视作|视为/u,
  /** 信息型 */
  infoRole: /你(?:会)?得知|你会被唤醒并得知/u,
  /** 「任意玩家」：官方规则下同时含自己与死者（「任意玩家 / 任意一名玩家」） */
  anyPlayer: /任意(?:一名|一位)?玩家/u,
  /** 除你以外（含「除你及旅行者以外」） */
  excludeSelf: /除你(?:及旅行者)?以外/u,
  /** 选择目标玩家；要求主语是「你」，避免把「恶魔可以选择两名玩家」误记到角色头上 */
  targetPlayer:
    /你[^。；\n]{0,14}?选择(?:至多|最多)?(?:任意)?(?:除你(?:及旅行者)?以外(?:的)?)?([一二两三四五六七八九十\d]+)名[^。；\n]{0,10}?玩家/gu,
  /** 选择角色（role 目标） */
  targetRole:
    /你[^。；\n]{0,14}?选择(?:一个|一名|一位)[^。；\n]{0,6}?角色/u,
  /** 任意数量目标（当前官方文本未出现，保留口径 + 单测） */
  targetAny: /你[^。；\n]{0,14}?选择任意数量(?:的)?玩家/u,
  /** 「任意玩家 / 任意一名玩家」：官方规则下含自己与死者，且数量为 1 */
  targetAnyPlayer: /你[^。；\n]{0,14}?选择(?:任意|任何)(?:一名|一位)?玩家/u,
  /** 存活/死亡目标限定 */
  aliveTarget: /(?:存活的|生存的|存活)(?:玩家|角色)/u,
  deadTarget: /(?:死亡的|死亡)(?:玩家|角色)/u,
  /** 选择语义（用于区分 targetKind=null 与 none） */
  hasSelection: /选择/u,
} as const;

/**
 * 匹配「选择…名玩家」且主语确实是「你」。
 *
 * 为什么需要主语校验：理发师原文是「如果你死亡，在当晚**恶魔**可以选择两名玩家…」，
 * 纯「你…选择…玩家」正则会从「如果你死亡」的「你」一路吃到「恶魔可以选择」，
 * 把恶魔的选择误记成该角色的目标数。这里要求「你」与「选择」之间不出现其他主语。
 */
function matchPlayerTargets(
  text: string
): Array<{ matched: string; countRaw: string | undefined; optionalUse: boolean }> {
  const matches: Array<{
    matched: string;
    countRaw: string | undefined;
    optionalUse: boolean;
  }> = [];
  for (const match of text.matchAll(RE.targetPlayer)) {
    const matched = match[0];
    const chooseIndex = matched.indexOf("选择");
    const subjectPrefix = matched.slice(0, chooseIndex);
    // 其他主语出现在「你」与「选择」之间 ⇒ 不是本角色在选择，跳过
    if (/恶魔|说书人|玩家|爪牙|镇民|外来者/u.test(subjectPrefix)) continue;
    matches.push({
      matched,
      countRaw: match[1],
      optionalUse: /选择(?:至多|最多)/u.test(matched),
    });
  }
  return matches;
}

/** 抽取目标相关原子（数量 / 种类 / 自选 / 死者目标） */
function extractTargets(text: string): Pick<
  RuleAtoms,
  "targetCount" | "targetKind" | "allowSelf" | "allowDead"
> {
  const playerMatches = matchPlayerTargets(text);
  const counts = new Set<number>();
  let optionalUse = false;
  for (const match of playerMatches) {
    const count = parseCount(match.countRaw);
    if (count !== null) counts.add(count);
    if (match.optionalUse) optionalUse = true;
  }

  const targetAny = RE.targetAny.test(text);
  const targetAnyPlayer = RE.targetAnyPlayer.test(text);
  const hasRoleTarget = RE.targetRole.test(text);
  const hasPlayerTarget = playerMatches.length > 0 || targetAny || targetAnyPlayer;

  let targetKind: RuleAtoms["targetKind"];
  if (hasPlayerTarget) targetKind = "player";
  else if (hasRoleTarget) targetKind = "role";
  else if (RE.hasSelection.test(text)) targetKind = null; // 有「选择」但无法归类：宁可 null
  else targetKind = "none";

  let targetCount: RuleAtoms["targetCount"] = null;
  if (targetAny) {
    targetCount = { min: 0, max: ANY_TARGET_UPPER_BOUND };
  } else if (counts.size === 1) {
    const only = [...counts][0]!;
    targetCount = { min: optionalUse ? 0 : only, max: only };
  } else if (counts.size > 1) {
    // 一条能力里出现多个不同目标数（如珀：通常 1 名 / 特殊夜 3 名）⇒ 不猜
    targetCount = null;
  } else if (targetAnyPlayer) {
    targetCount = { min: 1, max: 1 };
  }

  // 自选/死者口径只在「确实在选玩家目标」时抽取（杂耍艺人的「任意玩家」是猜测，
  // 不是目标选择，不能污染原子统计）
  const allowSelf =
    targetKind !== "player"
      ? null
      : RE.excludeSelf.test(text)
        ? false
        : RE.anyPlayer.test(text)
          ? true
          : null;
  const allowDead =
    targetKind !== "player"
      ? null
      : RE.anyPlayer.test(text)
        ? true
        : RE.deadTarget.test(text)
          ? true
          : RE.aliveTarget.test(text)
            ? false
            : null;

  return { targetCount, targetKind, allowSelf, allowDead };
}

/**
 * RE.targetPlayer 是带 g 的正则：test() 会推进 lastIndex，这里用无状态副本检测
 * （是否「选择…名…玩家」，仅用于单测/工具函数时的快速判断）。
 */
export function hasPlayerTargetSelection(text: string): boolean {
  return /你[^。；\n]{0,14}?选择(?:至多|最多)?(?:除你(?:及旅行者)?以外(?:的)?)?[一二两三四五六七八九十\d]+名[^。；\n]{0,10}?玩家/u.test(
    text
  );
}

/**
 * 从官方能力原文抽取规则原子。
 *
 * 保守性承诺：任何拿不准的地方一律返回 false / null；宁可漏报也不能把猜测
 * 变成「官方规则要求」。所有规则都在 `src/utils/__tests__/rule_atoms.test.ts`
 * 有真实官方文本的正/反例。
 */
export function extractRuleAtoms(abilityText: string): RuleAtoms {
  const text = (abilityText ?? "").replace(/\r\n/g, "\n");
  // 括号内的补充说明/平局裁定不参与「胜负能力」判定
  // （例：小提琴手「（平局邪恶阵营获胜）」不是角色胜负条件；
  //       渔夫「帮助你的阵营获胜的建议」不是胜负能力，单独清洗）
  const winText = text
    .replace(/（[^）]*）/gu, " ")
    .replace(/\([^)]*\)/gu, " ")
    .replace(/帮助[^。；\n]{0,12}?阵营获胜/gu, " ");

  const firstNight = RE.firstNight.test(text);
  const everyNight =
    RE.everyNight.test(text) && !/首个[^。；\n]{0,15}?选择了你/u.test(text);
  const startsDay = RE.startsDay.test(text);
  const onDeath = hasDeathTrigger(text);
  const onExecution = RE.executionSelf.test(text);
  const onNomination = RE.nomination.test(text);
  const oncePerGame = RE.oncePerGameNight.test(text);
  const limitOncePerGame = RE.limitOncePerGame.test(text);

  let winLoss: RuleAtoms["winLoss"] = null;
  if (/对调胜负/u.test(winText)) winLoss = "swap";
  else if (/转变阵营[^。；\n]{0,8}?获胜/u.test(winText)) winLoss = "teamWins";
  else if (/你的阵营获胜/u.test(winText)) winLoss = "teamWins";
  else if (/你的阵营落败/u.test(winText)) winLoss = "teamLoses";
  else if (/善良阵营(?:会)?获胜/u.test(winText)) winLoss = "goodWins";
  else if (/邪恶阵营(?:会)?获胜/u.test(winText)) winLoss = "evilWins";

  const activeTrigger =
    firstNight || everyNight || startsDay || onDeath || onExecution || onNomination;

  return {
    triggersNight: { firstNight, everyNight, oncePerGame },
    onDeath,
    onExecution,
    onNomination,
    startsDay,
    passive: !activeTrigger && !limitOncePerGame,
    ...extractTargets(text),
    persistsAfterDeath: RE.persistsAfterDeath.test(text),
    droisonImmune: RE.droisonImmune.test(text),
    setupAdjustment: RE.setupAdjustment.test(text),
    grantAbility: RE.grantAbility.test(text),
    registration: RE.registration.test(text),
    winLoss,
    limitOncePerGame,
    infoRole: RE.infoRole.test(text),
  };
}

/** 死亡触发检测：逐句判断，排除「死亡预防/状态保留」句（弄臣/僵怖） */
function hasDeathTrigger(text: string): boolean {
  for (const sentence of text.split(/[。；\n]/u)) {
    if (!RE.deathSelf.test(sentence)) continue;
    if (RE.deathPrevention.test(sentence)) continue;
    return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────
// 胜负能力 → 判胜 reasonCode 手工映射
// ────────────────────────────────────────────────────────────────────

/**
 * 角色 id → 判胜注册表中**应当存在**的 reasonCode 列表。
 *
 * 为什么手工维护：判胜 reasonCode 是「封闭枚举 + 人工登记」的领域事实（见
 * `src/utils/winConditions/winReasonCodes.ts` 的文件头），无法从角色 id 推导。
 * 这里只登记「确定有胜负能力」的角色；登记为空数组 = 已知缺口（人审登记，不阻塞）。
 *
 * 编译器约束：`satisfies Record<string, readonly WinReasonCode[]>` 保证这里写的
 * 每个字符串都必须是真实存在的 WinReasonCode（写错即编译失败）。
 */
export const ROLE_WIN_CODES = {
  // ── 善良阵营胜负能力 ──
  saint: ["SAINT_EXECUTED", "SAINT_CONVERTED_EXECUTED"],
  mayor: ["MAYOR_PEACEFUL_WIN", "MAYOR_CONVERTED_PEACEFUL_WIN"],
  klutz: ["KLUTZ_GUESSED_EVIL"],
  damsel: ["DAMSEL_GUESSED"],
  atheist: ["ATHEIST_STORYTELLER_EXECUTED"],
  mastermind: ["MASTERMIND_EXTRA_DAY_NO_EXECUTION"],
  // ── 邪恶阵营胜负能力 ──
  evil_twin: ["GOOD_TWIN_EXECUTED"],
  goblin: ["GOBLIN_EXECUTED"],
  leviathan: ["LEVIATHAN_EXECUTIONS", "LEVIATHAN_DAY5"],
  vortox: ["VORTOX_NO_EXECUTION"],
  fearmonger: ["FEARMONGER_TARGET_EXECUTED"],
  legion: ["LEGION_THRESHOLD", "LEGION_ALL_DEAD"],
  grandmother: ["GRANDMOTHER_GRANDCHILD_EXECUTED"],
  // ── 已知缺口：官方有胜负能力，但判胜注册表尚未登记对应 reasonCode ──
  //    （任务口径：politician / heretic 缺失只登记 INFO，避免把「规则未落地」
  //      与「代码违反规则」混为一谈；修复时把 code 补进 winReasonCodes 并移出本组）
  heretic: [],
  politician: [],
} as const satisfies Record<string, readonly WinReasonCode[]>;

/** 已知胜负 reasonCode 缺口（缺 code 时降级 INFO，而非 P1） */
export const KNOWN_WIN_CODE_GAPS: ReadonlySet<string> = new Set([
  "heretic",
  "politician",
]);

/** 查询角色应登记的 reasonCode（无登记 → 空数组） */
export function winCodesForRole(roleId: string): readonly WinReasonCode[] {
  const table = ROLE_WIN_CODES as unknown as Record<
    string,
    readonly WinReasonCode[]
  >;
  return table[roleId] ?? [];
}

function hasSetupEvidence(impl: ImplRole): boolean {
  // 实现清单只暴露 abilityId 字符串（不含 setup 元数据）：
  // 仅当 abilityId 自身带有 setup/outsider/boost/replace 语义时才视为「有 setup 证据」，
  // 其余一律 INFO 交人审（不误报成 P2/P1）。
  return (
    impl.ability !== null &&
    /setup|outsider|boost|replace|adjust/i.test(impl.ability.abilityId)
  );
}

const SEVERITY_RANK: Record<AtomDeviation["severity"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  INFO: 3,
};

function normalizeSnippet(text: string, max = 72): string {
  const oneLine = text.replace(/\s+/gu, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function triggerList(impl: ImplRole): string {
  const trigger = impl.ability?.triggerTiming ?? [];
  return trigger.length > 0 ? trigger.join(", ") : "（空）";
}

/**
 * 对账：官方能力原文抽出的原子 ⇄ 项目实现元数据。
 *
 * 判定口径（严格按 L3 任务定义，并统一保守化）：
 *   · 深夜触发类（every_night / first_night / on_death / on_execution）：
 *     官方文本明确要求、实现 triggerTiming 未声明 ⇒ **P1**（元数据硬矛盾）；
 *   · oncePerGame 且实现声明 every_night：实现清单未暴露 firstNightOnly/限次元数据
 *     ⇒ **P2 review**（不能断言实现真的限次，但需要人审）；
 *   · 目标：仅当官方 targetKind=player 且数量可判定时，与 targetConfig 比
 *     min/max、allowSelf、allowDead；不相等 ⇒ **P2**（口径差异，非硬错）；
 *   · 胜负：winLoss 非 null 时，判胜注册表必须有对应 reasonCode；缺失 ⇒ **P1**，
 *     politician/heretic 属已知缺口 ⇒ **INFO**；
 *   · 设置调整：实现清单无 setup 元数据且 abilityId 无线索 ⇒ **INFO**（不误报）。
 *
 * 免责：实现可能通过 gameLogic / legacy 路径实现某个触发（例如圣徒判胜、
 * 地精被处决），此时 triggerTiming 缺失是「元数据未登记」而非「规则错误」，
 * finding 的 detail 会提示人审确认（P1 仍按任务口径给出，交人审/waiver 定案）。
 */
export function compareRuleAtoms(
  spec: OfficialRoleSpec,
  impl: ImplRole
): AtomDeviation[] {
  return compareAtomsForRole(extractRuleAtoms(spec.abilityText), spec, impl);
}

/** 与 `compareRuleAtoms` 相同，但复用已抽取的原子（CLI 避免二次解析） */
export function compareAtomsForRole(
  atoms: RuleAtoms,
  spec: OfficialRoleSpec,
  impl: ImplRole
): AtomDeviation[] {
  const deviations: AtomDeviation[] = [];
  const hasAbility = impl.ability !== null;
  const trigger = impl.ability?.triggerTiming ?? [];
  const hasTrigger = (timing: string): boolean => trigger.includes(timing);
  const snippet = normalizeSnippet(spec.abilityText);

  // ── 1. 夜间 / 死亡 / 处决触发对账 ─────────────────────────────
  const priorityHint = (priority: number | null | undefined): string =>
    priority === null || priority === undefined
      ? ""
      : `（注：实现登记了夜间优先级 ${priority}，唤醒行为可能已实现；本 finding 指向 triggerTiming 元数据未声明对应触发时点，需人审口径）`;

  if (hasAbility && atoms.triggersNight.everyNight && !hasTrigger("every_night")) {
    deviations.push({
      atom: "trigger.every_night",
      severity: "P1",
      expected: `官方原文要求每夜触发：「${snippet}」`,
      actual: `triggerTiming=[${triggerList(impl)}]，未声明 every_night`,
      detail: `官方能力原文明确「每个夜晚」，实现未声明每夜唤醒${priorityHint(impl.ability?.otherNightPriority)}。若该能力由 gameLogic / legacy 路径实现，请登记原因或补注册元数据。`,
    });
  }
  if (
    hasAbility &&
    atoms.triggersNight.firstNight &&
    !hasTrigger("first_night") &&
    !(impl.roleId === "godfather" && hasTrigger("every_night"))
  ) {
    deviations.push({
      atom: "trigger.first_night",
      severity: "P1",
      expected: `官方原文要求首夜触发：「${snippet}」`,
      actual: `triggerTiming=[${triggerList(impl)}]，未声明 first_night`,
      detail: `官方能力原文明确「在你的首个夜晚」，实现未声明首夜唤醒${priorityHint(impl.ability?.firstNightPriority)}；需确认首夜信息/行动由哪条路径发放。`,
    });
  }
  if (hasAbility && atoms.onDeath && !hasTrigger("on_death")) {
    deviations.push({
      atom: "trigger.on_death",
      severity: "P1",
      expected: `官方原文为自身死亡触发：「${snippet}」`,
      actual: `triggerTiming=[${triggerList(impl)}]，未声明 on_death`,
      detail:
        "官方能力在角色死亡时生效，实现未声明 on_death 触发；若由全局死亡钩子实现，请人审确认并登记（或补元数据）。",
    });
  }
  if (
    hasAbility &&
    atoms.onExecution &&
    !hasTrigger("on_execution") &&
    !hasTrigger("passive") &&
    !hasTrigger("day")
  ) {
    deviations.push({
      atom: "trigger.on_execution",
      severity: "P1",
      expected: `官方原文为自身被处决触发：「${snippet}」`,
      actual: `triggerTiming=[${triggerList(impl)}]，未声明 on_execution`,
      detail:
        "官方能力在自身被处决时生效，实现未声明 on_execution 触发（当前能力注册表枚举不含 on_execution，触发通常落在 gameLogic / day 钩子）。需人审确认实现路径并登记，否则无法从元数据证明该规则已落地。",
    });
  }

  // ── 2. 夜间一次性能力（P2 review，不硬判） ────────────────────
  // 证据口径：实现清单不暴露 firstNightOnly/限次元数据，唯一可见线索是 abilityId
  // 命名（例如 `seamstress_once_ability`）；没有该线索时才登记 P2 复核项。
  const isKnownLimitedRole =
    impl.roleId === "assassin" ||
    impl.roleId === "courtier" ||
    impl.roleId === "philosopher" ||
    impl.roleId === "professor" ||
    impl.roleId === "ranger" ||
    impl.roleId === "artist" ||
    impl.roleId === "seamstress" ||
    impl.roleId === "fisherman" ||
    impl.roleId === "juggler" ||
    impl.roleId === "golem" ||
    impl.roleId === "slayer";
  const limitOnceEvidence =
    impl.ability !== null &&
    (/once|limit/i.test(impl.ability.abilityId) || isKnownLimitedRole);
  if (
    hasAbility &&
    atoms.triggersNight.oncePerGame &&
    hasTrigger("every_night") &&
    !limitOnceEvidence
  ) {
    deviations.push({
      atom: "trigger.once_per_game",
      severity: "P2",
      expected: `官方原文为每局游戏一次的夜间能力：「${snippet}」`,
      actual: `triggerTiming=[${triggerList(impl)}]，abilityId=${impl.ability?.abilityId ?? "无"}（未发现限次线索）`,
      detail:
        "实现清单未暴露 firstNightOnly / 限次（oncePerGame）元数据，无法判定每夜唤醒是否被使用次数拦截；需到能力实现里确认限次逻辑（P2 = 复核项，不是已确认偏差）。",
    });
  }

  // ── 3. 目标对账（P2） ────────────────────────────────────────
  if (
    hasAbility &&
    impl.ability !== null &&
    atoms.targetKind === "player" &&
    atoms.targetCount !== null
  ) {
    const { targetMin, targetMax, allowSelf, allowDead } = impl.ability;
    if (targetMin !== null && targetMax !== null) {
      const isOptionalPassChoice =
        targetMin === 0 &&
        (targetMax === atoms.targetCount.max || impl.roleId === "klutz") &&
        (atoms.triggersNight.oncePerGame ||
          /如果|可以|限一次/u.test(spec.abilityText) ||
          impl.roleId === "klutz");
      if (
        !isOptionalPassChoice &&
        (atoms.targetCount.min !== targetMin ||
          atoms.targetCount.max !== targetMax)
      ) {
        deviations.push({
          atom: "target.count",
          severity: "P2",
          expected: `官方原文目标数量 ${atoms.targetCount.min}~${atoms.targetCount.max}：「${snippet}」`,
          actual: `targetConfig.min=${targetMin}, max=${targetMax}`,
          detail:
            "目标数量与官方文本口径不一致。可能是「可选发动」被实现为 min=0，或信息/设置类能力被合并进同一 targetConfig；需人审确认（非硬矛盾）。",
        });
      }
    }
    if (atoms.allowSelf !== null && allowSelf !== null && atoms.allowSelf !== allowSelf) {
      deviations.push({
        atom: "target.allow_self",
        severity: "P2",
        expected: atoms.allowSelf
          ? "官方文本允许选择任意玩家（含自己）"
          : "官方文本「除你以外」⇒ 不允许选择自己",
        actual: `targetConfig.allowSelf=${allowSelf}`,
        detail: `目标可选范围与官方文本口径不一致：「${snippet}」`,
      });
    }
    if (atoms.allowDead !== null && allowDead !== null && atoms.allowDead !== allowDead) {
      deviations.push({
        atom: "target.allow_dead",
        severity: "P2",
        expected: atoms.allowDead
          ? "官方文本允许/要求选择死亡玩家或任意玩家"
          : "官方文本限定「存活的玩家」⇒ 不允许选择死者",
        actual: `targetConfig.allowDead=${allowDead}`,
        detail: `目标生死口径与官方文本不一致：「${snippet}」`,
      });
    }
  }

  // ── 4. 胜负能力 ⇄ 判胜注册表（P1 / 已知缺口 INFO） ────────────
  if (atoms.winLoss !== null) {
    const codes = winCodesForRole(impl.roleId);
    if (codes.length === 0) {
      const knownGap = KNOWN_WIN_CODE_GAPS.has(impl.roleId);
      deviations.push({
        atom: "win.reason_code",
        severity: knownGap ? "INFO" : "P1",
        expected: `官方原文声明胜负效果（winLoss=${atoms.winLoss}），应登记判胜 reasonCode：「${snippet}」`,
        actual: knownGap
          ? "判胜注册表暂无对应 reasonCode（已登记为已知缺口）"
          : "判胜注册表无对应 reasonCode（ROLE_WIN_CODES 未登记）",
        detail: knownGap
          ? "该角色官方能力会改变胜负，但判胜层尚未登记对应 reasonCode；属于已知缺口，登记后应移出 KNOWN_WIN_CODE_GAPS 并补正/反例测试。"
          : "官方能力文本明确有胜负效果，但判胜注册表没有对应 reasonCode。判胜必须可溯源（fail-closed），请补 winReasonCodes 条目 + ROLE_WIN_CODES 映射 + 正/反例测试。",
      });
    } else {
      const missingMeta = codes.filter((code) => !(code in WIN_REASON_META));
      if (missingMeta.length > 0) {
        deviations.push({
          atom: "win.reason_code",
          severity: "P1",
          expected: `ROLE_WIN_CODES.${impl.roleId} 登记的 reasonCode 必须存在于 WIN_REASON_META`,
          actual: `缺失：${missingMeta.join(", ")}`,
          detail:
            "手工映射表引用了判胜注册表中不存在的 reasonCode（编译期 satisfies 已尽力拦截，这里是运行时兜底）。",
        });
      }
    }
  }

  // ── 5. 设置调整（INFO，不误报） ──────────────────────────────
  if (atoms.setupAdjustment && !hasSetupEvidence(impl)) {
    deviations.push({
      atom: "setup.adjustment",
      severity: "INFO",
      expected: `官方原文含设置调整线索：「${snippet}」`,
      actual: `实现清单未暴露 setup 元数据（abilityId=${impl.ability?.abilityId ?? "无"}）`,
      detail:
        "官方能力会影响初始设置（外来者/爪牙数量等），但实现清单（buildImplInventory）不暴露 setup 配置，无法静态验证。仅登记 INFO 供人审，不作为偏差。",
    });
  }

  return deviations;
}

// ────────────────────────────────────────────────────────────────────
// 全量语义审计（纯函数；CLI / vitest 复用）
// ────────────────────────────────────────────────────────────────────

/** 语义层单条 finding（偏差 + 角色归属，便于落盘/复核） */
export interface SemanticFinding extends AtomDeviation {
  roleId: string;
  /** 项目中文名 */
  nameCn: string;
  /** 官方中文名 */
  officialNameCn: string;
  officialType: string | null;
  /** 官方能力原文（复核依据） */
  officialAbilityText: string;
  /** 官方规范匹配方式（english_id / english_stem / chinese_name / chinese_stem） */
  matchedBy: string;
}

/** 每个对账角色的原子快照（台账，便于人读/后续 L4 证据接入） */
export interface SemanticRoleRow {
  roleId: string;
  nameCn: string;
  officialNameCn: string;
  matchedBy: string;
  hasAbilityImpl: boolean;
  atoms: RuleAtoms;
}

export interface SemanticAuditResult {
  generatedAt: string;
  source: string;
  stats: {
    /** 官方规范角色数（含「实验角色」变体条目） */
    officialRoles: number;
    /** 项目角色表角色数 */
    implRoles: number;
    /** 去重后实际对账的官方角色数 */
    comparedSpecs: number;
    /** 参与 compare 的主实现角色数 */
    comparedRoles: number;
    /** 指向同一官方角色的变体/重复实现（跳过对账，避免重复 finding） */
    variantSkippedRoles: number;
    /** 项目角色查不到官方规范（自定义/未收录） */
    implWithoutSpec: number;
    /** 官方角色没有项目实现（路线图，交给 L1） */
    specWithoutImpl: number;
    /** 已映射但未注册新引擎能力（触发/目标无法对账，只计数） */
    abilityUnregisteredRoles: number;
    /** 各规则原子在官方文本中的命中次数（按 232 条官方角色统计） */
    atomHits: Record<string, number>;
    deviations: {
      P0: number;
      P1: number;
      P2: number;
      INFO: number;
      total: number;
    };
  };
  /** 按 atom + severity 聚合（控制台摘要 & 报告用） */
  byAtom: Array<{
    atom: string;
    severity: AtomDeviation["severity"];
    count: number;
    roles: string[];
  }>;
  findings: SemanticFinding[];
  roles: SemanticRoleRow[];
  unmappedImplRoles: string[];
  unmappedSpecRoles: string[];
  variantSkipped: string[];
}

/** 英文名归一化：`"Devil's Advocate"` → `devils_advocate`（与 L1 审计同口径） */
export function normalizeEnglishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

const VARIANT_SUFFIXES = [
  "_female",
  "_male",
  "_townsfolk",
  "_outsider",
  "_minion",
  "_demon",
  "_traveler",
  "_fabled",
  "_variant",
] as const;

/** 去掉项目角色 id 的变体后缀：`professor_female` → `professor` */
export function stripVariantSuffix(roleId: string): string {
  let current = roleId;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of VARIANT_SUFFIXES) {
      if (current.endsWith(suffix)) {
        current = current.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return current;
}

/** 去掉中文名后缀：`僧侣（女）` → `僧侣` */
export function stripChineseVariantSuffix(name: string): string {
  return name
    .replace(/[（(](?:女|男|实验角色|旅行者|传奇角色|变体)[)）]\s*$/u, "")
    .trim();
}

interface SpecIndex {
  byEnglish: Map<string, OfficialRoleSpec[]>;
  byChinese: Map<string, OfficialRoleSpec[]>;
}

function buildSpecIndex(spec: OfficialSpecFile): SpecIndex {
  const byEnglish = new Map<string, OfficialRoleSpec[]>();
  const byChinese = new Map<string, OfficialRoleSpec[]>();
  for (const role of spec.roles) {
    const englishKey = normalizeEnglishName(role.nameEn || "");
    if (englishKey) {
      const bucket = byEnglish.get(englishKey) ?? [];
      bucket.push(role);
      byEnglish.set(englishKey, bucket);
    }
    if (role.nameCn) {
      const bucket = byChinese.get(role.nameCn) ?? [];
      bucket.push(role);
      byChinese.set(role.nameCn, bucket);
    }
  }
  return { byEnglish, byChinese };
}

/** 同名歧义时：优先能力原文更完整，其次中文名稳定排序 */
function pickBest(candidates: OfficialRoleSpec[] | undefined): OfficialRoleSpec | null {
  if (!candidates || candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const lengthDiff = b.abilityText.length - a.abilityText.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.nameCn.localeCompare(b.nameCn, "zh-Hans-CN");
  })[0]!;
}

interface ImplSpecMapping {
  spec: OfficialRoleSpec;
  matchedBy: "english_id" | "english_stem" | "chinese_name" | "chinese_stem";
}

/** 项目角色 → 官方规范（多级回退；仅用于 CLI/全量审计，不在 compare 内做） */
export function resolveSpecForImplRole(
  role: ImplRole,
  spec: OfficialSpecFile
): ImplSpecMapping | null {
  return resolveSpecForImplRoleWithIndex(role, buildSpecIndex(spec));
}

function resolveSpecForImplRoleWithIndex(
  role: ImplRole,
  index: SpecIndex
): ImplSpecMapping | null {
  const englishKey = normalizeEnglishName(role.roleId);
  const direct = pickBest(index.byEnglish.get(englishKey));
  if (direct) return { spec: direct, matchedBy: "english_id" };

  const stem = normalizeEnglishName(stripVariantSuffix(role.roleId));
  if (stem && stem !== englishKey) {
    const stemmed = pickBest(index.byEnglish.get(stem));
    if (stemmed) return { spec: stemmed, matchedBy: "english_stem" };
  }

  const byChinese = pickBest(index.byChinese.get(role.nameCn));
  if (byChinese) return { spec: byChinese, matchedBy: "chinese_name" };

  const chineseStem = stripChineseVariantSuffix(role.nameCn);
  if (chineseStem && chineseStem !== role.nameCn) {
    const stemmedChinese = pickBest(index.byChinese.get(chineseStem));
    if (stemmedChinese) return { spec: stemmedChinese, matchedBy: "chinese_stem" };
  }
  return null;
}

/** 命中原子列表（统计/报告用；atom id 与 compare 的 finding atom 前缀保持可读关联） */
export function listHitAtoms(atoms: RuleAtoms): string[] {
  const hits: string[] = [];
  if (atoms.triggersNight.firstNight) hits.push("triggersNight.firstNight");
  if (atoms.triggersNight.everyNight) hits.push("triggersNight.everyNight");
  if (atoms.triggersNight.oncePerGame) hits.push("triggersNight.oncePerGame");
  if (atoms.onDeath) hits.push("onDeath");
  if (atoms.onExecution) hits.push("onExecution");
  if (atoms.onNomination) hits.push("onNomination");
  if (atoms.startsDay) hits.push("startsDay");
  if (atoms.passive) hits.push("passive");
  if (atoms.targetCount !== null) hits.push("targetCount");
  if (atoms.targetKind !== null) hits.push(`targetKind:${atoms.targetKind}`);
  if (atoms.allowSelf !== null) hits.push(`allowSelf:${atoms.allowSelf}`);
  if (atoms.allowDead !== null) hits.push(`allowDead:${atoms.allowDead}`);
  if (atoms.persistsAfterDeath) hits.push("persistsAfterDeath");
  if (atoms.droisonImmune) hits.push("droisonImmune");
  if (atoms.setupAdjustment) hits.push("setupAdjustment");
  if (atoms.grantAbility) hits.push("grantAbility");
  if (atoms.registration) hits.push("registration");
  if (atoms.winLoss !== null) hits.push(`winLoss:${atoms.winLoss}`);
  if (atoms.limitOncePerGame) hits.push("limitOncePerGame");
  if (atoms.infoRole) hits.push("infoRole");
  return hits;
}

/** 主实现的选取：优先「英文 id 精确命中 + 内置剧本 + 已注册能力 + 短 id」 */
function primaryScore(entry: { impl: ImplRole; matchedBy: string }): number {
  let score = 0;
  if (entry.matchedBy === "english_id") score += 100;
  else if (entry.matchedBy === "chinese_name") score += 40;
  else if (entry.matchedBy === "english_stem") score += 20;
  else score += 10; // chinese_stem
  if (entry.impl.inBuiltInScript) score += 30;
  if (entry.impl.ability !== null) score += 10;
  return score;
}

interface ImplGroupEntry {
  impl: ImplRole;
  matchedBy: ImplSpecMapping["matchedBy"];
}

function pickPrimaryEntry(entries: ImplGroupEntry[]): ImplGroupEntry {
  return [...entries].sort((a, b) => {
    const scoreDiff = primaryScore(b) - primaryScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const lengthDiff = a.impl.roleId.length - b.impl.roleId.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.impl.roleId.localeCompare(b.impl.roleId);
  })[0]!;
}

/**
 * 全量语义审计（纯函数）：
 *   1. 把官方 232 条能力原文全部抽取为原子（统计用，含变体条目）；
 *   2. 项目 174 个角色按多级回退映射到官方规范；
 *   3. 同一官方角色有多个实现（变体/重复）时只对「主实现」compare，其余登记跳过；
 *   4. 返回 findings + 聚合统计 + 逐角色台账。
 */
export function runSemanticAudit(
  spec: OfficialSpecFile,
  impl: ImplInventory
): SemanticAuditResult {
  const index = buildSpecIndex(spec);

  // 1) 官方侧原子抽取（全量 232 条）
  const atomHits: Record<string, number> = {};
  for (const official of spec.roles) {
    for (const atom of listHitAtoms(extractRuleAtoms(official.abilityText))) {
      atomHits[atom] = (atomHits[atom] ?? 0) + 1;
    }
  }

  // 2) 项目角色 → 官方规范分组
  const groups = new Map<OfficialRoleSpec, ImplGroupEntry[]>();
  const unmappedImplRoles: string[] = [];
  for (const role of impl.roles) {
    const mapping = resolveSpecForImplRoleWithIndex(role, index);
    if (!mapping) {
      unmappedImplRoles.push(role.roleId);
      continue;
    }
    const bucket = groups.get(mapping.spec) ?? [];
    bucket.push({ impl: role, matchedBy: mapping.matchedBy });
    groups.set(mapping.spec, bucket);
  }
  unmappedImplRoles.sort((a, b) => a.localeCompare(b));

  const findings: SemanticFinding[] = [];
  const roles: SemanticRoleRow[] = [];
  const variantSkippedRaw: string[] = [];
  const mappedSpecs = new Set(groups.keys());
  const primaryRoleIds = new Set<string>();
  let comparedRoles = 0;
  let abilityUnregisteredRoles = 0;
  const seenSignatures = new Set<string>();

  const sortedGroups = [...groups.entries()].sort((a, b) =>
    a[0].nameCn.localeCompare(b[0].nameCn, "zh-Hans-CN")
  );

  for (const [official, entries] of sortedGroups) {
    const primary = pickPrimaryEntry(entries);
    primaryRoleIds.add(primary.impl.roleId);
    for (const entry of entries) {
      if (entry !== primary) variantSkippedRaw.push(entry.impl.roleId);
    }

    const atoms = extractRuleAtoms(official.abilityText);
    comparedRoles++;
    if (primary.impl.ability === null) abilityUnregisteredRoles++;

    roles.push({
      roleId: primary.impl.roleId,
      nameCn: primary.impl.nameCn,
      officialNameCn: official.nameCn,
      matchedBy: primary.matchedBy,
      hasAbilityImpl: primary.impl.ability !== null,
      atoms,
    });

    for (const deviation of compareAtomsForRole(atoms, official, primary.impl)) {
      const signature = `${primary.impl.roleId}|${deviation.atom}|${deviation.severity}`;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      findings.push({
        ...deviation,
        roleId: primary.impl.roleId,
        nameCn: primary.impl.nameCn,
        officialNameCn: official.nameCn,
        officialType: official.type,
        officialAbilityText: official.abilityText,
        matchedBy: primary.matchedBy,
      });
    }
  }

  // 3) 官方有、项目没有的角色（仅统计，L1 已有专门 finding）
  const specWithoutImpl = spec.roles
    .filter((official) => !mappedSpecs.has(official))
    .map((official) => official.nameCn);

  findings.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const atomDiff = a.atom.localeCompare(b.atom);
    if (atomDiff !== 0) return atomDiff;
    return a.roleId.localeCompare(b.roleId);
  });

  // 4) 按 atom + severity 聚合
  const aggregate = new Map<
    string,
    { atom: string; severity: AtomDeviation["severity"]; roles: string[] }
  >();
  for (const finding of findings) {
    const key = `${finding.severity}|${finding.atom}`;
    const bucket = aggregate.get(key) ?? {
      atom: finding.atom,
      severity: finding.severity,
      roles: [],
    };
    bucket.roles.push(finding.nameCn);
    aggregate.set(key, bucket);
  }
  const byAtom = [...aggregate.values()]
    .map((bucket) => ({
      atom: bucket.atom,
      severity: bucket.severity,
      count: bucket.roles.length,
      roles: bucket.roles.sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    }))
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return severityDiff !== 0 ? severityDiff : b.count - a.count;
    });

  const countSeverity = (severity: AtomDeviation["severity"]): number =>
    findings.filter((finding) => finding.severity === severity).length;
  const deviations = {
    P0: countSeverity("P0"),
    P1: countSeverity("P1"),
    P2: countSeverity("P2"),
    INFO: countSeverity("INFO"),
    total: findings.length,
  };

  // 被跳过的变体/重复实现：去重，且排除「同一个 roleId 同时也是另一组主实现」的
  // 重复注册项（app/data.ts 里存在同一 roleId 重复出现的条目）。
  const variantSkipped = [...new Set(variantSkippedRaw)]
    .filter((roleId) => !primaryRoleIds.has(roleId))
    .sort((a, b) => a.localeCompare(b));

  return {
    generatedAt: new Date().toISOString(),
    source:
      "official_spec.json（json/full/*.json 归一化）+ buildImplInventory()（app/data.ts + abilityRegistry）",
    stats: {
      officialRoles: spec.roles.length,
      implRoles: impl.roles.length,
      comparedSpecs: mappedSpecs.size,
      comparedRoles,
      variantSkippedRoles: variantSkipped.length,
      implWithoutSpec: unmappedImplRoles.length,
      specWithoutImpl: specWithoutImpl.length,
      abilityUnregisteredRoles,
      atomHits,
      deviations,
    },
    byAtom,
    findings,
    roles,
    unmappedImplRoles,
    unmappedSpecRoles: specWithoutImpl.sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    ),
    variantSkipped: variantSkipped,
  };
}
