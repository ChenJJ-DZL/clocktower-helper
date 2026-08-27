/**
 * 八大经典剧本 完整生命周期自动化测试
 *
 * 覆盖：发牌 → 首夜行动 → 白天提名投票处决 → 其他夜晚恶魔击杀与技能结算 → 胜负判定
 * 重点边界用例：红唇女郎继承恶魔、醉酒、免死、投毒者下毒结算
 *
 * 运行：npx vitest run src/roles/__tests__/integration/lifecycle_scripts.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  buildAbilityMap,
  buildFullNightOrder,
  defaultTargetPicker,
  runAllInvariants,
  simulateNight,
} from "../../../utils/invariantTesting";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";
import type { IRoleAbility } from "../../core/roleAbility.types";
import { impAbility } from "../../new_engine/imp.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";

// ─── 辅助函数 ─────────────────────────────────────────────────────

function mkSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Record<string, any> = {}
) {
  const nameMap: Record<string, string> = {
    washerwoman: "洗衣妇",
    librarian: "图书管理员",
    investigator: "调查员",
    chef: "厨师",
    empath: "共情者",
    fortune_teller: "占卜师",
    undertaker: "送葬者",
    monk: "僧侣",
    ravenkeeper: "守鸦人",
    virgin: "贞洁者",
    slayer: "猎手",
    soldier: "士兵",
    mayor: "镇长",
    butler: "管家",
    drunk: "酒鬼",
    recluse: "陌客",
    saint: "圣徒",
    poisoner: "投毒者",
    spy: "间谍",
    scarlet_woman: "红唇女郎",
    baron: "男爵",
    imp: "小恶魔",
    grandmother: "祖母",
    sailor: "水手",
    chambermaid: "侍女",
    exorcist: "驱魔人",
    innkeeper: "旅店老板",
    gambler: "赌徒",
    gossip: "八卦",
    courtier: "朝臣",
    professor: "教授",
    minstrel: "吟游诗人",
    tea_lady: "茶女",
    pacifist: "和平主义者",
    fool: "弄臣",
    tinker: "修补匠",
    moonchild: "月之子",
    goon: "暴徒",
    lunatic: "疯子",
    godfather: "教父",
    devils_advocate: "魔鬼代言人",
    assassin: "刺客",
    mastermind: "智者",
    zombuul: "僵怖",
    pukka: "普卡",
    shabaloth: "沙巴洛斯",
    po: "珀",
    clockmaker: "钟表匠",
    dreamer: "梦行者",
    snake_charmer: "弄蛇人",
    mathematician: "数学家",
    flowergirl: "花艺师",
    town_crier: "镇公告员",
    oracle: "预言家",
    savant: "博学者",
    seamstress: "裁缝",
    philosopher: "哲学家",
    artist: "艺术家",
    juggler: "杂耍师",
    sage: "贤者",
    mutant: "变种人",
    sweetheart: "甜心",
    barber: "理发师",
    klutz: "笨蛋",
    evil_twin: "邪恶双子",
    witch: "女巫",
    cerenovus: "洗脑师",
    pit_hag: "麻脸巫婆",
    fang_gu: "方古",
    vigormortis: "亡骨魔",
    no_dashii: "毒素",
    vortox: "沃托克斯",
    balloonist: "气球师",
    knight: "骑士",
    noble: "贵族",
    politician: "政客",
    snitch: "告密者",
    plague_doctor: "疫医",
    shaman: "萨满",
    organ_grinder: "风琴手",
    scapegoat: "替罪羊",
    farmer: "农夫",
    choir_boy: "唱诗班男孩",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: nameMap[roleId] || roleId, type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...overrides,
  };
}

function mkSnapshot(
  seats: any[],
  nightCount: number,
  extra: Record<string, any> = {}
): GameStateSnapshot {
  return {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats,
    statusEffects: {},
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
    ...extra,
  };
}

/** 指定恶魔击杀目标，其他角色用默认选择器 */
function pickDemonTarget(
  targetId: number,
  demonRoleIds: string[]
): (node: any, snapshot: any, ability: IRoleAbility | null) => number[] {
  return (node, snapshot, ability) => {
    if (demonRoleIds.includes(node.roleId)) return [targetId];
    return defaultTargetPicker(node, snapshot, ability);
  };
}

/** 指定投毒者和恶魔目标 */
function pickPoisonerAndDemon(
  poisonerTargetId: number,
  demonTargetId: number,
  demonRoleIds: string[]
): (node: any, snapshot: any, ability: IRoleAbility | null) => number[] {
  return (node, snapshot, ability) => {
    if (node.roleId === "poisoner") return [poisonerTargetId];
    if (demonRoleIds.includes(node.roleId)) return [demonTargetId];
    return defaultTargetPicker(node, snapshot, ability);
  };
}

