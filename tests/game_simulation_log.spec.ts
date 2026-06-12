import fs from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const GAME_URL = "http://localhost:3000";
const LOG_FILE_PATH = "simulation-log.txt";

function captureConsoleLogs(page: Page, logFilePath: string) {
  const logStream = fs.createWriteStream(logFilePath, { flags: "w" });
  logStream.write(`====== 游戏模拟日志 ======\n`);

  page.on("console", (msg) => {
    const text = msg.text();
    const logLine = `[${new Date().toLocaleTimeString()}] [${msg.type()}] ${text}\n`;
    process.stdout.write(logLine);
    logStream.write(logLine);
  });
}

async function clickSeat(page: Page, seatNumber: number) {
  await page.evaluate((num) => {
    const seats = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const s of seats as any) {
      const fc = s.children[0];
      if (fc && /^\d+$/.test(fc.textContent.trim()) && parseInt(fc.textContent) === num) {
        s.click(); return;
      }
    }
  }, seatNumber);
}

test.skip("游戏模拟与日志记录", async ({ page }) => {
  captureConsoleLogs(page, LOG_FILE_PATH);

  // 1. 访问首页
  await page.goto(GAME_URL);
  await page.waitForTimeout(1000);

  // 2. 选择暗流涌动
  await page.getByRole("button", { name: /暗流涌动/ }).click();
  await page.waitForTimeout(1500);

  // 3. 快速测试
  await page.getByRole("button", { name: /快速测试/ }).click();
  await page.waitForTimeout(3000);

  // 4. 酒鬼身份配置（如果有）
  const setupBtn = page.getByRole("button", { name: /设置酒鬼身份/ });
  if (await setupBtn.isVisible().catch(() => false)) {
    await setupBtn.click();
    await page.waitForTimeout(800);
    // 选择弹窗中的第一个角色
    const roleBtn = page.locator('[data-modal-key] button:not([disabled])').first();
    const roleText = await roleBtn.textContent();
    if (roleText && !roleText.includes('✕')) {
      await roleBtn.click();
      await page.waitForTimeout(200);
      const confirmBtn = page.locator('[data-modal-key] button:not([disabled])').filter({ hasText: '确认选择' });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(400);
      }
    }
  }

  // 5. 入夜
  await page.getByRole("button", { name: /入夜/ }).click();
  await page.waitForTimeout(2000);

  // 6. 处理首夜行动
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);

    // 关闭弹窗
    const modalBtn = page.locator('[data-modal-key] button:not([disabled])');
    if (await modalBtn.first().isVisible().catch(() => false)) {
      await modalBtn.first().click();
      continue;
    }

    // 点击确认按钮
    const confirmBtn = page.getByRole("button", { name: /确认|下一步/ });
    if (await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
      await confirmBtn.click();
      continue;
    }

    // 选择目标（点击座位）
    const seats = page.locator('[class*="cursor-pointer"]');
    const seatCount = await seats.count().catch(() => 0);
    if (seatCount > 0) {
      const seat = seats.first();
      const seatText = await seat.textContent().catch(() => '');
      await seat.click();
      await page.waitForTimeout(150);
      // 如果确认仍禁用，点第二个座位（占卜师需要2个目标）
      if (!(await confirmBtn.isEnabled().catch(() => false))) {
        await seats.nth(1).click().catch(() => {});
        await page.waitForTimeout(100);
      }
      if (await confirmBtn.isEnabled().catch(() => false)) {
        await confirmBtn.click();
      }
    } else {
      break;
    }
  }

  // 7. 天亮确认
  const dawnConfirm = page.getByRole("button", { name: /^确认$/ });
  if (await dawnConfirm.isVisible().catch(() => false)) {
    await dawnConfirm.click();
    await page.waitForTimeout(500);
  }

  console.log("[TEST] 首夜完成，进入白天");
  await page.waitForTimeout(2000);
});
