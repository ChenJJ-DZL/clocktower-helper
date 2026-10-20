/**
 * 🎯 落难少女（Damsel）猜测结算 —— 全仓唯一判据
 * ======================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 落难少女）：
 *   「所有爪牙都知道落难少女在场。**每局游戏限一次**，任意爪牙可以公开猜测
 *     你是落难少女，如果猜对，你的阵营落败。」
 *   「不论有多少爪牙在场，他们**都仅仅只有一次**猜测的机会。如果有爪牙做出了
 *     猜测但答案错误，**后续做出的任何猜测都不会再生效**。」
 *   「如果恶魔假装自己是爪牙并做出了猜测，这次猜测**不会计算在内**。」
 *   「如果落难少女**死亡**，她将不再承担被爪牙猜中的风险。」
 *   运作方式：「如果……猜测错误，使用「已被猜测」标记落难少女。」
 *           「……猜测正确（同时「已被猜测」标记尚未放置），游戏结束。宣布邪恶阵营获胜。」
 *
 * 🔴 修复的三条旧实现违规（2026-10-21）：
 *   ① 旧代码「猜错 ⇒ 猜错的爪牙当场死亡」——官方**无事发生**，只放「已被猜测」标记；
 *   ② 旧代码把「已猜过」记成 **per-minion 列表**（`damselGuessUsedBy`）——官方是
 *      **全局一次**，任一爪牙猜过之后其他爪牙也不能再猜；
 *   ③ 旧代码猜对时只调 `checkGameOver(...,true)`，**不落 `damselGuessed` 状态**
 *      ⇒ 快照/持久化/能力管道都读不到这次结果。
 */

import { canGuessDamsel } from "./roleFlags";
import { isSeatAlive } from "./seatAlive";

interface DamselSeatLike {
  id: number;
  isDead?: boolean | null;
  isSentenced?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  roleType?: string | null;
  effectiveRole?: { id?: string | null; type?: string | null } | null;
}

/** 该座位是否「活着的落难少女」（死亡后不再承担被猜中的风险） */
export function isLivingDamsel(seat: DamselSeatLike | null | undefined): boolean {
  if (!seat) return false;
  if (!isSeatAlive(seat as any)) return false;
  return seat.role?.id === "damsel";
}

/** 场上是否还有活着的落难少女（没有 ⇒ 菜单项不该出现） */
export function hasLivingDamsel(
  seats: readonly DamselSeatLike[] | null | undefined
): boolean {
  return (seats ?? []).some((s) => isLivingDamsel(s));
}

/**
 * 此刻能否发起猜测。
 *
 * @param alreadyGuessed 全局「已被猜测」标记（`state.damselGuessed` 或旧 UI 列表非空）
 */
export function canOpenDamselGuess(input: {
  seats: readonly DamselSeatLike[];
  minionId: number;
  alreadyGuessed: boolean;
}): { allowed: boolean; reason?: string } {
  if (input.alreadyGuessed) {
    return { allowed: false, reason: "本局已有人猜过落难少女（官方：全局仅一次）" };
  }
  if (!hasLivingDamsel(input.seats)) {
    return { allowed: false, reason: "场上没有活着的落难少女" };
  }
  const minion = input.seats.find((s) => s.id === input.minionId);
  if (!minion || !canGuessDamsel(minion as any)) {
    return { allowed: false, reason: "只有真爪牙可以猜测（提线木偶与恶魔不计）" };
  }
  if (!isSeatAlive(minion as any)) {
    return { allowed: false, reason: "该爪牙已死亡" };
  }
  return { allowed: true };
}

export type DamselGuessOutcome =
  /** 本局已猜过 ⇒ 本次猜测不生效（官方：后续任何猜测都不再生效） */
  | "already_guessed"
  /** 猜中活着的落难少女 ⇒ 邪恶阵营立即获胜 */
  | "correct"
  /** 猜错 ⇒ 无事发生，但「已被猜测」标记落下，机会用尽 */
  | "wrong"
  /** 发起者不是真爪牙 / 目标不存在 ⇒ 不计入（官方：恶魔假装爪牙猜测不计算在内） */
  | "invalid";

export interface DamselGuessResolution {
  outcome: DamselGuessOutcome;
  /** 是否落「已被猜测」标记（correct / wrong 都落） */
  consumesGuess: boolean;
  /** 是否立即由邪恶阵营获胜 */
  evilWins: boolean;
  /** ⚠️ 恒为 false —— 保留字段是为了显式钉死「猜错不杀人」这条官方规则 */
  minionDies: boolean;
  reason: string;
}

/**
 * 结算一次爪牙猜测。
 *
 * 判据全部来自官方原文，**不看任何 UI 状态**；调用方只负责把
 * `consumesGuess` 落到唯一事实源（`damselGuessed`）并按 `evilWins` 判终局。
 */
export function resolveDamselGuess(input: {
  seats: readonly DamselSeatLike[];
  minionId: number;
  targetId: number;
  alreadyGuessed: boolean;
}): DamselGuessResolution {
  const { seats, minionId, targetId, alreadyGuessed } = input;

  const minion = seats.find((s) => s.id === minionId);
  if (!minion || !canGuessDamsel(minion as any)) {
    return {
      outcome: "invalid",
      consumesGuess: false,
      evilWins: false,
      minionDies: false,
      reason: "发起者不是真爪牙（恶魔/提线木偶的猜测不计入，也不消耗机会）",
    };
  }

  const target = seats.find((s) => s.id === targetId);
  if (!target) {
    return {
      outcome: "invalid",
      consumesGuess: false,
      evilWins: false,
      minionDies: false,
      reason: "猜测目标不存在",
    };
  }

  if (alreadyGuessed) {
    return {
      outcome: "already_guessed",
      consumesGuess: false,
      evilWins: false,
      minionDies: false,
      reason: "本局已有人猜过落难少女，本次猜测不生效",
    };
  }

  if (isLivingDamsel(target)) {
    return {
      outcome: "correct",
      consumesGuess: true,
      evilWins: true,
      minionDies: false,
      reason: "爪牙猜中落难少女 —— 邪恶阵营获胜",
    };
  }

  return {
    outcome: "wrong",
    consumesGuess: true,
    evilWins: false,
    minionDies: false,
    reason: "猜测错误 —— 无事发生，但本局猜测机会已用完",
  };
}

/** 「已被猜测」标记的放置/移除判据（官方：落难少女死亡时移除） */
export function shouldKeepGuessedMarker(
  seats: readonly DamselSeatLike[]
): boolean {
  return hasLivingDamsel(seats);
}
