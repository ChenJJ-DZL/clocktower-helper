import { test, expect } from "vitest";
import { poisonerAbility } from "../src/roles/new_engine/poisoner.ability";

test("投毒者 stateUpdate 应为目标添加中毒效果", async () => {
  const snapshot = {
    nightCount: 1,
    gamePhase: "firstNight",
    seats: [
      { id: 0, isAlive: true, role: { id: "poisoner", type: "minion" } },
      { id: 1, isAlive: true, role: { id: "chef", type: "townsfolk" } },
      { id: 2, isAlive: true, role: { id: "imp", type: "demon" } },
    ],
    statusEffects: {},
  };

  const context = {
    snapshot,
    actionNode: { seatId: 0, roleId: "poisoner", meta: {} },
    targetIds: [1],
    meta: { abilityResult: 1, abilityEffective: true },
    storytellerInput: {},
    aborted: false,
  };

  // 执行 stateUpdate
  const result = await poisonerAbility.stateUpdate[0](context as any);

  console.log("result.snapshot.seats:", JSON.stringify(result.snapshot.seats, null, 2));

  // 目标座位 (id=1) 应有中毒状态
  const targetSeat = result.snapshot.seats.find((s: any) => s.id === 1);
  expect(targetSeat).toBeDefined();
  expect(targetSeat.statusEffects).toBeDefined();
  expect(targetSeat.statusEffects.length).toBeGreaterThan(0);
  expect(targetSeat.statusEffects.some((e: any) => e.type === "poisoned")).toBe(true);

  console.log("✅ 投毒者 stateUpdate 测试通过");
});
