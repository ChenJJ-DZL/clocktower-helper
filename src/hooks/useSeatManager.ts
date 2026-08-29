/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useMemo } from "react";
import type { Role, Seat } from "../../app/data";
import { gameActions, useGameContext } from "../contexts/GameContext";
import { getRoleDefinition } from "../roles";
import { checkMutualExclusion, isAntagonismEnabled } from "../utils/antagonism";
import { applyLegionRoleSwap } from "../utils/legionSetupSwap";

/**
 * UseSeatManagerResult - 座位管理 Hook 的返回结果
 */
export interface UseSeatManagerResult {
  seats: Seat[];
  deadThisNight: number[];
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  killSeatOnly: (seatId: number) => void;
  reviveSeatOnly: (seatId: number) => void;
  reviveSeat: (seat: Seat) => Seat;
  patchSeat: (seatId: number, patch: Partial<Seat>) => void;
  updateSeatRole: (seatId: number, updater: (seat: Seat) => Seat) => void;
  changeRole: (seatId: number, newRoleId: string, roles: Role[]) => void;
  swapRoles: (seatId1: number, seatId2: number) => void;
  swapSeats: (seatId1: number, seatId2: number) => void;
}

/**
 * useSeatManager - 座位与玩家状态管理 Hook
 * 现已重构为原生使用 GameContext
 */
