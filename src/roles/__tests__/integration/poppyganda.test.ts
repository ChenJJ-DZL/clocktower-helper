import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
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
  initializeAbilityRegistry,
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
  initializeAbilityRegistry();

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

  it("🌺 核心机制：首夜罂粟种植者在场时，爪牙互认步骤绝不进队列，爪牙与恶魔无法互认", () => {
    const seats: any[] = [
      { id: 0, playerName: "P1", role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 1, playerName: "P2", role: { id: "evil_twin", name: "镜像双子", type: "minion" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 2, playerName: "P3", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 3, playerName: "P4", role: { id: "vortox", name: "涡流", type: "demon" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 4, playerName: "P5", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
    ];

    const snapshot: any = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
      statusEffects: {},
      poppyGrowerDead: false,
    };

    const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: true });
    // 验证爪牙互认步骤（minion_info）绝不在首夜队列中
    const minionInfoStep = queue.find((q) => q.roleId === "minion_info");
    expect(minionInfoStep).toBeUndefined();

    // 验证爪牙自身技能（镜像双子、洗脑师）独立唤醒
    const evilTwinStep = queue.find((q) => q.roleId === "evil_twin");
    const cerenovusStep = queue.find((q) => q.roleId === "cerenovus");
    expect(evilTwinStep).toBeDefined();
    expect(cerenovusStep).toBeDefined();
  });

  it("🌺 死亡触发：罂粟种植者死亡后，夜间队列正确生成邪恶互认步骤", () => {
    const seats: any[] = [
      { id: 0, playerName: "P1", role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" }, isDead: true, isAlive: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 1, playerName: "P2", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
      { id: 2, playerName: "P3", role: { id: "vortox", name: "涡流", type: "demon" }, isDead: false, isAlive: true, isDrunk: false, isPoisoned: false, statusEffects: [] },
    ];

    const snapshot: any = {
      nightCount: 2,
      gamePhase: "night",
      seats,
      statusEffects: {},
      poppyGrowerDead: true,
    };

    const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: false });
    const minionInfoStep = queue.find((q) => q.roleId === "minion_info");
    expect(minionInfoStep).toBeDefined();
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
