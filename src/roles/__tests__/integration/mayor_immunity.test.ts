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
