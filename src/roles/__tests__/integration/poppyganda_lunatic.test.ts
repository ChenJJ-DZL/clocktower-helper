import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { lunaticAbility } from "../../new_engine/lunatic.ability";

/**
 * 疯子（Lunatic）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 15.疯子）：
 *   "你以为你是一个恶魔，但其实你不是。
 *    恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。"
 *
 * 实现（假击杀 + 假恶魔身份）：
 *   - 真实身份：疯子（外来者）
 *   - 假象身份：apparentDemonRole 决定的恶魔
 *   - 每夜按 apparentDemonId 时序唤醒，选择目标（fakeKill: true）
 */

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
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    apparentDemonRole: null,
    statusDetails: [],
    ...overrides,
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("疯子：每夜假击杀（apparentDemonRole 决定时序）", () => {
  it("apparentDemonRole=imp → 单选 1 名目标", async () => {
    const seats: Seat[] = [
      makeSeat(0, "lunatic", "outsider", {
        apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
      }),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(3, "poisoner", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "lunatic" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(lunaticAbility), ctx);
    const r = res.meta.abilityResult as any;
    // imp 类恶魔只选 1 名
    expect(r.targetIds).toEqual([1]);
    expect(r.apparentDemonId).toBe("imp");
    expect(r.fakeKill).toBe(true);
    expect(r.realKill).toBe(false);

    // ⚠️⚠️ 防假绿补强（2026-09-21 变异检验实测）：
    //   旧版只断言 **calculate 阶段**的 `meta.abilityResult` ——
    //   把 stateUpdate 里写座位的 `lunaticTarget/lunaticTargetIds` 删掉，本文件照样绿。
    //   而 A4 关键恰恰是**写进行动者座位**（executeViaNewEngine 的状态合并是
    //   `{...prev, ...updatedSeat}`，只有写进 snapshot.seats 才能同步回 React），
    //   否则真恶魔的技能确认页/说书人控制台读不到「疯子攻击了谁」。
    const actor = (res.snapshot.seats as any[]).find((s) => s.id === 0);
    expect(
      actor?.lunaticTarget,
      "❌ 未把疯子本夜目标写进**行动者座位** —— 真恶魔看不到疯子攻击了谁（A4 回归）"
    ).toBe(1);
    expect(
      actor?.lunaticTargetIds,
      "❌ 未把疯子本夜目标列表写进行动者座位"
    ).toEqual([1]);

    // 疯子绝不真正杀人：目标座位不得被标记死亡
    const target = (res.snapshot.seats as any[]).find((s) => s.id === 1);
    expect(
      target?.isDead,
      "❌ 疯子是假击杀，目标绝不能被标记死亡 —— 否则等于多了一个真恶魔"
    ).toBeFalsy();
  });

  it("apparentDemonRole=shabaloth → 选 2 名目标", async () => {
    const seats: Seat[] = [
      makeSeat(0, "lunatic", "outsider", {
        apparentDemonRole: { id: "shabaloth", name: "沙巴洛斯", type: "demon" },
      }),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "lunatic" },
      targetIds: [1, 2],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(lunaticAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.apparentDemonId).toBe("shabaloth");
    expect(r.targetIds).toEqual([1, 2]);
  });

  it("疯子死亡时能力失效（preCheck aborted）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "lunatic", "outsider", {
        apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: true,
      }),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "lunatic" },
      targetIds: [],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(lunaticAbility), ctx);
    expect(res.aborted).toBe(true);
  });
});
