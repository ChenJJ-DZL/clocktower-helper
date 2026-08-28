import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { chefAbility } from "../../new_engine/chef.ability";

function makeSeat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    statusEffects: [],
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("厨师：得知相邻邪恶对数", () => {
  it("4、5 号相邻且为邪恶 → 输出 1 对", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "librarian", "townsfolk"),
      makeSeat(3, "monk", "townsfolk"),
      makeSeat(4, "poisoner", "minion"),
      makeSeat(5, "imp", "demon"),
    ];
    const res = await runFullAbilityPipeline(pipe(chefAbility), {
      actionNode: { seatId: 1, roleId: "chef" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    } as any);
    expect(res.meta.abilityResult).toBe(1);
  });

  it("醉酒时使用说书人假数字（圆形座位上限内）", async () => {
    const seats = [
      makeSeat(0, "chef", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(chefAbility), {
      actionNode: { seatId: 0, roleId: "chef" },
      targetIds: [],
      // 厨师仅首夜行动，干扰场景同样在首夜触发
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: { abilityEffective: false },
      storytellerInput: { fakeResult: 2 },
    } as any);
    expect(res.meta.abilityResult).toBe(2);
    expect(res.meta.isCorrupted).toBe(true);
  });
});
