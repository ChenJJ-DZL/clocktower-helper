/**
 * 🧠 洗脑师（Cerenovus）·「被洗脑告知」节点
 * ============================================================================
 * 洗脑师夜间指定「N号 疯狂扮演【X】」后，**被洗脑的玩家要在夜间队列里获得属于
 * 他自己的一个步骤**（与洗脑师那一步分开），内容只有他自己该知道的事：
 *   「你需要疯狂证明自己是【X】」+「若未照做，明天白天你可能会被处决」。
 *
 * 【为什么不能复用洗脑师那一步】
 *   洗脑师 = 爪牙，把「11号-洗脑师」这条信息交给 3 号玩家看，等于直接暴露爪牙座位。
 *   因此玩家侧页面**零行动者信息**（不含洗脑师座位号 / 角色名 / cerenovus 字样），
 *   说书人侧才有完整真值与「这是洗脑效果，不要让他知道是谁洗的」备注。
 *
 * 【节点如何保证送达】
 *   - 洗脑师结算时给目标座位打上 `cerenovusNoticeNight = 当夜编号`（夜限，不需要清理，
 *     夜号不匹配即自动失效），并把目标插入唤醒队列（见 useNightActionHandler）；
 *   - 目标本身有夜间技能 → 该技能节点即为他的步骤，告知并渲染在同一页（合并显示）；
 *   - 目标没有任何夜间信息（夜市会跳过空步骤）→ 由 nightInfoAdapter 产出本文件的
 *     **合成节点**（CERENOVUS_NOTICE_STEP_ID），保证这一步一定有页面、信息不丢。
 *
 * 【B 组玩家视角规矩】
 *   本文件的 `playerText` / `playerSubtitle` 是玩家面唯一允许的文案；
 *   `storytellerNote` / `stepLabel` 含行动者线索的说法一律只在说书人侧渲染。
 */

import type { Role, Seat } from "../../app/data";
import type { NightInfoResult } from "../types/game";

/** 合成节点 ID：被洗脑玩家的「得知自己被洗脑」步骤。 */
export const CERENOVUS_NOTICE_STEP_ID = "cerenovus_notice";

/** 说书人侧备注 —— 绝不允许出现在玩家页面。 */
export const CERENOVUS_NOTICE_STORYTELLER_NOTE =
  "这是洗脑效果，不要让他知道是谁洗的";

/** 玩家可见副标题（官方规则：未按洗脑执行，白天可能被处决）。 */
export const CERENOVUS_NOTICE_PLAYER_SUBTITLE =
  "若未照做，明天白天你可能会被处决";

/** 玩家可见主文案（大字）。 */
export function getCerenovusNoticePlayerText(roleName: string): string {
  return `你需要疯狂证明自己是【${roleName}】`;
}

/**
 * 夜间队列步骤名：
 * 「唤醒 N号：得知自己被洗脑（必须疯狂证明自己是【X】）」。
 * ⚠️ 含座位号与"洗脑"字样 —— 只在说书人侧（队列/控制台/解锁视图）使用。
 */
export function getCerenovusNoticeStepLabel(
  seatId: number,
  roleName: string
): string {
  return `唤醒 ${seatId + 1}号：得知自己被洗脑（必须疯狂证明自己是【${roleName}】）`;
}

/** 被洗脑者必须疯狂扮演的角色名（引擎写在该座位上的真值）。 */
export function getCerenovusNoticeRoleName(
  seat: (Partial<Seat> & Record<string, any>) | null | undefined
): string | null {
  const name = (seat as any)?.cerenovusMadnessRole;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/**
 * 该座位**当夜**是否有待送达的洗脑告知。
 * 用 `cerenovusNoticeNight` 与当夜编号比对做"夜限"，因此无需任何清理逻辑：
 * 换夜后夜号不匹配即自动失效，绝不会把昨晚的洗脑在今晚重放一遍。
 */
export function isCerenovusNoticePending(
  seat: (Partial<Seat> & Record<string, any>) | null | undefined,
  nightCount?: number
): boolean {
  const s = seat as any;
  if (!s) return false;
  if (typeof s.cerenovusNoticeNight !== "number") return false;
  if (typeof nightCount === "number" && s.cerenovusNoticeNight !== nightCount) {
    return false;
  }
  return getCerenovusNoticeRoleName(s) !== null;
}

/** 取当夜待送达的洗脑告知（无则 null）。 */
export function getPendingCerenovusNotice(
  seat: (Partial<Seat> & Record<string, any>) | null | undefined,
  nightCount?: number
): { targetId: number; roleName: string } | null {
  if (!isCerenovusNoticePending(seat, nightCount)) return null;
  const s = seat as any;
  return { targetId: s.id, roleName: getCerenovusNoticeRoleName(s) as string };
}

/** 某一步是否是洗脑告知合成节点。 */
export function isCerenovusNoticeStep(
  nightInfo: (NightInfoResult & Record<string, any>) | null | undefined
): boolean {
  return Boolean(nightInfo && (nightInfo as any).cerenovusNotice);
}

/** 合成节点上的洗脑告知数据。 */
export function getCerenovusNoticeFromStep(
  nightInfo: (NightInfoResult & Record<string, any>) | null | undefined
): { targetId: number; roleName: string } | null {
  const notice = (nightInfo as any)?.cerenovusNotice;
  if (!notice || typeof notice.roleName !== "string") return null;
  return { targetId: notice.targetId, roleName: notice.roleName };
}

/**
 * 构造「得知自己被洗脑」合成 NightInfoResult。
 * 仅在目标座位**自身没有任何夜间信息**时使用（否则会覆盖其真实技能步骤）。
 */
export function buildCerenovusNoticeNightInfo(
  seat: Seat,
  nightCount?: number
): NightInfoResult | null {
  const notice = getPendingCerenovusNotice(seat, nightCount);
  if (!notice) return null;
  const label = getCerenovusNoticeStepLabel(notice.targetId, notice.roleName);
  const playerText = getCerenovusNoticePlayerText(notice.roleName);
  return {
    seat,
    effectiveRole: {
      id: CERENOVUS_NOTICE_STEP_ID,
      name: "洗脑告知",
      type: "townsfolk",
    } as Role,
    playerFacingRole: {
      id: CERENOVUS_NOTICE_STEP_ID,
      name: "洗脑告知",
      type: "townsfolk",
    } as Role,
    playerFacingGuide: playerText,
    guide: label,
    guideText: label,
    storytellerNote: CERENOVUS_NOTICE_STORYTELLER_NOTE,
    isPoisoned: false,
    speak: "",
    action: "",
    targetLimit: { min: 0, max: 0 },
    validTargetIds: [],
    canSelectDead: false,
    canSelectSelf: false,
    cerenovusNotice: notice,
  } as NightInfoResult;
}
