import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  ferrymanAbility,
  pickFerrymanTarget,
} from "../../new_engine/ferryman.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 摆渡人：死亡触发时随机挑一名已死亡玩家复活。
 * 夜间行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演说的复活目标与实际复活的人会不同。
 */

function makeSeat(
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  isDead = false
) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead,
    isAlive: !isDead,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
  };
}

// 最小座位集：0号摆渡人（存活）+ 3 名已死亡玩家 + 1 名存活玩家
const seats = () => [
  makeSeat(0, "ferryman", "摆渡人", "townsfolk"),
  makeSeat(1, "chef", "厨师", "townsfolk", true),
  makeSeat(2, "soldier", "士兵", "townsfolk", true),
  makeSeat(3, "saint", "圣徒", "outsider", true),
  makeSeat(4, "imp", "小恶魔", "demon"),
];

const deadSeats = () => seats().filter((s) => s.isDead);

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("ferryman", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  seatList: any[];
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: "night",
      seats: opts.seatList,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "ferryman",
      roleName: "摆渡人",
      priority: 40,
      isFirstNightOnly: false,
      abilityId: "ferryman_cross",
      wakeMessage: "摆渡人",
      firstNightPriority: null,
      otherNightPriority: 40,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
    preview: opts.preview,
  };
}

async function run(preview: boolean, nightCount: number) {
  return runFullAbilityPipeline(
    {
      preCheck: ferrymanAbility.preCheck,
      calculate: ferrymanAbility.calculate,
      stateUpdate: ferrymanAbility.stateUpdate,
      postProcess: ferrymanAbility.postProcess,
    },
    makeContext({ nightCount, preview, seatList: seats() })
  );
}

describe("摆渡人：提示预演与实际执行必须复活同一名玩家（回归）", () => {
  it("同一夜、同一种子 → 同一名复活目标", () => {
    const a = pickFerrymanTarget(
      deadSeats(),
      createDeterministicRandom(seedFor(0, 2))
    );
    const b = pickFerrymanTarget(
      deadSeats(),
      createDeterministicRandom(seedFor(0, 2))
    );
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一个目标）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () =>
        pickFerrymanTarget(deadSeats(), rng)
      );
    };
    expect(sequence(2)).not.toEqual(sequence(3));
  });

  it("没有已死亡玩家时返回 null", () => {
    expect(
      pickFerrymanTarget([], createDeterministicRandom(seedFor(0, 2)))
    ).toBeNull();
  });

  it("管道级：preview 与结算得到同一个 targetId，且只在已死亡玩家中挑", async () => {
    const previewResult = await run(true, 2);
    const execResult = await run(false, 2);

    const previewId = (previewResult.meta.abilityResult as any).targetId;
    const execId = (execResult.meta.abilityResult as any).targetId;

    expect(previewId).not.toBeNull();
    expect(execId).toBe(previewId);
    expect(deadSeats().map((s) => s.id)).toContain(execId);
  });
});
