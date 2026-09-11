import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeRoleName,
  ravenkeeperAbility,
  resolveTargetRole,
} from "../../new_engine/ravenkeeper.ability";

// 最小 6 人局：守鸦人（今夜死亡）+ 陌客 + 间谍 + 士兵 + 小恶魔 + 男爵
// 陌客 / 间谍会走「注册为其它角色」的随机分支，保证随机点被真正走到。
const seats: any[] = [
  {
    id: 0,
    isDead: true,
    isAlive: false,
    diedAtNight: 3,
    playerName: "守鸦人",
    role: { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
  },
  {
    id: 1,
    isDead: false,
    isAlive: true,
    playerName: "陌客",
    role: { id: "recluse", name: "陌客", type: "outsider" },
  },
  {
    id: 2,
    isDead: false,
    isAlive: true,
    playerName: "间谍",
    role: { id: "spy", name: "间谍", type: "minion" },
  },
  {
    id: 3,
    isDead: false,
    isAlive: true,
    playerName: "士兵",
    role: { id: "soldier", name: "士兵", type: "townsfolk" },
  },
  {
    id: 4,
    isDead: false,
    isAlive: true,
    playerName: "小恶魔",
    role: { id: "imp", name: "小恶魔", type: "demon" },
  },
  {
    id: 5,
    isDead: false,
    isAlive: true,
    playerName: "男爵",
    role: { id: "baron", name: "男爵", type: "minion" },
  },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("ravenkeeper", actorId, night);

function makeContext(preview: boolean, nightCount = 3): MiddlewareContext {
  const sceneSeats = seats.map((s) => ({ ...s }));
  return {
    snapshot: {
      nightCount,
      gamePhase: "night",
      // 守鸦人今夜死亡
      seats: sceneSeats,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "ravenkeeper",
      roleName: "1号-守鸦人",
      priority: 80,
      isFirstNightOnly: false,
      abilityId: "ravenkeeper_death_ability",
      wakeMessage: "守鸦人，请睁眼",
      firstNightPriority: null,
      otherNightPriority: 80,
      targetIds: [1],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [1],
    meta: {},
    aborted: false,
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: ravenkeeperAbility.preCheck,
      calculate: ravenkeeperAbility.calculate,
      stateUpdate: ravenkeeperAbility.stateUpdate,
      postProcess: ravenkeeperAbility.postProcess,
    },
    ctx
  );

describe("守鸦人：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("陌客注册为邪恶角色时，同种子下结果完全一致", () => {
    const a = resolveTargetRole(
      seats[1],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = resolveTargetRole(
      seats[1],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(b).toBe(a);
  });

  it("间谍注册为善良角色时，同种子下结果完全一致", () => {
    const a = resolveTargetRole(
      seats[2],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = resolveTargetRole(
      seats[2],
      seats,
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(b).toBe(a);
  });

  it("醉酒/中毒时的假角色名在同种子下完全一致", () => {
    const a = generateFakeRoleName(
      seats,
      "士兵",
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = generateFakeRoleName(
      seats,
      "士兵",
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(b).toBe(a);
  });

  it("不同夜次的种子会重新随机（不会整局锁死同一个答案）", () => {
    const recluses = new Set(
      [2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
        resolveTargetRole(
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
          seats,
          "士兵",
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
    expect(execute.meta.prompt).toContain(
      `【${preview.meta.abilityResult.roleName}】`
    );
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
  });
});
