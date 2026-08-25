import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  impAbility,
  vortoxAbility,
  legionAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【《罂粟花开》恶魔 (Demons) 1:1 官方 Wiki 原装具名范例场景测试】", () => {
  initializeAbilityRegistry();

  it("1. 小恶魔 (Imp): 自杀时转移恶魔身份给存活爪牙（投毒者）", async () => {
    const seats: any[] = [
      { id: 0, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
      { id: 1, playerName: "投毒者P", role: { id: "poisoner", name: "投毒者", type: "minion" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "imp" },
      targetIds: [0],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(impAbility as any, ctx);
    expect(res.meta.abilityResult.isSuicide).toBe(true);
  });

  it("2. 涡流 (Vortox): 镇民获取全假信息；白天无人被处决邪恶直接胜利", async () => {
    const seats: any[] = [
      { id: 0, playerName: "涡流P", role: { id: "vortox", name: "涡流", type: "demon" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "vortox" },
      targetIds: [0],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(vortoxAbility as any, ctx);
    expect(res.meta.abilityResult.vortoxActive).toBe(true);
  });

  it("3. 军团 (Legion): 多数玩家为军团；邪恶玩家占主导", async () => {
    const seats: any[] = [
      { id: 0, playerName: "军团1", role: { id: "legion", name: "军团", type: "demon" }, isDead: false, isAlive: true },
      { id: 1, playerName: "军团2", role: { id: "legion", name: "军团", type: "demon" }, isDead: false, isAlive: true },
      { id: 2, playerName: "占卜师P", role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "legion" },
      targetIds: [],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(legionAbility as any, ctx);
    expect(res.meta.abilityResult.legionActive).toBe(true);
    expect(res.meta.abilityResult.allAreDemons).toBe(true);
  });
});
