import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { farmerAbility, pickFarmerSuccessor } from "../../new_engine/farmer.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 农夫：死亡传承的继承者是随机挑的。
 * 夜间行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演提示的继承者与实际改写的人会不同。
 */

// 最小座位集：0号农夫（夜晚死亡）+ 4 名存活善良玩家
function makeSeat(id: number, roleId: string, roleName: string, roleType: string, isDead = false) {
  return {
    id,
    playerName: `玩家${id + 1}`,
    isDead,
    isAlive: !isDead,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
  };
}

const seats = () => [
  makeSeat(0, "farmer", "农夫", "townsfolk", true),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "empath", "共情者", "townsfolk"),
  makeSeat(3, "soldier", "士兵", "townsfolk"),
  makeSeat(4, "saint", "圣徒", "outsider"),
];

// 合格继承者（存活 + 善良），等价于 getEligibleFarmerSuccessors 的返回
const eligible = () => seats().slice(1);

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("farmer", actorId, night);

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
      roleId: "farmer",
      roleName: "农夫",
      priority: 85,
      isFirstNightOnly: false,
      abilityId: "farmer_death_transfer",
      wakeMessage: "农夫",
      firstNightPriority: null,
      otherNightPriority: 85,
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
  const ctx = makeContext({ nightCount, preview, seatList: seats() });
  return runFullAbilityPipeline(
    {
      preCheck: farmerAbility.preCheck,
      calculate: farmerAbility.calculate,
      stateUpdate: farmerAbility.stateUpdate,
      postProcess: farmerAbility.postProcess,
    },
    ctx
  );
}

describe("农夫：提示预演与实际执行必须挑到同一名继承者（回归）", () => {
  it("同一夜、同一座位、同一种子 → 同一名继承者", () => {
    const a = pickFarmerSuccessor(
      eligible(),
      createDeterministicRandom(seedFor(0, 3))
    );
    const b = pickFarmerSuccessor(
      eligible(),
      createDeterministicRandom(seedFor(0, 3))
    );
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一名继承者）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () =>
        pickFarmerSuccessor(eligible(), rng)?.id
      );
    };
    expect(sequence(3)).not.toEqual(sequence(4));
  });

  it("无合格继承者时返回 null", () => {
    expect(pickFarmerSuccessor([], createDeterministicRandom(seedFor(0, 3)))).toBeNull();
  });

  it("管道级：preview 与结算算出同一个 newFarmerId，且实际改写同一个座位", async () => {
    const previewResult = await run(true, 3);
    const execResult = await run(false, 3);

    const previewId = (previewResult.meta.abilityResult as any).newFarmerId;
    const execId = (execResult.meta.abilityResult as any).newFarmerId;

    expect(previewId).not.toBeNull();
    expect(execId).toBe(previewId);

    // preview 不得改写任何座位（继承者尚未变身）
    expect(
      (previewResult.snapshot.seats as any[]).filter(
        (s) => s.role?.id === "farmer"
      ).length
    ).toBe(1);
    // 结算后确实是一名存活的善良玩家变成了农夫
    const newFarmers = (execResult.snapshot.seats as any[]).filter(
      (s) => s.id === execId && s.role?.id === "farmer"
    );
    expect(newFarmers.length).toBe(1);
    expect(newFarmers[0].isDead).toBe(false);
  });
});
