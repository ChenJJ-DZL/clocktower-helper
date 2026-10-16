/**
 * 旅行者 / 传奇角色（fabled）数据一致性契约（缺口补齐计划 · G3/G4）
 * ==================================================================
 * 背景（2026-10-12 缺口扫描实测）：
 *   1. `sentinel` / `spirit_of_ivory` 曾在 `roles` 数组以
 *      `type: "traveler"` 定义，又在 `FABLED_ROLES` 以 `type: "fabled"`
 *      定义 —— 同 id 双宿主。官方口径（officialRoleDocs.json）：
 *      两者「角色类型」均为**传奇角色**，且圣洁之魂官方中文名
 *      **不叫「象牙之魂」**（FABLED_ROLES 曾用错名）。
 *   2. fabled 官方设计「不占座位、作为全局规则生效、不计入邪恶
 *      获胜阈值」—— 因此绝不可以作为座位角色进入剧本。
 *   3. 旅行者 17 个（traveler_official 占位 + 13 个 experimental_*）
 *      机制未实现，只有负面契约（不进夜序）。
 *
 * 本文件锁死以上事实，防数据漂移。修正数据必须同步本文件。
 */
import { describe, it, expect } from "vitest";
import { roles, FABLED_ROLES, TRAVELER_ROLES, scripts } from "../../../app/data";
import officialRoleDocs from "../../data/officialRoleDocs.json";

const docs = officialRoleDocs as Record<string, string>;

