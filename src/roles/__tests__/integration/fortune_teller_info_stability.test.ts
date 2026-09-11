import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  fortuneTellerAbility,
  pickBoonSeatId,
} from "../../new_engine/fortune_teller.ability";
import { fortuneTellerBoonManager } from "../../../utils/FortuneTellerBoonManager";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 占卜师：首夜的「干扰项」(Boon) 是随机挑的。
 * 首夜行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演看到的干扰项与实际标记的人会不同。
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

// 最小座位集：0号占卜师 + 3 名善良候选 + 1 名爪牙 + 1 名恶魔（后两者不可当干扰项）
const seats = () => [
  makeSeat(0, "fortune_teller", "占卜师", "townsfolk"),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "soldier", "士兵", "townsfolk"),
  makeSeat(3, "saint", "圣徒", "outsider"),
  makeSeat(4, "poisoner", "投毒者", "minion"),
  makeSeat(5, "imp", "小恶魔", "demon"),
];

const candidates = () => seats().slice(1, 4);

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("fortune_teller", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  gameId: string;
  targetIds: number[];
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: "firstNight",
      seats: seats(),
      statusEffects: {},
      gameId: opts.gameId,
    },
    actionNode: {
      seatId: 0,
      roleId: "fortune_teller",
      roleName: "占卜师",
      priority: 57,
      isFirstNightOnly: false,
      abilityId: "fortune_teller_night_ability",
      wakeMessage: "占卜师",
      firstNightPriority: 57,
      otherNightPriority: 91,
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
  gameId: string;
  nightCount?: number;
  targetIds?: number[];
}) {
  const targetIds = opts.targetIds ?? [1, 2];
  return runFullAbilityPipeline(
    {
      preCheck: fortuneTellerAbility.preCheck,
      calculate: fortuneTellerAbility.calculate,
      stateUpdate: fortuneTellerAbility.stateUpdate,
      postProcess: fortuneTellerAbility.postProcess,
    },
    makeContext({
      nightCount: opts.nightCount ?? 1,
      preview: opts.preview,
      gameId: opts.gameId,
      targetIds,
    })
  );
}

describe("占卜师：提示预演与实际执行必须标记同一个干扰项（回归）", () => {
  it("同一夜、同一种子 → 同一个干扰项", () => {
    const a = pickBoonSeatId(
      candidates(),
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickBoonSeatId(
      candidates(),
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(candidates().map((s) => s.id)).toContain(a);
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一个干扰项）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () => pickBoonSeatId(candidates(), 0, rng));
    };
    expect(sequence(1)).not.toEqual(sequence(2));
  });

  it("无合格候选时回退为占卜师自身", () => {
    expect(pickBoonSeatId([], 0, createDeterministicRandom(seedFor(0, 1)))).toBe(0);
  });

  it("管道级：两次独立的首夜计算（不同对局 id）初始化出同一个干扰项", async () => {
    const gameIdA = "ft-stability-a-" + Date.now();
    const gameIdB = "ft-stability-b-" + Date.now();

    const previewResult = await run({ preview: true, gameId: gameIdA });
    const execResult = await run({ preview: false, gameId: gameIdB });

    const boonA = fortuneTellerBoonManager.getCurrentBoon(gameIdA);
    const boonB = fortuneTellerBoonManager.getCurrentBoon(gameIdB);

    expect(boonA).not.toBeNull();
    expect(boonB).toBe(boonA);
    // 干扰项只能是善良候选之一，不能是占卜师自己、爪牙或恶魔
    expect(candidates().map((s) => s.id)).toContain(boonA);
    // 两次计算的占卜结果也一致
    expect(execResult.meta.abilityResult).toBe(previewResult.meta.abilityResult);
  });
});
