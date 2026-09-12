/**
 * 疯子（Lunatic）首夜「假恶魔信息」生成器
 * ============================================================================
 *
 * 【官方依据】json/wiki_crawl/parsed_roles.json「疯子」角色简介第 2 条：
 *   「疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量
 *     符合的爪牙，**但是这些信息可能是错误的**。」
 * 角色能力里还有一句：
 *   「你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个
 *     夜晚选择了哪些玩家。」
 *
 * 【实现口径（说书人裁决）】
 *   1. 给疯子看的 3 张伪装牌：**允许是本局在场的善良角色**（镇民/外来者），
 *      但**必须与真恶魔拿到的 3 张不重叠**（唯一硬约束）；仍然只能给善良角色，
 *      绝不给爪牙/恶魔；内部不得重复。剧本善良角色（扣掉恶魔那 3 张）不足 3 张时
 *      允许少于 3 张。
 *   2. 给疯子看的"爪牙"：数量 == 场上真实爪牙数；
 *      身份**必须为假**，只从"非邪恶座位"里选（排除真恶魔/真爪牙/疯子自己），
 *      绝不出现任何真实邪恶玩家。
 *   3. 稳定性：一次生成、整局固定。种子只由**本局不变的事实**推出
 *      （剧本 id、疯子座位号、在场角色集合），因此即使重新渲染/撤销重做
 *      重算，结果也完全一致。生成结果会写回 `seat.lunaticFakeInfo` 持久化；
 *      读取一律走 `resolveLunaticFakeInfo()`（有持久化值就用它）。
 *   4. 隔离：这份信息**只喂给疯子**（见 utils/nightInfoAdapter.ts 的
 *      demon_info 分支）。真恶魔、真爪牙的互认信息仍走原逻辑，一字不改。
 */

import { roles as allRoles, type Seat } from "../../app/data";
import { createDeterministicRandom } from "../roles/core/deterministicRandom";
import { isRealMinion, isMarionetteSeat } from "./roleFlags";

/** 疯子首夜"假恶魔信息"的持久化结构（挂在 seat 上）。 */
export interface LunaticFakeInfo {
  /** 给疯子看的 3 张"不在场"伪装牌（角色名） */
  bluffNames: string[];
  /** 给疯子看的"爪牙队友"座位号（全部来自非邪恶座位，且不含疯子自己） */
  fakeMinionIds: number[];
  /** 生成种子（可复现，便于排查） */
  seed: string;
}

interface SeatLike {
  id: number;
  role?: { id?: string | null; name?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null } | null;
  isDead?: boolean;
  isEvilConverted?: boolean;
  apparentDemonRole?: { id?: string | null } | null;
  lunaticFakeInfo?: LunaticFakeInfo | null;
}

/** 取剧本角色 id 列表（兼容 selectedScript 的两种字段写法）。 */
export function getScriptRoleIds(script: any): string[] {
  if (!script) return [];
  return (
    script.roleIds ||
    script.roles?.map((r: any) => r?.id).filter(Boolean) ||
    []
  );
}

/** 本局剧本里的全部善良角色名（镇民 + 外来者，按剧本原顺序）。 */
export function computeScriptGoodRoleNames(scriptRoleIds: string[]): string[] {
  return scriptRoleIds
    .map((id) => allRoles.find((r) => r.id === id))
    .filter((r: any) => r && (r.type === "townsfolk" || r.type === "outsider"))
    .map((r: any) => r.name as string);
}

/** 本局"不在场的善良角色"（镇民 + 外来者，按剧本原顺序）。 */
export function computeNotInPlayGoodRoleNames(
  seats: SeatLike[],
  scriptRoleIds: string[]
): string[] {
  const inPlay = new Set(
    (seats || []).map((s) => s.role?.id).filter(Boolean) as string[]
  );
  return scriptRoleIds
    .map((id) => allRoles.find((r) => r.id === id))
    .filter((r: any) => r && (r.type === "townsfolk" || r.type === "outsider"))
    .filter((r: any) => !inPlay.has(r.id))
    .map((r: any) => r.name as string);
}

/**
 * 真恶魔拿到的 3 张伪装牌 —— 与 utils/nightInfoAdapter.ts 的
 * `regularBluffText` 使用**同一个函数**，确保两边永远一致
 * （否则"疯子与恶魔不重叠"这条约束会失去意义）。
 */
export function computeDemonBluffNames(
  seats: SeatLike[],
  scriptRoleIds: string[]
): string[] {
  return computeNotInPlayGoodRoleNames(seats, scriptRoleIds).slice(0, 3);
}

/** 是否属于"邪恶阵营座位"（真恶魔/真爪牙/转邪恶）——疯子假爪牙池必须排除它们。 */
function isEvilSideSeat(seat: SeatLike): boolean {
  if (seat.isEvilConverted) return true;
  const t = seat.role?.type;
  return t === "minion" || t === "demon";
}

