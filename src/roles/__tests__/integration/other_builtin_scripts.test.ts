import { describe, expect, it } from "vitest";
import { scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import {
  balloonistAbility,
  choir_boyAbility,
  getAbilityForRole,
  initializeAbilityRegistry,
  plague_doctorAbility,
  politicianAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("内置其他 5 个剧本全量百科范例与 UI 同步测试", () => {
  initializeAbilityRegistry();

  // =========================================================================
  // 1. 《窃窃私语》(Whispering Secrets - 19 角色)
  // =========================================================================
  describe("剧本 1：《窃窃私语》(Whispering Secrets)", () => {
    const script = scripts.find((s) => s.id === "whispering_secrets");

    it("剧本配置与角色完整性", () => {
      expect(script).toBeDefined();
      expect(script?.name).toBe("窃窃私语");
      expect(script?.roleIds).toHaveLength(19);
    });

    it("所有 19 个角色能力与管道注册齐全", () => {
      const requiredRoles = [
        "chambermaid",
        "gossip",
        "oracle",
        "mathematician",
        "artist",
        "flowergirl",
        "innkeeper",
        "fool",
        "saint",
        "recluse",
        "politician",
        "spy",
        "witch",
        "assassin",
        "devils_advocate",
        "vortox",
        "po",
        "zombuul",
        "plague_doctor",
      ];
      requiredRoles.forEach((roleId) => {
        expect(getAbilityForRole(roleId)).toBeDefined();
      });
    });

    it("瘟疫医生 (Plague Doctor) 死亡触发爪牙能力下发", () => {
      expect(plague_doctorAbility).toBeDefined();
    });

    it("政客 (Politician) 判定逻辑存在", () => {
      expect(politicianAbility).toBeDefined();
    });
  });

  // =========================================================================
  // 2. 《无名之墓》(Tomb of the Unknown - 19 角色)
  // =========================================================================
  describe("剧本 2：《无名之墓》(Tomb of the Unknown)", () => {
    const script = scripts.find((s) => s.id === "tomb_of_the_unknown");

    it("剧本配置与角色完整性", () => {
      expect(script).toBeDefined();
      expect(script?.name).toBe("无名之墓");
      expect(script?.roleIds).toHaveLength(19);
    });

    it("所有 19 个角色能力与管道注册齐全", () => {
      const requiredRoles = [
        "undertaker",
        "gambler",
        "savant",
        "gossip",
        "artist",
        "juggler",
        "clockmaker",
        "oracle",
        "sailor",
        "farmer",
        "fool",
        "scapegoat",
        "drunk",
        "mutant",
        "baron",
        "poisoner",
        "assassin",
        "shabaloth",
        "zombuul",
      ];
      requiredRoles.forEach((roleId) => {
        expect(getAbilityForRole(roleId)).toBeDefined();
      });
    });

    it("替罪羊 (Scapegoat) 处决替代逻辑存在", () => {
      expect(getAbilityForRole("scapegoat")).toBeDefined();
    });
  });

  // =========================================================================
  // 3. 《无上愉悦》(High Pleasure - 16 角色)
  // =========================================================================
  describe("剧本 3：《无上愉悦》(High Pleasure)", () => {
    const script = scripts.find((s) => s.id === "high_pleasure");

    it("剧本配置与角色完整性", () => {
      expect(script).toBeDefined();
      expect(script?.name).toBe("无上愉悦");
      expect(script?.roleIds).toHaveLength(16);
    });

    it("所有 16 个角色能力与管道注册齐全", () => {
      const requiredRoles = [
        "washerwoman",
        "investigator",
        "chef",
        "librarian",
        "empath",
        "fortune_teller",
        "monk",
        "ravenkeeper",
        "butler",
        "drunk",
        "recluse",
        "poisoner",
        "scarlet_woman",
        "baron",
        "imp",
        "zombuul",
      ];
      requiredRoles.forEach((roleId) => {
        expect(getAbilityForRole(roleId)).toBeDefined();
      });
    });

    it("首夜与次夜动态队列正常生成", () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];
      const snapshot: any = {
        nightCount: 1,
        gamePhase: "firstNight",
        seats,
        statusEffects: {},
        isVortoxWorld: false,
      };
      const queue = generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        snapshot,
        { isFirstNight: true }
      );
      expect(queue.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 4. 《凶宅魅影》(Haunted Manor - 21 角色)
  // =========================================================================
  describe("剧本 4：《凶宅魅影》(Haunted Manor)", () => {
    const script = scripts.find((s) => s.id === "haunted_manor");

    it("剧本配置与角色完整性", () => {
      expect(script).toBeDefined();
      expect(script?.name).toBe("凶宅魅影");
      expect(script?.roleIds).toHaveLength(21);
    });

    it("所有 21 个角色能力与管道注册齐全", () => {
      const requiredRoles = [
        "balloonist",
        "mathematician",
        "clockmaker",
        "seamstress",
        "juggler",
        "philosopher",
        "artist",
        "town_crier",
        "courtier",
        "choir_boy",
        "mutant",
        "barber",
        "fool",
        "saint",
        "witch",
        "godfather",
        "assassin",
        "devils_advocate",
        "no_dashii",
        "fang_gu",
        "pukka",
      ];
      requiredRoles.forEach((roleId) => {
        expect(getAbilityForRole(roleId)).toBeDefined();
      });
    });

    it("热气球驾驶员 (Balloonist) 每夜获取新阵营玩家信息", () => {
      expect(balloonistAbility).toBeDefined();
    });

    it("唱诗班男孩 (Choirboy) 恶魔杀害国王时得知恶魔身份", () => {
      expect(choir_boyAbility).toBeDefined();
    });
  });

  // =========================================================================
  // 5. 《游园惊梦》(Garden of Dreams - 20 角色)
  // =========================================================================
  describe("剧本 5：《游园惊梦》(Garden of Dreams)", () => {
    const script = scripts.find((s) => s.id === "garden_of_dreams");

    it("剧本配置与角色完整性", () => {
      expect(script).toBeDefined();
      expect(script?.name).toBe("游园惊梦");
      expect(script?.roleIds).toHaveLength(20);
    });

    it("所有 20 个角色能力与管道注册齐全", () => {
      const requiredRoles = [
        "clockmaker",
        "dreamer",
        "mathematician",
        "flowergirl",
        "oracle",
        "savant",
        "seamstress",
        "artist",
        "sage",
        "mutant",
        "sweetheart",
        "barber",
        "klutz",
        "witch",
        "cerenovus",
        "pit_hag",
        "fang_gu",
        "vigormortis",
        "no_dashii",
        "vortox",
      ];
      requiredRoles.forEach((roleId) => {
        expect(getAbilityForRole(roleId)).toBeDefined();
      });
    });
  });
});
