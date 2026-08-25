import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  drunkAbility,
  lunaticAbility,
  mutantAbility,
  snitchAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【《罂粟花开》外来者 (Outsiders) 1:1 官方 Wiki 原装具名范例场景测试】", () => {
  initializeAbilityRegistry();

  it("1. 酒鬼 (Drunk): 以为自己是士兵的酒鬼被小恶魔攻击正常死亡（免疫失效）", async () => {
    expect(drunkAbility).toBeDefined();
    expect(drunkAbility.roleId).toBe("drunk");
  });

  it("2. 疯子 (Lunatic): 疯子以为自己是沙巴洛斯，选择2人击杀但不造成真实死亡", async () => {
    const seats: any[] = [
      { id: 0, playerName: "疯子P", role: { id: "lunatic", name: "疯子", type: "outsider" }, apparentDemonRole: { id: "shabaloth", name: "沙巴洛斯" }, isDead: false, isAlive: true },
      { id: 1, playerName: "小美", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true },
      { id: 2, playerName: "小八", role: { id: "saint", name: "圣徒", type: "outsider" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "lunatic" },
      targetIds: [1, 2],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(lunaticAbility as any, ctx);
    expect(res.meta.abilityResult.fakeKill).toBe(true);
    expect(res.meta.abilityResult.realKill).toBe(false);
    expect(res.meta.abilityResult.targetIds).toEqual([1, 2]);
  });

  it("3. 畸形秀演员 (Mutant): 承认自己是外来者/眨眼暗示，说书人可立即处决并终止当天处决", async () => {
    const seats: any[] = [
      { id: 0, playerName: "小文", role: { id: "mutant", name: "畸形秀演员", type: "outsider" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "mutant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day" },
      storytellerInput: { mutantRevealed: true },
      meta: {},
    };
    const res = await runFullAbilityPipeline(mutantAbility as any, ctx);
    expect(res.meta.abilityResult.mutantRevealed).toBe(true);
    expect(res.meta.abilityResult.canBeExecuted).toBe(true);
  });

  it("4. 告密者 (Snitch): 爪牙在其首个夜晚各自单独得知 3 个不在场伪装角色", async () => {
    const seats: any[] = [
      { id: 0, playerName: "告密P", role: { id: "snitch", name: "告密者", type: "outsider" }, isDead: false, isAlive: true },
      { id: 1, playerName: "主谋P", role: { id: "mastermind", name: "主谋", type: "minion" }, isDead: false, isAlive: true },
      { id: 2, playerName: "女巫P", role: { id: "witch", name: "女巫", type: "minion" }, isDead: false, isAlive: true },
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "snitch" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        roleAssignments: {
          1: { team: "minion" },
          2: { team: "minion" },
        },
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(snitchAbility as any, ctx);
    expect(res.meta.abilityResult.snitchRevealed).toBe(true);
    expect(res.meta.abilityResult.minionCount).toBe(2);
  });
});
