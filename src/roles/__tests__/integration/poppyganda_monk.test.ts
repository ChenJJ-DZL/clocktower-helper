import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { monkAbility } from "../../new_engine/monk.ability";

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

describe("僧侣：夜晚保护一名玩家", () => {
  it("保护生效：目标获得 protected 标记", async () => {
    const seats = [
      makeSeat(0, "monk", "townsfolk"),
      makeSeat(1, "fortune_teller", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(monkAbility), {
      actionNode: { seatId: 0, roleId: "monk" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    } as any);
    const target = (res.snapshot.seats as any[]).find((s) => s.id === 1);
    expect(target?.statusEffects ?? []).toContainEqual(
      expect.objectContaining({ type: "protected" })
    );
    expect(res.meta.monkResult.isProtected).toBe(true);
  });

  it("首夜不唤醒（僧侣从第二夜开始行动）", async () => {
    const seats = [
      makeSeat(0, "monk", "townsfolk"),
      makeSeat(1, "fortune_teller", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(monkAbility), {
      actionNode: { seatId: 0, roleId: "monk" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    } as any);
    expect(res.aborted).toBe(true);
  });

  it("僧侣醉酒时保护无效，但仍选择目标", async () => {
    const drunkMonk = makeSeat(0, "monk", "townsfolk");
    (drunkMonk as any).statusEffects = [{ type: "drunk" }];
    const seats = [drunkMonk, makeSeat(1, "fortune_teller", "townsfolk")];
    const res = await runFullAbilityPipeline(pipe(monkAbility), {
      actionNode: { seatId: 0, roleId: "monk" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    } as any);
    expect(res.meta.monkResult.isProtected).toBe(false);
    const target = (res.snapshot.seats as any[]).find((s) => s.id === 1);
    expect(target?.isProtected).toBeFalsy();
  });
});
