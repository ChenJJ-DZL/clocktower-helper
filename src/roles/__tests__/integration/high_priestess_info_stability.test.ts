import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  high_priestessAbility,
  pickGuideTargetId,
} from "../../new_engine/high_priestess.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 女祭司：每夜随机指引一名玩家。
 * 夜间行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演指引的人与实际指引的人会不同。
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

// 最小座位集：0号女祭司 + 5 名其他玩家
const seats = () => [
  makeSeat(0, "high_priestess", "女祭司", "townsfolk"),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "empath", "共情者", "townsfolk"),
  makeSeat(3, "soldier", "士兵", "townsfolk"),
  makeSeat(4, "saint", "圣徒", "outsider"),
  makeSeat(5, "imp", "小恶魔", "demon"),
];

const candidates = () => seats().slice(1);

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("high_priestess", actorId, night);

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
      roleId: "high_priestess",
      roleName: "女祭司",
      priority: 109,
      isFirstNightOnly: false,
      abilityId: "high_priestess_guide",
      wakeMessage: "女祭司",
      firstNightPriority: 77,
      otherNightPriority: 109,
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
      preCheck: high_priestessAbility.preCheck,
      calculate: high_priestessAbility.calculate,
      stateUpdate: high_priestessAbility.stateUpdate,
      postProcess: high_priestessAbility.postProcess,
    },
    makeContext({ nightCount, preview, seatList: seats() })
  );
}

describe("女祭司：提示预演与实际执行必须指引同一名玩家（回归）", () => {
  it("同一夜、同一种子 → 同一名指引对象", () => {
    const a = pickGuideTargetId(
      candidates(),
      createDeterministicRandom(seedFor(0, 4))
    );
    const b = pickGuideTargetId(
      candidates(),
      createDeterministicRandom(seedFor(0, 4))
    );
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一名指引对象）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () =>
        pickGuideTargetId(candidates(), rng)
      );
    };
    expect(sequence(4)).not.toEqual(sequence(5));
  });

  it("没有其他玩家时返回 null", () => {
    expect(
      pickGuideTargetId([], createDeterministicRandom(seedFor(0, 4)))
    ).toBeNull();
  });

  it("管道级：preview 与结算指引同一名玩家，且不会指引自己", async () => {
    const previewResult = await run(true, 4);
    const execResult = await run(false, 4);

    const previewId = (previewResult.meta.abilityResult as any).targetId;
    const execId = (execResult.meta.abilityResult as any).targetId;

    expect(previewId).not.toBeNull();
    expect(execId).toBe(previewId);
    expect(candidates().map((s) => s.id)).toContain(execId);
  });
});
