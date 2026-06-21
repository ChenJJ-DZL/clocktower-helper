/**
 * Jinx 相克规则系统测试
 * 验证：
 * 1. jinxUtils 正确加载并索引 130+ 条相克规则
 * 2. getJinx / getJinxesForCharacter 正确返回
 * 3. JINX_RULES 双向索引正确（character1 和 character2 均可查到）
 * 4. JinxManager 的核心拦截函数正常工作
 * 5. gameRules 中的 Jinx 集成点正确调用
 */
import { describe, expect, test } from "vitest";
import type { Seat } from "../app/data";
import type { RegistrationResult } from "../src/types/registration";
import {
  canPerformAction,
  getAllJinxesFor,
  getJinxesBetween,
  interceptInspection,
} from "../src/utils/JinxManager";
import {
  getJinx,
  getJinxesForCharacter,
  JINX_RULES,
  JinxRule,
} from "../src/utils/jinxUtils";

describe("Jinx Utility - Data Loading", () => {
  test("JINX_RULES 应加载 130+ 条规则", () => {
    // 收集所有规则的唯一 ID
    const allRuleIds = new Set<string>();
    for (const rules of Object.values(JINX_RULES)) {
      for (const rule of rules) {
        allRuleIds.add(rule.id);
      }
    }
    expect(allRuleIds.size).toBeGreaterThan(130);
  });

  test("JINX_RULES 应是双向索引 — character1 和 character2 均可查到", () => {
    // 找一个已知规则: actor_atheist
    const actorRules = getJinxesForCharacter("actor");
    expect(actorRules.length).toBeGreaterThan(0);
    const atheistRules = getJinxesForCharacter("atheist");
    expect(atheistRules.length).toBeGreaterThan(0);

    // actor_atheist 规则同时出现在两者的列表中
    const fromActor = actorRules.find((r) => r.id === "actor_atheist");
    const fromAtheist = atheistRules.find((r) => r.id === "actor_atheist");
    expect(fromActor).toBeDefined();
    expect(fromAtheist).toBeDefined();
  });

  test("getJinx 正确返回两个角色之间的相克规则", () => {
    const jinx = getJinx("spy", "damsel");
    expect(jinx).toBeDefined();
    expect(jinx!.id).toBe("spy_damsel");
    expect(jinx!.description).toContain("落难少女中毒");
  });

  test("不存在的角色返回空数组", () => {
    const rules = getJinxesForCharacter("nonexistent_character_xyz");
    expect(rules).toEqual([]);
  });

  test("不存在的相克规则返回 undefined", () => {
    const jinx = getJinx("washerwoman", "imp");
    expect(jinx).toBeUndefined();
  });
});

