import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  grandmotherAbility,
  pickFakeGrandchildId,
} from "../../new_engine/grandmother.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 祖母：醉酒/中毒时会被告知一名"假孙子"（随机挑人）。
 * 首夜行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演告知的孙子与实际告知的人会不同。
 */

function makeSeat(
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  poisoned = false
) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead: false,
    isAlive: true,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: poisoned ? [{ type: "poisoned" }] : [],
  };
}

// 最小座位集：0号被投毒的祖母 + 5 名其他玩家
const seats = () => [
  makeSeat(0, "grandmother", "祖母", "townsfolk", true),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "empath", "共情者", "townsfolk"),
  makeSeat(3, "soldier", "士兵", "townsfolk"),
  makeSeat(4, "saint", "圣徒", "outsider"),
  makeSeat(5, "imp", "小恶魔", "demon"),
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("grandmother", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  seatList: any[];
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: "firstNight",
      seats: opts.seatList,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "grandmother",
      roleName: "祖母",
      priority: 60,
      isFirstNightOnly: true,
      abilityId: "grandmother_first_night_ability",
      wakeMessage: "祖母",
      firstNightPriority: 60,
      otherNightPriority: null,
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
      preCheck: grandmotherAbility.preCheck,
      calculate: grandmotherAbility.calculate,
      stateUpdate: grandmotherAbility.stateUpdate,
      postProcess: grandmotherAbility.postProcess,
    },
    makeContext({ nightCount, preview, seatList: seats() })
  );
}

describe("祖母：提示预演与实际执行必须被告知同一名假孙子（回归）", () => {
  it("同一夜、同一种子 → 同一名假孙子", () => {
    const a = pickFakeGrandchildId(
      seats(),
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickFakeGrandchildId(
      seats(),
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(seats().map((s) => s.id)).toContain(a);
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一名假孙子）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () => pickFakeGrandchildId(seats(), rng));
    };
    expect(sequence(1)).not.toEqual(sequence(2));
  });

  it("空座位集返回 -1（表示无信息）", () => {
    expect(
      pickFakeGrandchildId([], createDeterministicRandom(seedFor(0, 1)))
    ).toBe(-1);
  });

  it("管道级：中毒祖母在 preview 与结算中得到同一个 grandchildId", async () => {
    const previewResult = await run(true, 1);
    const execResult = await run(false, 1);

    const previewInfo = previewResult.meta.abilityResult as any;
    const execInfo = execResult.meta.abilityResult as any;

    expect(previewResult.meta.isAbilityActive).toBe(false);
    expect(previewInfo.grandchildId).toBeGreaterThanOrEqual(0);
    expect(execInfo.grandchildId).toBe(previewInfo.grandchildId);
    expect(execInfo.grandchildRoleName).toBe("镇民");
  });
});
