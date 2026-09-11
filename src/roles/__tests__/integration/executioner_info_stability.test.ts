import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  executionerAbility,
  pickExecutionerVictim,
} from "../../new_engine/executioner.ability";

const seat = (id: number, roleId: string, type: string, isAlive = true) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: !isAlive,
  isAlive,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 5 人局简化座位：0号刽子手，4号已死亡（不该被带走）
const seats = () => [
  seat(0, "executioner", "outsider"),
  seat(1, "soldier", "townsfolk"),
  seat(2, "chef", "townsfolk"),
  seat(3, "poisoner", "minion"),
  seat(4, "saint", "outsider", false),
];

const mkCtx = (nightCount: number, allSeats = seats()): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: "day",
    seats: allSeats,
    statusEffects: {},
    executedToday: 0,
  },
  actionNode: {
    seatId: 0,
    roleId: "executioner",
    roleName: "刽子手",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "executioner_take",
    wakeMessage: "",
    firstNightPriority: null,
    otherNightPriority: null,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [],
  meta: {},
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("executioner", actorId, night);

const runCalculate = async (nightCount: number) => {
  const ctx = await executionerAbility.calculate[0](mkCtx(nightCount));
  return ctx.meta.abilityResult as { targetId: number } | undefined;
};

describe("刽子手：提示预演与实际执行必须带走同一名玩家（回归）", () => {
  it("同一场景重复计算结果完全一致，且只从存活玩家中挑", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    expect(a?.targetId).toBeDefined();
    expect([1, 2, 3]).toContain(a!.targetId);
    expect(a!.targetId).not.toBe(4);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一名玩家）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      seen.add(JSON.stringify(await runCalculate(n)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("无其他存活玩家时中止（不产生目标）", async () => {
    const lonely = [seat(0, "executioner", "outsider")];
    const ctx = await executionerAbility.calculate[0](mkCtx(1, lonely));
    expect(ctx.aborted).toBe(true);
    expect(pickExecutionerVictim(lonely, 0)).toBeNull();
  });

  it("底层选择函数：同种子一致，跨夜仍随机", () => {
    const s = seats();
    const a = pickExecutionerVictim(s, 0, createDeterministicRandom(seedFor(0, 1)));
    const b = pickExecutionerVictim(s, 0, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toEqual(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        pickExecutionerVictim(s, 0, createDeterministicRandom(seedFor(0, n))).id
      )
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