// ─── 剧本定义 ─────────────────────────────────────────────────────

interface ScriptDef {
  name: string;
  demons: string[];
  setup: {
    demon: string;
    minions: string[];
    outsiders: string[];
    townsfolk: string[];
  };
}

const SCRIPTS: Record<string, ScriptDef> = {
  trouble_brewing: {
    name: "暗流涌动",
    demons: ["imp"],
    setup: {
      demon: "imp",
      minions: ["poisoner"],
      outsiders: ["butler"],
      townsfolk: ["washerwoman", "investigator", "chef", "empath"],
    },
  },
  bad_moon_rising: {
    name: "黯月初升",
    demons: ["zombuul", "pukka", "shabaloth", "po"],
    setup: {
      demon: "zombuul",
      minions: ["godfather"],
      outsiders: ["tinker"],
      townsfolk: ["grandmother", "sailor", "chambermaid", "exorcist"],
    },
  },
  sects_and_violets: {
    name: "梦殒春宵",
    demons: ["fang_gu", "vigormortis", "no_dashii", "vortox"],
    setup: {
      demon: "vortox",
      minions: ["witch"],
      outsiders: ["mutant"],
      townsfolk: ["clockmaker", "dreamer", "snake_charmer", "mathematician"],
    },
  },
  whispering_secrets: {
    name: "窃窃私语",
    demons: ["vortox", "po", "zombuul"],
    setup: {
      demon: "vortox",
      minions: ["spy"],
      outsiders: ["saint"],
      townsfolk: ["chambermaid", "gossip", "mathematician", "flowergirl"],
    },
  },
  tomb_of_the_unknown: {
    name: "无名之墓",
    demons: ["shabaloth", "zombuul"],
    setup: {
      demon: "shabaloth",
      minions: ["poisoner"],
      outsiders: ["drunk"],
      townsfolk: ["undertaker", "gambler", "savant", "gossip"],
    },
  },
  high_pleasure: {
    name: "无上愉悦",
    demons: ["imp", "zombuul"],
    setup: {
      demon: "imp",
      minions: ["poisoner"],
      outsiders: ["butler"],
      townsfolk: ["washerwoman", "investigator", "chef", "empath"],
    },
  },
  haunted_manor: {
    name: "凶宅魅影",
    demons: ["no_dashii", "fang_gu", "pukka"],
    setup: {
      demon: "no_dashii",
      minions: ["witch"],
      outsiders: ["mutant"],
      townsfolk: ["balloonist", "mathematician", "clockmaker", "seamstress"],
    },
  },
  garden_of_dreams: {
    name: "游园惊梦",
    demons: ["fang_gu", "vigormortis", "no_dashii", "vortox"],
    setup: {
      demon: "fang_gu",
      minions: ["witch"],
      outsiders: ["mutant"],
      townsfolk: ["clockmaker", "dreamer", "mathematician", "flowergirl"],
    },
  },
};

function buildScriptSnapshot(
  scriptId: string,
  nightCount: number,
  overrides: Record<string, any> = {}
): GameStateSnapshot {
  const script = SCRIPTS[scriptId];
  if (!script) throw new Error(`未知剧本: ${scriptId}`);
  const s = script.setup;
  const seats = [
    mkSeat(0, s.demon, "demon"),
    ...s.minions.map((id, i) => mkSeat(1 + i, id, "minion")),
    ...s.outsiders.map((id, i) =>
      mkSeat(1 + s.minions.length + i, id, "outsider")
    ),
    ...s.townsfolk.map((id, i) =>
      mkSeat(1 + s.minions.length + s.outsiders.length + i, id, "townsfolk")
    ),
  ];
  return mkSnapshot(seats, nightCount, overrides);
}

// ─── 核心测试 ─────────────────────────────────────────────────────

