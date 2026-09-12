/**
 * 全局「玩家视角（player view）」统一机制
 * ============================================================================
 *
 * 【为什么需要这一层】
 * 《血染钟楼》的说书人掌握的信息量远大于玩家：
 *   - 谁中毒/醉酒/受涡流影响（= 能力可能不生效）；
 *   - 谁的真实身份被伪装了（酒鬼、提线木偶、疯子、镜像双子…）；
 *   - 某条信息是不是被系统替换过的假信息；
 *   - 每个座位上坐着的真实角色是什么。
 * 这些都属于**说书人视角信息**。而本项目的「技能确认页 / 技能结果页」
 * （components/game/NightActionPage.tsx 及其内联的 INFO_RESULT、
 *  modals/NightActionConfirmModal.tsx）会**整机交给玩家亲手点击**，
 * 因此它们必须只呈现玩家视角能看到的信息。
 *
 * 【机制】
 * 1. `src/components/game/PlayerViewContext.tsx`
 *    - `PlayerViewProvider`：注入当前是「玩家视角」还是「说书人解锁视图」；
 *    - `usePlayerView()`：读取开关（**默认 true = 玩家视角**，安全默认）；
 *    - `<StorytellerOnly>`：只有说书人解锁视图才**渲染**（不是 CSS 隐藏！），
 *      未解锁时 children 根本不进入 DOM，可用静态 HTML 断言兜底。
 * 2. 本文件提供与 React 无关的**纯函数**：
 *    - 玩家可见身份解析（疯子→apparentDemonRole、酒鬼/提线木偶→charadeRole）；
 *    - 面向玩家的文案脱敏 + 泄漏词表（供测试与运行时双重把关）。
 * 3. 讲纪律：新增任何"玩家会看到的"文案/列表前，先过一遍
 *    `sanitizePlayerFacingText()` / `findPlayerViewLeaks()`，
 *    并在 `src/utils/__tests__/playerView.test.ts` 里补断言。
 *
 * 【安全默认原则】
 * 任何"不确定该不该给别人看"的内容，一律算说书人专属：
 * 默认不渲染，只有显式解锁（长按 1.5 秒，见 NightActionPage）才出现。
 */

import type { Role, Seat } from "../../app/data";

/** 说书人专属座位字段（真实身份/伪装/状态真相）——玩家视角下禁止读取与渲染。 */
export const STORYTELLER_ONLY_SEAT_FIELDS = [
  "role",
  "charadeRole",
  "apparentDemonRole",
  "isDrunk",
  "isPoisoned",
  "isEvilConverted",
  "isGoodTwin",
  "isRedHerring",
  "lunaticTarget",
  "lunaticTargetIds",
  "statusDetails",
  "statusEffects",
  "statuses",
] as const;

/**
 * 玩家视角下**绝不允许出现**的字样。
 *
 * 说明：这是一份"兜底网"，不是唯一防线——真正的防线是条件渲染
 * （<StorytellerOnly>，数据不进 DOM）。词表用于：
 *   - 运行时对动态文案做最后一道脱敏；
 *   - 单测里对整页静态 HTML 做泄漏断言（见 __tests__）。
 */
export const PLAYER_VIEW_FORBIDDEN_TERMS: readonly string[] = [
  // 伪装身份相关
  "疯子",
  "lunatic",
  "Lunatic",
  "真实身份",
  "伪装身份",
  "伪:",
  "实:",
  "你以为你是一个恶魔",
  // 状态/干扰相关
  "受干扰",
  "能力可能不生效",
  "中毒",
  "醉酒",
  "涡流世界",
  "此为假信息",
  "可能为虚假信息",
  "虚假信息",
  "假信息",
  // 说书人专属提示
  "说书人",
  "请勿让它察觉",
  "不要透露",
  "提线木偶",
  "命中毒",
  "命中恶魔",
  "红罗刹",
];

