"use client";

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { Seat, Role } from "../../app/data";

export interface SeatManagerState {
  seats: Seat[];
  setSeats: Dispatch<SetStateAction<Seat[]>>;
  deadThisNight: number[];
  setDeadThisNight: Dispatch<SetStateAction<number[]>>;
}

export interface UseSeatManagerResult {
  seats: Seat[];
  setSeats: Dispatch<SetStateAction<Seat[]>>;
  deadThisNight: number[];
  setDeadThisNight: Dispatch<SetStateAction<number[]>>;
  /**
   * 轻量级座位操作工具：仅做结构性修改，不包含复杂规则判断。
   * 复杂的击杀/保护/胜负判定仍由 useGameController 中的高阶逻辑负责。
   */
  killSeatOnly: (seatId: number) => void;
  reviveSeatOnly: (seatId: number) => void;
  reviveSeat: (seat: Seat) => Seat;
  patchSeat: (seatId: number, patch: Partial<Seat>) => void;
  updateSeatRole: (seatId: number, updater: (seat: Seat) => Seat) => void;
  changeRole: (seatId: number, newRoleId: string) => void;
  swapRoles: (seatId1: number, seatId2: number) => void;
}

export interface SeatManagerDeps {
  /**
   * 可选的座位清理逻辑（如清除临时中毒/醉酒等）
   * 若未提供，reviveSeat 将仅清除 isDead 标记。
   */
  cleanseSeatStatuses?: (seat: Seat, opts?: { keepDeathState?: boolean }) => Seat;
  roles?: Role[];
  addLog?: (msg: string) => void;
  isAntagonismEnabled?: (seats: Seat[]) => boolean;
  checkMutualExclusion?: (params: { seats: Seat[]; enteringRoleId: string; roles?: Role[] }) => { allowed: boolean; reason?: string };
}

/**
 * useSeatManager - 座位与玩家状态管理（占位版）
 * 本阶段接管 seats/deadThisNight 及其 setter
 */
export function useSeatManager(base: SeatManagerState, deps: SeatManagerDeps = {}): UseSeatManagerResult {
  const killSeatOnly = useCallback(
    (seatId: number) => {
      base.setSeats(prev =>
        prev.map(seat =>
          seat.id === seatId ? { ...seat, isDead: true } : seat
        )
      );
      base.setDeadThisNight(prev =>
        prev.includes(seatId) ? prev : [...prev, seatId]
      );
    },
    [base.setSeats, base.setDeadThisNight]
  );

  const reviveSeatOnly = useCallback(
    (seatId: number) => {
      base.setSeats(prev =>
        prev.map(seat =>
          seat.id === seatId ? { ...seat, isDead: false } : seat
        )
      );
      // 复活不自动从 deadThisNight 中移除；由上层在结算边界时统一清理
    },
    [base.setSeats]
  );

  const reviveSeat = useCallback(
    (seat: Seat): Seat => {
      if (deps.cleanseSeatStatuses) {
        return deps.cleanseSeatStatuses({
          ...seat,
          isDead: false,
          isEvilConverted: false,
          isZombuulTrulyDead: seat.isZombuulTrulyDead,
          hasGhostVote: true,
        });
      }
      return { ...seat, isDead: false };
    },
    [deps.cleanseSeatStatuses]
  );

  const patchSeat = useCallback(
    (seatId: number, patch: Partial<Seat>) => {
      base.setSeats(prev =>
        prev.map(seat =>
          seat.id === seatId ? { ...seat, ...patch } : seat
        )
      );
    },
    [base.setSeats]
  );

  const updateSeatRole = useCallback(
    (seatId: number, updater: (seat: Seat) => Seat) => {
      base.setSeats(prev =>
        prev.map(seat =>
          seat.id === seatId ? updater(seat) : seat
        )
      );
    },
    [base.setSeats]
  );

  const changeRole = useCallback(
    (seatId: number, newRoleId: string) => {
      if (!deps.roles || deps.roles.length === 0) return;
      const newRole = deps.roles.find(r => r.id === newRoleId);
      if (!newRole) return;

      if (deps.isAntagonismEnabled?.(base.seats) && deps.checkMutualExclusion) {
        const decision = deps.checkMutualExclusion({
          seats: base.seats,
          enteringRoleId: newRoleId,
          roles: deps.roles,
        });
        if (!decision.allowed) {
          if (decision.reason) {
            alert(decision.reason);
            deps.addLog?.(`⛔ ${decision.reason}`);
          }
          return;
        }
      }

      base.setSeats(prev =>
        prev.map(s =>
          s.id === seatId ? { ...s, role: newRole, displayRole: newRole } : s
        )
      );
      deps.addLog?.(`🔄 ${seatId + 1}号 的身份变成了 [${newRole.name}]`);
    },
    [base.seats, base.setSeats, deps.roles, deps.addLog, deps.checkMutualExclusion, deps.isAntagonismEnabled]
  );

  const swapRoles = useCallback(
    (seatId1: number, seatId2: number) => {
      let swapped = false;
      base.setSeats(prev => {
        const s1 = prev.find(s => s.id === seatId1);
        const s2 = prev.find(s => s.id === seatId2);
        if (!s1 || !s2) return prev;
        swapped = true;
        return prev.map(s => {
          if (s.id === seatId1) return { ...s, role: s2.role, displayRole: s2.displayRole };
          if (s.id === seatId2) return { ...s, role: s1.role, displayRole: s1.displayRole };
          return s;
        });
      });
      if (swapped) {
        deps.addLog?.(`🔀 ${seatId1 + 1}号 和 ${seatId2 + 1}号 交换了角色`);
      }
    },
    [base.setSeats, deps.addLog]
  );

  return useMemo(() => {
    return {
      seats: base.seats,
      setSeats: base.setSeats,
      deadThisNight: base.deadThisNight,
      setDeadThisNight: base.setDeadThisNight,
      killSeatOnly,
      reviveSeatOnly,
      reviveSeat,
      patchSeat,
      updateSeatRole,
      changeRole,
      swapRoles,
    };
  }, [
    base.seats,
    base.deadThisNight,
    base.setSeats,
    base.setDeadThisNight,
    killSeatOnly,
    reviveSeatOnly,
    reviveSeat,
    patchSeat,
    updateSeatRole,
    changeRole,
    swapRoles,
  ]);
}

