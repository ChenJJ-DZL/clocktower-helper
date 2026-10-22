/**
 * 🌅 黎明播报的唯一格式化入口
 * ----------------------------------------------------------------------------
 * 官方规则（两处都要求播报**死亡**与**复活**两段，且**不说明原因**）：
 *
 * · 沙巴洛斯【角色能力】/【运作方式】：
 *   「在黎明时，在宣布哪些玩家死亡后，宣布哪些玩家复活了。（不要说明原因。）」
 * · 哈迪寂亚【运作方式】：
 *   「宣布黄昏时存活但黎明时死亡的玩家死亡，宣布黄昏时死亡但黎明时存活的玩家复活。」
 *
 * 🔴 为什么必须收口到一个函数（2026-10-22）：
 *   修复前「昨晚…玩家死亡 / 昨天是个平安夜」这句话在 **4 个地方**各写了一遍：
 *     · `useNightSnapshot.ts::continueToNextAction`（两处分支）
 *     · `useConfirmHandlers.ts::confirmHadesia`
 *     · `GameModals.tsx` 的兜底
 *   ⇒ 只要其中一处忘了加复活段，玩家就会在不同恶魔局里看到不同口径
 *     （本项目「双写入点必分叉」已命中 8 次，不再赌第 9 次）。
 *
 * ⚠️ 措辞约束：
 *   · 不写死因（官方明确「不要说明原因」）；
 *   · 不写角色名（只能有座位号）；
 *   · 只有复活时也要明说「昨晚无人死亡」，否则玩家会误以为有人死了。
 */

export interface DawnAnnouncementInput {
  /** 今夜死亡的座位 id（0 基，允许重复/乱序/含脏值） */
  deadThisNight?: Array<number | null | undefined> | null;
  /** 今夜复活的座位 id（0 基） */
  revivedThisNight?: Array<number | null | undefined> | null;
}

const PING_AN_NIGHT = "昨天是个平安夜";

/** 去重 + 去脏值 + 升序，保证同一局的播报顺序稳定（避免快照 diff 噪音） */
function normalizeSeatIds(ids: DawnAnnouncementInput["deadThisNight"]): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  for (const raw of ids) {
    // ⚠️ `Number(null) === 0` —— 不显式挡掉，脏值 null 会被当成 0 号座位
    //    凭空播报一条「1号玩家死亡」（单测已锁）。
    if (raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    seen.add(Math.trunc(n));
  }
  return [...seen].sort((a, b) => a - b);
}

function formatSeatNames(ids: number[]): string {
  return ids.map((id) => `${id + 1}号`).join("、");
}

/**
 * 生成黎明播报文案。
 *
 * | 死亡 | 复活 | 输出 |
 * |---|---|---|
 * | 无 | 无 | 昨天是个平安夜 |
 * | 有 | 无 | 昨晚N号玩家死亡 |
 * | 无 | 有 | 昨晚无人死亡；M号玩家复活 |
 * | 有 | 有 | 昨晚N号玩家死亡；M号玩家复活 |
 */
export function buildDawnAnnouncement(input: DawnAnnouncementInput): string {
  const dead = normalizeSeatIds(input.deadThisNight);
  const revived = normalizeSeatIds(input.revivedThisNight);

  if (dead.length === 0 && revived.length === 0) return PING_AN_NIGHT;

  const parts: string[] = [];
  if (dead.length > 0) {
    parts.push(`昨晚${formatSeatNames(dead)}玩家死亡`);
  } else {
    // 只有复活时也必须先播「无人死亡」：官方顺序是「先死亡、后复活」，
    // 少了这半句玩家会以为有人死了却没听到名字。
    parts.push("昨晚无人死亡");
  }
  if (revived.length > 0) {
    parts.push(`${formatSeatNames(revived)}玩家复活`);
  }
  return parts.join("；");
}

/**
 * 从座位上收集「本夜复活」的座位 id。
 *
 * 判据是座位级标记 `revivedAtNight`（由复活写入方打戳：
 * 教授 / 沙巴洛斯反刍 / 哈迪寂亚「生」）。
 * ❌ 不要用 `statusEffects` 里有没有 `resurrected` 来判 —— 那是**永久**记录，
 *    会把上一夜的复活重复播报成今夜。
 */
export function collectRevivedThisNight(
  seats: Array<{ id: number; revivedAtNight?: number | null }> | null | undefined,
  nightCount: number
): number[] {
  if (!Array.isArray(seats)) return [];
  const out: number[] = [];
  for (const s of seats) {
    if (!s) continue;
    if (Number(s.revivedAtNight) === Number(nightCount)) out.push(s.id);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 从**权威座位表**算死亡名单 —— 修复「死了一个人，播报却说平安夜」。
 *
 * 🔴 实测缺陷（2026-10-22，seed 94001 · 第 2 夜）：
 *   小恶魔杀了 1 号（座位 `isDead:true`、`diedAtNight=2`），
 *   黎明播报却是「昨天是个平安夜」。
 *   根因：`deadThisNight` 是 **React state**，而播报在
 *   `setTimeout(() => continueToNextAction(), 50)` 的闭包里构造 ——
 *   拿到的是击杀之前的渲染快照 ⇒ 名单为空。
 *
 * 判据优先级：
 *   ① 座位表（`seatsRef.current`，击杀时同步写入）—— 权威；
 *   ② `deadThisNight` state —— 只作兜底（某些路径不写 `diedAtNight`）。
 *   两者取并集，**不是二选一**：漏报比「多报一个已确认死者」更严重。
 */
export function buildDawnAnnouncementFromSeats(
  seats:
    | Array<{
        id: number;
        isDead?: boolean;
        diedAtNight?: number | null;
        revivedAtNight?: number | null;
      }>
    | null
    | undefined,
  nightCount: number,
  fallbackDeadThisNight?: Array<number | null | undefined> | null,
  fallbackRevivedThisNight?: Array<number | null | undefined> | null
): string {
  const list = Array.isArray(seats) ? seats : [];
  const deadFromSeats = list
    .filter(
      (s) =>
        s &&
        s.isDead === true &&
        Number(s.diedAtNight) === Number(nightCount)
    )
    .map((s) => s.id);

  return buildDawnAnnouncement({
    // 并集：座位表权威 + state 兜底（见上）
    deadThisNight: [...(fallbackDeadThisNight ?? []), ...deadFromSeats],
    revivedThisNight: [
      ...(fallbackRevivedThisNight ?? []),
      ...collectRevivedThisNight(list, nightCount),
    ],
  });
}
