import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeRoleName,
  resolveExecutedRole,
  undertakerAbility,
} from "../../new_engine/undertaker.ability";

// 最小 6 人局：送葬者 0 存活，今日被处决者 1（陌客，会走随机注册分支）
const seats: any[] = [
  { id: 0, playerName: "送葬者", isDead: false, isAlive: true, role: { id: "undertaker", name: "送葬者", type: "townsfolk" }, statusEffects: [] },
  { id: 1, playerName: "陌客", isDead: true, isAlive: false, executedToday: true, role: { id: "recluse", name: "陌客", type: "outsider" }, statusEffects: [] },
  { id: 2, playerName: "间谍", isDead: false, isAlive: true, role: { id: "spy", name: "间谍", type: "minion" }, statusEffects: [] },
  { id: 3, playerName: "士兵", isDead: false, isAlive: true, role: { id: "soldier", name: "士兵", type: "townsfolk" }, statusEffects: [] },
  { id: 4, playerName: "投毒者", isDead: false, isAlive: true, role: { id: "poisoner", name: "投毒者", type: "minion" }, statusEffects: [] },
  { id: 5, playerName: "小恶魔", isDead: false, isAlive: true, role: { id: "imp", name: "小恶魔", type: "demon" }, statusEffects: [] },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("undertaker", actorId, night);

function makeContext(preview: boolean, nightCount = 3): MiddlewareContext {
  const sceneSeats = seats.map((s) => ({
    ...s,
    statusEffects: [...s.statusEffects],
  }));
  return {
    snapshot: {
      nightCount,
      gamePhase: "night",
      seats: sceneSeats,
      statusEffects: {},
      todayExecutedId: 1,
    },
    actionNode: {
      seatId: 0,
      roleId: "undertaker",
      roleName: "1号-送葬者",
      priority: 93,
      isFirstNightOnly: false,
      abilityId: "undertaker_night_ability",
      wakeMessage: "送葬者，请睁眼",
      firstNightPriority: null,
      otherNightPriority: 93,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: undertakerAbility.preCheck,
      calculate: undertakerAbility.calculate,
      stateUpdate: undertakerAbility.stateUpdate,
      postProcess: undertakerAbility.postProcess,
    },
    ctx
  );

describe("送葬者：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("被处决者是陌客（注册为邪恶）时，同种子下结果完全一致", () => {
    const a = resolveExecutedRole(
      seats[1],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = resolveExecutedRole(
      seats[1],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(b).toBe(a);
    expect(typeof a).toBe("string");
  });

  it("醉酒/中毒时的假角色名在同种子下完全一致", () => {
    const a = generateFakeRoleName(
      1,
      seats,
      "陌客",
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = generateFakeRoleName(
      1,
      seats,
      "陌客",
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(b).toBe(a);
    expect(a).not.toBe("陌客");
  });

  it("不同夜次的种子会重新随机（不会整局锁死同一个答案）", () => {
    const recluses = new Set(
      [2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
        resolveExecutedRole(
          seats[1],
          seats,
          createDeterministicRandom(seedFor(0, n))
        )
      )
    );
    expect(recluses.size).toBeGreaterThan(1);

    const fakes = new Set(
      [2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
        generateFakeRoleName(
          1,
          seats,
          "陌客",
          createDeterministicRandom(seedFor(0, n))
        )
      )
    );
    expect(fakes.size).toBeGreaterThan(1);
  });

  it("管道预演（preview）与真实结算得到同一个角色名", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.displayInfo.roleName).toBe(
      preview.meta.abilityResult.roleName
    );
    // 说书人提示词里念的角色名 = 实际标记的角色名
    expect(execute.meta.prompt).toContain(preview.meta.abilityResult.roleName);
    expect(execute.meta.prompt).toContain(`是${preview.meta.abilityResult.roleName}。`);
  });

  it("醉酒/中毒（受干扰）时管道预演与真实结算仍然一致", async () => {
    const poisoned = (preview: boolean) => {
      const ctx = makeContext(preview);
      ctx.snapshot.seats[0].statusEffects = [{ type: "poisoned" }];
      return ctx;
    };
    const preview = await run(poisoned(true));
    const execute = await run(poisoned(false));

    expect(preview.meta.isCorrupted).toBe(true);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.abilityResult.roleName).not.toBe("陌客");
  });
});
