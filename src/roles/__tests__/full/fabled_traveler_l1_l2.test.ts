/**
 * 传奇角色(8) + 旅行者(15) 四层全量套件 · L1 数据层 / L2 规则层
 * ======================================================================
 * 口径（用户裁决）：
 *   · 传奇 8 个（FABLED_ROLES）均有真实能力实现且已注册 ⇒ L2 断言真实语义；
 *     判注册必须用 isRoleAbilitiesRegistered（getAbilityForRole 是 startsWith 模糊匹配，禁用）。
 *   · 旅行者 15 个 = `TRAVELER_ROLES`（Round 10a 重建：官方 wiki 15 个，
 *     三套剧本各 5；旧 traveler_official 占位 + 14 experimental_* 已删）。
 *     L2 只做负向不变量（不进剧本 roleIds / 不进夜序 / 不占玩家 15 座 /
 *     上限 4 / setTravelerAt 位置化不串位），能力语义由
 *     `traveler_data_contract.test.ts` 锁定。
 *   · 另有 2 条 hidden 双宿主（sentinel / spirit_of_ivory）不计入 8。
 *
 * 验收门槛：每角色 ≥3 用例、每用例 ≥3 expect、每角色 ≥1 负向对照。
 * 只加测试不改生产：偏差只冻结 + 报告。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { FABLED_ROLES, roles, scripts } from "../../../../app/data";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import * as abilityRegistry from "../../new_engine/abilityRegistry";
import { setTravelerAt, TRAVELER_MAX } from "../../../utils/fabledLock";

// 8 个传奇角色的能力实现：逐个 import 验证模块真实加载（非占位）
import * as spiritOfIvoryMod from "../../new_engine/spirit_of_ivory.ability";
import * as sentinelMod from "../../new_engine/sentinel.ability";
import * as revolutionaryMod from "../../new_engine/revolutionary.ability";
import * as doomsayerMod from "../../new_engine/doomsayer.ability";
import * as fibbinMod from "../../new_engine/fibbin.ability";
import * as hellsLibrarianMod from "../../new_engine/hells_librarian.ability";
import * as buddhistMod from "../../new_engine/buddhist.ability";
import * as angelMod from "../../new_engine/angel.ability";
// 2026-10-16 补登记：官方 legendary 有、能力文件早已存在却漏登记进 FABLED_ROLES
import * as deusExFiascoMod from "../../new_engine/deus_ex_fiasco.ability";
import * as ferrymanMod from "../../new_engine/ferryman.ability";
// 2026-10-16 补齐：官方 legendary 全量 14（toymaker 文件早已存在；其余 3 个本轮新建）
import * as toymakerMod from "../../new_engine/toymaker.ability";
import * as fiddlerMod from "../../new_engine/fiddler.ability";
import * as duchessMod from "../../new_engine/duchess.ability";
import * as djinnMod from "../../new_engine/djinn.ability";

const docs = officialRoleDocs as Record<string, string>;
const registry: any = abilityRegistry;

const FABLED_MODULES: Record<string, object> = {
  spirit_of_ivory: spiritOfIvoryMod,
  sentinel: sentinelMod,
  revolutionary: revolutionaryMod,
  doomsayer: doomsayerMod,
  fibbin: fibbinMod,
  hells_librarian: hellsLibrarianMod,
  buddhist: buddhistMod,
  angel: angelMod,
  deus_ex_fiasco: deusExFiascoMod,
  ferryman: ferrymanMod,
  toymaker: toymakerMod,
  fiddler: fiddlerMod,
  duchess: duchessMod,
  djinn: djinnMod,
};

/** 仓库译名 → 官方文档键（既有翻译差异登记册口径） */
const OFFICIAL_NAME_ALIAS: Record<string, string> = {
  doomsayer: "末日预言者",
  revolutionary: "革命者",
  hells_librarian: "地狱藏书员",
  fibbin: "骗人精",
};

const FABLED_IDS = FABLED_ROLES.map((f) => f.id);
const TRAVELER_ROLES = roles.filter((r) => r.type === "traveler");
const TRAVELER_IDS = TRAVELER_ROLES.map((r) => r.id);
const ALL_IDS = [...FABLED_IDS, ...TRAVELER_IDS];
const nightOrderIds = new Set<string>(
  ENGINE_CONFIG.fullNightOrder.map((e: any) => e.roleId as string)
);

/**
 * 官方夜间旅行者例外册（2026-10-12 Round 10a 实测登记）：
 * 官员（bureaucrat, otherNightPriority=32）与窃贼（thief, 33）官方即有
 * 「每个夜晚选择一名玩家：明天投票算作三票/负数」的夜间行动 ⇒
 * **应当**进入 fullNightOrder（ability 声明 EVERY_NIGHT）。
 * ⚠️ 旧口径「所有 traveler 都不进夜序」是占位符时代的错误假设——
 *    真实数据下这两个是正向锚定，不是负向。
 */
const OFFICIAL_NIGHT_TRAVELERS = new Set(["bureaucrat", "thief"]);

