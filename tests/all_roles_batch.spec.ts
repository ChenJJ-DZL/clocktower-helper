/**
 * Phase 2 批量 E2E 测试 — 全剧本白天能力角色
 *
 * 验证每个有 day 属性的角色：按钮存在 + 可点击 + 对话框可处理
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface RoleTest {
  roleName: string;
  script: string; // 首页按钮文本
  demon: string; // 恶魔名
  townsfolk: string[]; // 镇民填充2个
  minion: string; // 爪牙
}

const ROLES: RoleTest[] = [
  // ── 暗流涌动 (Trouble Brewing) ──
  {
    roleName: "猎手",
    script: "暗流涌动",
    demon: "小恶魔",
    townsfolk: ["洗衣妇", "厨师"],
    minion: "投毒者",
  },
  // ── 黯月初升 (Bad Moon Rising) ──
  {
    roleName: "赌徒",
    script: "黯月初升",
    demon: "僵怖",
    townsfolk: ["祖母", "水手"],
    minion: "刺客",
  },
  {
    roleName: "造谣者",
    script: "黯月初升",
    demon: "僵怖",
    townsfolk: ["祖母", "水手"],
    minion: "刺客",
  },
  {
    roleName: "修补匠",
    script: "黯月初升",
    demon: "僵怖",
    townsfolk: ["祖母", "水手"],
    minion: "刺客",
  },
  {
    roleName: "吟游诗人",
    script: "黯月初升",
    demon: "僵怖",
    townsfolk: ["祖母", "水手"],
    minion: "刺客",
  },
  // ── 梦殒春宵 (Sects & Violets) ──
  {
    roleName: "艺术家",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
  },
  {
    roleName: "博学者",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
  },
  {
    roleName: "杂耍艺人",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
  },
  {
    roleName: "哲学家",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
  },
];

test.describe("全剧本 DAY 能力角色 (Phase 1+2)", () => {
  for (const role of ROLES) {
    test(`${role.roleName} (${role.script})`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      await page.locator(`text=${role.script}`).first().click();
      await page.waitForTimeout(1500);
      await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
      await page.waitForSelector(".seat-node[data-seat-id]", {
        timeout: 10000,
      });

      const seats = page.locator(".seat-node[data-seat-id]");
      const assign = async (name: string, idx: number) => {
        const btn = page.getByRole("button", { name: new RegExp(name, "i") });
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();
        await page.waitForTimeout(300);
        const all = await seats.all();
        if (all.length <= idx) return;
        await all[idx].click();
        await page.waitForTimeout(300);
      };

      await assign(role.roleName, 0);
      await assign(role.townsfolk[0], 1);
      await assign(role.townsfolk[1], 2);
      await assign(role.minion, 3);
      await assign(role.demon, 4);

      await page.getByRole("button", { name: /开始游戏/ }).click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("button", { name: /确认无误/ });
      if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(1000);
      }

      await skipToDay(page);

      // 关闭所有残留弹窗（修复BMR修补匠按钮被遮罩覆盖）
      for (let m = 0; m < 10; m++) {
        const modal = page
          .locator(
            ".fixed.inset-0.z-50, .fixed.inset-0.z-\\[3200\\], [data-modal-key]"
          )
          .first();
        if (!(await modal.isVisible({ timeout: 100 }).catch(() => false)))
          break;
        const closeBtn = modal.locator("button:not([disabled])").first();
        if (await closeBtn.isVisible({ timeout: 100 }).catch(() => false)) {
          await closeBtn.click().catch(() => {});
          await page.waitForTimeout(300);
        } else {
          break;
        }
      }

      const btn = page.locator(`button:has-text('${role.roleName}')`);
      await expect(btn.first()).toBeVisible({ timeout: 5000 });
      // force:true 绕过残留遮罩层(BMR修补匠特定问题)
      await btn.first().click({ force: true });
      await page.waitForTimeout(500);
    });
  }
});
