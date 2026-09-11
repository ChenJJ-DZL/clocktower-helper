import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  chambermaidAbility,
  pickFakeWokenCount,
} from "../../new_engine/chambermaid.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 5 人局简化座位：0号侍女，1号涡流（触发「必假信息」分支）
const seats = () => [
  seat(0, "chambermaid", "townsfolk"),
  seat(1, "vortox", "demon"),
  seat(2, "soldier", "townsfolk"),
  seat(3, "chef", "townsfolk"),
  seat(4, "saint", "outsider"),
];

const mkCtx = (nightCount: number): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
    // 3 号玩家本夜因自身能力被唤醒 → 真实被唤醒人数 realWokenCount = 1
    wokenPlayerIds: [3],
  },
  actionNode: {
    seatId: 0,
    roleId: "chambermaid",
    roleName: "侍女",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "chambermaid_night_ability",
    wakeMessage: "",
    firstNightPriority: 82,
    otherNightPriority: 114,
    targetIds: [2, 3],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [2, 3],
  meta: {},
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("chambermaid", actorId, night);

const runCalculate = async (nightCount: number) => {
  const ctx = await chambermaidAbility.calculate[0](mkCtx(nightCount));
  return ctx.meta.abilityResult;
};

describe("侍女：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("涡流在场（必假信息）时，同一夜重复计算结果完全一致", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    // 真实被唤醒人数为 1 → 假信息必须不等于 1
    expect(a.wokenCount).not.toBe(1);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一个数字）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      seen.add(JSON.stringify((await runCalculate(n)).wokenCount));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("底层假数字生成函数：同种子一致，跨夜仍随机，且永不等于真实值", () => {
    const a = pickFakeWokenCount(1, createDeterministicRandom(seedFor(0, 1)));
    const b = pickFakeWokenCount(1, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        pickFakeWokenCount(1, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    for (const real of [0, 1, 2]) {
      for (let n = 1; n <= 6; n++) {
        expect(
          pickFakeWokenCount(real, createDeterministicRandom(seedFor(0, n)))
        ).not.toBe(real);
      }
    }
  });
});
