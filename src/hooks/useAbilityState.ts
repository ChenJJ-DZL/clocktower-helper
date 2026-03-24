import { useCallback, useState } from "react";
import type { Seat } from "@/app/data";

export function useAbilityState(
  nightCount: number,
  setSeats: (val: any) => void
) {
  const [usedOnceAbilities, setUsedOnceAbilities] = useState<
    Record<string, number[]>
  >({});
  const [usedDailyAbilities, setUsedDailyAbilities] = useState<
    Record<string, { day: number; seats: number[] }>
  >({});

  const hasUsedAbility = useCallback(
    (roleId: string, seatId: number) => {
      return (usedOnceAbilities[roleId] || []).includes(seatId);
    },
    [usedOnceAbilities]
  );

  const markAbilityUsed = useCallback(
    (roleId: string, seatId: number) => {
      setSeats((prev: Seat[]) =>
        prev.map((s) => {
          if (s.id !== seatId) return s;
          const detail = `${roleId} 一次性能力已用`;
          const statusDetails = s.statusDetails || [];
          return statusDetails.includes(detail)
            ? s
            : { ...s, statusDetails: [...statusDetails, detail] };
        })
      );
      setUsedOnceAbilities((prev) => {
        const existed = prev[roleId] || [];
        if (existed.includes(seatId)) return prev;
        return { ...prev, [roleId]: [...existed, seatId] };
      });
    },
    [setSeats]
  );

  /**
   * 重置玩家的能力使用状态（当玩家角色变化时调用）
   * @param seatId 玩家座位ID
   * @param oldRoleId 旧角色ID（可选，不传则清除该玩家所有能力使用记录）
   */
  const resetAbilityUsageForSeat = useCallback(
    (seatId: number, oldRoleId?: string) => {
      setSeats((prev: Seat[]) =>
        prev.map((s) => {
          if (s.id !== seatId) return s;
          let statusDetails = s.statusDetails || [];
          if (oldRoleId) {
            // 只清除旧角色的能力使用记录
            const detailToRemove = `${oldRoleId} 一次性能力已用`;
            statusDetails = statusDetails.filter((d) => d !== detailToRemove);
          } else {
            // 清除所有一次性能力使用记录
            statusDetails = statusDetails.filter(
              (d) => !d.includes("一次性能力已用")
            );
          }
          return { ...s, statusDetails };
        })
      );

      setUsedOnceAbilities((prev) => {
        if (oldRoleId) {
          // 只清除指定角色的该玩家记录
          const existed = prev[oldRoleId] || [];
          if (!existed.includes(seatId)) return prev;
          return {
            ...prev,
            [oldRoleId]: existed.filter((id) => id !== seatId),
          };
        } else {
          // 清除所有角色的该玩家记录
          const newState: Record<string, number[]> = {};
          Object.entries(prev).forEach(([roleId, seatIds]) => {
            newState[roleId] = seatIds.filter((id) => id !== seatId);
          });
          return newState;
        }
      });

      // 清除每日能力使用记录
      setUsedDailyAbilities((prev) => {
        const newState: Record<string, { day: number; seats: number[] }> = {};
        Object.entries(prev).forEach(([roleId, entry]) => {
          newState[roleId] = {
            ...entry,
            seats: entry.seats.filter((id) => id !== seatId),
          };
        });
        return newState;
      });
    },
    [setSeats]
  );

  const hasUsedDailyAbility = useCallback(
    (roleId: string, seatId: number) => {
      const entry = usedDailyAbilities[roleId];
      if (!entry) return false;
      if (entry.day !== nightCount) return false;
      return entry.seats.includes(seatId);
    },
    [usedDailyAbilities, nightCount]
  );

  const markDailyAbilityUsed = useCallback(
    (roleId: string, seatId: number) => {
      setUsedDailyAbilities((prev) => {
        const entry = prev[roleId];
        const seatsForDay =
          entry && entry.day === nightCount ? entry.seats : [];
        if (seatsForDay.includes(seatId)) return prev;
        return {
          ...prev,
          [roleId]: { day: nightCount, seats: [...seatsForDay, seatId] },
        };
      });
    },
    [nightCount]
  );

  return {
    usedOnceAbilities,
    setUsedOnceAbilities,
    usedDailyAbilities,
    setUsedDailyAbilities,
    hasUsedAbility,
    markAbilityUsed,
    hasUsedDailyAbility,
    markDailyAbilityUsed,
    resetAbilityUsageForSeat,
  };
}
