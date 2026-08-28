import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { oracleAbility } from "../../new_engine/oracle.ability";

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
    ...overrides,
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("神谕者：得知死亡邪恶玩家数量", () => {
  it("死亡名单中有 1 名邪恶 → finalCount = 1", async () => {
    const seats = [
      makeSeat(0, "oracle", "townsfolk"),
      makeSeat(1, "imp", "demon", { isDead: true }),
      makeSeat(2, "washerwoman", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(oracleAbility), {
      actionNode: { seatId: 0, roleId: "oracle" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [1],
      },
      meta: {},
    } as any);
    expect(res.meta.abilityResult.deadEvilCount).toBe(1);
    expect(res.meta.abilityResult.finalCount).toBe(1);
  });

  it("涡流局：以说书人错误数字反相展示", async () => {
    const seats = [
      makeSeat(0, "oracle", "townsfolk"),
      makeSeat(1, "imp", "demon", { isDead: true }),
      makeSeat(2, "washerwoman", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(oracleAbility), {
      actionNode: { seatId: 0, roleId: "oracle" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [1],
        isVortoxWorld: true,
      },
      meta: {},
      storytellerInput: { fakeResult: 2 },
    } as any);
    expect(res.meta.abilityResult.deadEvilCount).toBe(1);
    expect(res.meta.abilityResult.finalCount).toBe(2);
  });
});
