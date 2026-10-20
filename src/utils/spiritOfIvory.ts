/**
 * 圣洁之魂（Spirit of Ivory，Fabled）邪恶上限 —— 判据（SST）
 * ==================================================================
 * 【官方原文】"游戏过程中邪恶玩家的总数**最多能比初始设置多一名**。"
 *   【运作方式】"当通过角色能力将善良玩家转变为邪恶阵营时，如果已经有一名
 *     额外邪恶角色在场，则阻止转变。"
 *
 * ⚠️ 2026-10-20 审计发现（用户要求核查全部传奇/旅行者是否真生效）：
 *   旧实现只有 FabledPanel 里一个**手动**「重新评估是否已封顶」按钮，
 *   UI 提示写着"说书人应拒绝任何转为邪恶的操作" —— **靠人肉执行**，
 *   转邪恶入口（PlayerContextMenu / GameConsole）根本不查这个上限。
 *   ⇒ 引擎必须自己拦，判据收敛到本模块。
 */

import { isSeatEvil } from "./seatAlignment";

interface SeatLike {
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
  roleId?: string | null;
}

export interface SpiritOfIvoryInput {
  /** 当前座位 */
  seats: readonly SeatLike[] | null | undefined;
  /** 初始座位（判定"比初始多一名"的基线） */
  initialSeats?: readonly SeatLike[] | null | undefined;
  /** 本局是否上了圣洁之魂（activeFabled 内含 spirit_of_ivory） */
  spiritOfIvoryInPlay?: boolean;
}

/**
 * 「转为邪恶」是否应被阻止。
 *
 * 只有圣洁之魂在场时才有上限；上限 = 初始邪恶数 + 1。
 * 当前邪恶数已达上限 ⇒ 阻止任何新的善良→邪恶转变。
 */
export function isEvilConversionBlockedBySpiritOfIvory(
  input: SpiritOfIvoryInput
): boolean {
  if (input.spiritOfIvoryInPlay === false) return false;
  const seats = input.seats ?? [];
  const initial = input.initialSeats ?? [];
  const initialEvil = initial.filter((s) => isSeatEvil(s as any)).length;
  const currentEvil = seats.filter((s) => isSeatEvil(s as any)).length;
  return currentEvil >= initialEvil + 1;
}

/** 当前邪恶数 / 初始邪恶数 / 上限（UI 展示与提示共用） */
export function spiritOfIvoryBudget(input: SpiritOfIvoryInput): {
  initialEvil: number;
  currentEvil: number;
  cap: number;
  blocked: boolean;
} {
  const seats = input.seats ?? [];
  const initial = input.initialSeats ?? [];
  const initialEvil = initial.filter((s) => isSeatEvil(s as any)).length;
  const currentEvil = seats.filter((s) => isSeatEvil(s as any)).length;
  return {
    initialEvil,
    currentEvil,
    cap: initialEvil + 1,
    blocked: isEvilConversionBlockedBySpiritOfIvory(input),
  };
}
