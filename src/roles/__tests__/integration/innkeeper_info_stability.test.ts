import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  innkeeperAbility,
  pickDrunkTargetId,
} from "../../new_engine/innkeeper.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 旅店老板：在两名人选中随机挑一人醉酒。
 * 夜间行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演说「3号醉酒」、结算却让 5号醉酒。
 */

function makeSeat(id: number, roleId: string, roleName: string, roleType: string) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead: false,
    isAlive: true,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
  };
}

// 最小座位集：0号旅店老板 + 两名人选(1/2) + 其他玩家
const seats = () => [
  makeSeat(0, "innkeeper", "旅店老板", "townsfolk"),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "empath", "共情者", "townsfolk"),
  makeSeat(3, "soldier", "士兵", "townsfolk"),
  makeSeat(4, "imp", "小恶魔", "demon"),
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("innkeeper", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  seatList: any[];
  targetIds: number[];
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
      roleId: "innkeeper",
      roleName: "旅店老板",
      priority: 14,
      isFirstNightOnly: false,
      abilityId: "innkeeper_night_ability",
      wakeMessage: "旅店老板",
      firstNightPriority: null,
      otherNightPriority: 14,
      targetIds: opts.targetIds,
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: opts.targetIds,
    meta: {},
    aborted: false,
    preview: opts.preview,
  };
}

async function run(opts: {
  preview: boolean;
  nightCount: number;
  targetIds?: number[];
  storytellerInput?: any;
}) {
  const targetIds = opts.targetIds ?? [1, 2];
  return runFullAbilityPipeline(
    {
      preCheck: innkeeperAbility.preCheck,
      calculate: innkeeperAbility.calculate,
      stateUpdate: innkeeperAbility.stateUpdate,
      postProcess: innkeeperAbility.postProcess,
    },
    {
      ...makeContext({
        nightCount: opts.nightCount,
        preview: opts.preview,
        seatList: seats(),
        targetIds,
      }),
      storytellerInput: opts.storytellerInput,
    }
  );
}

describe("旅店老板：提示预演与实际执行必须让同一名玩家醉酒（回归）", () => {
  it("同一夜、同一种子 → 同一名醉酒目标", () => {
    const a = pickDrunkTargetId(1, 2, createDeterministicRandom(seedFor(0, 2)));
    const b = pickDrunkTargetId(1, 2, createDeterministicRandom(seedFor(0, 2)));
    expect([1, 2]).toContain(a);
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一名醉酒目标）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 8 }, () => pickDrunkTargetId(1, 2, rng));
    };
    expect(sequence(2)).not.toEqual(sequence(3));
  });

  it("管道级：preview 与结算选中的 drunkId 一致，且结算确实只让该玩家醉酒", async () => {
    const previewResult = await run({ preview: true, nightCount: 2 });
    const execResult = await run({ preview: false, nightCount: 2 });

    const previewInfo = previewResult.meta.abilityResult as any;
    const execInfo = execResult.meta.abilityResult as any;

    expect([previewInfo.target1Id, previewInfo.target2Id]).toContain(
      previewInfo.drunkId
    );
    expect(execInfo.drunkId).toBe(previewInfo.drunkId);

    const execSeats = execResult.snapshot.seats as any[];
    const drunkSeats = execSeats.filter((s) =>
      (s.statusEffects ?? []).some((e: any) => e.type === "drunk")
    );
    expect(drunkSeats.length).toBe(1);
    expect(drunkSeats[0].id).toBe(previewInfo.drunkId);

    // 两名目标都被保护
    const protectedSeats = execSeats.filter((s) =>
      (s.statusEffects ?? []).some((e: any) => e.type === "protected")
    );
    expect(protectedSeats.map((s: any) => s.id).sort()).toEqual(
      [previewInfo.target1Id, previewInfo.target2Id].sort()
    );

    // preview 不写状态
    const previewSeats = previewResult.snapshot.seats as any[];
    expect(
      previewSeats.filter((s) =>
        (s.statusEffects ?? []).some((e: any) => e.type === "drunk")
      ).length
    ).toBe(0);
  });
});
