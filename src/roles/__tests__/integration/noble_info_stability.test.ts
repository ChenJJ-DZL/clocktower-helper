import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  getNobleCandidates,
  nobleAbility,
  selectNobleTrio,
} from "../../new_engine/noble.ability";

// 贵族：首夜得知三名玩家，其中一名邪恶。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("noble", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  noble: "贵族",
  empath: "共情者",
  chef: "厨师",
  saint: "圣徒",
  baron: "男爵",
  imp: "小恶魔",
};

function seat(id: number, roleId: string, type: string, poisoned = false) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: poisoned,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: poisoned ? [{ type: "poisoned" }] : [],
  };
}

/** 最小座位集：贵族自己 + 2 邪恶（男爵/小恶魔）+ 3 善良 */
function makeSeats(poisonedSelf = false) {
  return [
    seat(0, "noble", "townsfolk", poisonedSelf),
    seat(1, "empath", "townsfolk"),
    seat(2, "chef", "townsfolk"),
    seat(3, "saint", "outsider"),
    seat(4, "baron", "minion"),
    seat(5, "imp", "demon"),
  ];
}

function makeCtx(opts: { preview?: boolean; poisoned?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: makeSeats(!!opts.poisoned),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "noble",
      roleName: "贵族",
      priority: 0,
      isFirstNightOnly: true,
      abilityId: "noble_first_night_ability",
      wakeMessage: "",
      firstNightPriority: 66,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    storytellerInput: {},
    meta: {},
    aborted: false,
    preview: !!opts.preview,
  };
  return ctx;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

const jsonTrio = (trio: any[]) => JSON.stringify(trio.map((s) => s.id));

describe("贵族：提示预演与实际执行必须给出同一组玩家（回归）", () => {
  it("真实信息（三人中恰有一名邪恶）在同种子下完全一致", () => {
    const a = selectNobleTrio(makeSeats(), 0, false, createDeterministicRandom(seedFor(0, 1)));
    const b = selectNobleTrio(makeSeats(), 0, false, createDeterministicRandom(seedFor(0, 1)));
    expect(jsonTrio(b)).toBe(jsonTrio(a));

    const evil = new Set([4, 5]);
    expect(a.filter((s) => evil.has(s.id)).length).toBe(1);
  });

  it("受干扰时的假信息在同种子下完全一致（三名全善良）", () => {
    const a = selectNobleTrio(makeSeats(), 0, true, createDeterministicRandom(seedFor(0, 1)));
    const b = selectNobleTrio(makeSeats(), 0, true, createDeterministicRandom(seedFor(0, 1)));
    expect(jsonTrio(b)).toBe(jsonTrio(a));

    const evil = new Set([4, 5]);
    expect(a.filter((s) => evil.has(s.id)).length).toBe(0);
  });

  it("不同夜次会重新随机（不会整局锁死同一组玩家）", () => {
    const trios = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        jsonTrio(selectNobleTrio(makeSeats(), 0, false, createDeterministicRandom(seedFor(0, n))))
      )
    );
    expect(trios.size).toBeGreaterThan(1);
  });

  it("候选池：排除自身与非恶魔/非善良的注册结果", () => {
    const { evilCandidates, goodCandidates } = getNobleCandidates(makeSeats(), 0);
    expect(evilCandidates.map((s) => s.id)).toEqual([4, 5]);
    expect(goodCandidates.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("预览（只跑 calculate）与完整执行得出同一组玩家", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(nobleAbility),
      makeCtx({ preview: true })
    );
    const executed = await runFullAbilityPipeline(pipe(nobleAbility), makeCtx());

    expect(executed.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(executed.meta.nobleResult).toEqual(preview.meta.abilityResult);

    const trio = preview.meta.abilityResult as any;
    const evil = new Set([4, 5]);
    const evilCount = [trio.seat1, trio.seat2, trio.seat3].filter((id) =>
      evil.has(id)
    ).length;
    expect(evilCount).toBe(1);
  });
});
