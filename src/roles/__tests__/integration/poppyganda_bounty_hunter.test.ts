import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { bounty_hunterAbility } from "../../new_engine/bounty_hunter.ability";

/**
 * 赏金猎人（Bounty Hunter）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 3.赏金猎人）：
 *   1. 设置调整：[会有一名镇民转变为邪恶阵营]
 *   2. 首夜：得知一名邪恶玩家
 *   3. 死亡轮转：每当你得知的玩家死亡，当晚得知另一名邪恶玩家（不重复）
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("赏金猎人：首夜 + 死亡轮转", () => {
  it("首夜：默认告知一个邪恶玩家", async () => {
    const seats: Seat[] = [
      makeSeat(0, "bounty_hunter", "townsfolk"),
      makeSeat(1, "imp", "demon"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "washerwoman", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx);
    const r = res.meta.abilityResult as any;
    // 默认告知一个邪恶玩家
    expect(r.targetId).toBeGreaterThanOrEqual(0);
    expect(r.targetId).not.toBe(0); // 不告知自己
    expect([1, 2]).toContain(r.targetId); // imp 或 poisoner
    // 不重复告知
    expect((res.snapshot as any).bountyHunterKnownTargets).toContain(
      r.targetId
    );
  });

  it("醉酒/中毒：告知一个善良玩家（虚假信息）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "bounty_hunter", "townsfolk", { isDrunk: true }),
      makeSeat(1, "imp", "demon"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "washerwoman", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: { abilityEffective: false }, // 模拟醉酒/中毒
    };
    const res = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx);
    const r = res.meta.abilityResult as any;
    // 醉酒/中毒：告知善良（3 号 washerwoman）
    expect(r.targetId).toBe(3);
    expect(res.meta.isCorrupted).toBe(true);
  });

  it("死亡轮转：第 1 个得知目标死亡后，再告知另一个邪恶玩家（不重复）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "bounty_hunter", "townsfolk"),
      makeSeat(1, "imp", "demon"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "baron", "minion"),
    ];
    // 第 1 次：首夜告知 1 号（imp）
    const ctx1: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        bountyHunterKnownTargets: [],
      },
      meta: {},
      // 固定首个目标，保证轮转断言确定性
      storytellerInput: { targetId: 1 },
    };
    const res1 = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx1);
    expect(res1.meta.abilityResult.targetId).toBe(1);

    // 第 2 次：1 号已死，轮转告知下一个邪恶（2 号或 3 号）
    const ctx2: any = {
      ...ctx1,
      snapshot: {
        ...ctx1.snapshot,
        bountyHunterKnownTargets: res1.snapshot.bountyHunterKnownTargets,
        // 模拟 1 号死亡
        seats: ctx1.snapshot.seats.map((s: Seat) =>
          s.id === 1 ? { ...s, isDead: true, isAlive: false } : s
        ),
      },
      meta: { isRotationTrigger: true },
      // 第二次不再强制指定目标，让「已告知排除」逻辑接管轮转
      storytellerInput: {},
    };
    const res2 = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx2);
    const r2 = res2.meta.abilityResult as any;
    // 不应重复告知 1 号；应在 [2, 3] 中
    expect(r2.targetId).not.toBe(1);
    expect([2, 3]).toContain(r2.targetId);
  });
});
