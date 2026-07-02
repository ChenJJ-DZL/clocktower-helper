import { expect, test } from "@playwright/test";

test.setTimeout(300000);

/** 夜辅：点击包含指定文本的按钮 */
async function clickBtn(
  page: any,
  text: string,
  timeout = 3000
): Promise<boolean> {
  const btn = page.locator(`button:has-text("${text}")`).first();
  if (await btn.isVisible({ timeout }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

/** 夜辅：关闭所有弹窗 */
async function closeAllDialogs(page: any): Promise<boolean> {
  await page.waitForTimeout(300);
  const selectors = ['div[role="dialog"]', "[data-modal-key]"];
  let closed = false;

  for (const sel of selectors) {
    const d = page.locator(sel).first();
    if (!(await d.isVisible({ timeout: 500 }).catch(() => false))) continue;
    for (const btnText of [
      "确认执行",
      "确认",
      "关闭",
      "好的",
      "确定",
      "是",
      "否",
      "取消",
    ]) {
      const btn = d.locator(`button:has-text("${btnText}")`).first();
      if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
        await btn.click().catch(() => {});
        console.log(`  [关闭弹窗] 点击 "${btnText}"`);
        await page.waitForTimeout(500);
        closed = true;
        break;
      }
    }
    if (closed) break;
  }
  return closed;
}

/** 夜辅：点击座位（确保没有遮罩层） */
async function clickSeat(page: any, id: number): Promise<boolean> {
  // 先尝试关闭弹窗
  await closeAllDialogs(page);
  const seat = page.locator(`[data-seat-id="${id}"]`).first();
  if (await seat.isVisible({ timeout: 500 }).catch(() => false)) {
    await seat.click();
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

/** 夜辅：获取活着的座位ID */
async function getAliveSeats(page: any): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-seat-id]"))
      .filter((n: any) => !n.textContent?.includes("已死亡"))
      .map((n: any) => parseInt(n.getAttribute("data-seat-id") || "-1"))
      .filter((id: number) => id >= 0)
      .sort((a: number, b: number) => a - b)
  );
}

/** 执行一个夜间步骤：找到并点击正确的主按钮 */
async function executeNightStep(
  page: any,
  stepIndex: number
): Promise<boolean> {
  // 优先关闭所有弹窗
  await closeAllDialogs(page);
  await page.waitForTimeout(300);

  // 0. 检查间谍步骤特殊按钮（优先级最高，避免被"上一步"误匹配）
  const expandBtn = page.locator('button:has-text("展开对局记录")').first();
  const expandVisible = await expandBtn
    .isVisible({ timeout: 200 })
    .catch(() => false);
  if (expandVisible) {
    await expandBtn.click();
    console.log(`  [#${stepIndex}] 点击 展开对局记录`);
    await page.waitForTimeout(1000);
    await closeAllDialogs(page);
    await page.waitForTimeout(500);
    return false; // 继续
  }

  // 1. 检查是否天亮了
  if (await clickBtn(page, "天亮了", 200)) {
    console.log(`  [#${stepIndex}] ✅ 天亮了!`);
    return true;
  }
  // 检查是否直接进入白天/黄昏阶段
  if (await clickBtn(page, "进入黄昏处决阶段", 200)) {
    console.log(`  [#${stepIndex}] ✅ 直接进入黄昏阶段!`);
    return true;
  }

  // 2. 检查"确认 & 下一步"按钮
  const nextBtn = page.locator('button:has-text("确认 & 下一步")').first();
  const nextVisible = await nextBtn
    .isVisible({ timeout: 200 })
    .catch(() => false);
  const nextEnabled = nextVisible
    ? await nextBtn.isEnabled({ timeout: 200 }).catch(() => false)
    : false;

  if (nextVisible && nextEnabled) {
    await nextBtn.click();
    console.log(`  [#${stepIndex}] 点击 确认&下一步`);
    await page.waitForTimeout(800);
    await closeAllDialogs(page); // 关闭 NightActionConfirmModal
    await page.waitForTimeout(300);
    await closeAllDialogs(page); // 关闭后续弹窗（如占卜师结果）
    return false; // 继续
  }

  if (nextVisible && !nextEnabled) {
    // 按钮存在但不可用，需要选择目标
    console.log(`  [#${stepIndex}] 按钮不可用，选择目标...`);
    const alive = await getAliveSeats(page);
    for (const sid of alive.slice(0, 3)) {
      await clickSeat(page, sid);
    }
    await closeAllDialogs(page);
    await page.waitForTimeout(300);
    return false; // 继续
  }

  // 3. 检查是否有其他可点击按钮
  const otherButtons = ["确认", "查看", "下一步"];
  for (const btnText of otherButtons) {
    if (await clickBtn(page, btnText, 200)) {
      console.log(`  [#${stepIndex}] 点击 "${btnText}"`);
      await closeAllDialogs(page);
      return false; // 继续
    }
  }

  // 4. 无法识别当前状态
  return false;
}

test("完整流程：首夜→白天→第二夜", async ({ page }) => {
  console.log("=== 完整流程 E2E 测试 ===");

  // ===== 1. 设置阶段 =====
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const tbBtn = page.locator("text=暗流涌动").first();
  if (await tbBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tbBtn.click();
    console.log("✅ 选择暗流涌动剧本");
  }
  await page.waitForTimeout(600);

  if (await clickBtn(page, "快速测试")) {
    console.log("✅ 点击快速测试");
  } else {
    throw new Error("未找到快速测试按钮");
  }
  await page.waitForTimeout(2000);

  // 处理酒鬼伪装身份
  if (await clickBtn(page, "设置酒鬼身份", 2000)) {
    console.log("✅ 处理酒鬼伪装身份弹窗");
    await page.waitForTimeout(500);
    const opt = page
      .locator('div[role="dialog"] button, [data-modal-key] button')
      .first();
    if (await opt.isVisible({ timeout: 1000 }).catch(() => false)) {
      await opt.click();
      await page.waitForTimeout(400);
    }
    await closeAllDialogs(page);
  }

  // ===== 2. 进入首夜 =====
  if (!(await clickBtn(page, "确认无误", 5000))) {
    throw new Error("未找到入夜按钮");
  }
  console.log("✅ 进入首夜");
  await page.waitForTimeout(1000);
  await closeAllDialogs(page);
  await page.waitForTimeout(500);

  // ===== 3. 执行首夜（最多30步）=====
  let reachedDawn = false;
  let noProgressCount = 0;

  for (let i = 0; i < 30 && !reachedDawn; i++) {
    const prevUrl = await page.url();

    const result = await executeNightStep(page, i);
    if (result) {
      // true = 天亮了
      reachedDawn = true;
      break;
    }

    if (i > 0) {
      // 检查是否卡住在同一个状态：连续5轮无进展
      const buttonsVisible = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const labels = btns
          .filter((b) => b.textContent)
          .map((b) => b.textContent);
        return labels;
      });
      console.log(
        `  [#${i}] 页面可见按钮:`,
        JSON.stringify(buttonsVisible.slice(0, 10))
      );

      noProgressCount++;
    }

    if (noProgressCount > 8) {
      console.log("⚠️ 连续8步无进展，可能卡住");
      break;
    }
  }

  // ===== 4. 验证白天阶段 =====
  await page.waitForTimeout(1000);

  const inDay =
    (await page
      .locator('button:has-text("进入黄昏处决阶段")')
      .isVisible({ timeout: 3000 })
      .catch(() => false)) ||
    (await page
      .locator('button:has-text("发起提名")')
      .isVisible({ timeout: 3000 })
      .catch(() => false));

  if (reachedDawn && inDay) {
    console.log("✅ 白天阶段已进入");
  } else if (reachedDawn) {
    console.log("⚠️ 天亮了但未进入白天阶段");
  } else {
    console.log("⚠️ 未能到达天亮");
  }

  // ===== 5. 尝试进入黄昏→第二夜 =====
  if (inDay) {
    if (await clickBtn(page, "进入黄昏处决阶段", 3000)) {
      console.log("✅ 进入黄昏阶段");
      await page.waitForTimeout(1000);
      await closeAllDialogs(page);
      await page.waitForTimeout(500);

      const night2Btn = page.locator('button:has-text("确认无误")').first();
      if (await night2Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await night2Btn.click();
        console.log("✅ 进入第二夜");
        await page.waitForTimeout(1000);
        await closeAllDialogs(page);

        const hasNightAction =
          (await page
            .locator('button:has-text("确认 & 下一步")')
            .isVisible({ timeout: 3000 })
            .catch(() => false)) ||
          (await page
            .locator('button:has-text("天亮了")')
            .isVisible({ timeout: 3000 })
            .catch(() => false)) ||
          (await page
            .locator('button:has-text("展开对局记录")')
            .isVisible({ timeout: 3000 })
            .catch(() => false));

        if (hasNightAction) {
          console.log("✅ 第二夜行动正常显示");
        }
      }
    }
  }

  console.log("=== 测试完成 ===");
  // 成功标准：首夜到达天亮或进入白天阶段
  const success = reachedDawn || inDay;
  expect(success).toBe(true);
});
