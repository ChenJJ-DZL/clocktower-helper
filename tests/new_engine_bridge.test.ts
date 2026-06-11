/**
 * 新引擎桥接测试
 * 验证：
 * 1. abilityRegistry 正确注册了所有能力
 * 2. getRawAbilityMap 返回有效的能力映射
 * 3. 关键角色的能力可通过中间件管道执行
 */
import { describe, expect, test } from "vitest";
import {
  getRawAbilityMap,
  registerAllNewEngineAbilities,
} from "../src/roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../src/utils/middlewarePipeline";
import type { GameStateSnapshot } from "../src/utils/middlewareTypes";

describe("New Engine Ability Bridge", () => {
  // 在测试前注册所有能力
  beforeAll(() => {
    registerAllNewEngineAbilities();
  });

  test("ability registry has abilities", () => {
    const abilityMap = getRawAbilityMap();
    const keys = Object.keys(abilityMap);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBe(206); // 199-3+2(boffin+boomdandy)+8(bard+golem+hermit+liz+lloam+professor_female+psychopath+titus)=206
  });

  test("key roles have abilities registered", () => {
    const abilityMap = getRawAbilityMap();
    // 核心角色应有能力
    const expectedRoles = [
      "washerwoman",
      "chef",
      "empath",
      "investigator",
      "librarian",
      "imp",
      "poisoner",
      "soldier",
      "mayor",
    ];
    for (const roleId of expectedRoles) {
      const found = Object.keys(abilityMap).some(
        (k) => abilityMap[k].roleId === roleId
      );
      expect(found).toBe(true);
    }
  });

  test("each ability has required middleware arrays", () => {
    const abilityMap = getRawAbilityMap();
    for (const [key, ability] of Object.entries(abilityMap)) {
      expect(ability.roleId, `Ability ${key} missing roleId`).toBeTruthy();
      expect(
        ability.abilityId,
        `Ability ${key} missing abilityId`
      ).toBeTruthy();
      expect(
        Array.isArray(ability.preCheck),
        `Ability ${key} preCheck should be array`
      ).toBe(true);
      expect(
        Array.isArray(ability.calculate),
        `Ability ${key} calculate should be array`
      ).toBe(true);
      expect(
        Array.isArray(ability.stateUpdate),
        `Ability ${key} stateUpdate should be array`
      ).toBe(true);
      expect(
        Array.isArray(ability.postProcess),
        `Ability ${key} postProcess should be array`
      ).toBe(true);
    }
  });

  test("washerwoman ability pipeline executes successfully", async () => {
    const abilityMap = getRawAbilityMap();
    const washerwomanAbility = Object.values(abilityMap).find(
      (a) => a.roleId === "washerwoman"
    );
    expect(washerwomanAbility).toBeDefined();

    const snapshot: GameStateSnapshot = {
      nightCount: 1,
      seats: [
        {
          id: 0,
          role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
        {
          id: 1,
          role: { id: "chef", name: "厨师", type: "townsfolk" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
        {
          id: 2,
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
      ],
      statusEffects: {},
      gamePhase: "firstNight",
    };

    const context = {
      snapshot,
      actionNode: {
        seatId: 0,
        roleId: "washerwoman",
        roleName: "洗衣妇",
        priority: 10,
        isFirstNightOnly: true,
        abilityId: "washerwoman_first_night_ability",
        wakeMessage: "",
        wakePriority: 10,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [],
      meta: {},
      aborted: false,
    };

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility!.preCheck,
        calculate: washerwomanAbility!.calculate,
        stateUpdate: washerwomanAbility!.stateUpdate,
        postProcess: washerwomanAbility!.postProcess,
      },
      context
    );

    // 应成功执行（未中止）
    expect(result.aborted).toBe(false);
    // 应在 meta 中产生能力结果
    expect(result.meta.abilityResult).toBeDefined();
    expect(result.meta.abilityResult.roleName).toBeTruthy();
    // 应产出提示词
    expect(result.meta.prompt).toBeTruthy();
  });

  test("dead player preCheck aborts execution", async () => {
    const abilityMap = getRawAbilityMap();
    const soldierAbility = Object.values(abilityMap).find(
      (a) => a.roleId === "soldier"
    );
    expect(soldierAbility).toBeDefined();

    const snapshot: GameStateSnapshot = {
      nightCount: 1,
      seats: [
        {
          id: 0,
          role: { id: "soldier", name: "士兵", type: "townsfolk" },
          isAlive: false,
          isDead: true,
          statusEffects: [],
        },
        {
          id: 1,
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
      ],
      statusEffects: {},
      gamePhase: "night",
    };

    const context = {
      snapshot,
      actionNode: {
        seatId: 0,
        roleId: "soldier",
        roleName: "士兵",
        priority: 10,
        isFirstNightOnly: false,
        abilityId: "soldier_ability",
        wakeMessage: "",
        wakePriority: 10,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [],
      meta: {},
      aborted: false,
    };

    const result = await runFullAbilityPipeline(
      {
        preCheck: soldierAbility!.preCheck,
        calculate: soldierAbility!.calculate,
        stateUpdate: soldierAbility!.stateUpdate,
        postProcess: soldierAbility!.postProcess,
      },
      context
    );

    // 死亡玩家应被中止
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain("死亡");
  });

  test("imp demon kill pipeline can execute", async () => {
    const abilityMap = getRawAbilityMap();
    const impAbility = Object.values(abilityMap).find(
      (a) => a.roleId === "imp"
    );
    expect(impAbility).toBeDefined();

    const snapshot: GameStateSnapshot = {
      nightCount: 2,
      seats: [
        {
          id: 0,
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
        {
          id: 1,
          role: { id: "soldier", name: "士兵", type: "townsfolk" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
        {
          id: 2,
          role: { id: "mayor", name: "镇长", type: "townsfolk" },
          isAlive: true,
          isDead: false,
          statusEffects: [],
        },
      ],
      statusEffects: {},
      gamePhase: "night",
    };

    const context = {
      snapshot,
      actionNode: {
        seatId: 0,
        roleId: "imp",
        roleName: "小恶魔",
        priority: 50,
        isFirstNightOnly: false,
        abilityId: "imp_night_ability",
        wakeMessage: "",
        wakePriority: 50,
        targetIds: [1],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [1],
      meta: {},
      aborted: false,
    };

    const result = await runFullAbilityPipeline(
      {
        preCheck: impAbility!.preCheck,
        calculate: impAbility!.calculate,
        stateUpdate: impAbility!.stateUpdate,
        postProcess: impAbility!.postProcess,
      },
      context
    );

    // 小恶魔应有可执行的管道
    expect(result).toBeDefined();
  });
});
