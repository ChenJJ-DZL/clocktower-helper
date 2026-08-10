import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { impAbility } from "../../new_engine/imp.ability";

function mkSeat(id: number, roleId: string, roleName: string, type: string, extra: any = {}) {
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
function buildImpKillMayorCtx(targetSeat: any, aliveSeats: any[]): MiddlewareContext {
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

describe("镇长免疫恶魔攻击（imp 杀人路径）", () => {
  test("≥3人存活时恶魔杀镇长 -> 镇长不死亡（免疫恶魔的刀）", async () => {
    // 3名存活：镇长(0) + 小恶魔(1) + 厨师(2)
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const ctx = buildImpKillMayorCtx(mayor, [chef]);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBeUndefined();
    expect(updatedSeat.isDead).toBeFalsy();
    expect(updatedSeat.isAlive).not.toBe(false);
  });

  test("仅2人存活时恶魔杀镇长 -> 镇长死亡（免疫失效）", async () => {
    // 2名存活：镇长(0) + 小恶魔(1)
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const ctx = buildImpKillMayorCtx(mayor, []);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBe(true);
  });

  test("醉酒镇长被恶魔杀 -> 失去免疫", async () => {
    const drunkMayor = mkSeat(0, "mayor", "镇长", "townsfolk", {
      isDrunk: true,
      statusEffects: [{ type: "drunk", source: "test" }],
    });
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const ctx = buildImpKillMayorCtx(drunkMayor, [chef]);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBe(true);
  });
});

describe("镇长免疫恶魔攻击的代价：一名镇民替代死亡（W8.10.7）", () => {
  test("≥3人存活恶魔杀镇长 -> 随机一名存活镇民替代死亡", async () => {
    // 5名存活：镇长(0) + 小恶魔(1) + 厨师(2) + 士兵(3) + 共情者(4)
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const chef = mkSeat(2, "chef", "厨师", "townsfolk");
    const soldier = mkSeat(3, "soldier", "士兵", "townsfolk");
    const empath = mkSeat(4, "empath", "共情者", "townsfolk");
    const ctx = buildImpKillMayorCtx(mayor, [chef, soldier, empath]);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const seats = result.snapshot.seats as any[];

    // 镇长不死亡
    const mayorAfter = seats.find((s: any) => s.id === 0);
    expect(mayorAfter.markedForDeath).toBeUndefined();
    expect(mayorAfter.isDead).toBeFalsy();

    // 恰好一名存活镇民替代死亡（死亡来源 mayor_substitute）
    const deadTownsfolk = seats.filter(
      (s: any) =>
        s.id !== 1 && // 排除小恶魔
        s.role?.type === "townsfolk" &&
        (s.markedForDeath === true || s.isDead === true)
    );
    expect(deadTownsfolk.length).toBe(1);
    expect(deadTownsfolk[0].deathSource || deadTownsfolk[0].killedBy).toBe(
      "mayor_substitute"
    );
    // 替代者来自 2/3/4 号（厨师/士兵/共情者），不能是镇长自己
    expect([2, 3, 4]).toContain(deadTownsfolk[0].id);
  });

  test("镇长免疫但无存活镇民可替代 -> 镇长仍存活，无人替代死亡", async () => {
    // 3名存活：镇长(0) + 小恶魔(1) + 投毒者(2,minion)
    const mayor = mkSeat(0, "mayor", "镇长", "townsfolk");
    const poisoner = mkSeat(2, "poisoner", "投毒者", "minion");
    const ctx = buildImpKillMayorCtx(mayor, [poisoner]);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const seats = result.snapshot.seats as any[];
    const mayorAfter = seats.find((s: any) => s.id === 0);
    expect(mayorAfter.markedForDeath).toBeUndefined();
    // 无镇民替代，爪牙不死亡
    const poisonerAfter = seats.find((s: any) => s.id === 2);
    expect(poisonerAfter.markedForDeath).toBeFalsy();
  });

  test("士兵被恶魔杀 -> 无替代死亡（士兵免疫无代价）", async () => {
    // 4名存活：士兵(0) + 小恶魔(1) + 厨师(2) + 共情者(3)
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
    // 士兵不死
    const soldierAfter = seats.find((s: any) => s.id === 0);
    expect(soldierAfter.markedForDeath).toBeUndefined();
    // 其他镇民无替代死亡
    const deadOthers = seats.filter(
      (s: any) => s.id !== 1 && s.markedForDeath === true
    );
    expect(deadOthers.length).toBe(0);
  });
});
