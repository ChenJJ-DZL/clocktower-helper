import { describe, it, expect } from "vitest";
import { getCharacterWikiDetails } from "../characterWikiLookup";

describe("角色百科官方详情解析 (getCharacterWikiDetails) 测试", () => {
  const poppygandaRoleIds = [
    "poppy_grower",
    "snitch",
    "marionette",
    "legion",
    "bounty_hunter",
    "pixie",
  ];

  poppygandaRoleIds.forEach((roleId) => {
    it(`应能完整解析 ${roleId} 的 6 段式官方 Wiki 数据`, () => {
      const details = getCharacterWikiDetails(roleId);
      expect(details).toBeDefined();
      expect(details?.name).toBeTruthy();
      expect(details?.abilityText).toBeTruthy();
      expect(details?.overview).toBeTruthy();
      expect(details?.operation).toBeTruthy();
      expect(details?.ruleDetails).toBeTruthy();
      expect(details?.scenarios).toBeTruthy();
      expect(details?.strategyTips.length).toBeGreaterThan(0);
    });
  });

  it("赏金猎人 (bounty_hunter) 的范例与规则细节应正确解析", () => {
    const bh = getCharacterWikiDetails("bounty_hunter");
    expect(bh?.name).toBe("赏金猎人");
    expect(bh?.scenarios?.includes("小艾是赏金猎人")).toBe(true);
    expect(bh?.operation?.includes("倒转放置")).toBe(true);
    expect(bh?.ruleDetails?.includes("哲学家")).toBe(true);
  });

  it("小精灵 (pixie) 的范例与规则细节应正确解析", () => {
    const pixie = getCharacterWikiDetails("pixie");
    expect(pixie?.name).toBe("小精灵");
    expect(pixie?.scenarios?.includes("小米是小精灵")).toBe(true);
    expect(pixie?.operation?.includes("疯狂")).toBe(true);
  });
});
