import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  deusExFiascoAbility,
  pickChaosTargetId,
} from "../../new_engine/deus_ex_fiasco.ability";

const seat = (id: number, roleId: string, type: string, isAlive = true) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: !isAlive,
  isAlive,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 5 人局简化座位（3号已死亡，不该被选中）
const seats = () => [
  seat(0, "deus_ex_fiasco", "fabled"),
  seat(1, "poisoner", "minion"),
  seat(2, "soldier", "townsfolk"),
  seat(3, "saint", "outsider", false),
  seat(4, "imp", "demon"),
];

const mkCtx = (nightCount: number): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: "night",
    seats: seats(),
    statusEffects: {},
  },
  actionNode: {
    seatId: 0,
    roleId: "deus_ex_fiasco",
    roleName: "天降横祸",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "deus_chaos",
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
  nightInfoSeed("deus_ex_fiasco", actorId, night);

const runCalculate = async (nightCount: number) => {
  const ctx = await deusExFiascoAbility.calculate[0](mkCtx(nightCount));
  return ctx.meta.abilityResult as { targetId: number | null };
};

describe("天降横祸：提示预演与实际执行必须选中同一名玩家（回归）", () => {
  it("同一夜重复计算结果完全一致，且只挑存活玩家", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    expect(a.targetId).not.toBeNull();
    expect([0, 1, 2, 4]).toContain(a.targetId);
    expect(a.targetId).not.toBe(3);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一名玩家）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      seen.add(JSON.stringify((await runCalculate(n)).targetId));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("底层选择函数：同种子一致、跨夜仍随机、无存活玩家时返回 null", () => {
    const alive = seats().filter((s) => s.isAlive);
    const a = pickChaosTargetId(alive, createDeterministicRandom(seedFor(0, 1)));
    const b = pickChaosTargetId(alive, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        pickChaosTargetId(alive, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    expect(pickChaosTargetId([], createDeterministicRandom(seedFor(0, 1)))).toBeNull();
  });
});
