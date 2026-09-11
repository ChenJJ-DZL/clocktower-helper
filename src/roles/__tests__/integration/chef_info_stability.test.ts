import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  chefAbility,
  generateFakePairCount,
} from "../../new_engine/chef.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 7 人局简化座位（邪恶：1号投毒者 + 5号男爵 + 6号小恶魔）
const seats = () => [
  seat(0, "chef", "townsfolk"),
  seat(1, "poisoner", "minion"),
  seat(2, "soldier", "townsfolk"),
  seat(3, "washerwoman", "townsfolk"),
  seat(4, "saint", "outsider"),
  seat(5, "baron", "minion"),
  seat(6, "imp", "demon"),
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
    roleId: "chef",
    roleName: "厨师",
    priority: 0,
    isFirstNightOnly: true,
    abilityId: "chef_first_night_ability",
    wakeMessage: "",
    firstNightPriority: 55,
    otherNightPriority: null,
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
  nightInfoSeed("chef", actorId, night);

const runCalculate = async (nightCount: number, abilityEffective: boolean) => {
  const ctx = await chefAbility.calculate[0](
    mkCtx(nightCount, abilityEffective)
  );
  return ctx.meta.abilityResult as number;
};

describe("厨师：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("醉酒/中毒时的假数字：同一夜重复计算结果完全一致", async () => {
    const a = await runCalculate(1, false);
    const b = await runCalculate(1, false);
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一个数字）", async () => {
    const seen = new Set<number>();
    for (let n = 1; n <= 12; n++) {
      seen.add(await runCalculate(n, false));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("能力正常时不使用随机（真实对数恒定）", async () => {
    const a = await runCalculate(1, true);
    const b = await runCalculate(1, true);
    expect(b).toBe(a);
    // 5号男爵与6号小恶魔相邻 → 1 对
    expect(a).toBe(1);
  });

  it("底层假数字生成函数：同种子一致，跨夜仍随机，且永不等于真实值", () => {
    const s = seats();
    const a = generateFakePairCount(s, null, createDeterministicRandom(seedFor(0, 1)));
    const b = generateFakePairCount(s, null, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        generateFakePairCount(s, null, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    for (let n = 1; n <= 8; n++) {
      expect(
        generateFakePairCount(s, 2, createDeterministicRandom(seedFor(0, n)))
      ).not.toBe(2);
    }
  });
});
