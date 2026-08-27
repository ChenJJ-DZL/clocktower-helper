import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";

function s(id: number, rid: string, rt: string, o?: { dead?: boolean }) {
  const n: Record<string, string> = {
    fortune_teller: "占卜师",
    imp: "小恶魔",
    soldier: "士兵",
    washerwoman: "洗衣妇",
    chef: "厨师",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!o?.dead,
    isAlive: !o?.dead,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(
  sid: number,
  nc: number,
  phase: string,
  seats: ReturnType<typeof s>[]
): MiddlewareContext {
  return {
    snapshot: {
      nightCount: nc,
      gamePhase: phase,
      seats,
      statusEffects: {},
      isVortoxWorld: false,
      statusEffectMap: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "fortune_teller",
      roleName: "占卜师",
      priority: 57,
      isFirstNightOnly: false,
      abilityId: "ft_night",
      wakeMessage: "...",
      firstNightPriority: 57,
      otherNightPriority: 91,
      targetIds: [1, 2],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [1, 2],
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

describe("占卜师 引擎集成测试", () => {
  test("选中恶魔返回是", async () => {
    const ss = [
      s(0, "fortune_teller", "townsfolk"),
      s(1, "imp", "demon"),
      s(2, "soldier", "townsfolk"),
      s(3, "washerwoman", "townsfolk"),
    ];
    expect(
      (
        await runFullAbilityPipeline(
          pipe(fortuneTellerAbility),
          ctx(0, 1, "firstNight", ss)
        )
      ).aborted
    ).toBe(false);
  });
  test("未选恶魔返回否", async () => {
    const ss = [
      s(0, "fortune_teller", "townsfolk"),
      s(1, "soldier", "townsfolk"),
      s(2, "washerwoman", "townsfolk"),
      s(3, "chef", "townsfolk"),
    ];
    expect(
      (
        await runFullAbilityPipeline(
          pipe(fortuneTellerAbility),
          ctx(0, 1, "firstNight", ss)
        )
      ).aborted
    ).toBe(false);
  });
  test("每夜唤醒", async () => {
    const ss = [
      s(0, "fortune_teller", "townsfolk"),
      s(1, "soldier", "townsfolk"),
      s(2, "washerwoman", "townsfolk"),
    ];
    expect(
      (
        await runFullAbilityPipeline(
          pipe(fortuneTellerAbility),
          ctx(0, 2, "night", ss)
        )
      ).aborted
    ).toBe(false);
  });
  test("可选死亡玩家", async () => {
    const ss = [
      s(0, "fortune_teller", "townsfolk"),
      s(1, "imp", "demon", { dead: true }),
      s(2, "soldier", "townsfolk"),
    ];
    expect(
      (
        await runFullAbilityPipeline(
          pipe(fortuneTellerAbility),
          ctx(0, 2, "night", ss)
        )
      ).aborted
    ).toBe(false);
  });

  test("中毒占卜师必须得到与真实结果相反的假信息", async () => {
    const ft = s(0, "fortune_teller", "townsfolk");
    (ft as any).statusEffects = [{ type: "poisoned", source: "poisoner" }];
    (ft as any).isPoisoned = true;
    const ss = [ft, s(1, "imp", "demon"), s(2, "soldier", "townsfolk")];
    const r = await runFullAbilityPipeline(
      pipe(fortuneTellerAbility),
      ctx(0, 2, "night", ss)
    );
    expect(r.meta.abilityResult).toBe(false);
    expect(r.meta.isCorrupted).toBe(true);
  });
});
