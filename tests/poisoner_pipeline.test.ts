import { test, expect } from "vitest";
import { getRawAbilityMap, registerAllNewEngineAbilities } from "../src/roles/new_engine/abilityRegistry";
import type { Seat } from "../app/data";

test("投毒者 executeViaNewEngine 完整流程（preview=false）", async () => {
  // 必须先注册
  registerAllNewEngineAbilities();

  // 1. 模拟 React 座位
  const seats: Seat[] = [
    { id: 0, isAlive: true, role: { id: "poisoner", name: "投毒者", type: "minion" } } as Seat,
    { id: 1, isAlive: true, role: { id: "chef", name: "厨师", type: "townsfolk" } } as Seat,
    { id: 2, isAlive: true, role: { id: "imp", name: "小恶魔", type: "demon" } } as Seat,
  ];

  let updatedSeats: Seat[] = [...seats];
  let logs: string[] = [];

  // 模拟 setSeats
  const setSeats = (fn: any) => {
    updatedSeats = fn(updatedSeats);
  };
  const addLog = (msg: string) => logs.push(msg);
  const markAbilityUsed = () => {};

  // 2. 构建 MiddlewareContext
  const snapshotSeats = seats.map((s: any) => ({
    ...s,
    isAlive: !s.isDead,
    statusEffects: [...((s as any).statusEffects || [])],
  }));

  const abilityMap = getRawAbilityMap();
  console.log("abilityMap keys for poisoner:", Object.keys(abilityMap).filter(k => k.includes("poison")));
  const abilityKey = Object.keys(abilityMap).find(
    (k) => abilityMap[k].roleId === "poisoner"
  )!;
  console.log("abilityKey:", abilityKey);
  const ability = abilityMap[abilityKey];
  console.log("ability:", ability);

  const { runFullAbilityPipeline } = await import("../src/utils/middlewarePipeline");

  const middlewareContext = {
    snapshot: {
      nightCount: 1,
      seats: snapshotSeats,
      statusEffects: {},
      gamePhase: "firstNight",
    },
    actionNode: {
      seatId: 0,
      roleId: "poisoner",
      roleName: "投毒者",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "poisoner_night_ability",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: null,
      meta: {},
      targetIds: [1],
      processed: false,
      success: false,
    },
    targetIds: [1],
    storytellerInput: {},
    meta: {},
    aborted: false,
    preview: false,
  };

  // 3. 执行完整管道
  const resultContext = await runFullAbilityPipeline(
    {
      preCheck: ability.preCheck,
      calculate: ability.calculate,
      stateUpdate: ability.stateUpdate,
      postProcess: ability.postProcess,
    },
    middlewareContext as any
  );

  console.log("resultContext.snapshot.seats[1]:", JSON.stringify(resultContext.snapshot.seats[1], null, 2));

  // 4. 验证 snapshot 有中毒状态
  const poisonedSeat = resultContext.snapshot.seats[1];
  expect(poisonedSeat.statusEffects).toBeDefined();
  expect(poisonedSeat.statusEffects.length).toBeGreaterThan(0);
  expect(poisonedSeat.statusEffects.some((e: any) => e.type === "poisoned")).toBe(true);

  console.log("✅ 投毒者完整管道测试通过");
});