/**
 * 找出文本里的玩家视角泄漏词。
 * @returns 命中的词（去重，保持词表顺序）；无泄漏返回空数组。
 */
export function findPlayerViewLeaks(text: string | null | undefined): string[] {
  if (!text) return [];
  return PLAYER_VIEW_FORBIDDEN_TERMS.filter((term) => text.includes(term));
}

/** 递归找出任意值（字符串/数组/对象）里的玩家视角泄漏词。 */
export function findPlayerViewLeaksDeep(value: unknown): string[] {
  const hits = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      findPlayerViewLeaks(v).forEach((t) => hits.add(t));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach((item) =>
        walk(item, depth + 1)
      );
    }
  };
  walk(value, 0);
  return Array.from(hits);
}

/**
 * 对一段（可能来自引擎的）动态文案做玩家视角脱敏。
 *
 * 处理对象是引擎在**说书人链路上**生成、但会流入玩家页面的后缀/标记，例如：
 *   - `占卜师【受干扰】探查【3号和5号】：没有恶魔`
 *   - `得知：场上有2对邪恶玩家邻座。（虚假信息）`
 *   - `3号玩家的真实身份：男爵 (中毒/醉酒状态，此为假信息)`
 *
 * 注意：脱敏只做"减法"，不会凭空造信息；真正的信息替换在引擎侧完成。
 */
export function sanitizePlayerFacingText(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  // ① 括号包裹的干扰/假信息标记（中英文括号都处理）
  const bracketed = [
    "受干扰",
    "干扰",
    "虚假信息",
    "假信息",
    "可能为虚假信息",
    "信息可能不准确",
    "中毒",
    "醉酒",
    "中毒/醉酒",
    "中毒或醉酒",
  ];
  for (const tag of bracketed) {
    out = out.split(`【${tag}】`).join("");
    out = out.split(`（${tag}）`).join("");
    out = out.split(`(${tag})`).join("");
    out = out.split(`[${tag}]`).join("");
  }
  // ② 行内说明性后缀
  out = out.replace(/[（(]\s*(中毒|醉酒|中毒\/醉酒|中毒或醉酒)[^）)]*[）)]/g, "");
  out = out.replace(/[（(]\s*此为假信息\s*[）)]/g, "");
  out = out.replace(/[（(]\s*可能为虚假信息\s*[）)]/g, "");
  out = out.replace(/[（(]\s*能力可能不生效\s*[）)]/g, "");
  // ③ 残留的独立标记
  out = out.replace(/【受干扰】/g, "").replace(/【虚假信息】/g, "");
  // ④ 冒号后的"真实身份"写法 → 只留角色名本身
  out = out.replace(/[0-9]+号玩家的真实身份[:：]/g, "");
  // ⑤ 去掉因删除标记产生的悬挂标点/空行
  out = out
    .split("\n")
    .map((line) => line.replace(/\s+([。，,；;])/g, "$1").trimEnd())
    .filter((line, idx, arr) => line.trim() !== "" || (idx > 0 && idx < arr.length - 1))
    .join("\n");
  return out.trim();
}

/**
 * 玩家视角下的"我是谁"：疯子以为自己是恶魔；酒鬼/提线木偶以为自己是伪装的镇民。
 * 这是**玩家可见身份**，与执行/规则无关（执行仍走真实角色能力）。
 */
export function getPlayerFacingRole(
  seat: (Seat & { apparentDemonRole?: Role | null }) | null | undefined
): Role | null {
  if (!seat) return null;
  const roleId = seat.role?.id;
  if (roleId === "lunatic") {
    return (seat as any).apparentDemonRole ?? seat.role ?? null;
  }
  if ((roleId === "drunk" || roleId === "marionette") && seat.charadeRole) {
    return seat.charadeRole;
  }
  return seat.role ?? null;
}