beforeAll(() => {
  registry.initializeAbilityRegistry?.();
});

describe("L1 全局数据契约", () => {
  it("FABLED_ROLES 恰好 14 个（官方 legendary 全量）、id 唯一、type 全为 fabled", () => {
    // 2026-10-16：10（含补登记的 deus_ex_fiasco/ferryman）→ 14（补齐 toymaker/fiddler/duchess/djinn）
    expect(FABLED_ROLES).toHaveLength(14);
    expect(new Set(FABLED_IDS).size).toBe(14);
    expect(FABLED_ROLES.every((f) => f.type === "fabled")).toBe(true);
  });

  it("旅行者恰好 15 个条目（TRAVELER_ROLES 官方口径）、id 唯一", () => {
    expect(TRAVELER_ROLES).toHaveLength(15);
    expect(new Set(TRAVELER_IDS).size).toBe(15);
    // 官方 15 个锚定（三套剧本各 5；scapegoat 双宿主隔离为 scapegoat_traveler）
    for (const id of [
      "bureaucrat",
      "beggar",
      "gunslinger",
      "thief",
      "scapegoat_traveler",
      "butcher",
      "bone_collector",
      "harlot",
      "barista",
      "deviant",
      "apprentice",
      "matron",
      "voudon",
      "judge",
      "bishop",
    ]) {
      expect(TRAVELER_IDS, `应含官方旅行者 ${id}`).toContain(id);
    }
    // 旧垃圾口径绝迹
    expect(TRAVELER_IDS).not.toContain("traveler_official");
    expect(TRAVELER_IDS.some((id) => id.startsWith("experimental_"))).toBe(false);
  });

  it("2 条 hidden 双宿主存在且 hidden === true（不计入 8）", () => {
    for (const id of ["sentinel", "spirit_of_ivory"]) {
      const dup = roles.filter((r) => r.id === id);
      expect(dup.length, `${id} 应有双宿主条目`).toBeGreaterThanOrEqual(2);
      const hiddenEntry = dup.find((r) => r.hidden === true);
      expect(hiddenEntry, `${id} 应有 hidden 条目`).toBeTruthy();
      expect(hiddenEntry!.type).toBe("fabled");
    }
  });

  it("29 个 id 全量清单 = 14 fabled + 15 traveler", () => {
    expect(ALL_IDS).toHaveLength(29);
    expect(new Set(ALL_IDS).size).toBe(29);
    expect(nightOrderIds.size).toBeGreaterThan(0);
  });
});

describe.each(FABLED_ROLES.map((f) => [f.id, f] as const))(
  "L1/L2 传奇角色 %s",
  (id, f) => {
    it("L1-1：定义唯一且 type === fabled", () => {
      expect(roles.some((r) => r.id === id)).toBe(true);
      expect(f.type).toBe("fabled");
      expect(FABLED_IDS.filter((x) => x === id)).toHaveLength(1);
    });

    it("L1-2：中文名与官方文档对拍", () => {
      const doc =
        docs[f.name] ??
        (OFFICIAL_NAME_ALIAS[id] ? docs[OFFICIAL_NAME_ALIAS[id]] : undefined);
      expect(doc, `officialRoleDocs 应有「${f.name}」条目`).toBeTruthy();
      expect((doc ?? "").length).toBeGreaterThan(10);
      expect(f.name.length).toBeGreaterThan(0);
    });

    it("L2-1：能力模块真实加载且已注册（isRoleAbilitiesRegistered 精确判）", () => {
      const mod = FABLED_MODULES[id];
      expect(mod).toBeTruthy();
      expect(Object.keys(mod).length).toBeGreaterThan(0);
      expect(
        registry.isRoleAbilitiesRegistered(id),
        `${id} 应已注册进 abilityRegistry`
      ).toBe(true);
    });

    it("L2-2：规则语义对拍（能力原文 + 官方要点）", () => {
      expect((f.ability ?? "").length).toBeGreaterThan(5);
      expect(typeof f.fullDescription).toBe("string");
      const doc = docs[f.name] ?? docs[OFFICIAL_NAME_ALIAS[id]];
      if (id === "spirit_of_ivory") {
        // 官方：游戏过程中邪恶玩家的总数最多比初始设置多一名
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("邪恶玩家的总数最多");
        expect(f.ability).toContain("邪恶玩家的总数最多");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "sentinel") {
        // 官方：初始设置时可能额外增加或减少一个外来者
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("外来者");
        expect(f.ability).toContain("外来者");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "revolutionary") {
        // 官方：公开声明一对邻座玩家本局游戏一直保持同一阵营
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("同一阵营");
        expect(f.ability).toContain("同一阵营");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "doomsayer") {
        // 官方：存活玩家可公开要求你杀死一名同阵营玩家
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("杀死一名");
        expect(f.ability).toContain("杀死一名");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "fibbin") {
        // 官方：每局游戏限一次，一名善良玩家可能会得知"有问题"的信息。
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("善良玩家");
        expect(f.ability).toContain("善良玩家");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "hells_librarian") {
        // 官方：当说书人宣布安静时，仍在说话的玩家可能会遭遇一些不好的事情。
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("安静");
        expect(f.ability).toContain("安静");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "buddhist") {
        // 官方：每个白天的前两分钟老玩家不能发言。
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("前两分钟");
        expect(f.ability).toContain("前两分钟");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      } else if (id === "angel") {
        // 官方：对新玩家的死亡负最大责任的人，可能会遭遇一些不好的事情。
        expect(doc, "官方文档条目必须存在").toBeTruthy();
        expect(doc, "官方文档缺关键词").toContain("新玩家");
        expect(f.ability).toContain("新玩家");
        expect(f.fullDescription ?? "").toBeTypeOf("string");
      }
    });

    it("负向对照：不进夜序、不进任何剧本 roleIds", () => {
      expect(nightOrderIds.has(id), `${id} 不得进夜序`).toBe(false);
      expect(
        scripts.filter((s) => (s.roleIds ?? []).includes(id)),
        `${id} 不得进剧本 roleIds`
      ).toEqual([]);
      expect(scripts.some((s) => (s.roleIds ?? []).length > 0)).toBe(true);
    });
  }
);

