import { normalizeWakeQueueForDeaths } from "../src/utils/wakeQueue";

describe("normalizeWakeQueueForDeaths", () => {
  const getSeatRoleId = (seat?: any) => seat?.role?.id ?? null;

  test("removing the first (dead) queue item should not cause skipping the next alive player", () => {
    const seats = [
      { id: 0, role: { id: "monk" }, isDead: true, hasAbilityEvenDead: false },
      { id: 1, role: { id: "poisoner" }, isDead: false, hasAbilityEvenDead: false },
      { id: 2, role: { id: "imp" }, isDead: false, hasAbilityEvenDead: false },
    ];

    const res = normalizeWakeQueueForDeaths({
      wakeQueueIds: [0, 1, 2],
      currentWakeIndex: 0,
      seats: seats as any,
      deadThisNight: [],
      getSeatRoleId,
    });

    expect(res.wakeQueueIds).toEqual([1, 2]);
    expect(res.currentWakeIndex).toBe(0);
  });

  test("if currentWakeIndex points to seat 1, removing a dead seat 0 should shift index back to keep current seat consistent", () => {
    const seats = [
      { id: 0, role: { id: "monk" }, isDead: true, hasAbilityEvenDead: false },
      { id: 1, role: { id: "poisoner" }, isDead: false, hasAbilityEvenDead: false },
      { id: 2, role: { id: "imp" }, isDead: false, hasAbilityEvenDead: false },
    ];

    const res = normalizeWakeQueueForDeaths({
      wakeQueueIds: [0, 1, 2],
      currentWakeIndex: 1,
      seats: seats as any,
      deadThisNight: [],
      getSeatRoleId,
    });

    expect(res.wakeQueueIds).toEqual([1, 2]);
    expect(res.currentWakeIndex).toBe(0);
  });

  test("ravenkeeper that died tonight should NOT be removed from queue", () => {
    const seats = [
      { id: 0, role: { id: "ravenkeeper" }, isDead: true, hasAbilityEvenDead: false },
      { id: 1, role: { id: "imp" }, isDead: false, hasAbilityEvenDead: false },
    ];

    const res = normalizeWakeQueueForDeaths({
      wakeQueueIds: [0, 1],
      currentWakeIndex: 0,
      seats: seats as any,
      deadThisNight: [0],
      getSeatRoleId,
    });

    expect(res.wakeQueueIds).toEqual([0, 1]);
    expect(res.currentWakeIndex).toBe(0);
  });
});


