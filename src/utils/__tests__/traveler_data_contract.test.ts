/**
 * 旅行者数据契约（缺口补齐 Round 10a · 验收补齐）
 * ==================================================================
 * 背景：TableCenterHUD 曾用 `roles.filter(type==="traveler")` 取候选，
 * 而 roles 里 traveler 类型恰好是 15 条误标垃圾（traveler_official 占位
 * + 14 个 experimental_*）⇒ 旅行者座位只能选到假货。Round 10a 已把
 * 数据层重建为 TRAVELER_ROLES（15 个官方旅行者，三套剧本各 5，
 * ability 逐字来自 json/wiki_crawl/parsed_roles.json）。
 *
 * 本文件锁定重建后的数据契约，防漂移。
 */
import { describe, expect, it } from "vitest";
import { FABLED_ROLES, roles, scripts, TRAVELER_ROLES } from "../../../app/data";

/** 官方 15 个旅行者的英文名 → id 映射（三套剧本各 5）
 *  ⚠️ scapegoat 用 scapegoat_traveler（双宿主隔离，见 ⑥b） */
const OFFICIAL_15: Record<string, string> = {
  bureaucrat: "bureaucrat",
  beggar: "beggar",
  gunslinger: "gunslinger",
  thief: "thief",
  scapegoat_traveler: "scapegoat_traveler",
  butcher: "butcher",
  bone_collector: "bone_collector",
  harlot: "harlot",
  barista: "barista",
  deviant: "deviant",
  apprentice: "apprentice",
  matron: "matron",
  voudon: "voudon",
  judge: "judge",
  bishop: "bishop",
};

describe("TRAVELER_ROLES 数据契约（Round 10a）", () => {
  it("① 恰好 15 个官方旅行者", () => {
    expect(TRAVELER_ROLES.length).toBe(15);
  });

  it("② id 全部唯一", () => {
    const ids = TRAVELER_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(15);
  });

  it("③ 全部 type === traveler 且 ability 非空（>10 字）", () => {
    for (const r of TRAVELER_ROLES) {
      expect(r.type, `${r.id} type`).toBe("traveler");
      expect(r.ability, `${r.id} ability`).toBeTruthy();
      expect(r.ability!.length, `${r.id} ability 长度`).toBeGreaterThan(10);
    }
  });

  it("④ script 三剧本各 5（暗流涌动/梦殒春宵/黯月初升）", () => {
    const dist: Record<string, number> = {};
    for (const r of TRAVELER_ROLES) {
      dist[r.script ?? "?"] = (dist[r.script ?? "?"] ?? 0) + 1;
    }
    expect(dist).toEqual({ 暗流涌动: 5, 梦殒春宵: 5, 黯月初升: 5 });
  });

  it("⑤ id 与官方英文名一一对应（15/15）", () => {
    for (const id of Object.keys(OFFICIAL_15)) {
      expect(
        TRAVELER_ROLES.some((r) => r.id === id),
        `应有 ${id}`
      ).toBe(true);
    }
    expect(Object.keys(OFFICIAL_15).length).toBe(15);
  });

  it("⑥ 关键能力语义锚定（防静默改文案）", () => {
    const ab = (id: string) => TRAVELER_ROLES.find((r) => r.id === id)!.ability;
    expect(ab("thief")).toContain("算作负数");
    expect(ab("beggar")).toContain("投票标记");
    expect(ab("gunslinger")).toContain("他死亡");
    expect(ab("scapegoat_traveler")).toContain("代替他被处决");
    expect(ab("bureaucrat")).toContain("三票");
  });

  it("⑥b scapegoat 双宿主登记（元教训：同名 type 先锁宿主）", () => {
    // 官方 Scapegoat 仅 traveler 一版（roles_index outsider 24 个无替罪羊）。
    // data.ts 另有一条 id="scapegoat" 的 outsider 历史误植（script 无名之墓）
    // ⇒ traveler 正身已改用 scapegoat_traveler 隔离；误植删除留待独立批次。
    const travelerSide = TRAVELER_ROLES.find((r) => r.id === "scapegoat_traveler");
    expect(travelerSide, "traveler 正身应为 scapegoat_traveler").toBeTruthy();
    expect(travelerSide!.type).toBe("traveler");
    const outsiderSide = roles.find((r) => r.id === "scapegoat");
    expect(outsiderSide, "无名之墓 outsider 误植条目应仍在（未删）").toBeTruthy();
    expect(outsiderSide!.type).toBe("outsider");
    // 两条 id 不得相同（撞车会导致 runtime 遮蔽）
    expect(travelerSide!.id).not.toBe(outsiderSide!.id);
  });

  it("⑦ 官方额外旅行者（黑帮/笑匠/侏儒）不得进入 TRAVELER_ROLES", () => {
    for (const id of ["gangster", "cacklejack", "gnome"]) {
      expect(
        TRAVELER_ROLES.some((r) => r.id === id),
        `${id} 不属三套剧本，不得入表`
      ).toBe(false);
    }
  });

  it("⑧ 与 FABLED_ROLES id 交集为空", () => {
    const fabledIds = new Set(FABLED_ROLES.map((f) => f.id));
    const overlap = TRAVELER_ROLES.filter((r) => fabledIds.has(r.id));
    expect(overlap).toEqual([]);
  });

  it("⑨ roles（runtime）中 traveler 类型恰好 = TRAVELER_ROLES 15 个（垃圾清零）", () => {
    const runtimeTravelers = roles.filter((r) => r.type === "traveler");
    expect(runtimeTravelers.length).toBe(15);
    const runtimeIds = new Set(runtimeTravelers.map((r) => r.id));
    for (const r of TRAVELER_ROLES) {
      expect(runtimeIds.has(r.id), `${r.id} 应已进入 roles`).toBe(true);
    }
    // 旧垃圾必须绝迹
    for (const junk of ["traveler_official", "experimental_king", "experimental_general"]) {
      expect(runtimeIds.has(junk), `垃圾 ${junk} 不得残留`).toBe(false);
    }
  });

  it("⑩ 任何旅行者不得进入剧本 roleIds（官方设计：不占配比）", () => {
    const travelerIds = TRAVELER_ROLES.map((r) => r.id);
    for (const s of scripts) {
      for (const rid of s.roleIds ?? []) {
        expect(
          travelerIds.includes(rid),
          `剧本「${s.name}」roleIds 含旅行者 ${rid}`
        ).toBe(false);
      }
    }
  });

  it("⑪ rolesData.json 前 5 个暗流涌动旅行者已补 ability（Round 10a 步骤 4）", async () => {
    const rolesData = (await import("../../data/rolesData.json")).default as any[];
    for (const id of ["bureaucrat", "beggar", "gunslinger", "thief", "scapegoat"]) {
      const entry = rolesData.find((x) => x.id === id);
      expect(entry, `rolesData 应有 ${id}`).toBeTruthy();
      expect(entry.ability, `${id} 应有 ability`).toBeTruthy();
    }
  });
});
