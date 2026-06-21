/**
 * 传奇角色花名册测试 (自定义剧本)
 *
 * 传奇角色需要通过自定义剧本添加并验证。
 * 覆盖 10 个传奇角色。
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

const LEGENDARY: {name:string;fill:string[]}[] = [
  { name: "末日预言者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "玩具匠", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "天使", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "佛教徒", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "革命者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "失败的上帝", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "摆渡人", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "暴风捕手", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "腹语师", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "诡诈杰克", fill: ["洗衣妇","厨师","投毒者"] },
];

test.describe("传奇角色花名册 (10个)", () => {
  for (const role of LEGENDARY) {
    test(`${role.name}`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      const buildBtn = page.locator("button:has-text('自建剧本')");
      await expect(buildBtn).toBeVisible({ timeout: 10000 });
      await buildBtn.click();
      await page.waitForTimeout(1000);
      await page.locator("#script-name-input").fill("传奇测试");
      await page.waitForTimeout(300);

      const needed = [role.name, ...role.fill, "小恶魔"];
      for (const n of needed) {
        const btn = page.locator(`button:has-text("${n}")`).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click(); await page.waitForTimeout(150);
        }
      }

      await page.locator("button:has-text('保存剧本')").click();
      await page.waitForTimeout(800);
      await page.locator("text=传奇测试").click();
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

      try {
        await assign(role.name, 0);
        for (let i = 0; i < role.fill.length; i++) await assign(role.fill[i], i + 1);
        await assign("小恶魔", 4);

        await page.getByRole("button", { name: /开始游戏/ }).click();
        await page.waitForTimeout(1500);
        const confirm = page.getByRole("button", { name: /确认无误/ });
        if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) { await confirm.click(); await page.waitForTimeout(1000); }

        await skipToDay(page);
        for (let m = 0; m < 5; m++) {
          const modal = page.locator(".fixed.inset-0.z-50, [data-modal-key]").first();
          if (!(await modal.isVisible({ timeout: 100 }).catch(() => false))) break;
          const btn = modal.locator("button:not([disabled])").first();
          if (await btn.isVisible({ timeout: 100 }).catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300); }
          else break;
        }
        const txt = await page.evaluate(() => document.body.innerText);
        expect(txt.includes("第 1 天")).toBeTruthy();
        console.log(`✅ [${role.name}] 到达白天`);
      } catch (e: any) {
        console.log(`❌ [${role.name}] ${e.message?.substring(0,80)}`);
        throw e;
      }
    });
  }
});
