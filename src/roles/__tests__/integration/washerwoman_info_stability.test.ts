import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeInfo,
  generateRealInfo,
  resolveWasherwomanInfo,
  washerwomanAbility,
} from "../../new_engine/washerwoman.ability";

// 最小 5 人局：洗衣妇 0 + 两名镇民 + 一名外来者 + 恶魔
// 镇民候选 >1，保证「随机挑镇民 / 挑干扰项 / 打乱顺序」三个随机点都被走到
const seats: any[] = [
  { id: 0, playerName: "洗衣妇", isDead: false, isAlive: true, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } },
  { id: 1, playerName: "厨师", isDead: false, isAlive: true, role: { id: "chef", name: "厨师", type: "townsfolk" } },
  { id: 2, playerName: "士兵", isDead: false, isAlive: true, role: { id: "soldier", name: "士兵", type: "townsfolk" } },
  { id: 3, playerName: "圣徒", isDead: false, isAlive: true, role: { id: "saint", name: "圣徒", type: "outsider" } },
  { id: 4, playerName: "小恶魔", isDead: false, isAlive: true, role: { id: "imp", name: "小恶魔", type: "demon" } },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("washerwoman", actorId, night);

function makeContext(preview: boolean, nightCount = 1): MiddlewareContext {
  const sceneSeats = seats.map((s) => ({ ...s }));
  return {
    snapshot: {
      nightCount,
      gamePhase: "firstNight",
      seats: sceneSeats,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "washerwoman",
      roleName: "1号-洗衣妇",
      priority: 52,
      isFirstNightOnly: true,
      abilityId: "washerwoman_first_night_ability",
      wakeMessage: "洗衣妇，请睁眼",
      firstNightPriority: 52,
      otherNightPriority: null,
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
      preCheck: washerwomanAbility.preCheck,
      calculate: washerwomanAbility.calculate,
      stateUpdate: washerwomanAbility.stateUpdate,
      postProcess: washerwomanAbility.postProcess,
    },
    ctx
  );

describe("洗衣妇：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("真实信息在同种子下完全一致", () => {
    const a = generateRealInfo(
      seats,
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = generateRealInfo(
      seats,
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    // 结论必须成立：两名玩家之一确实是该镇民
    const roleOf = (id: number) => seats.find((s) => s.id === id)?.role.name;
    expect([roleOf(a.seat1), roleOf(a.seat2)]).toContain(a.roleName);
  });

  it("醉酒/中毒的假信息在同种子下完全一致", () => {
    const a = generateFakeInfo(
      seats,
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = generateFakeInfo(
      seats,
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    expect(a.roleName).not.toBe("洗衣妇");
  });

  it("预置首夜信息 + 醉酒/中毒时，换角色名在同一夜内稳定", () => {
    const snapshot: any = { seats };
    const initialNightInfo = {
      washerwomanInfo: { seat1: 0, seat2: 1, roleName: "士兵" },
    };
    const pick = (night: number) =>
      resolveWasherwomanInfo(
        snapshot,
        0,
        false,
        undefined,
        initialNightInfo,
        createDeterministicRandom(seedFor(0, night))
      );
    expect(pick(1)).toEqual(pick(1));
    expect(pick(1).roleName).not.toBe("士兵");
  });

  it("不同夜次的种子会重新随机（不会整局锁死同一个答案）", () => {
    const realResults = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        JSON.stringify(
          generateRealInfo(seats, 0, createDeterministicRandom(seedFor(0, n)))
        )
      )
    );
    expect(realResults.size).toBeGreaterThan(1);

    const snapshot: any = { seats };
    const fakeNames = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) =>
          resolveWasherwomanInfo(
            snapshot,
            0,
            false,
            undefined,
            { washerwomanInfo: { seat1: 0, seat2: 1, roleName: "士兵" } },
            createDeterministicRandom(seedFor(0, n))
          ).roleName
      )
    );
    expect(fakeNames.size).toBeGreaterThan(1);
  });

  it("管道预演（preview）与真实结算得到同一份信息", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.displayInfo.roleName).toBe(
      preview.meta.abilityResult.roleName
    );
    // 说书人提示词里念的座位与角色 = 实际标记的座位与角色
    expect(execute.meta.prompt).toContain(
      `${preview.meta.abilityResult.seat1 + 1}号`
    );
    expect(execute.meta.prompt).toContain(
      `${preview.meta.abilityResult.seat2 + 1}号`
    );
    expect(execute.meta.prompt).toContain(
      `【${preview.meta.abilityResult.roleName}】`
    );
  });
});
