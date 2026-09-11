import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  clockmakerAbility,
  pickFakeClockmakerDistance,
} from "../../new_engine/clockmaker.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

const seats = () => [
  seat(0, "clockmaker", "townsfolk"),
  seat(1, "soldier", "townsfolk"),
  seat(2, "poisoner", "minion"),
  seat(3, "washerwoman", "townsfolk"),
  seat(4, "imp", "demon"),
];

/** meta.isAbilityActive = false 表示醉酒/中毒（走随机假信息分支） */
const mkCtx = (
  nightCount: number,
  isAbilityActive: boolean
): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
  },
  actionNode: {
    seatId: 0,
    roleId: "clockmaker",
    roleName: "钟表匠",
    priority: 0,
    isFirstNightOnly: true,
    abilityId: "clockmaker_first_night_ability",
    wakeMessage: "",
    firstNightPriority: 61,
    otherNightPriority: null,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [],
  meta: { isAbilityActive },
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("clockmaker", actorId, night);

const runCalculate = async (nightCount: number, isAbilityActive: boolean) => {
  const ctx = await clockmakerAbility.calculate[0](
    mkCtx(nightCount, isAbilityActive)
  );
  return ctx.meta.abilityResult as number;
};

describe("钟表匠：提示预演与实际执行必须给出同一个距离（回归）", () => {
  it("醉酒/中毒时的假距离：同一夜重复计算结果完全一致", async () => {
    const a = await runCalculate(1, false);
    const b = await runCalculate(1, false);
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一个距离）", async () => {
    const seen = new Set<number>();
    for (let n = 1; n <= 12; n++) {
      seen.add(await runCalculate(n, false));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("能力正常时使用真实距离（与随机无关）", async () => {
    const a = await runCalculate(1, true);
    const b = await runCalculate(2, true);
    // 2号投毒者与4号小恶魔相距 2 格（环形座位）
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  it("底层假距离生成函数：同种子一致，跨夜仍随机，且永不等于真实值", () => {
    const a = pickFakeClockmakerDistance(1, createDeterministicRandom(seedFor(0, 1)));
    const b = pickFakeClockmakerDistance(1, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        pickFakeClockmakerDistance(
          1,
          createDeterministicRandom(seedFor(0, n))
        )
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    for (let real = 0; real <= 4; real++) {
      for (let n = 1; n <= 6; n++) {
        expect(
          pickFakeClockmakerDistance(
            real,
            createDeterministicRandom(seedFor(0, n))
          )
        ).not.toBe(real);
      }
    }
  });
});
