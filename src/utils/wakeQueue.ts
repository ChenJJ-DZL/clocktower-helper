"use client";

import type { Seat } from "../../app/data";

export interface NormalizeWakeQueueInput {
  wakeQueueIds: number[];
  currentWakeIndex: number;
  seats: Seat[];
  deadThisNight: number[];
  getSeatRoleId: (seat?: Seat | null) => string | null;
}

export interface NormalizeWakeQueueResult {
  wakeQueueIds: number[];
  currentWakeIndex: number;
  removedIds: number[];
}

/**
 * Normalize wake queue after some seats are dead.
 * Fixes index-shift bugs: when earlier queue items are removed, the current index is adjusted so the
 * "current actor" stays consistent and we don't skip an alive player.
 */
export function normalizeWakeQueueForDeaths(
  input: NormalizeWakeQueueInput
): NormalizeWakeQueueResult {
  const { wakeQueueIds, currentWakeIndex, seats, deadThisNight, getSeatRoleId } = input;

  const shouldRemoveFromWakeQueue = (s: Seat) => {
    const roleId = getSeatRoleId(s);
    const diedTonight = deadThisNight.includes(s.id);
    // Ravenkeeper: if died tonight, still wakes.
    if (roleId === "ravenkeeper" && diedTonight) return false;
    // Seats with hasAbilityEvenDead should still wake.
    return s.isDead && !s.hasAbilityEvenDead;
  };

  const removeIds = new Set(seats.filter(shouldRemoveFromWakeQueue).map((s) => s.id));
  if (removeIds.size === 0) {
    return { wakeQueueIds, currentWakeIndex, removedIds: [] };
  }

  const removedBefore = wakeQueueIds
    .slice(0, Math.max(0, currentWakeIndex))
    .filter((id) => removeIds.has(id)).length;

  const nextWakeQueueIds = wakeQueueIds.filter((id) => !removeIds.has(id));
  const nextWakeIndex = Math.max(0, currentWakeIndex - removedBefore);

  return {
    wakeQueueIds: nextWakeQueueIds,
    currentWakeIndex: nextWakeIndex,
    removedIds: Array.from(removeIds),
  };
}


