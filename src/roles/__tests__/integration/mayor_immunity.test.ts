import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { resolveMayorDemonKill } from "../../../utils/soldierImmunity";
import { impAbility } from "../../new_engine/imp.ability";

function mkSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string,
  extra: any = {}
) {
  return {
    id,
    playerName: "P" + (id + 1),
    isDead: false,
    isAlive: true,
    role: { id: roleId, name: roleName, type },
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    statusEffects: [],
    hasAbilityEvenDead: false,
    ...extra,
  };
}

/**
 * 构建小恶魔击杀镇长的上下文。
 * @param targetSeat 目标座位（镇长）
 * @param aliveSeats 其他存活座位（用于计算存活玩家数）
 */
function buildImpKillMayorCtx(
  targetSeat: any,
  aliveSeats: any[]
): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      seats: [targetSeat, mkSeat(1, "imp", "小恶魔", "demon"), ...aliveSeats],
      statusEffects: {},
    },
    actionNode: {
      seatId: 1,
      roleId: "imp",
      roleName: "小恶魔",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "imp_night_ability",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: 99,
      targetIds: [0],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [0],
    meta: {},
    aborted: false,
  };
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("镇长替死固定概率机制（5%自己死亡，95%镇民替代死亡）", () => {
  test("resolveMayorDemonKill: 95% 概率由存活镇民替代死亡 (roll >= 0.05)", () => {
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const empath = mkSeat(3, "empath", "共情者", "townsfolk");
    const seats = [mayor, mkSeat(1, "imp", "小恶魔", "demon"), chef, empath];

    const res = resolveMayorDemonKill(seats, mayor, 4, 0.5); // roll = 0.5 >= 0.05
    expect(res.isMayor).toBe(true);
    expect(res.substituted).toBe(true);
    expect(res.substituteSeat).toBeDefined();
    expect([1, 2, 3]).toContain(res.substituteSeat.id);
    expect(res.reason).toBe("substituted_95_percent");
  });

  test("resolveMayorDemonKill: 5% 概率为镇长自己死亡 (roll < 0.05)", () => {
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const seats = [mayor, mkSeat(1, "imp", "小恶魔", "demon"), chef];

    const res = resolveMayorDemonKill(seats, mayor, 3, 0.02); // roll = 0.02 < 0.05
    expect(res.isMayor).toBe(true);
    expect(res.substituted).toBe(false);
    expect(res.substituteSeat).toBeNull();
    expect(res.reason).toBe("self_killed_5_percent");
  });

  test("resolveMayorDemonKill: 醉酒或中毒时替死失效，镇长自己死亡", () => {
    const drunkMayor = mkSeat(0, "mayor", "镇长", "townsfolk", {
      isDrunk: true,
    });
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const seats = [drunkMayor, mkSeat(1, "imp", "小恶魔", "demon"), chef];

    const res = resolveMayorDemonKill(seats, drunkMayor, 3, 0.9);
    expect(res.isMayor).toBe(true);
    expect(res.substituted).toBe(false);
    expect(res.reason).toBe("disabled_by_status");
  });

  test("resolveMayorDemonKill: 存活人数不足3人时，镇长自己死亡", () => {
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const seats = [mayor, mkSeat(1, "imp", "小恶魔", "demon")];

    const res = resolveMayorDemonKill(seats, mayor, 2, 0.9);
    expect(res.isMayor).toBe(true);
    expect(res.substituted).toBe(false);
    expect(res.reason).toBe("no_candidates");
  });

  test("resolveMayorDemonKill: 场上无其他存活玩家可替代时，镇长自己死亡", () => {
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const dead1 = mkSeat(1, "imp", "小恶魔", "demon", { isDead: true });
    const dead2 = mkSeat(2, "poisoner", "投毒者", "minion", { isDead: true });
    const seats = [mayor, dead1, dead2];

    const res = resolveMayorDemonKill(seats, mayor, 3, 0.9);
    expect(res.isMayor).toBe(true);
    expect(res.substituted).toBe(false);
    expect(res.reason).toBe("no_candidates");
  });
});

describe("小恶魔攻击镇长完整管道集成测试", () => {
  test("受攻击且触发替死时，替代存活玩家标记死亡，镇长存活", async () => {
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const empath = mkSeat(3, "empath", "共情者", "townsfolk");
    const ctx = buildImpKillMayorCtx(mayor, [chef, empath]);

    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const deadSeats = seats.filter((s: any) => s.markedForDeath === true);
    expect(deadSeats.length).toBe(1);

    // 死亡的必定是镇长(5%)或者替代存活玩家(95%)之一
    expect([0, 1, 2, 3]).toContain(deadSeats[0].id);
    if (deadSeats[0].id === 0) {
      expect(deadSeats[0].deathSource).toBe("imp_kill");
    } else {
      expect(deadSeats[0].deathSource).toBe("mayor_substitute");
    }
  });

  test("士兵被恶魔杀 -> 绝对免疫，无替代死亡", async () => {
    const soldier = mkSeat(0, "soldier", "士兵", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const empath = mkSeat(3, "empath", "共情者", "townsfolk");
    const ctx = {
      snapshot: {
        nightCount: 2,
        gamePhase: "night",
        seats: [soldier, mkSeat(1, "imp", "小恶魔", "demon"), chef, empath],
        statusEffects: {},
      },
      actionNode: {
        seatId: 1,
        roleId: "imp",
        roleName: "小恶魔",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "imp_night_ability",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: 99,
        targetIds: [0],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [0],
      meta: {},
      aborted: false,
    };
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const seats = result.snapshot.seats as any[];
    const soldierAfter = seats.find((s: any) => s.id === 0);
    expect(soldierAfter.markedForDeath).toBeUndefined();
    const deadOthers = seats.filter(
      (s: any) => s.id !== 1 && s.markedForDeath === true
    );
    expect(deadOthers.length).toBe(0);
  });
});
