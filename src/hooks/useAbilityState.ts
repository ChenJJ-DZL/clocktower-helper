import { useState, useCallback } from 'react';
import type { Seat } from '@/app/data';

export function useAbilityState(nightCount: number, setSeats: (val: any) => void) {
    const [usedOnceAbilities, setUsedOnceAbilities] = useState<Record<string, number[]>>({});
    const [usedDailyAbilities, setUsedDailyAbilities] = useState<Record<string, { day: number; seats: number[] }>>({});

    const hasUsedAbility = useCallback((roleId: string, seatId: number) => {
        return (usedOnceAbilities[roleId] || []).includes(seatId);
    }, [usedOnceAbilities]);

    const markAbilityUsed = useCallback((roleId: string, seatId: number) => {
        setSeats((prev: Seat[]) => prev.map(s => {
            if (s.id !== seatId) return s;
            const detail = '一次性能力已用';
            const statusDetails = s.statusDetails || [];
            return statusDetails.includes(detail)
                ? s
                : { ...s, statusDetails: [...statusDetails, detail] };
        }));
        setUsedOnceAbilities((prev) => {
            const existed = prev[roleId] || [];
            if (existed.includes(seatId)) return prev;
            return { ...prev, [roleId]: [...existed, seatId] };
        });
    }, [setSeats]);

    const hasUsedDailyAbility = useCallback((roleId: string, seatId: number) => {
        const entry = usedDailyAbilities[roleId];
        if (!entry) return false;
        if (entry.day !== nightCount) return false;
        return entry.seats.includes(seatId);
    }, [usedDailyAbilities, nightCount]);

    const markDailyAbilityUsed = useCallback((roleId: string, seatId: number) => {
        setUsedDailyAbilities((prev) => {
            const entry = prev[roleId];
            const seatsForDay = entry && entry.day === nightCount ? entry.seats : [];
            if (seatsForDay.includes(seatId)) return prev;
            return { ...prev, [roleId]: { day: nightCount, seats: [...seatsForDay, seatId] } };
        });
    }, [nightCount]);

    return {
        usedOnceAbilities, setUsedOnceAbilities,
        usedDailyAbilities, setUsedDailyAbilities,
        hasUsedAbility, markAbilityUsed,
        hasUsedDailyAbility, markDailyAbilityUsed,
    };
}