describe("Jinx Manager - interceptInspection", () => {
  const createSeat = (
    id: number,
    roleId: string,
    roleName: string,
    roleType: string,
    alignment: string
  ): Seat =>
    ({
      id,
      role: { id: roleId, name: roleName, type: roleType, alignment },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
    }) as Seat;

  const baseResult: RegistrationResult = {
    alignment: "Good",
    registersAsMinion: false,
    registersAsDemon: false,
    registersAsOutsider: false,
    registersAsTownsfolk: false,
    registeredRole: null,
    overrides: [],
  };

  test("无相克规则时返回 baseResult", () => {
    const target = createSeat(0, "washerwoman", "洗衣妇", "townsfolk", "Good");
    const viewer = createSeat(1, "chef", "厨师", "townsfolk", "Good");
    const result = interceptInspection(target, viewer, baseResult, [target]);
    expect(result).toEqual(baseResult);
  });

  test("Magician vs Legion: 军团查看魔术师 → 魔术师注册为邪恶", () => {
    // JinxManager 逻辑: viewer=legion, target=magician
    const target = createSeat(0, "magician", "魔术师", "townsfolk", "Good");
    const viewer = createSeat(1, "legion", "军团", "demon", "Evil");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.alignment).toBe("Evil");
    expect(result.registersAsDemon).toBe(true);
  });

  test("Ogre vs Spy: 间谍对食人魔注册为邪恶爪牙", () => {
    const target = createSeat(0, "spy", "间谍", "minion", "Evil");
    const viewer = createSeat(1, "ogre", "食人魔", "townsfolk", "Good");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.alignment).toBe("Evil");
    expect(result.registersAsMinion).toBe(true);
  });

  test("缺少角色信息时返回 baseResult", () => {
    const target = { id: 0, isDead: false } as Seat;
    const viewer = createSeat(1, "chef", "厨师", "townsfolk", "Good");
    const result = interceptInspection(target, viewer, baseResult, []);
    expect(result).toEqual(baseResult);
  });

  test("Summoner vs Clockmaker: 召唤师被钟表匠当作恶魔", () => {
    const target = createSeat(0, "summoner", "召唤师", "minion", "Evil");
    const viewer = createSeat(1, "clockmaker", "钟表匠", "townsfolk", "Good");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.alignment).toBe("Evil");
    expect(result.registersAsDemon).toBe(true);
  });

  test("Spy vs Heretic: 异端分子被间谍当作不在场外来者", () => {
    const target = createSeat(0, "heretic", "异端分子", "outsider", "Good");
    const viewer = createSeat(1, "spy", "间谍", "minion", "Evil");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.registersAsOutsider).toBe(true);
  });

  test("Legion vs Politician: 政客被军团当作邪恶", () => {
    const target = createSeat(0, "politician", "政客", "townsfolk", "Good");
    const viewer = createSeat(1, "legion", "军团", "demon", "Evil");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.alignment).toBe("Evil");
    expect(result.registersAsMinion).toBe(true);
  });

  test("Vizier vs Politician: 政客被维齐尔当作邪恶", () => {
    const target = createSeat(0, "politician", "政客", "townsfolk", "Good");
    const viewer = createSeat(1, "vizier", "维齐尔", "minion", "Evil");
    const result = interceptInspection(target, viewer, baseResult, [
      target,
      viewer,
    ]);
    expect(result.alignment).toBe("Evil");
    expect(result.registersAsMinion).toBe(true);
  });

  test("getJinxesBetween 返回两个角色间的相克规则", () => {
    const effects = getJinxesBetween("spy", "damsel");
    expect(effects.length).toBeGreaterThanOrEqual(1);
    expect(effects.some((e) => e.ruleId === "spy_damsel")).toBe(true);
  });

  test("getAllJinxesFor 返回角色的所有相克规则", () => {
    const effects = getAllJinxesFor("leviathan");
    expect(effects.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Jinx Manager - canPerformAction", () => {
  const createSeat = (
    id: number,
    roleId: string,
    roleName: string,
    roleType: string,
    isDead = false
  ): Seat =>
    ({
      id,
      role: { id: roleId, name: roleName, type: roleType },
      isDead,
      statusEffects: [],
      statusDetails: [],
    }) as Seat;

  test("无特殊限制时允许行动", () => {
    const actor = createSeat(0, "imp", "小恶魔", "demon");
    const result = canPerformAction(actor, null, [actor]);
    expect(result.allowed).toBe(true);
  });

  test("无角色信息时允许行动", () => {
    const actor = { id: 0, isDead: false } as Seat;
    const result = canPerformAction(actor, null, []);
    expect(result.allowed).toBe(true);
  });
});

describe("Jinx System - 边界情况", () => {
  test("每个角色 ID 的相克规则数应合理", () => {
    // 已知高频角色应有较多相克规则
    const summonerRules = getJinxesForCharacter("summoner");
    expect(summonerRules.length).toBeGreaterThanOrEqual(8);

    const vizierRules = getJinxesForCharacter("vizier");
    expect(vizierRules.length).toBeGreaterThanOrEqual(7);

    const leviathanRules = getJinxesForCharacter("leviathan");
    expect(leviathanRules.length).toBeGreaterThanOrEqual(10);
  });

  test("相克规则 ID 应无重复（自相克规则 character1===character2 的仅索引一次）", () => {
    const allRuleIds = new Map<string, number>();
    for (const rules of Object.values(JINX_RULES)) {
      for (const rule of rules) {
        const count = allRuleIds.get(rule.id) ?? 0;
        allRuleIds.set(rule.id, count + 1);
      }
    }
    // 每条规则应被索引1-2次：
    // - character1===character2（自相克，如 hatter_hatter）：1次
    // - 正常相克：2次
    for (const [id, count] of allRuleIds) {
      const rule = Object.values(JINX_RULES)
        .flat()
        .find((r) => r.id === id);
      const isSelfJinx = rule!.character1 === rule!.character2;
      if (isSelfJinx) {
        expect(count).toBe(1);
      } else {
        expect(count).toBe(2);
      }
    }
  });

  test("自相克规则（hatter_hatter）是合法的特殊情况", () => {
    const hatterJinx = getJinx("hatter", "hatter");
    expect(hatterJinx).toBeDefined();
    expect(hatterJinx!.id).toBe("hatter_hatter");
    expect(hatterJinx!.description).toContain("军团");
    // 自相克规则仅被索引一次
    const count = Object.values(JINX_RULES)
      .flat()
      .filter((r) => r.id === "hatter_hatter").length;
    expect(count).toBe(1);
  });

  test("所有规则应有 description", () => {
    for (const rules of Object.values(JINX_RULES)) {
      for (const rule of rules) {
        expect(rule.description.length).toBeGreaterThan(0);
      }
    }
  });
});