/**
 * 生成疯子的首夜假信息（纯函数、确定性）。
 *
 * ⚠️ 注意：本函数**不读随机数以外的不确定来源**，同输入必定同输出。
 */
export function buildLunaticFakeInfo(
  seats: SeatLike[],
  scriptRoleIds: string[],
  lunaticSeatId: number,
  scriptId?: string | null
): LunaticFakeInfo {
  // 真恶魔的 3 张伪装牌（与 utils/nightInfoAdapter.ts 的 regularBluffText 同源）
  const demonBluffs = computeDemonBluffNames(seats, scriptRoleIds);

  /**
   * ① 3 张伪装牌（说书人裁决版规则）：
   *    - **允许是本局在场的善良角色**（镇民/外来者都行）——官方只说"不在场的角色"，
   *      但电子化实现下与真恶魔那 3 张不重叠才是关键约束；
   *    - **必须与真恶魔拿到的 3 张不重叠**（唯一硬约束，集合交集为空）；
   *    - 仍然**只能是善良角色**（townsfolk / outsider），绝不给爪牙或恶魔；
   *    - 内部不得重复；剧本善良角色（扣除恶魔那 3 张后）不足 3 张时允许少于 3 张。
   */
  const scriptGoodNames = computeScriptGoodRoleNames(scriptRoleIds);
  // ⚠️ 绝不能把疯子自己的角色名（"疯子"）当成伪装牌给他 —— 那等于直接自曝。
  const lunaticRoleName =
    (seats || []).find((s) => s.id === lunaticSeatId)?.role?.name ??
    allRoles.find((r) => r.id === "lunatic")?.name ??
    "疯子";
  const lunaticBluffPool = scriptGoodNames.filter(
    (name) => name !== lunaticRoleName && !demonBluffs.includes(name)
  );

  // ② 假爪牙：数量 == 真实爪牙数，来源必须是"非邪恶座位"
  const realMinionCount = (seats || []).filter((s) => isRealMinion(s)).length;
  const goodPool = (seats || [])
    .filter(
      (s) =>
        s.id !== lunaticSeatId &&
        !isEvilSideSeat(s) &&
        // 提线木偶本身是爪牙，虽然它"以为自己是好人"，但也不能被当成假爪牙
        // 展示给疯子（否则疯子与木偶一对信息就会发现异常）。
        !isMarionetteSeat(s)
    )
    .map((s) => s.id)
    .sort((a, b) => a - b);

  const seed = [
    "lunatic-fake-info",
    scriptId ?? "unknown-script",
    `seat:${lunaticSeatId}`,
    `inplay:${(seats || [])
      .map((s) => s.role?.id)
      .filter(Boolean)
      .sort()
      .join(",")}`,
  ].join("|");

  const rng = createDeterministicRandom(seed);
  const shuffled = [...goodPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // 取前 N 个（N = 真实爪牙数）；可用非邪恶座位不足时只能少给，绝不塞真实邪恶玩家。
  const fakeMinionIds = shuffled
    .slice(0, Math.min(realMinionCount, shuffled.length))
    .sort((a, b) => a - b);

  // 3 张伪装牌同样按确定性随机从"善良角色 − 恶魔那 3 张"里取，
  // 保证：内部不重复、与恶魔牌不重叠、且跨夜/撤销重做完全稳定。
  const bluffShuffled = [...lunaticBluffPool];
  for (let i = bluffShuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bluffShuffled[i], bluffShuffled[j]] = [bluffShuffled[j], bluffShuffled[i]];
  }
  const bluffNames = Array.from(new Set(bluffShuffled)).slice(0, 3);

  return { bluffNames, fakeMinionIds, seed };
}

/**
 * 读取（必要时生成）疯子的假信息。
 * 优先用座位上的持久化值 `seat.lunaticFakeInfo`；没有则按确定性规则现算。
 */
export function resolveLunaticFakeInfo(
  seats: SeatLike[],
  scriptRoleIds: string[],
  lunaticSeatId: number,
  scriptId?: string | null
): LunaticFakeInfo {
  const seat = (seats || []).find((s) => s.id === lunaticSeatId);
  const stored = seat?.lunaticFakeInfo;
  if (
    stored &&
    Array.isArray(stored.bluffNames) &&
    Array.isArray(stored.fakeMinionIds)
  ) {
    return stored;
  }
  return buildLunaticFakeInfo(seats, scriptRoleIds, lunaticSeatId, scriptId);
}

/** 供测试/调试：把假信息渲染成与真恶魔同款的文案。 */
export function formatLunaticFakeGuide(
  fake: LunaticFakeInfo,
  allSeats: SeatLike[]
): string {
  const minionDesc =
    fake.fakeMinionIds
      .map((id) => `${id + 1}号`)
      .join("、") || "无";
  const bluffText =
    fake.bluffNames.length > 0
      ? `\n不在场伪装: 【${fake.bluffNames.join("】、【")}】`
      : "";
  void allSeats;
  return `爪牙是: ${minionDesc}${bluffText}`;
}
