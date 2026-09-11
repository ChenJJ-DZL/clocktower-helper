import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  bounty_hunterAbility,
  pickEvilBountyTargetId,
  pickFakeBountyTargetId,
} from "../../new_engine/bounty_hunter.ability";

// 7 人局·暗流涌动 简化座位：0号赏金猎人，含 2 名非恶魔邪恶 + 1 名恶魔
const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

const seats = () => [
  seat(0, "bounty_hunter", "townsfolk"),
  seat(1, "poisoner", "minion"),
  seat(2, "soldier", "townsfolk"),
  seat(3, "imp", "demon"),
  seat(4, "washerwoman", "townsfolk"),
  seat(5, "chef", "townsfolk"),
  seat(6, "baron", "minion"),
];

const mkCtx = (
  nightCount: number,
  abilityEffective = true
): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
  },
  actionNode: {
    seatId: 0,
    roleId: "bounty_hunter",
    roleName: "赏金猎人",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "bounty_hunter_reveal",
    wakeMessage: "",
    firstNightPriority: 72,
    otherNightPriority: 105,
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
  nightInfoSeed("bounty_hunter", actorId, night);

/** 真实跑一遍 calculate 中间件，取出能力结果 */
const runCalculate = async (nightCount: number, abilityEffective = true) => {
  const ctx = await bounty_hunterAbility.calculate[0](
    mkCtx(nightCount, abilityEffective)
  );
  return ctx.meta.abilityResult;
};

describe("赏金猎人：提示预演与实际执行必须给出同一名目标（回归）", () => {
  it("同一夜重复计算（预演 / 执行）结果完全一致", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    // 确认真的走到了随机分支（2 名非恶魔邪恶中挑一人）
    expect(a.targetId).not.toBeNull();
  });

  it("被干扰（醉酒/中毒）时的假目标在同种子下完全一致，且绝不指向邪恶玩家", async () => {
    const a = await runCalculate(1, false);
    const b = await runCalculate(1, false);
    expect(b).toEqual(a);
    expect([1, 3, 6]).not.toContain(a.targetId);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一名目标）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      seen.add(JSON.stringify(await runCalculate(n)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("底层选择函数：同种子一致，跨夜仍有随机性", () => {
    const aliveEvils = seats().filter((s) => s.role.type === "minion");

    const a = pickEvilBountyTargetId(
      aliveEvils,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickEvilBountyTargetId(
      aliveEvils,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toBe(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        pickEvilBountyTargetId(
          aliveEvils,
          createDeterministicRandom(seedFor(0, n))
        )
      )
    );
    expect(seen.size).toBeGreaterThan(1);

    const fakeSeats = seats();
    const f1 = pickFakeBountyTargetId(
      fakeSeats,
      0,
      aliveEvils,
      createDeterministicRandom(seedFor(0, 1))
    );
    const f2 = pickFakeBountyTargetId(
      fakeSeats,
      0,
      aliveEvils,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(f2).toBe(f1);
    expect([1, 3, 6]).not.toContain(f1);
  });
});
