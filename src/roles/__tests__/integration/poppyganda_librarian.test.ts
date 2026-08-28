import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { librarianAbility } from "../../new_engine/librarian.ability";

function makeSeat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusDetails: [],
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("图书管理员：首夜得知外来者信息", () => {
  it("说书人指定结果 → 原样输出两名玩家与外来者角色", async () => {
    const seats = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "drunk", "outsider"),
      makeSeat(3, "monk", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(librarianAbility), {
      actionNode: { seatId: 0, roleId: "librarian" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
      storytellerInput: {
        overrideResult: { seat1: 1, seat2: 2, roleName: "drunk" },
      },
    } as any);
    expect(res.meta.abilityResult).toEqual({
      seat1: 1,
      seat2: 2,
      roleName: "drunk",
    });
  });

  it("醉酒时采用说书人预设的假信息并标记干扰", async () => {
    const seats = [makeSeat(0, "librarian", "townsfolk")];
    const res = await runFullAbilityPipeline(pipe(librarianAbility), {
      actionNode: { seatId: 0, roleId: "librarian" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: { seat1: 1, seat2: 3, roleName: "butler" },
      },
    } as any);
    expect(res.meta.abilityResult).toEqual({
      seat1: 1,
      seat2: 3,
      roleName: "butler",
    });
    expect(res.meta.isCorrupted).toBe(true);
  });
});
