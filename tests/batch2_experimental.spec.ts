/**
 * 第2批: 实验角色(24个) - 自定义剧本验证
 *
 * 通过自建剧本添加实验角色，验证游戏能正常启动到达白天
 * 分批: 每批6个角色，避免16G内存溢出
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface ExpRole {
  name: string;
  id: string;
}

const EXP_BATCHES: ExpRole[][] = [
  // Batch A: 镇民类
  [
    { name: "食人族", id: "cannibal" },
    { name: "失忆者", id: "amnesiac" },
    { name: "无神论者", id: "atheist" },
    { name: "工程师", id: "engineer" },
    { name: "矿工", id: "miner" },
    { name: "游侠", id: "ranger" },
  ],
  // Batch B: 镇民类
  [
    { name: "杂技演员", id: "acrobat" },
    { name: "骑士", id: "knight" },
    { name: "贵族", id: "noble" },
    { name: "朝圣者", id: "pilgrim" },
    { name: "女祭司", id: "priestess" },
    { name: "唱诗男孩", id: "choir_boy" },
  ],
  // Batch C: 镇民+外来者
  [
    { name: "公主", id: "princess" },
    { name: "农夫", id: "farmer" },
    { name: "半兽人", id: "half_ogre" },
    { name: "报丧女妖", id: "banshee" },
    { name: "星象师", id: "astrologer" },
    { name: "气球驾驶员", id: "balloonist" },
  ],
  // Batch D: 特殊+爪牙+恶魔
  [
    { name: "市长", id: "mayor" },
    { name: "解谜大师", id: "puzzlemaster" },
    { name: "告密者", id: "snitch" },
    { name: "提线木偶", id: "marionette" },
    { name: "维齐尔", id: "vizier" },
    { name: "巫师", id: "wizard" },
  ],
];

async function setupCustomScript(
  page: any,
  roles: ExpRole[],
  batchName: string
) {
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");

  // 自建剧本
  await page.locator("button:has-text('自建剧本')").click();
  await page.waitForTimeout(1000);
  await page.locator("#script-name-input").fill(`实验批次${batchName}`);
  await page.waitForTimeout(300);

  // 选角色
  for (const r of roles) {
    const btn = page.locator(`button:has-text("${r.name}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const text = await btn.innerText().catch(() => "");
      if (text === r.name || text.startsWith(r.name)) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
  }
  // 加恶魔和填充
  for (const name of ["小恶魔", "洗衣妇", "厨师", "图书管理员"]) {
    const btn = page.locator(`button:has-text("${name}")`).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(150);
    }
  }

  // 保存
  await page.locator("button:has-text('保存剧本')").click();
  await page.waitForTimeout(1500);
}

test.describe("第2批: 实验角色(24)", () => {
  for (let b = 0; b < EXP_BATCHES.length; b++) {
    const batch = EXP_BATCHES[b];
    const batchName = String.fromCharCode(65 + b); // A,B,C,D

    test(`批次${batchName}: 自定义剧本创建+启动`, async ({ page }) => {
      test.setTimeout(180000);
      page.on("dialog", (d) => d.accept());

      await setupCustomScript(page, batch, batchName);

      // 选择自定义剧本
      const scriptCard = page.locator(`text=实验批次${batchName}`).first();
      await expect(scriptCard).toBeVisible({ timeout: 5000 });
      await scriptCard.click();
      await page.waitForTimeout(1500);

      await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
      await page.waitForSelector(".seat-node[data-seat-id]", {
        timeout: 10000,
      });
      const seats = page.locator(".seat-node[data-seat-id]");

      // 只测试第一个实验角色能否正常分配+游戏启动
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

      await assign(batch[0].name, 0);
      await assign("洗衣妇", 1);
      await assign("厨师", 2);
      await assign("图书管理员", 3);
      await assign("小恶魔", 4);

      await page.getByRole("button", { name: /开始游戏/ }).click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("button", { name: /确认无误/ });
      if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(1000);
      }

      await skipToDay(page);
      for (let m = 0; m < 5; m++) {
        const modal = page
          .locator(".fixed.inset-0.z-50, [data-modal-key]")
          .first();
        if (!(await modal.isVisible({ timeout: 100 }).catch(() => false)))
          break;
        const btn = modal.locator("button:not([disabled])").first();
        if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(300);
        } else break;
      }
      const txt = await page.evaluate(() => document.body.innerText);
      expect(txt.includes("第 1 天")).toBeTruthy();
      console.log(`✅ 批次${batchName} 实验角色启动正常`);
    });
  }
});
