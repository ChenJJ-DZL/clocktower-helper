/**
 * 🀄 角色文档译名分歧（本地显示名 ↔ 官方 wiki 译名）
 * ======================================================================
 * 为什么需要这条护栏：
 *   项目里存在**同一角色两套译名**，而两份数据源的键用的是官方 wiki 译名：
 *     · `pit_hag`    本地「坑道巫婆」/ 官方「麻脸巫婆」（英文名同为 Pit-Hag）
 *     · `no_dashii`  本地「诺-达」  / 官方「诺-达鲺」（英文名同为 No Dashii）
 *   直接按 `role.name` 查 → **全 miss** → 两个消费点各自掉进兜底：
 *     ① `roleDocLookup::getRoleDocSummary` → 退回 `def.detailedDescription`
 *        （更短、且缺【范例】【运作方式】）⇒ 说书人控制台的「角色文档」缺内容；
 *     ② `characterWikiLookup::getCharacterWikiDetails` → 掉进「自定义角色」兜底
 *        ⇒ 图鉴里只剩一行 `role.ability`，简介/运作/范例/提示全空。
 *   这类「数据在、查询键对不上」的死法本项目已复发多次，故用单测钉住。
 *
 * 判据（不是断言「查得到非空」，而是**断言查到的是官方那一条**）：
 *   英文名必须是 Pit-Hag / No Dashii，且【角色能力】/【运作方式】必须有内容。
 */
import { describe, expect, it } from "vitest";
import { roles as appRoles } from "../../../app/data";
import { getCharacterWikiDetails } from "../characterWikiLookup";
import { getRoleDocSummary } from "../roleDocLookup";

/**
 * 🚧 已知「官方原文不在本仓」的自制 / 扩展角色（**不是缺陷，是数据边界**）。
 * 这些角色的文本只存在于 `app/data.ts` 的 `ability` 字段（作者自撰），
 * `json/full/*.json`（官方 wiki 抓取）里没有对应条目，任何来源都补不出官方原文。
 * ⇒ 允许它们退回 RoleDefinition 文案；**新增未登记的角色会立刻变红**，
 *   逼着下次要写清楚「这个角色的官方基线在哪」。
 */
const NO_OFFICIAL_SOURCE = new Set([
  "astrologer", // 星象师（扩展镇民，自撰）
  "miner", // 矿工（扩展镇民，自撰）
  "lloam", // 罗姆（实验性恶魔，自撰）
  "titus", // 提图斯（实验性恶魔，自撰）
  "liz", // 利兹（实验性恶魔，自撰）
]);

const CASES = [
  { local: "坑道巫婆", official: "麻脸巫婆", english: "Pit-Hag" },
  { local: "诺-达", official: "诺-达鲺", english: "No Dashii" },
] as const;

describe("🀄 角色文档译名分歧", () => {
  for (const c of CASES) {
    it(`图鉴：${c.local} 必须查到官方【${c.official}】的全量条目`, () => {
      const d = getCharacterWikiDetails(c.local);
      expect(d, `getCharacterWikiDetails("${c.local}") 返回 null`).not.toBeNull();
      expect(d?.name, `查到的是「${d?.name}」而不是官方译名「${c.official}」`).toBe(
        c.official
      );
      expect(d?.englishName).toBe(c.english);
      // 兜底合成对象只有 abilityText + strategyTips，且没有 operation / overview
      expect(d?.operation, "【运作方式】为空 ⇒ 说明掉进了「自定义角色」兜底").toBeTruthy();
      expect(d?.overview, "【角色简介】为空 ⇒ 同上").toBeTruthy();
      expect(d?.abilityText).toBeTruthy();
    });

    it(`说书人文档：${c.local} 必须拿到官方【${c.official}】的【运作方式】`, () => {
      const s = getRoleDocSummary(c.local);
      expect(s, `getRoleDocSummary("${c.local}") 返回 null`).not.toBeNull();
      expect(s?.abilityText, "【角色能力】为空").toBeTruthy();
      expect(
        s?.operation,
        "【运作方式】为空 ⇒ 退回了 RoleDefinition.detailedDescription（缺这一节）"
      ).toBeTruthy();
      // 同一角色的官方译名必须与本地译名查到**完全一致**的结果
      const viaOfficial = getRoleDocSummary(c.official);
      expect(s?.abilityText).toBe(viaOfficial?.abilityText);
      expect(s?.operation).toBe(viaOfficial?.operation);
    });
  }

  it("替罪羊：officialRoleDocs 必须补上官方原文（此前整条缺失）", () => {
    const s = getRoleDocSummary("替罪羊");
    expect(s, "替罪羊 在 officialRoleDocs.json 里整条缺失").not.toBeNull();
    // 官方【角色能力】逐字：「如果你的阵营的一名玩家被处决，你可能会代替他被处决。」
    expect(s?.abilityText).toContain("代替他被处决");
    expect(s?.examples?.length, "【范例】至少 3 条").toBeGreaterThanOrEqual(3);
    expect(s?.background, "【背景故事】为空").toBeTruthy();
  });

  it("反证：非法译名不得凭空造出文档", () => {
    expect(getRoleDocSummary("不存在的角色XYZ")).toBeNull();
  });

  /**
   * 全量兜底：`app/data.ts` 里每个**可发牌**角色（镇民/外来者/爪牙/恶魔/旅行者）
   * 都必须能查到一条带【角色能力】的文档。
   * 这条挡的是「新加角色只写了 ability，忘了补文档」——
   * 症状是控制台「角色文档」整块空白，但单测全绿（因为没人断言过它非空）。
   */
  it("全量：每个可发牌角色都必须有【角色能力】可读", () => {
    const dealable = (appRoles as any[]).filter((r) =>
      ["townsfolk", "outsider", "minion", "demon", "traveler"].includes(r?.type)
    );
    expect(dealable.length, "app/data.ts 角色表解析失败（防止变成空测）").toBeGreaterThan(
      150
    );
    const broken: string[] = [];
    for (const r of dealable) {
      if (NO_OFFICIAL_SOURCE.has(r.id)) continue;
      const s = getRoleDocSummary(r.name);
      if (!s?.abilityText) broken.push(`${r.id}/${r.name}`);
    }
    expect(
      broken,
      `以下角色查不到【角色能力】（新加角色请补 officialRoleDocs 或登记进 NO_OFFICIAL_SOURCE）：\n` +
        broken.join("\n")
    ).toEqual([]);
  });

  it("全量：已登记的「无官方来源」角色必须是真实存在的 id（防止名单过期）", () => {
    const ids = new Set((appRoles as any[]).map((r) => r.id));
    const stale = [...NO_OFFICIAL_SOURCE].filter((id) => !ids.has(id));
    expect(stale, `以下 id 已不存在，请从 NO_OFFICIAL_SOURCE 删掉：${stale.join(", ")}`).toEqual(
      []
    );
  });
});
