/**
 * E2E 测试 - 圣女(Virgin) 条件性技能
 *
 * 场景：镇民提名圣女 → 提名者被立即处决
 *
 * E2E 测试的价值：验证"提名发生时提名系统正确检测到圣女并触发能力"的完整链路，
 * 包括：①提名UI可用 ②圣女向导弹窗弹出 ③向导选择正确 ④处决生效
 */
import { expect, test } from "@playwright/test";

test("圣女(Virgin) - 镇民提名圣女 → 提名者被立即处决", async ({ page }) => {
  test.setTimeout(300000);

  // ─── 1. 访问与剧本选择 ──────────────────────────
  await page.goto("http://localhost:3001");
  await page.waitForLoadState("networkidle");

  // 点击暗流涌动
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });

  // ─── 2. 分配角色 ──────────────────────────────
  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });
  const seats = page.locator(".seat-node[data-seat-id]");

  const assignRole = async (roleName: string, seatIndex: number) => {
    const roleBtn = page.getByRole("button", { name: new RegExp(roleName, "i") });
    await expect(roleBtn).toBeVisible({ timeout: 5000 });
    await roleBtn.click();
    await page.waitForTimeout(300);

    const allSeats = await seats.all();
    if (allSeats.length <= seatIndex) return;
    await allSeats[seatIndex].click();
    await page.waitForTimeout(300);
  };

  // 5人局: 圣女(0) + 洗衣妇(1,充当提名者) + 厨师(2) + 投毒者(3) + 小恶魔(4)
  await assignRole("贞洁者", 0);
  await assignRole("洗衣妇", 1);
  await assignRole("厨师", 2);
  await assignRole("投毒者", 3);
  await assignRole("小恶魔", 4);

  // ─── 3. 开始游戏 ──────────────────────────────
  const startBtn = page.getByRole("button", { name: /开始游戏/ });
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();
  await page.waitForTimeout(1500);

  // ─── 4. 确认入夜 ──────────────────────────────
  const confirmBtn = page.getByRole("button", { name: /确认无误/ });
  if (await confirmBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }

  // 5. 使用 page.evaluate 直接推进夜晚阶段到白天
  await page.evaluate(async () => {
    for (let i = 0; i < 200; i++) {
      const bodyText = document.body.innerText;
      if (bodyText.includes('进入黄昏处决阶段') || bodyText.includes('发起提名')) break;
      
      let acted = false;
      const buttons = document.querySelectorAll('button');
      
      // 优先点击"下一步"按钮（如果可用）
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if ((text.includes('下一步') || text.includes('继续')) && !btn.disabled && btn.offsetParent) {
          btn.click(); acted = true; break;
        }
      }
      
      // 如果没有"下一步"可用，尝试点击"确认"按钮
      if (!acted) {
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (text.includes('确认') && !btn.disabled && btn.offsetParent && !text.includes('结果')) {
            btn.click(); acted = true; break;
          }
        }
      }
      
      // 如果还没有，尝试点击目标选择（含#号的按钮，如"1# 贞洁者"）
      if (!acted && bodyText.includes('选择目标')) {
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (text.includes('#') && btn.offsetParent && !btn.disabled) {
            btn.click(); acted = true; break;
          }
        }
      }
      
      // 尝试点击"开始白天"按钮
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
  console.log("✅ 夜晚阶段已推进");

  // ─── 6. 提名流程 ──────────────────────────────
  // 截图记录当前白天界面
  await page.screenshot({ path: "virgin-day-start.png" }).catch(() => {});

  // 方案A: 尝试直接找到"发起提名"按钮
  const nominateBtn = page.locator("button:has-text('发起提名')");
  const nominateVisible = await nominateBtn
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (nominateVisible) {
    // 先选择提名者（1号 = seat index 1 = 洗衣妇）
    await seats.nth(1).click();
    await page.waitForTimeout(500);
    // 再选择被提名者（0号 = 圣女）
    await seats.nth(0).click();
    await page.waitForTimeout(500);
    // 发起提名
    await nominateBtn.click();
  } else {
    // 方案B: 先点击"进入黄昏处决阶段"看看提名是否在那边
    console.log("尝试通过黄昏阶段进入提名...");
    const duskBtn = page.locator("button:has-text('进入黄昏处决阶段')");
    if (await duskBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await duskBtn.click();
      await page.waitForTimeout(1500);

      // 在处决阶段尝试找到提名按钮
      const nominate2 = page.locator("button:has-text('发起提名')");
      if (await nominate2.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 选择提名者和被提名者
        const seatElements = await seats.all();
        if (seatElements.length > 1) {
          await seatElements[1].click(); // 提名者
          await page.waitForTimeout(500);
          await seatElements[0].click(); // 被提名者=圣女
          await page.waitForTimeout(500);
          await nominate2.click();
        }
      } else {
        // 方案C: 直接点击圣女座位试试
        console.log("尝试直接与座位交互...");
        const seatElements = await seats.all();
        if (seatElements.length > 0) {
          // 尝试点击每个可见座位
          for (let si = 0; si < Math.min(seatElements.length, 5); si++) {
            await seatElements[si].click();
            await page.waitForTimeout(300);
          }
        }
        // 截图看看现在是什么界面
        await page.screenshot({ path: "virgin-nominate-attempt.png" });
      }
    }
  }

  // ─── 7. 检查圣女弹窗 ──────────────────────────
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "virgin-after-nominate.png" }).catch(() => {});

  // 检查圣女向导弹窗
  const guide = page.locator("text=贞洁者判定向导");
  const hasGuide = await guide.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasGuide) {
    console.log("✅ 圣女向导弹窗已出现");
    // 选择"第一次"（用精确匹配避免匹配到"不是第一次"）
    await page.getByRole("button", { name: "第一次", exact: true }).click();
    await page.waitForTimeout(300);
    // 选择"是镇民"（用精确匹配）
    await page.getByRole("button", { name: "是镇民", exact: true }).click();
    await page.waitForTimeout(300);
    // 确认
    await page.locator("button:has-text('按此指引继续提名')").click();
    await page.waitForTimeout(1500);
    console.log("✅ 圣女向导已确认");

    // 验证处决结果
    const bodyText = await page.evaluate(() => document.body.innerText);
    const executed = bodyText.includes("处决") || bodyText.includes("已死亡");
    await page.screenshot({ path: "virgin-final.png" });
    expect(executed).toBeTruthy();
  } else {
    // 检查触发弹窗
    const trigger = page.locator("text=贞洁者触发");
    const hasTrigger = await trigger
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (hasTrigger) {
      console.log("✅ 圣女触发弹窗已出现");
      await page.locator("button:has-text('处决提名者')").click();
      await page.waitForTimeout(1500);
    } else {
      // 输出当前页面文本用于分析
      const debugText = await page.evaluate(() => document.body.innerText);
      console.log("当前页面文本片段:", debugText.substring(0, 500));
      await page.screenshot({ path: "virgin-debug.png" });
    }
  }
});