export function useSeatManager(): UseSeatManagerResult {
  const { state, dispatch } = useGameContext();
  const { seats, deadThisNight } = state;

  const killSeatOnly = useCallback(
    (seatId: number) => {
      dispatch(
        gameActions.updateSeat(seatId, { isDead: true, hasGhostVote: true })
      );
      dispatch(gameActions.addDeadThisNight(seatId));
    },
    [dispatch]
  );

  const reviveSeatOnly = useCallback(
    (seatId: number) => {
      dispatch(gameActions.updateSeat(seatId, { isDead: false }));
    },
    [dispatch]
  );

  const reviveSeat = useCallback((seat: Seat): Seat => {
    // 基础复活逻辑
    return {
      ...seat,
      isDead: false,
      isEvilConverted: false,
      isZombuulTrulyDead: seat.isZombuulTrulyDead,
      hasGhostVote: true,
      isDrunk: false, // 复活通常清除醉酒
      isPoisoned: (seat.statusDetails || []).includes("永久中毒"),
    };
  }, []);

  const patchSeat = useCallback(
    (seatId: number, patch: Partial<Seat>) => {
      dispatch(gameActions.updateSeat(seatId, patch));
    },
    [dispatch]
  );

  const updateSeatRole = useCallback(
    (seatId: number, updater: (seat: Seat) => Seat) => {
      const seat = seats.find((s) => s.id === seatId);
      if (seat) {
        dispatch(gameActions.updateSeat(seatId, updater(seat)));
      }
    },
    [seats, dispatch]
  );

  const changeRole = useCallback(
    (seatId: number, newRoleId: string, roles: Role[]) => {
      const newRole = roles.find((r) => r.id === newRoleId);
      if (!newRole) return;

      if (isAntagonismEnabled(seats)) {
        const decision = checkMutualExclusion({
          seats,
          enteringRoleId: newRoleId,
          roles,
        });
        if (!decision.allowed) {
          if (decision.reason) {
            dispatch(
              gameActions.addLog({
                day: state.nightCount,
                phase: state.gamePhase,
                message: `⛔ ${decision.reason}`,
              })
            );
          }
          return;
        }
      }

      // 酒鬼与提线木偶特殊处理：charadeRole 保持 null，由说书人手动指定不在场镇民
      const displayRole = newRole;
      const charadeRole = null;

      // 疯子特殊处理：自动从剧本中随机选一个恶魔作为 apparentDemonRole
      let apparentDemonRole: Role | null = null;
      if (newRoleId === "lunatic") {
        const demonRoles = roles.filter((r) => r.type === "demon");
        if (demonRoles.length > 0) {
          apparentDemonRole =
            demonRoles[Math.floor(Math.random() * demonRoles.length)];
          console.log(
            `[useSeatManager] 疯子分配 apparentDemonRole: ${apparentDemonRole.name} (${apparentDemonRole.id})`
          );
        }
      }

      if (newRoleId === "legion") {
        // 军团特殊处理：先把军团写入目标座位，再按官方规则整桌反转角色类型
        const seatsAfterAssign = seats.map((seat) =>
          seat.id === seatId
            ? { ...seat, role: newRole, displayRole, charadeRole }
            : seat
        );
        const swap = applyLegionRoleSwap({
          seats: seatsAfterAssign,
          scriptRoles: roles,
        });
        if (swap.applied) {
          // 反转后同步展示身份，避免旧的 displayRole 残留
          const normalizedSeats = swap.seats.map((seat) => ({
            ...seat,
            displayRole: seat.role ?? seat.displayRole ?? null,
          }));
          dispatch(gameActions.setSeats(normalizedSeats));
          dispatch(
            gameActions.addLog({
              day: state.nightCount,
              phase: state.gamePhase,
              message: `🔄 ${seatId + 1}号 的身份变成了 [${newRole.name}]`,
            })
          );
          dispatch(
            gameActions.addLog({
              day: state.nightCount,
              phase: state.gamePhase,
              message: `🔁 军团反转生效：${swap.legionCount} 名玩家变为军团，${swap.newTownsfolkCount} 名玩家变为善良`,
            })
          );
          return;
        }
      }

      dispatch(
        gameActions.updateSeat(seatId, {
          role: newRole,
          displayRole,
          charadeRole,
          ...(apparentDemonRole ? { apparentDemonRole } : {}),
        })
      );

      // NEW: Trigger automated onSetup for the role
      const def = getRoleDefinition(newRoleId);
      console.log(
        `[useSeatManager] Triggering onSetup for ${newRoleId} (Seat ${seatId + 1})`
      );
      if (def?.onSetup) {
        const setupResult = def.onSetup({ seats, selfId: seatId });
        if (setupResult?.updates) {
          setupResult.updates.forEach((update: any) => {
            const { id, ...patch } = update;
            dispatch(gameActions.updateSeat(id, patch));
          });
        }
        if (setupResult?.logs) {
          const logMsg =
            setupResult.logs.privateLog || setupResult.logs.publicLog;
          if (logMsg) {
            dispatch(
              gameActions.addLog({
                day: state.nightCount,
                phase: state.gamePhase,
                message: `⚙️ [Setup] ${logMsg}`,
              })
            );
          }
        }
      }

      dispatch(
        gameActions.addLog({
          day: state.nightCount,
          phase: state.gamePhase,
          message: `🔄 ${seatId + 1}号 的身份变成了 [${newRole.name}]`,
        })
      );
      dispatch(gameActions.saveHistory());
    },
    [seats, state.nightCount, state.gamePhase, dispatch]
  );

  const swapRoles = useCallback(
    (seatId1: number, seatId2: number) => {
      const s1 = seats.find((s) => s.id === seatId1);
      const s2 = seats.find((s) => s.id === seatId2);
      if (!s1 || !s2) return;

      dispatch(
        gameActions.updateSeat(seatId1, {
          role: s2.role,
          displayRole: s2.displayRole,
        })
      );
      dispatch(
        gameActions.updateSeat(seatId2, {
          role: s1.role,
          displayRole: s1.displayRole,
        })
      );
      dispatch(
        gameActions.addLog({
          day: state.nightCount,
          phase: state.gamePhase,
          message: `🔀 ${seatId1 + 1}号 和 ${seatId2 + 1}号 交换了角色`,
        })
      );
      dispatch(gameActions.saveHistory());
    },
    [seats, state.nightCount, state.gamePhase, dispatch]
  );

  const swapSeats = useCallback(
    (seatId1: number, seatId2: number) => {
      if (seatId1 === seatId2) return;
      const s1 = seats.find((s) => s.id === seatId1);
      const s2 = seats.find((s) => s.id === seatId2);
      if (!s1 || !s2) return;

      const newSeats = seats.map((s) => {
        if (s.id === seatId1) {
          return { ...s2, id: seatId1 };
        }
        if (s.id === seatId2) {
          return { ...s1, id: seatId2 };
        }
        return s;
      });

      dispatch(gameActions.setSeats(newSeats));

      // 互换关联的 seatNotes
      if (state.seatNotes) {
        const newNotes = { ...state.seatNotes };
        const n1 = newNotes[seatId1];
        const n2 = newNotes[seatId2];
        if (n2 !== undefined) newNotes[seatId1] = n2;
        else delete newNotes[seatId1];
        if (n1 !== undefined) newNotes[seatId2] = n1;
        else delete newNotes[seatId2];
        dispatch(gameActions.updateState({ seatNotes: newNotes }));
      }

      const name1 = s1.role?.name || s1.playerName || `${seatId1 + 1}号`;
      const name2 = s2.role?.name || s2.playerName || `${seatId2 + 1}号`;
      dispatch(
        gameActions.addLog({
          day: state.nightCount,
          phase: state.gamePhase,
          message: `🔀 ${seatId1 + 1}号 (${name1}) 与 ${seatId2 + 1}号 (${name2}) 互换了座位`,
        })
      );
      dispatch(gameActions.saveHistory({ seats: newSeats }));
    },
    [seats, state.nightCount, state.gamePhase, state.seatNotes, dispatch]
  );

  return useMemo(
    () => ({
      seats,
      deadThisNight,
      setSeats: (val: React.SetStateAction<Seat[]>) => {
        const next =
          typeof val === "function"
            ? (val as (p: Seat[]) => Seat[])(state.seats)
            : val;
        dispatch(gameActions.setSeats(next));
      },
      setDeadThisNight: (val: React.SetStateAction<number[]>) => {
        const next =
          typeof val === "function"
            ? (val as (p: number[]) => number[])(state.deadThisNight)
            : val;
        dispatch(gameActions.updateState({ deadThisNight: next }));
      },
      killSeatOnly,
      reviveSeatOnly,
      reviveSeat,
      patchSeat,
      updateSeatRole,
      changeRole,
      swapRoles,
      swapSeats,
    }),
    [
      seats,
      deadThisNight,
      killSeatOnly,
      reviveSeatOnly,
      reviveSeat,
      patchSeat,
      updateSeatRole,
      changeRole,
      swapRoles,
      swapSeats,
      dispatch,
      state.deadThisNight,
      state.seats,
    ]
  );
}
