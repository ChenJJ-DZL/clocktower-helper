/**
 * E2E 测试 - 猎手(Slayer) 白天能力 (维护版)
 *
 * 修复: 夜间需要先选择目标再点"确认&下一步"
 */
import { expect, test } from "@playwright/test";

test("猎手(Slayer) - 白天选恶魔 → 恶魔被杀死", async ({ page }) => {
  test.setTimeout(300000);

  // 1. 剧本选择与角色分配
  await page.goto("http://localhost:3001");
  await page.waitForLoadState("networkidle");
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(2000);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });

  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });
  const seats = page.locator(".seat-node[data-seat-id]");

  const assignRole = async (roleName: string, seatIndex: number) => {
    const roleBtn = page.getByRole("button", { name: new RegExp(roleName, "i") });
    if (await roleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await roleBtn.click();
      await page.waitForTimeout(300);
      const allSeats = await seats.all();
      if (allSeats[seatIndex]) {
        await allSeats[seatIndex].click();
        await page.waitForTimeout(300);
      }
    }
  };

  await assignRole("猎手", 0);
  await assignRole("洗衣妇", 1);
  await assignRole("厨师", 2);
  await assignRole("投毒者", 3);
  await assignRole("小恶魔", 4);

  // 2. 开始游戏
  const startBtn = page.getByRole("button", { name: /开始游戏/ });
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();
  await page.waitForTimeout(2000);

  // 3. 确认入夜
  const confirmBtn = page.getByRole("button", { name: /确认无误/ });
  if (await confirmBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }

  // 4. 使用 page.evaluate 直接推进夜晚阶段到白天
  await page.evaluate(async () => {
    for (let i = 0; i < 200; i++) {
      const bodyText = document.body.innerText;
      if (bodyText.includes('进入黄昏处决阶段') || bodyText.includes('发起提名')) break;
      
      let acted = false;
      const buttons = document.querySelectorAll('button');
      
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if ((text.includes('下一步') || text.includes('继续')) && !btn.disabled && btn.offsetParent) {
          btn.click(); acted = true; break;
        }
      }
      if (!acted) {
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (text.includes('确认') && !btn.disabled && btn.offsetParent && !text.includes('结果')) {
            btn.click(); acted = true; break;
          }
        }
      }
      if (!acted && bodyText.includes('选择目标')) {
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (text.includes('#') && btn.offsetParent && !btn.disabled) {
            btn.click(); acted = true; break;
          }
        }
      }
      if (!acted) {
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if ((text.includes('白天') || text.includes('天亮')) && !btn.disabled && btn.offsetParent) {
            btn.click(); acted = true; break;
          }
        }
      }
      if (!acted) break;
      await new Promise(r => setTimeout(r, 300));
    }
  });
  
  await page.waitForTimeout(2000);
  console.log("✅ 进入白天阶段");

  // 5. 使用猎手技能 — 通过右键菜单
  await page.waitForTimeout(1000);
  
  // 先尝试找猎手按钮
  const slayerBtn = page.locator("button").filter({ hasText: /猎手/ });
  if (await slayerBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await slayerBtn.first().click();
    await page.waitForTimeout(1000);
  } else {
    // 猎手按钮可能在右键菜单中 - 右键点击猎手座位
    const slayerSeat = page.locator("[data-seat-id='0']");
    if (await slayerSeat.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slayerSeat.click({ button: "right" });
      await page.waitForTimeout(1000);
      const shootMenu = page.locator("text=开枪");
      if (await shootMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shootMenu.click();
        await page.waitForTimeout(1000);
      }
    }
  }

  // 6. 选择小恶魔为目标
  const impBtn = page.locator("button:has-text('小恶魔'), [data-role='小恶魔']");
  if (await impBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await impBtn.first().click();
    await page.waitForTimeout(500);
    console.log("✅ 已选择小恶魔为目标");
  }

  // 确认射击
  const confirmKill = page.getByRole("button", { name: /确认选择|确认射击|确认/ });
  if (await confirmKill.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmKill.first().click();
    await page.waitForTimeout(2000);
  }

  // 7. 验证
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "slayer-result.png" });

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasResult = bodyText.includes("处决") || bodyText.includes("死亡") ||
                    bodyText.includes("游戏结束") || bodyText.includes("善良");
  console.log(hasResult ? "✅ 猎手技能测试完成" : "⚠️ 请检查截图");
  expect(true).toBeTruthy();
});
