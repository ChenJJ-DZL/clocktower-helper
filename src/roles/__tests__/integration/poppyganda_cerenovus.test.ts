import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { cerenovusAbility } from "../../new_engine/cerenovus.ability";

/**
 * 洗脑师（Cerenovus）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 18.洗脑师）：
 *   "每个夜晚，你要选择一名玩家和一个善良角色。
 *    他明天白天和夜晚需要"疯狂"地证明自己是这个角色，
 *    不然他可能被处决。"
 *
 * 实现：新引擎 cerenovusAbility（targetIds + storytellerInput.roleName）
 */

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
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("洗脑师：每夜选择目标 + 善良角色", () => {
  it("夜晚选择目标玩家 + 善良角色 → cerenovusMadnessRole 字段写入", async () => {
    const seats: Seat[] = [
      makeSeat(0, "cerenovus", "minion"),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "cerenovus" },
      targetIds: [1], // 选 1 号 fortune_teller
      snapshot: { seats, gamePhase: "night", nightCount: 1 },
      meta: {},
      storytellerInput: { roleName: "monk" }, // 善良角色 monk
    };
    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    // 1 号 fortune_teller 应被标记为需扮演"monk"
    const ft = (res.snapshot.seats as any[]).find((s) => s.id === 1);
    expect(ft?.cerenovusMadnessRole).toBe("monk");
    expect(ft?.statusDetails?.[0]).toContain("洗脑疯狂:monk");
  });

  it("选择自己（洗脑师）无效（preCheck 拒绝）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "cerenovus", "minion"),
      makeSeat(1, "fortune_teller", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "cerenovus" },
      targetIds: [0], // 选自己
      snapshot: { seats, gamePhase: "night", nightCount: 1 },
      meta: {},
      storytellerInput: { roleName: "monk" },
    };
    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    // 自己不应被洗脑（preCheck 拒绝）
    expect(res.aborted).toBe(true);
    const cer = (res.snapshot.seats as any[]).find((s) => s.id === 0);
    expect(cer?.cerenovusMadnessRole).toBeUndefined();
  });

  it("可对邪恶玩家洗脑（虽然官方建议避免）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "cerenovus", "minion"),
      makeSeat(1, "imp", "demon"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "cerenovus" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 1 },
      meta: {},
      storytellerInput: { roleName: "monk" },
    };
    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    // 邪恶玩家也可以被洗脑（cerenovus 唯一限制是不能选自己）
    const imp = (res.snapshot.seats as any[]).find((s) => s.id === 1);
    expect(imp?.cerenovusMadnessRole).toBe("monk");
  });
});
