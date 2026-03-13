"use client";

import { useCallback } from "react";
import { Seat, Role } from "../../app/data";

export function useSetupManager(seats: Seat[], setSeats: React.Dispatch<React.SetStateAction<Seat[]>>) {
  const getStandardComposition = useCallback((n: number) => {
    const table: Record<number, { townsfolk: number; outsider: number; minion: number; demon: number; total: number }> = {
      5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1, total: 5 },
      6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1, total: 6 },
      7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1, total: 7 },
      8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1, total: 8 },
      9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1, total: 9 },
      10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1, total: 10 },
      11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1, total: 11 },
      12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1, total: 12 },
      13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1, total: 13 },
      14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1, total: 14 },
      15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1, total: 15 },
    };
    return table[n] || null;
  }, []);

  const getCompositionStatus = useCallback((activeSeats: Seat[]) => {
    const playerCount = activeSeats.length;
    const standard = getStandardComposition(playerCount);
    const actual = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };
    const hasBaron = activeSeats.some(s => s.role?.id === 'baron');
    const valid = standard ? (
      actual.townsfolk === standard.townsfolk &&
      actual.outsider === standard.outsider &&
      actual.minion === standard.minion &&
      actual.demon === standard.demon
    ) : false;

    return { valid, standard, actual, playerCount, hasBaron };
  }, [getStandardComposition]);

  const getBaronStatus = useCallback((activeSeats: Seat[]) => {
    const playerCount = activeSeats.length;
    const std = getStandardComposition(playerCount);
    const hasBaron = activeSeats.some(s => s.role?.id === 'baron');
    const actual = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };

    if (!hasBaron) return { valid: true, recommended: std, current: actual, playerCount };

    const recommended = std ? {
      ...std,
      townsfolk: std.townsfolk - 2,
      outsider: std.outsider + 2
    } : null;

    const valid = recommended ? (
      actual.townsfolk === recommended.townsfolk &&
      actual.outsider === recommended.outsider
    ) : false;

    return { valid, recommended, current: actual, playerCount };
  }, [getStandardComposition]);

  const validateCompositionSetup = useCallback((activeSeats: Seat[]) => {
    return getCompositionStatus(activeSeats).valid;
  }, [getCompositionStatus]);

  const validateBaronSetup = useCallback((activeSeats: Seat[]) => {
    return getBaronStatus(activeSeats).valid;
  }, [getBaronStatus]);

  const handleBaronAutoRebalance = useCallback(() => {
    const activeSeats = seats.filter(s => s.role);
    const status = getBaronStatus(activeSeats);
    if (!status.recommended) return;

    const townsfolkSeats = activeSeats.filter(s => s.role?.type === 'townsfolk');
    if (townsfolkSeats.length < 2) return;

    // Pick 2 random townsfolk to remove
    const toRemove = [...townsfolkSeats].sort(() => Math.random() - 0.5).slice(0, 2);
    const toRemoveIds = new Set(toRemove.map(s => s.id));

    setSeats(prev => prev.map(s => toRemoveIds.has(s.id) ? { ...s, role: null, displayRole: null } : s));
  }, [seats, setSeats, getBaronStatus]);

  return {
    getStandardComposition,
    getCompositionStatus,
    getBaronStatus,
    validateCompositionSetup,
    validateBaronSetup,
    handleBaronAutoRebalance
  };
}
