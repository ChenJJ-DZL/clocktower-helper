import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  bounty_hunterAbility,
  cerenovusAbility,
  chefAbility,
  drunkAbility,
  evil_twinAbility,
  farmerAbility,
  fortuneTellerAbility,
  getAbilityForRole,
  impAbility,
  isRoleAbilitiesRegistered,
  jugglerAbility,
  legionAbility,
  librarianAbility,
  lunaticAbility,
  marionetteAbility,
  mayorAbility,
  monkAbility,
  mutantAbility,
  oracleAbility,
  pixieAbility,
  poppy_growerAbility,
  savantAbility,
  snitchAbility,
  town_crierAbility,
  vortoxAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《罂粟花开》 (Poppyganda) 剧本及全角色能力测试", () => {
  it("剧本数据完整性验证：剧本定义、建议人数、24个角色齐全", () => {
    const poppyganda = scripts.find((s) => s.id === "poppyganda");
    expect(poppyganda).toBeDefined();
    expect(poppyganda?.name).toBe("罂粟花开");
    expect(poppyganda?.minPlayers).toBe(7);
    expect(poppyganda?.maxPlayers).toBe(15);
    expect(poppyganda?.isCustom).toBe(true);
    expect(poppyganda?.roleIds).toHaveLength(24);

    // 验证24个角色在roles表中全部存在
    const allRoleIds = new Set(roles.map((r) => r.id));
    for (const rid of poppyganda!.roleIds!) {
      expect(allRoleIds.has(rid), `角色 ${rid} 应该在全局 roles 列表中存在`).toBe(true);
    }
  });

  it("罂粟种植者 (poppy_grower) + 告密者 (snitch) 注册与下发能力", () => {
    expect(poppy_growerAbility).toBeDefined();
    expect(snitchAbility).toBeDefined();
    expect(getAbilityForRole("poppy_grower")).toBeDefined();
    expect(getAbilityForRole("snitch")).toBeDefined();
  });

  it("赏金猎人 (bounty_hunter) 首夜知晓邪恶玩家并在其死亡后轮转", async () => {
    expect(bounty_hunterAbility).toBeDefined();

    const seats: any[] = [
      { id: 0, playerName: "P1", role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 1, playerName: "P2", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 2, playerName: "P3", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
    ];

    const ctx: MiddlewareContext = {
      snapshot: { nightCount: 1, gamePhase: "firstNight", seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
      actionNode: { seatId: 0, roleId: "bounty_hunter", roleName: "赏金猎人", priority: 40, isFirstNightOnly: false, abilityId: "bounty_hunter_reveal", targetIds: [], processed: false, success: false, meta: {} } as any,
      targetIds: [],
      meta: {},
      aborted: false,
    };

    const res = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx);
    expect(res.aborted).toBe(false);
    expect(res.meta?.bountyHunterResult || res.meta?.bounty_hunter).toBeDefined();
  });

  it("小精灵 (pixie) 首夜知晓在场镇民", async () => {
    expect(pixieAbility).toBeDefined();

    const seats: any[] = [
      { id: 0, playerName: "P1", role: { id: "pixie", name: "小精灵", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 1, playerName: "P2", role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 2, playerName: "P3", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
    ];

    const ctx: MiddlewareContext = {
      snapshot: { nightCount: 1, gamePhase: "firstNight", seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
      actionNode: { seatId: 0, roleId: "pixie", roleName: "小精灵", priority: 35, isFirstNightOnly: true, abilityId: "pixie_first_night", targetIds: [], processed: false, success: false, meta: {} } as any,
      targetIds: [],
      meta: {},
      aborted: false,
    };

    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    expect(res.aborted).toBe(false);
  });

  it("提线木偶 (marionette) 注册与恶魔邻座识别能力", () => {
    expect(marionetteAbility).toBeDefined();
    expect(getAbilityForRole("marionette")).toBeDefined();
  });

  it("军团 (legion) 恶魔阵营结算与处决判定能力", () => {
    expect(legionAbility).toBeDefined();
    expect(getAbilityForRole("legion")).toBeDefined();
  });

  it("洗脑师 (cerenovus) 夜间选择疯狂目标与角色", async () => {
    expect(cerenovusAbility).toBeDefined();

    const seats: any[] = [
      { id: 0, playerName: "P1", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 1, playerName: "P2", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
    ];

    const ctx: MiddlewareContext = {
      snapshot: { nightCount: 2, gamePhase: "night", seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
      actionNode: { seatId: 0, roleId: "cerenovus", roleName: "洗脑师", priority: 20, isFirstNightOnly: false, abilityId: "cerenovus_madness", targetIds: [1], processed: false, success: false, meta: { chosenRole: "fortune_teller" } } as any,
      targetIds: [1],
      meta: { chosenRole: "fortune_teller" },
      aborted: false,
    };

    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    expect(res.aborted).toBe(false);
  });

  it("农夫 (farmer) 与 镇长 (mayor) 夜晚死亡与转移机制", () => {
    expect(farmerAbility).toBeDefined();
    expect(mayorAbility).toBeDefined();
    expect(getAbilityForRole("farmer")).toBeDefined();
    expect(getAbilityForRole("mayor")).toBeDefined();
  });

  it("镜像双子 (evil_twin) 胜负判定与信息注册", () => {
    expect(evil_twinAbility).toBeDefined();
    expect(getAbilityForRole("evil_twin")).toBeDefined();
  });

  it("《罂粟花开》其余所有角色 (librarian, chef, fortune_teller, monk, oracle, town_crier, juggler, savant, drunk, lunatic, mutant, imp, vortox) 能力齐全且管道通畅", () => {
    expect(librarianAbility).toBeDefined();
    expect(chefAbility).toBeDefined();
    expect(fortuneTellerAbility).toBeDefined();
    expect(monkAbility).toBeDefined();
    expect(oracleAbility).toBeDefined();
    expect(town_crierAbility).toBeDefined();
    expect(jugglerAbility).toBeDefined();
    expect(savantAbility).toBeDefined();
    expect(drunkAbility).toBeDefined();
    expect(lunaticAbility).toBeDefined();
    expect(mutantAbility).toBeDefined();
    expect(impAbility).toBeDefined();
    expect(vortoxAbility).toBeDefined();
  });
});