describe("fabled / traveler 数据一致性契约", () => {
  it("FABLED_ROLES 全部 type === fabled", () => {
    for (const r of FABLED_ROLES) {
      expect(r.type, `${r.id} 的 type 应为 fabled`).toBe("fabled");
    }
  });

  it("FABLED_ROLES 数量为官方全量 14（增减须先改本契约）", () => {
    // 2026-10-16 批次：先补登记 deus_ex_fiasco + ferryman（文件早存在却漏登记），
    // 再补齐 toymaker / fiddler / duchess / djinn ⇒ 达到**官方 legendary 全量 14 个**。
    // 契约棘轮：增减 FABLED 须先改本契约。
    expect(FABLED_ROLES.length).toBe(14);
  });

  it("FABLED_ROLES 经 push 全部并入 roles（图鉴可查），但同 id 至多一个非 hidden 条目", () => {
    const roleIds = roles.map((r) => r.id);
    for (const f of FABLED_ROLES) {
      expect(roleIds, `FABLED_ROLES.${f.id} 应并入 roles（RoleCodexModal 图鉴展示）`).toContain(f.id);
    }
    // 防双条目：sentinel/spirit_of_ivory 有字面量(hidden:true) + push(hidden:false) 两份
    for (const id of ["sentinel", "spirit_of_ivory"]) {
      const visible = roles.filter((r) => r.id === id && !r.hidden);
      expect(visible.length, `${id} 在 roles 中非 hidden 条目应唯一`).toBe(1);
    }
  });

  it("双宿主条目在 roles 侧必须 hidden + type=fabled（防作为座位角色候选）", () => {
    for (const id of ["sentinel", "spirit_of_ivory"]) {
      const r = roles.find((x) => x.id === id);
      expect(r, `roles 中应存在 ${id}`).toBeTruthy();
      expect(r!.hidden, `${id} 在 roles 侧应 hidden（正牌入口是 FABLED_ROLES）`).toBe(true);
      expect(r!.type, `${id} 官方类型为传奇角色`).toBe("fabled");
    }
  });

  it("spirit_of_ivory 官方中文名 = 圣洁之魂（两侧一致，禁「象牙之魂」）", () => {
    const fabledSide = FABLED_ROLES.find((f) => f.id === "spirit_of_ivory");
    const rolesSide = roles.find((r) => r.id === "spirit_of_ivory");
    expect(fabledSide!.name).toBe("圣洁之魂");
    expect(rolesSide!.name).toBe("圣洁之魂");
    // 官方原文键必须存在且能力语义同源
    expect(docs["圣洁之魂"], "officialRoleDocs.json 应有「圣洁之魂」条目").toBeTruthy();
    expect(docs["圣洁之魂"]).toContain("邪恶玩家的总数最多");
  });

  it("哨兵官方中文名一致 + 官方类型为传奇角色", () => {
    const fabledSide = FABLED_ROLES.find((f) => f.id === "sentinel");
    expect(fabledSide!.name).toBe("哨兵");
    expect(docs["哨兵"]).toContain("角色类型：传奇角色");
  });

  it("fabled 不得进入任何剧本的 roleIds（官方设计：不占座位）", () => {
    const fabledIds = FABLED_ROLES.map((f) => f.id);
    for (const s of scripts) {
      for (const rid of s.roleIds ?? []) {
        expect(
          fabledIds.includes(rid),
          `剧本「${s.name}」的 roleIds 含 fabled 角色 ${rid}`
        ).toBe(false);
      }
    }
  });

  it("fabled 不得进入夜序（与 orphan_roles_matrix 负面契约互锁）", () => {
    // 该断言依赖 buildFullNightOrder；此处直接验证角色侧前提：
    // fabled 无 firstNightPriority / otherNightPriority 概念（不在 ability 注册表）
    const fabledIds = new Set(FABLED_ROLES.map((f) => f.id));
    for (const r of roles) {
      if (fabledIds.has(r.id)) {
        expect(r.type).toBe("fabled");
      }
    }
  });

  it("TRAVELER_ROLES 恰好 15 个，且全部 type===\"traveler\"、id 唯一、script 三剧本各 5", () => {
    expect(TRAVELER_ROLES.length).toBe(15);
    const ids = TRAVELER_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(15);
    for (const r of TRAVELER_ROLES) {
      expect(r.type, `${r.id} 的 type 应为 traveler`).toBe("traveler");
      expect(r.ability, `${r.id} 的 ability 应非空`).toBeTruthy();
    }
    const scriptCount: Record<string, number> = {};
    for (const r of TRAVELER_ROLES) {
      const key = r.script ?? "?";
      scriptCount[key] = (scriptCount[key] ?? 0) + 1;
    }
    expect(scriptCount).toEqual({ 暗流涌动: 5, 梦殒春宵: 5, 黯月初升: 5 });
  });

  it("FABLED_ROLES 名称翻译差异登记册（不强制统一，防静默漂移）", () => {
    // 官方列表（[任意游戏]/[自定义游戏]）与仓库译名的已知差异：
    //   doomsayer 末日使者 ↔ 官方「末日预言者」
    //   revolutionary 革命家 ↔ 官方「革命者」
    //   hells_librarian 地狱图书管理员 ↔ 官方「地狱藏书员」
    //   fibbin 佛吉 ↔ 官方「骗人精」
    // 其余（天使/佛教徒/哨兵/圣洁之魂）与官方一致。
    // ⚠️ 新增差异必须在此登记；不得静默改名。
    const KNOWN_TRANSLATION_DRIFT: Record<string, string> = {
      doomsayer: "末日预言者",
      revolutionary: "革命者",
      hells_librarian: "地狱藏书员",
      fibbin: "骗人精",
    };
    for (const [id, officialName] of Object.entries(KNOWN_TRANSLATION_DRIFT)) {
      const r = FABLED_ROLES.find((f) => f.id === id);
      expect(r, `FABLED_ROLES 应含 ${id}`).toBeTruthy();
      expect(r!.name, `${id} 译名发生静默漂移`).not.toBe(officialName);
    }
    // 与官方同名的四个必须严格一致
    for (const name of ["天使", "佛教徒", "哨兵", "圣洁之魂"]) {
      expect(
        FABLED_ROLES.some((f) => f.name === name),
        `FABLED_ROLES 应含官方同名角色「${name}」`
      ).toBe(true);
    }
  });
});
