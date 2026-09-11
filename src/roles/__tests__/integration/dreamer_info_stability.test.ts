import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { dreamerAbility, getRandom } from "../../new_engine/dreamer.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

const R = (id: string, type: string) => ({ id, name: id, type });

const seats = () => [
  seat(0, "dreamer", "townsfolk"),
  seat(1, "soldier", "townsfolk"),
  seat(2, "poisoner", "minion"),
  seat(3, "imp", "demon"),
];

const availableRoles = [
  R("soldier", "townsfolk"),
  R("chef", "townsfolk"),
  R("washerwoman", "townsfolk"),
  R("saint", "outsider"),
  R("butler", "outsider"),
  R("poisoner", "minion"),
  R("baron", "minion"),
  R("imp", "demon"),
];

const mkCtx = (
  nightCount: number,
  opts: { isAbilityActive?: boolean; storytellerInput?: any } = {}
): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
    availableRoles,
    isVortoxWorld: false,
  },
  actionNode: {
    seatId: 0,
    roleId: "dreamer",
    roleName: "筑梦师",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "dreamer_nightly_ability",
    wakeMessage: "",
    firstNightPriority: 62,
    otherNightPriority: 95,
    targetIds: [1],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [1],
  storytellerInput: opts.storytellerInput,
  meta: { isAbilityActive: opts.isAbilityActive ?? true },
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("dreamer", actorId, night);

const runCalculate = async (
  nightCount: number,
  opts?: { isAbilityActive?: boolean; storytellerInput?: any }
) => {
  const ctx = await dreamerAbility.calculate[0](mkCtx(nightCount, opts));
  return ctx.meta.abilityResult as {
    targetId: number;
    roleA: { id: string };
    roleB: { id: string };
  };
};

describe("筑梦师：提示预演与实际执行必须给出同一对角色（回归）", () => {
  it("同一夜重复计算（预演 / 执行）结果完全一致", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    // 目标1号是镇民 → 必须恰好给出一个真实角色 + 一个邪恶角色
    expect([a.roleA.id, a.roleB.id]).toContain("soldier");
  });

  it("醉酒/中毒时的假角色对在同一夜重复计算下完全一致", async () => {
    const a = await runCalculate(1, { isAbilityActive: false });
    const b = await runCalculate(1, { isAbilityActive: false });
    expect(b).toEqual(a);
    // 假信息中不能出现目标的真实角色
    expect(a.roleA.id).not.toBe("soldier");
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一对角色）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      const r = await runCalculate(n);
      seen.add(`${r.roleA.id}|${r.roleB.id}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("说书人显式指定 roleA / roleB 时不参与随机", async () => {
    const roleA = R("saint", "outsider");
    const roleB = R("baron", "minion");
    const a = await runCalculate(1, { storytellerInput: { roleA, roleB } });
    const b = await runCalculate(1, { storytellerInput: { roleA, roleB } });
    expect(b).toEqual(a);
    expect(a.roleA.id).toBe("saint");
    expect(a.roleB.id).toBe("baron");
  });

  it("底层 getRandom：同种子一致，跨夜仍随机", () => {
    const pool = ["a", "b", "c", "d"];
    const a = getRandom(pool, createDeterministicRandom(seedFor(0, 1)));
    const b = getRandom(pool, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        getRandom(pool, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
