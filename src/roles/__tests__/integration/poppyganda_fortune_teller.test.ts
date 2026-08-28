import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Record<string, any> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    statusEffects: [],
    ...overrides,
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("占卜师：探查两名玩家中是否有恶魔", () => {
  it("目标含真实恶魔 → 是", async () => {
    const seats = [
      makeSeat(0, "fortune_teller", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "imp", "demon"),
    ];
    const res = await runFullAbilityPipeline(pipe(fortuneTellerAbility), {
      actionNode: { seatId: 0, roleId: "fortune_teller" },
      targetIds: [1, 2],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    } as any);
    expect(res.meta.abilityResult).toBe(true);
  });

  it("陌客强制判定 → 可被当作恶魔", async () => {
    const seats = [
      makeSeat(0, "fortune_teller", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(3, "recluse", "outsider"),
    ];
    const res = await runFullAbilityPipeline(pipe(fortuneTellerAbility), {
      actionNode: { seatId: 0, roleId: "fortune_teller" },
      targetIds: [1, 3],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
      storytellerInput: { forceFtRecluseDemon: true },
    } as any);
    expect(res.meta.abilityResult).toBe(true);
  });

  it("醉酒时得到与真实相反的结果", async () => {
    // 额外提供一个非目标善良玩家作为干扰项，避免单例缓存串扰
    const extra = makeSeat(3, "chef", "townsfolk");
    const seats = [
      makeSeat(0, "fortune_teller", "townsfolk", {
        statusEffects: [{ type: "drunk" }],
      } as any),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      extra,
    ];
    const res = await runFullAbilityPipeline(pipe(fortuneTellerAbility), {
      actionNode: { seatId: 0, roleId: "fortune_teller" },
      targetIds: [1, 2],
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        gameId: "ft-drunk-case",
      },
      meta: { abilityEffective: false },
      storytellerInput: { boonSeatId: 3 },
    } as any);
    // 真实无恶魔（false）→ 干扰后告知「是」（true）
    expect(res.meta.abilityResult).toBe(true);
    expect(res.meta.isCorrupted).toBe(true);
  });
});