/** 玩家视角下的角色名（疯子 → 其以为的恶魔名）。 */
export function getPlayerFacingRoleName(seat: any): string {
  return getPlayerFacingRole(seat)?.name ?? "未知角色";
}

/** 玩家视角下的角色类型（疯子 → demon）。 */
export function getPlayerFacingRoleType(seat: any): string {
  return (getPlayerFacingRole(seat) as any)?.type ?? "unknown";
}

/** 该座位在玩家视角下是否「扮演着另一个角色」（酒鬼/提线木偶/疯子）。 */
export function hasPlayerFacingDisguise(seat: any): boolean {
  const roleId = seat?.role?.id;
  if (roleId === "lunatic") return !!seat.apparentDemonRole;
  if (roleId === "drunk" || roleId === "marionette") return !!seat.charadeRole;
  return false;
}

/**
 * 玩家视角下的座位标签：**只有座位号 + 玩家名**。
 * 绝不包含真实角色名（这是 NightActionPage 目标网格此前最大的泄漏点）。
 */
export function getPlayerFacingSeatLabel(
  seat: { id: number; playerName?: string | null } | null | undefined
): string {
  if (!seat) return "—";
  const name = (seat.playerName ?? "").trim();
  const isPlaceholder =
    !name || name === `玩家${seat.id + 1}` || name === `玩家 ${seat.id + 1}`;
  return isPlaceholder ? `${seat.id + 1}号` : `${seat.id + 1}号 ${name}`;
}

/** 读取疯子本夜提交的目标（兼容单目标/多目标两种历史写法）。 */
export function getLunaticChosenTargetIds(
  seat: any
): number[] {
  const ids = seat?.lunaticTargetIds;
  if (Array.isArray(ids)) return ids.filter((n: any) => typeof n === "number");
  const single = seat?.lunaticTarget;
  return typeof single === "number" ? [single] : [];
}

/**
 * A4：真恶魔在每个夜晚都应看到「疯子本夜选择了哪些玩家」。
 * 官方原文（json/wiki_crawl/parsed_roles.json「疯子」）：
 *   「真正的恶魔会知道疯子每个夜晚攻击了哪些玩家。」
 *
 * @param seats 全部座位
 * @param opts.forStorytellerConsole 说书人控制台用语（默认面向玩家/恶魔的文案）
 * @returns 提示文案；场上没有疯子或疯子本夜未选择时返回 null
 *          （未选择时由调用方决定是否用 `getLunaticNoChoiceHint()`）
 */
export function getLunaticChoiceHint(
  seats: Seat[],
  opts?: { allowDead?: boolean }
): string | null {
  const lunatics = (seats || []).filter(
    (s) => s?.role?.id === "lunatic" && (opts?.allowDead || !s.isDead)
  );
  if (lunatics.length === 0) return null;
  const parts: string[] = [];
  for (const seat of lunatics) {
    const ids = getLunaticChosenTargetIds(seat);
    if (ids.length === 0) continue;
    const label = ids.map((id) => `${id + 1}号玩家`).join("、");
    parts.push(`🌀 疯子本夜选择了 ${label}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** 疯子在场但本夜未选择目标时的明确文案（A4 要求"0 目标也要有明确文案"）。 */
export function getLunaticNoChoiceHint(
  seats: Seat[],
  opts?: { allowDead?: boolean }
): string | null {
  const lunatics = (seats || []).filter(
    (s) => s?.role?.id === "lunatic" && (opts?.allowDead || !s.isDead)
  );
  if (lunatics.length === 0) return null;
  const all = lunatics.every((s) => getLunaticChosenTargetIds(s).length === 0);
  return all ? "🌀 疯子本夜未选择任何玩家" : null;
}

/** A4 统一入口：优先给"选择了谁"，其次给"本夜未选择"；无疯子返回 null。 */
export function getLunaticNightHint(seats: Seat[]): string | null {
  return getLunaticChoiceHint(seats) ?? getLunaticNoChoiceHint(seats);
}
