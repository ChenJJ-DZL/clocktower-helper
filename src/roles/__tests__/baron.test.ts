import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import {
  STANDARD_COMPOSITIONS,
  generateAndSortQuickStartLineup,
} from "../../utils/quickStartGenerator";
import { TB, r } from "./_tbHarness";

/**
 * 男爵 (Baron) —— 官方：
 * 【角色能力】会有额外的外来者在场。[+2 外来者]
 * 【角色简介】「外来者的数量变化会发生在**初始设置**时，且不会因为男爵死亡而
 *   恢复成原本的数量。」
 * → 即：设置时外来者 +2、镇民 −2；男爵死亡**不**回滚。
 */
describe("男爵 (Baron)", () => {
  it("官方能力文本为 [+2 外来者]（判据：officialRoleDocs.json 原文）", () => {
    const official = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src/data/officialRoleDocs.json"),
        "utf8"
      )
    ) as Record<string, string>;
    const text = String(official["男爵"] ?? "");
    expect(text, "官方文档缺少男爵条目").toBeTruthy();
    expect(text, "官方原文应写明额外的外来者 [+2 外来者]").toMatch(
      /\[?\+?2\s*外来者\]?|额外的外来者/
    );
    expect(r("baron").type).toBe("minion");
  });

  it("标准人数配置表自洽：村民 + 外来者 + 爪牙 + 恶魔 == 玩家人数", () => {
    for (const [countStr, comp] of Object.entries(STANDARD_COMPOSITIONS)) {
      const count = Number(countStr);
      const sum = comp.townsfolk + comp.outsider + comp.minion + comp.demon;
      expect(sum, `${count} 人局配置合计应为 ${count}，实际 ${sum}`).toBe(count);
      expect(comp.demon, `${count} 人局应有 1 名恶魔`).toBe(1);
    }
  });

  it("⭐⭐ 男爵在场时：外来者 = 基础 +2，镇民相应 −2（总数不变）", () => {
    const PLAYERS = 9;
    const base = STANDARD_COMPOSITIONS[PLAYERS];
    let found: any = null;
    // 爪牙是随机抽的 → 反复抽直到抽到男爵（TB 有 4 名爪牙，9 人局抽 1 名）
    for (let i = 0; i < 600 && !found; i++) {
      const out = generateAndSortQuickStartLineup(TB as any, roles as any, PLAYERS);
      if (out.hasBaron) found = out;
    }
    expect(found, "600 次都没抽到男爵，抽样异常").not.toBeNull();

    expect(found.composition.outsider).toBe(base.outsider + 2);
    expect(found.composition.townsfolk).toBe(base.townsfolk - 2);
    expect(
      found.composition.outsider +
        found.composition.townsfolk +
        found.composition.minion +
        found.composition.demon,
      "男爵只改结构，不改总人数"
    ).toBe(PLAYERS);
    // 发牌也必须真的多出 2 名外来者
    const dealtOutsiders = found.sortedRoles.filter(
      (x: any) => x.type === "outsider"
    ).length;
    expect(dealtOutsiders).toBe(base.outsider + 2);
  });

  it("无男爵时，外来者数量等于标准配置（不误加）", () => {
    const PLAYERS = 9;
    const base = STANDARD_COMPOSITIONS[PLAYERS];
    let checked = 0;
    for (let i = 0; i < 200 && checked < 5; i++) {
      const out = generateAndSortQuickStartLineup(TB as any, roles as any, PLAYERS);
      if (out.hasBaron) continue;
      checked++;
      expect(out.composition.outsider).toBe(base.outsider);
    }
    expect(checked, "样本不足").toBeGreaterThan(0);
  });
});
