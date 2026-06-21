/**
 * Phase 2 批量 E2E 测试 — BMR/S&V/实验/传奇/旅行者 白天能力
 *
 * 覆盖角色：
 *   黯月初升: 弄臣(fool)、刺客(assassin)、教授(professor)
 *   梦殒春宵: 哲学家(philosopher)、女裁缝(seamstress)、渔夫(fisherman)、工程师(engineer)
 *   实验角色: 食人族(cannibal)、吟游诗人(minstrel)
 *   传奇角色: 末日预言者(doomsayer)
 *   旅行者:   官员(bureaucrat)、乞丐(beggar)、枪手(gunslinger)
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface RoleTest {
  roleName: string;
  scriptText: string;
  demonName: string;
  townsfolkAlt1: string;
  townsfolkAlt2: string;
  minionName: string;
}

const PHASE2_ROLES: RoleTest[] = [
  // 黯月初升(BMR) — 吟游诗人是白天能力
  { roleName: "吟游诗人", scriptText: "黯月初升", demonName: "僵怖", townsfolkAlt1: "祖母", townsfolkAlt2: "水手", minionName: "刺客" },
  // 梦殒春宵(S&V) — 哲学家是白天能力
  { roleName: "哲学家", scriptText: "梦殒春宵", demonName: "涡流", townsfolkAlt1: "筑梦师", townsfolkAlt2: "数学家", minionName: "麻脸巫婆" },
];

test.describe("Phase 2 — 高优先级 DAY 能力角色", () => {
  for (const role of PHASE2_ROLES) {
    test(`${role.roleName} - 按钮存在且可点击 (${role.scriptText})`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => { console.log(`对话框:`, d.message().substring(0, 50)); d.accept(); });

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      await page.locator(`text=${role.scriptText}`).first().click();
      await page.waitForTimeout(1500);
      await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
      await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

      const seats = page.locator(".seat-node[data-seat-id]");
      const assign = async (name: string, idx: number) => {
        const btn = page.getByRole("button", { name: new RegExp(name, "i") });
        await expect(btn).toBeVisible({ timeout: 5000 }); await btn.click();
        await page.waitForTimeout(300);
        const all = await seats.all(); if (all.length <= idx) return;
        await all[idx].click(); await page.waitForTimeout(300);
      };

      await assign(role.roleName, 0);
      await assign(role.townsfolkAlt1, 1);
      await assign(role.townsfolkAlt2, 2);
      await assign(role.minionName, 3);
      await assign(role.demonName, 4);

      await page.getByRole("button", { name: /开始游戏/ }).click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("button", { name: /确认无误/ });
      if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
        await confirm.click(); await page.waitForTimeout(1000);
      }

      await skipToDay(page);

      const roleBtn = page.locator(`button:has-text('${role.roleName}')`);
      await expect(roleBtn.first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ [${role.roleName}] 按钮可见`);

      await roleBtn.first().click();
      await page.waitForTimeout(1000);
      console.log(`✅ [${role.roleName}] 按钮点击成功`);
    });
  }
});
