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

/** 构建小恶魔击杀目标的上下文（targetId=0） */
function buildImpKillCtx(targetSeat: any): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      seats: [
        targetSeat,
        mkSeat(1, "imp", "小恶魔", "demon"),
        mkSeat(2, "chef", "厨师", "townsfolk"),
      ],
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

describe("士兵免疫恶魔攻击（imp 杀人路径）", () => {
  test("小恶魔杀士兵 -> 士兵不死亡", async () => {
    const soldier = mkSeat(0, "soldier", "士兵", "townsfolk");
    const ctx = buildImpKillCtx(soldier);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBeUndefined();
    expect(updatedSeat.isDead).toBeFalsy();
    expect(updatedSeat.isAlive).not.toBe(false);
  });

  test("小恶魔杀普通镇民 -> 目标死亡", async () => {
    const chef = mkSeat(0, "chef", "厨师", "townsfolk");
    const ctx = buildImpKillCtx(chef);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBe(true);
  });

  test("醉酒士兵被恶魔杀 -> 失去免疫", async () => {
    const drunkSoldier = mkSeat(0, "soldier", "士兵", "townsfolk", {
      isDrunk: true,
      statusEffects: [{ type: "drunk", source: "test" }],
    });
    const ctx = buildImpKillCtx(drunkSoldier);
    const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const updatedSeat = result.snapshot.seats.find((s: any) => s.id === 0);
    expect(updatedSeat.markedForDeath).toBe(true);
  });
});
