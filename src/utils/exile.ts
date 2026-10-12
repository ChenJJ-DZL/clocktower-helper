/**
 * exile.ts —— 流放（Exile）官方口径纯函数层
 * ==================================================================
 * ⚠️ 本文件是【派单附件】：由 commandcode 读取后整块保存为
 *    `src/utils/exile.ts`，不得改动任何字符。
 *
 * 官方铁律（json/rule/officialRules.json 明文 + 用户 2026-10-12 裁定）：
 *   1. 门槛 = **全体玩家（无论生死）的一半向上取整**（不是存活的一半，
 *      与处决口径不同）；
 *   2. 任何人（含死者）可提议、可表决，且**不消耗投票标记**；
 *   3. 被流放者**立即死**；
 *   4. 一日可流放多人；
 *   5. 流放 ≠ 处决 ⇒ 同日可既有流放又有处决；
 *   6. 不受任何能力影响（含免疫类：镇长/士兵/圣徒一概不挡）；
 *   7. **不产生终局**（旅行者非恶魔且不计入邪恶阈值）；
 *   8. 与旅行者绑定：只有旅行者可被流放（官方：流放是旅行者的离开机制；
 *      说书人也可对非旅行者使用，但本引擎先实现旅行者通道）。
 *
 * 与处决（Execution）的区分：
 *   · 处决走 killPlayer 咽喉（useGameController.ts:605，会触发终局检查
 *     与死亡类能力）；流放**绕过**该咽喉，只写座位死亡字段。
 *   · 送葬者只认处决死（diedOnDay + executedToday），流放死**不得**被
 *     送葬者得知（官方：「对旅行者的流放，不算在内」）。
 */
import type { Seat } from "../../app/data";

/** 流放门槛：全体玩家（含死者）一半向上取整 */
export function exileThreshold(totalPlayers: number): number {
  if (!Number.isFinite(totalPlayers) || totalPlayers <= 0) return 0;
  return Math.ceil(totalPlayers / 2);
}

/** 流放是否通过：赞成票 ≥ 门槛（不分存活/死亡，死者票同等计数） */
export function isExilePassed(votesFor: number, threshold: number): boolean {
  return votesFor >= threshold;
}

export interface ExileOutcome {
  /** 被流放座位 id */
  targetId: number;
  /** 新座位数组（不可变更新：只改 targetId 的死亡字段） */
  seats: Seat[];
  /** 是否真的写入了死亡（false = 目标不存在或已死） */
  applied: boolean;
}

/**
 * 流放死亡写入：立即死，但不触发终局、不触发死亡类能力。
 * ⚠️ 与 killPlayer 的区别：本函数只改座位状态（isDead + 死亡日期标注），
 *    不调用任何能力/终局路径。送葬者不可得知（不写 executedToday）。
 *
 * @param seats    当前座位数组
 * @param targetId 被流放座位 id
 * @param dayCount 当前白天序号（写入死亡日期标注，供 UI 展示）
 */
export function applyExileDeath(
  seats: Seat[],
  targetId: number,
  dayCount: number
): ExileOutcome {
  const target = seats.find((s) => s.id === targetId);
  if (!target || target.isDead) {
    return { targetId, seats, applied: false };
  }
  const next = seats.map((s) =>
    s.id === targetId
      ? {
          ...s,
          isDead: true,
          /** 流放不是处决：不写 diedOnDay 的 executedToday 语义，
           *  只写展示用死亡日期；送葬者判据不看此字段。 */
          diedOnDay: dayCount,
          /** 显式标记流放死（供 UI/日志区分；处决死无此字段） */
          exiled: true,
        }
      : s
  ) as Seat[];
  return { targetId, seats: next, applied: true };
}

/** 一日可流放多人：判断某座位当日是否已被流放（防同一目标重复流放） */
export function isExiledToday(seat: Seat, dayCount: number): boolean {
  return seat.isDead && seat.exiled === true && seat.diedOnDay === dayCount;
}