describe.each(TRAVELER_ROLES.map((r) => [r.id, r] as const))(
  "L1/L2 旅行者 %s",
  (id, r) => {
    it("L1-1：定义唯一且 type === traveler", () => {
      expect(r.type).toBe("traveler");
      expect(TRAVELER_IDS.filter((x) => x === id)).toHaveLength(1);
      expect(FABLED_IDS.includes(id)).toBe(false);
    });

    it("L1-2：真实能力文案（禁空 ability；官方 15 个均有能力）", () => {
      // Round 10a 后 traveler 全部有官方 ability 原文（parsed_roles.json），
      // 「占位标记」旧口径已废。
      expect(typeof r.ability).toBe("string");
      expect((r.ability ?? "").length).toBeGreaterThan(10);
      expect(r.name.length).toBeGreaterThan(0);
    });

    it("L2-1：负向 —— 不进任何剧本 roleIds（官方：旅行者不占配比）", () => {
      const hits = scripts.filter((s) => (s.roleIds ?? []).includes(id));
      expect(hits, `${id} 不得进剧本 roleIds`).toEqual([]);
      expect(scripts.some((s) => (s.roleIds ?? []).length > 0)).toBe(true);
      // 夜序判据：夜间旅行者（官员/窃贼）官方即在夜序；其余不得进
      if (OFFICIAL_NIGHT_TRAVELERS.has(id)) {
        expect(nightOrderIds.has(id), `${id} 官方夜间旅行者应在夜序`).toBe(true);
      } else {
        expect(nightOrderIds.has(id), `${id} 不得进夜序`).toBe(false);
      }
    });

    it("L2-2：夜序口径 —— 夜间旅行者正向锚定 priority，其余负向", () => {
      const entry = ENGINE_CONFIG.fullNightOrder.find(
        (e: any) => e.roleId === id
      );
      if (OFFICIAL_NIGHT_TRAVELERS.has(id)) {
        expect(entry, `${id} 应在 fullNightOrder`).toBeTruthy();
        expect(entry!.otherNightPriority).toBeGreaterThan(0);
        expect(entry!.firstNightPriority).toBe(0);
      } else {
        expect(nightOrderIds.has(id), `${id} 不得进夜序`).toBe(false);
        expect([...nightOrderIds].filter((x) => x === id)).toEqual([]);
      }
      expect(ENGINE_CONFIG.fullNightOrder.length).toBeGreaterThan(0);
    });

    it("L2-3：负向 —— 不占玩家座位 + setTravelerAt 位置化不串位", () => {
      const list = setTravelerAt([null, null, null, null], 2, r);
      expect(list).toHaveLength(TRAVELER_MAX);
      expect(list[2]?.id).toBe(id);
      expect(list.filter(Boolean)).toHaveLength(1);
      expect(list[0]).toBeNull();
    });
  }
);

describe("负向对照全量（25 个 id 逐一独立 expect）", () => {
  it("25 个 id：夜间旅行者（官员/窃贼）应在夜序，其余不得泄漏", () => {
    expect(ENGINE_CONFIG.fullNightOrder.length).toBeGreaterThan(0);
    for (const id of ALL_IDS) {
      if (OFFICIAL_NIGHT_TRAVELERS.has(id)) {
        expect(nightOrderIds.has(id), `${id} 官方夜间旅行者应在夜序`).toBe(true);
      } else {
        expect(nightOrderIds.has(id), `${id} 泄漏进夜序`).toBe(false);
      }
    }
  });

  it("25 个 id 全部不得进入任何剧本 roleIds", () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const id of ALL_IDS) {
      const hits = scripts.filter((s) => (s.roleIds ?? []).includes(id));
      expect(hits, `${id} 泄漏进剧本 roleIds`).toEqual([]);
    }
  });
});
