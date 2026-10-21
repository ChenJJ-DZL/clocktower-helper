"use client";

import { useCallback } from "react";
import type { Seat } from "../../app/data";
import {
  computeSetupComposition,
  STANDARD_COMPOSITIONS,
} from "../utils/setupComposition";

/**
 * ⚠️ 2026-10-21：这里原来**自己抄了一份 5~15 人的配比表**，并且只认「男爵 +2」。
 * 后果：方古（+1 外来者）/亡骨魔（−1）在场时，界面会弹「阵容配置错误」
 * （期望 9/2、实际 8/3），把一个**合法**阵容拦住 —— E2E 直接卡在入夜前。
 * 修法：配比只允许一个事实源 `computeSetupComposition`，本文件只负责「比对」。
 *
 * @param availableOutsiderPool 当前剧本的外来者池大小（用于钳制 +2/+1 的上限）。
 *   不传则不做池钳制（老调用方行为不变）。
 */
export function useSetupManager(
  seats: Seat[],
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>,
  availableOutsiderPool?: number
) {
  /** 基础配比（**不含**角色修正）；唯一事实源 = STANDARD_COMPOSITIONS */
  const getStandardComposition = useCallback((n: number) => {
    const base = STANDARD_COMPOSITIONS[n];
    if (!base) return null;
    return { ...base, total: n };
  }, []);

  const getCompositionStatus = useCallback(
    (activeSeats: Seat[]) => {
      const playerCount = activeSeats.length;
      const actual = {
        townsfolk: activeSeats.filter((s) => s.role?.type === "townsfolk")
          .length,
        outsider: activeSeats.filter((s) => s.role?.type === "outsider").length,
        minion: activeSeats.filter((s) => s.role?.type === "minion").length,
        demon: activeSeats.filter(
          (s) => s.role?.type === "demon" || s.role?.id === "legion"
        ).length,
      };
      const hasBaron = activeSeats.some((s) => s.role?.id === "baron");
      const hasLegion = activeSeats.some((s) => s.role?.id === "legion");

      // 军团：多数为军团、无爪牙、至少 1 名善良 —— 不适用常规配比
      if (hasLegion) {
        const goodCount = actual.townsfolk + actual.outsider;
        return {
          valid: actual.demon > goodCount && actual.minion === 0 && goodCount >= 1,
          standard: null,
          actual,
          playerCount,
          hasBaron,
          hasLegion,
        };
      }

      const expected = computeSetupComposition(playerCount, {
        baronInPlay: hasBaron,
        availableOutsiderPool,
        inPlayRoleIds: activeSeats
          .map((s) => s.role?.id)
          .filter((id): id is string => typeof id === "string"),
      });
      const standard = { ...expected.counts, total: playerCount };
      const valid =
        actual.townsfolk === standard.townsfolk &&
        actual.outsider === standard.outsider &&
        actual.minion === standard.minion &&
        actual.demon === standard.demon;

      return { valid, standard, actual, playerCount, hasBaron, hasLegion };
    },
    [availableOutsiderPool]
  );

  const getBaronStatus = useCallback(
    (activeSeats: Seat[]) => {
      const playerCount = activeSeats.length;
      const actual = {
        townsfolk: activeSeats.filter((s) => s.role?.type === "townsfolk")
          .length,
        outsider: activeSeats.filter((s) => s.role?.type === "outsider").length,
        minion: activeSeats.filter((s) => s.role?.type === "minion").length,
        demon: activeSeats.filter((s) => s.role?.type === "demon").length,
      };
      const hasBaron = activeSeats.some((s) => s.role?.id === "baron");
      const base = getStandardComposition(playerCount);
      if (!hasBaron) {
        return { valid: true, recommended: base, current: actual, playerCount };
      }

      // 男爵只是「配比修正」的一种 ⇒ 期望值统一由 computeSetupComposition 出
      const expected = computeSetupComposition(playerCount, {
        baronInPlay: true,
        availableOutsiderPool,
        inPlayRoleIds: activeSeats
          .map((s) => s.role?.id)
          .filter((id): id is string => typeof id === "string"),
      });
      const recommended = { ...expected.counts, total: playerCount };
      const valid =
        actual.townsfolk === recommended.townsfolk &&
        actual.outsider === recommended.outsider;

      return { valid, recommended, current: actual, playerCount };
    },
    [availableOutsiderPool, getStandardComposition]
  );

  const validateCompositionSetup = useCallback(
    (activeSeats: Seat[]) => {
      return getCompositionStatus(activeSeats).valid;
    },
    [getCompositionStatus]
  );

  const validateBaronSetup = useCallback(
    (activeSeats: Seat[]) => {
      return getBaronStatus(activeSeats).valid;
    },
    [getBaronStatus]
  );

  const handleBaronAutoRebalance = useCallback(() => {
    const activeSeats = seats.filter((s) => s.role);
    const status = getBaronStatus(activeSeats);
    if (!status.recommended) return;

    const townsfolkSeats = activeSeats.filter(
      (s) => s.role?.type === "townsfolk"
    );
    if (townsfolkSeats.length < 2) return;

    // Pick 2 random townsfolk to remove
    const toRemove = [...townsfolkSeats]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    const toRemoveIds = new Set(toRemove.map((s) => s.id));

    setSeats((prev) =>
      prev.map((s) =>
        toRemoveIds.has(s.id) ? { ...s, role: null, displayRole: null } : s
      )
    );
  }, [seats, setSeats, getBaronStatus]);

  return {
    getStandardComposition,
    getCompositionStatus,
    getBaronStatus,
    validateCompositionSetup,
    validateBaronSetup,
    handleBaronAutoRebalance,
  };
}
