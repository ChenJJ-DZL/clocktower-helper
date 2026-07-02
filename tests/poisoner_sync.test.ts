import { test, expect } from "vitest";
import { getRawAbilityMap, registerAllNewEngineAbilities } from "../src/roles/new_engine/abilityRegistry";
import { syncStatusEffectsToSeat } from "../src/hooks/useNightActionHandler";

test("投毒者 状态同步到 React Seats（完整链路）", async () => {
  registerAllNewEngineAbilities();

  const abilityMap = getRawAbilityMap();
  const abilityKey = Object.keys(abilityMap).find(
    (k) => abilityMap[k].roleId === "poisoner"
  )!;
  const ability = abilityMap[abilityKey];

  // 1. 模拟 React 座位（含 isPoisoned 等遗留布尔字段）
  let seats = [
    { id: 0, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, statusDetails: [], statuses: [], role: { id: "poisoner", name: "投毒者", type: "minion" } },
    { id: 1, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, statusDetails: [], statuses: [], role: { id: "chef", name: "厨师", type: "townsfolk" } },
    { id: 2, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, statusDetails: [], statuses: [], role: { id: "imp", name: "小恶魔", type: "demon" } },
  ];

  // 2. 模拟 executeViaNewEngine 的完整状态同步逻辑
  const { runFullAbilityPipeline } = await import("../src/utils/middlewarePipeline");

  const snapshotSeats = seats.map((s: any) => ({
    ...s,
    isAlive: !s.isDead,
    statusEffects: [...((s as any).statusEffects || [])],
  }));

  const middlewareContext = {
    snapshot: { nightCount: 1, seats: snapshotSeats, statusEffects: {}, gamePhase: "firstNight" },
    actionNode: { seatId: 0, roleId: "poisoner", roleName: "投毒者", priority: 0, isFirstNightOnly: false, abilityId: "poisoner_night_ability", wakeMessage: "", firstNightPriority: null, otherNightPriority: null, meta: {}, targetIds: [1], processed: false, success: false },
    targetIds: [1],
    storytellerInput: {},
    meta: {},
    aborted: false,
    preview: false,
  };

  const resultContext = await runFullAbilityPipeline(
    {
      preCheck: ability.preCheck,
      calculate: ability.calculate,
      stateUpdate: ability.stateUpdate,
      postProcess: ability.postProcess,
    },
    middlewareContext as any
  );

  // 3. 模拟 executeViaNewEngine 中的状态同步（与生产代码完全一致）
  const updatedSeats = resultContext.snapshot.seats as any[];

  const syncedSeats = seats.map((prev: any) => {
    const updated = updatedSeats.find((u: any) => u.id === prev.id);
    if (updated) {
      const syncedFields = syncStatusEffectsToSeat(prev, updated);
      return { ...prev, ...updated, ...syncedFields, id: prev.id };
    }
    return prev;
  });

  console.log("同步后 seats[1] (目标):", JSON.stringify(syncedSeats[1], null, 2));
  console.log("同步后 seats[0] (投毒者):", JSON.stringify(syncedSeats[0], null, 2));

  // 4. 验证目标座位（厨师）被标记为中毒
  const targetSeat = syncedSeats[1];
  expect(targetSeat.isPoisoned).toBe(true);
  expect(targetSeat.statusDetails).toBeDefined();
  expect(targetSeat.statusDetails).toContain("新引擎中毒（黄昏清除）");
  expect(targetSeat.statuses).toBeDefined();
  expect(targetSeat.statuses.length).toBeGreaterThan(0);
  expect(targetSeat.statuses.some((s: any) => s.effect === "Poison")).toBe(true);

  // 5. 验证投毒者座位未受影响
  const poisonerSeat = syncedSeats[0];
  expect(poisonerSeat.isPoisoned).toBe(false);

  // 6. 验证小恶魔座位未受影响
  const demonSeat = syncedSeats[2];
  expect(demonSeat.isPoisoned).toBe(false);

  console.log("✅ 状态同步测试通过");
});
