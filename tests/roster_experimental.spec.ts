/**
 * 实验角色花名册测试 (自定义剧本)
 *
 * 使用自建剧本创建包含所有实验角色的自定义剧本，
 * 逐个分配、运行、验证到达白天。
 *
 * 覆盖 24 个实验角色
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface ExpRole { name: string; fill: string[]; }

const EXP_ROLES: ExpRole[] = [
  // 实验镇民
  { name: "半兽人", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "星象师", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "骑士", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "贵族", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "朝圣者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "女祭司", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "唱诗男孩", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "公主", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "农夫", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "失忆者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "无神论者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "渔夫", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "矿工", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "游侠", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "杂技演员", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "食人族", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "工程师", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "气球驾驶员", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "市长", fill: ["洗衣妇","厨师","投毒者"] },
  // 实验外来者
  { name: "报丧女妖", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "告密者", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "解谜大师", fill: ["洗衣妇","厨师","投毒者"] },
  // 实验爪牙
  { name: "提线木偶", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "维齐尔", fill: ["洗衣妇","厨师","投毒者"] },
  { name: "巫师", fill: ["洗衣妇","厨师","投毒者"] },
];

test.describe("实验角色花名册 (24个)", () => {
  for (const role of EXP_ROLES) {
    test(`${role.name}`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      // 自建剧本
      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      const buildBtn = page.locator("button:has-text('自建剧本')");
      await expect(buildBtn).toBeVisible({ timeout: 10000 });
      await buildBtn.click();
      await page.waitForTimeout(1000);

      await page.locator("#script-name-input").fill("实验测试");
      await page.waitForTimeout(300);

      // 只选必要的角色
      const needed = [role.name, ...role.fill, "小恶魔"];
      for (const n of needed) {
        const btn = page.locator(`button:has-text("${n}")`).first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(150);
        }
      }

      await page.locator("button:has-text('保存剧本')").click();
      await page.waitForTimeout(800);

      // 选自定义剧本
      await page.locator("text=实验测试").click();
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
