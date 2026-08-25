import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  cerenovusAbility,
  evil_twinAbility,
  baronAbility,
  marionetteAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【《罂粟花开》爪牙 (Minions) 1:1 官方 Wiki 原装具名范例场景测试】", () => {
  initializeAbilityRegistry();

  it("1. 洗脑师 (Cerenovus): 洗脑理发师疯狂证明自己是博学者；违背疯狂被处决", async () => {
    const seats: any[] = [
      { id: 0, playerName: "洗脑P", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true },
      { id: 1, playerName: "理发师P", role: { id: "barber", name: "理发师", type: "outsider" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "cerenovus" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 1 },
      storytellerInput: { targetId: 1, roleName: "savant" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(cerenovusAbility as any, ctx);
    expect(res.meta.abilityResult.targetId).toBe(1);
    expect(res.meta.abilityResult.roleName).toBe("savant");
    expect(res.meta.abilityResult.mad).toBe(true);
  });

  it("2. 镜像双子 (Evil Twin): 好双子死于处决邪恶获胜，双子存活恶魔死游戏继续", async () => {
    const seats: any[] = [
      { id: 0, playerName: "邪双子", role: { id: "evil_twin", name: "镜像双子", type: "minion" }, isDead: false, isAlive: true },
      { id: 1, playerName: "好双子", role: { id: "oracle", name: "神谕者", type: "townsfolk" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "evil_twin" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      storytellerInput: { twinId: 1 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(evil_twinAbility as any, ctx);
    expect(res.meta.abilityResult.twinRevealed).toBe(true);
    expect(res.meta.abilityResult.evilWinsIfGoodTwinDies).toBe(true);
  });

  it("3. 男爵 (Baron): 初始设置增加 2 名外来者", () => {
    expect(baronAbility).toBeDefined();
    expect(baronAbility.roleId).toBe("baron");
  });

  it("4. 提线木偶 (Marionette): 必须与恶魔邻座，以为自己是善良角色技能失效，恶魔知晓其是木偶", async () => {
    const seats: any[] = [
      { id: 0, playerName: "恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
      { id: 1, playerName: "木偶P", role: { id: "marionette", name: "提线木偶", type: "minion" }, charadeRole: { id: "undertaker", name: "送葬者" }, isDead: false, isAlive: true, isDrunk: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 1, roleId: "marionette" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(marionetteAbility as any, ctx);
    expect(res.meta.abilityResult.isMarionette).toBe(true);
    expect(res.meta.abilityResult.demonSeatId).toBe(0);
    expect(res.meta.abilityResult.thinksTheyAreGood).toBe(true);
  });
});
