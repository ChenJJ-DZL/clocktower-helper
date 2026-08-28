import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { farmerAbility } from "../../new_engine/farmer.ability";

function makeSeat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    hasAbilityEvenDead: false,
    acquiredAbilities: [],
    statusDetails: [],
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("农夫：夜晚死亡时传承农夫身份", () => {
  it("夜晚死亡 + 指定 2 号 → 2 号变为农夫", async () => {
    const farmer = makeSeat(0, "farmer", "townsfolk");
    (farmer as any).isDead = true; // 当晚已死亡
    const seats = [
      farmer,
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(farmerAbility), {
      actionNode: { seatId: 0, roleId: "farmer" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [0],
      },
      meta: {},
      storytellerInput: { newFarmerSeatId: 2 },
    } as any);
    const newFarmer = (res.snapshot.seats as any[]).find((s) => s.id === 2);
    expect(newFarmer?.role?.id).toBe("farmer");
    expect(newFarmer?.statusDetails).toContain("成为新农夫");
  });

  it("农夫中毒时不传承", async () => {
    const farmer = makeSeat(0, "farmer", "townsfolk");
    (farmer as any).isDead = true;
    (farmer as any).statusEffects = [{ type: "poisoned" }];
    const seats = [
      farmer,
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(farmerAbility), {
      actionNode: { seatId: 0, roleId: "farmer" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [0],
      },
      meta: {},
      storytellerInput: { newFarmerSeatId: 2 },
    } as any);
    expect((res.snapshot.seats as any[])[2].role?.id).toBe("monk");
    expect(res.meta.abilityResult.hasTransfer).toBe(false);
  });
});
