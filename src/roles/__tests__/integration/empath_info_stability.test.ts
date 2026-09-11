import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  empathAbility,
  generateFakeEvilCount,
} from "../../new_engine/empath.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 3 人局简化座位：0号共情者，左邻2号投毒者（邪恶）、右邻1号士兵（善良）
// → 真实邪恶邻座数 realCount = 1
const seats = () => [
  seat(0, "empath", "townsfolk"),
  seat(1, "soldier", "townsfolk"),
  seat(2, "poisoner", "minion"),
];

const mkCtx = (
  nightCount: number,
  abilityEffective: boolean
): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
  },
  actionNode: {
    seatId: 0,
    roleId: "empath",
    roleName: "共情者",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "empath_night_ability",
    wakeMessage: "",
    firstNightPriority: 56,
    otherNightPriority: 90,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [],
  meta: { abilityEffective },
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("empath", actorId, night);

const runCalculate = async (nightCount: number, abilityEffective: boolean) => {
  const ctx = await empathAbility.calculate[0](
    mkCtx(nightCount, abilityEffective)
  );
  return ctx.meta.abilityResult as number;
};

describe("共情者：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("醉酒/中毒时的假数字：同一夜重复计算结果完全一致", async () => {
    const a = await runCalculate(1, false);
    const b = await runCalculate(1, false);
    expect(b).toBe(a);
    // 真实值 1 → 假数字必须不等于 1
    expect(a).not.toBe(1);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一个数字）", async () => {
    const seen = new Set<number>();
    for (let n = 1; n <= 12; n++) {
      seen.add(await runCalculate(n, false));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("能力正常时使用真实数字（与随机无关）", async () => {
    const a = await runCalculate(1, true);
    const b = await runCalculate(2, true);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("底层假数字生成函数：同种子一致，跨夜仍随机，且永不等于真实值", () => {
    const s = seats();
    const a = generateFakeEvilCount(s, 0, 1, createDeterministicRandom(seedFor(0, 1)));
    const b = generateFakeEvilCount(s, 0, 1, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        generateFakeEvilCount(s, 0, 1, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    for (const real of [0, 1, 2]) {
      for (let n = 1; n <= 6; n++) {
        expect(
          generateFakeEvilCount(
            s,
            0,
            real,
            createDeterministicRandom(seedFor(0, n))
          )
        ).not.toBe(real);
      }
    }
  });
});