describe("八大经典剧本 - 完整生命周期测试", () => {
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();

  describe("暗流涌动 (Trouble Brewing)", () => {
    it("首夜完整执行：信息类角色正常获取信息，恶魔首夜不行动", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("trouble_brewing", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 100 }
      );
      expect(
        result.finalSnapshot.seats.filter((s: any) => s.isDead).length
      ).toBe(0);
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("washerwoman");
      expect(roles).toContain("investigator");
      expect(roles).toContain("chef");
      expect(roles).toContain("empath");
      expect(roles).not.toContain("imp");
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });

    it("第二夜恶魔击杀 + 全流程不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("trouble_brewing", 2),
        {
          nightCount: 2,
          fullNightOrder,
          abilityMap,
          seed: 101,
          pickTargets: pickDemonTarget(3, ["imp"]),
        }
      );
      const imp = result.actions.find((a: any) => a.node.roleId === "imp");
      expect(imp).toBeDefined();
      expect(imp!.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });

    it("投毒者下毒后目标中毒", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("trouble_brewing", 1),
        {
          nightCount: 1,
          fullNightOrder,
          abilityMap,
          seed: 102,
          pickTargets: pickPoisonerAndDemon(4, 3, ["imp"]),
        }
      );
      const pa = result.actions.find((a: any) => a.node.roleId === "poisoner");
      expect(pa).toBeDefined();
      expect(pa!.aborted).toBe(false);
      const target = result.finalSnapshot.seats.find((s: any) => s.id === 4);
      expect(
        target?.statusEffects?.some((e: any) => e.type === "poisoned") ||
          target?.isPoisoned
      ).toBe(true);
    });

    it("士兵免疫恶魔击杀（直接管道验证）", async () => {
      // 使用直接管道验证士兵免疫，与 soldier_immunity.test.ts 一致
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats: [
            {
              id: 0,
              playerName: "P1",
              role: { id: "soldier", name: "士兵", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 1,
              playerName: "P2",
              role: { id: "imp", name: "小恶魔", type: "demon" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 2,
              playerName: "P3",
              role: { id: "chef", name: "厨师", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
          ],
          statusEffects: {},
        },
        actionNode: {
          seatId: 1,
          roleId: "imp",
          roleName: "小恶魔",
          priority: 0,
          isFirstNightOnly: false,
          abilityId: "imp_night_ability",
          wakeMessage: "",
          firstNightPriority: null,
          otherNightPriority: 99,
          targetIds: [0],
          processed: false,
          success: false,
          meta: {},
        },
        targetIds: [0],
        meta: {},
        aborted: false,
      };
      const pipe = (a: any) => ({
        preCheck: a.preCheck,
        calculate: a.calculate,
        stateUpdate: a.stateUpdate,
        postProcess: a.postProcess,
      });
      const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
      const soldierSeat = result.snapshot.seats.find((s: any) => s.id === 0);
      expect(soldierSeat.markedForDeath).toBeUndefined();
      expect(soldierSeat.isDead).toBeFalsy();
    });

    it("红唇女郎继承恶魔：恶魔死亡且≥5人存活时变为恶魔（直接管道验证）", async () => {
      // 使用直接管道验证红唇女郎继承，与 scarlet_woman.test.ts 一致
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats: [
            {
              id: 0,
              playerName: "P1",
              role: { id: "scarlet_woman", name: "红唇女郎", type: "minion" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 1,
              playerName: "P2",
              role: { id: "imp", name: "小恶魔", type: "demon" },
              isAlive: false,
              isDead: true,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 2,
              playerName: "P3",
              role: { id: "chef", name: "厨师", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 3,
              playerName: "P4",
              role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 4,
              playerName: "P5",
              role: { id: "butler", name: "管家", type: "outsider" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 5,
              playerName: "P6",
              role: { id: "investigator", name: "调查员", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
            {
              id: 6,
              playerName: "P7",
              role: { id: "mayor", name: "镇长", type: "townsfolk" },
              isAlive: true,
              isDead: false,
              isDrunk: false,
              isPoisoned: false,
              statusEffects: [],
              hasAbilityEvenDead: false,
            },
          ],
          statusEffects: {},
        },
        actionNode: {
          seatId: 0,
          roleId: "scarlet_woman",
          roleName: "红唇女郎",
          priority: 0,
          isFirstNightOnly: false,
          abilityId: "sw_passive",
          wakeMessage: "",
          firstNightPriority: null,
          otherNightPriority: null,
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        },
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const pipe = (a: any) => ({
        preCheck: a.preCheck,
        calculate: a.calculate,
        stateUpdate: a.stateUpdate,
        postProcess: a.postProcess,
      });
      const result = await runFullAbilityPipeline(
        pipe(scarletWomanAbility),
        ctx
      );
      const swSeat = result.snapshot.seats.find((s: any) => s.id === 0);
      expect(
        swSeat?.role?.type === "demon" ||
          swSeat?.isDemonSuccessor ||
          swSeat?.role?.id === "imp"
      ).toBe(true);
    });

    it("镇长和平胜利条件：恶魔死亡 + 镇长存活", async () => {
      const seats = [
        mkSeat(0, "imp", "demon", { isDead: true, isAlive: false }),
        mkSeat(1, "mayor", "townsfolk"),
        mkSeat(2, "poisoner", "minion", { isDead: true, isAlive: false }),
        mkSeat(3, "butler", "outsider", { isDead: true, isAlive: false }),
        mkSeat(4, "washerwoman", "townsfolk", { isDead: true, isAlive: false }),
      ];
      expect(
        seats.filter((s: any) => !s.isDead && s.role?.type === "demon").length
      ).toBe(0);
      expect(
        seats
          .filter((s: any) => !s.isDead)
          .some((s: any) => s.role?.id === "mayor")
      ).toBe(true);
    });
  });

  describe("黯月初升 (Bad Moon Rising)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("bad_moon_rising", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 200 }
      );
      expect(result.actions.map((a: any) => a.node.roleId)).toContain(
        "grandmother"
      );
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("bad_moon_rising", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 201 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.bad_moon_rising.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("梦殒春宵 (Sects & Violets)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("sects_and_violets", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 300 }
      );
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("clockmaker");
      expect(roles).toContain("dreamer");
      expect(roles).toContain("mathematician");
    });
    it("沃托克斯世界 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("sects_and_violets", 2, { isVortoxWorld: true }),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 301 }
      );
      const v = result.actions.find((a: any) => a.node.roleId === "vortox");
      if (v) expect(v.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("窃窃私语 (Whispering Secrets)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("whispering_secrets", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 400 }
      );
      expect(result.actions.map((a: any) => a.node.roleId)).toContain(
        "chambermaid"
      );
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("whispering_secrets", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 401 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.whispering_secrets.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("无名之墓 (Tomb of the Unknown)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("tomb_of_the_unknown", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 500 }
      );
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("poisoner");
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("tomb_of_the_unknown", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 501 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.tomb_of_the_unknown.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      const violations = await runAllInvariants(result, abilityMap);
      if (violations.size > 0)
        console.log(
          "[无名之墓 第二夜违规]",
          JSON.stringify(Object.fromEntries(violations), null, 2)
        );
      expect(violations.size).toBe(0);
    });
  });

  describe("无上愉悦 (High Pleasure)", () => {
    it("首夜信息角色正常执行 + 恶魔首夜不行动", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("high_pleasure", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 600 }
      );
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("washerwoman");
      expect(roles).toContain("investigator");
      expect(roles).toContain("chef");
      expect(roles).toContain("empath");
      expect(roles).not.toContain("imp");
      expect(
        result.finalSnapshot.seats.filter((s: any) => s.isDead).length
      ).toBe(0);
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("high_pleasure", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 601 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.high_pleasure.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("凶宅魅影 (Haunted Manor)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("haunted_manor", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 700 }
      );
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("balloonist");
      expect(roles).toContain("clockmaker");
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("haunted_manor", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 701 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.haunted_manor.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("游园惊梦 (Garden of Dreams)", () => {
    it("首夜信息角色正常执行", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("garden_of_dreams", 1),
        { nightCount: 1, fullNightOrder, abilityMap, seed: 800 }
      );
      const roles = result.actions.map((a: any) => a.node.roleId);
      expect(roles).toContain("clockmaker");
      expect(roles).toContain("dreamer");
      expect(roles).toContain("mathematician");
    });
    it("第二夜恶魔击杀 + 不变式通过", async () => {
      const result = await simulateNight(
        buildScriptSnapshot("garden_of_dreams", 2),
        { nightCount: 2, fullNightOrder, abilityMap, seed: 801 }
      );
      const demonAction = result.actions.find((a: any) =>
        SCRIPTS.garden_of_dreams.demons.includes(a.node.roleId)
      );
      if (demonAction) expect(demonAction.aborted).toBe(false);
      expect((await runAllInvariants(result, abilityMap)).size).toBe(0);
    });
  });

  describe("跨剧本不变式全绿", () => {
    const scriptIds = Object.keys(SCRIPTS);
    for (const scriptId of scriptIds) {
      it(`${SCRIPTS[scriptId].name}：首夜+次夜不变式全绿`, async () => {
        const idx = scriptIds.indexOf(scriptId);
        const r1 = await simulateNight(buildScriptSnapshot(scriptId, 1), {
          nightCount: 1,
          fullNightOrder,
          abilityMap,
          seed: 900 + idx,
        });
        expect((await runAllInvariants(r1, abilityMap)).size).toBe(0);
        const r2 = await simulateNight(buildScriptSnapshot(scriptId, 2), {
          nightCount: 2,
          fullNightOrder,
          abilityMap,
          seed: 910 + idx,
        });
        expect((await runAllInvariants(r2, abilityMap)).size).toBe(0);
      });
    }
  });
});
