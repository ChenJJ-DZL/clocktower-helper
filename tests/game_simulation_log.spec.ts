import fs from "node:fs";
import { test } from "@playwright/test";

const GAME_URL = "http://localhost:3000";
const LOG_FILE_PATH = "simulation-log.txt";

test("游戏模拟与日志记录", async ({ page }) => {
  test.setTimeout(120000);
  const logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: "w" });
  page.on("console", (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] [${msg.type()}] ${msg.text()}\n`;
    logStream.write(line);
  });

  page.on("dialog", async (d) => { if (d.type() === "confirm") await d.accept(); });

  // 1. 加载页面
  await page.goto(GAME_URL);
  await page.waitForTimeout(1000);
  console.log("[TEST] 页面加载成功");

  // 2. 选择剧本
  await page.getByRole("button", { name: /暗流涌动/ }).click();
  await page.waitForTimeout(1500);

  // 3. 快速测试
  await page.getByRole("button", { name: /快速测试/ }).click();
  await page.waitForTimeout(3000);
  console.log("[TEST] 快速测试完成");

  // 4. 处理酒鬼对话框
  const setupBtn = page.getByRole("button", { name: /设置酒鬼身份/ });
  if (await setupBtn.isVisible().catch(() => false)) {
    await setupBtn.click();
    await page.waitForTimeout(1000);
    // 用 evaluate 点击弹窗中的第一个角色按钮
    await page.evaluate(() => {
      const overlay = document.querySelector('[class*="fixed"]');
      if (!overlay) return;
      const btns = overlay.querySelectorAll("button");
      for (const b of btns) {
        const t = b.textContent?.trim() || "";
        if (t && t !== "✕" && !t.includes("确认选择")) { b.click(); return; }
      }
    });
    await page.waitForTimeout(500);
    // 点击确认选择
    await page.evaluate(() => {
      const overlay = document.querySelector('[class*="fixed"]');
      if (!overlay) return;
      const btns = overlay.querySelectorAll("button");
      for (const b of btns) {
        if (b.textContent?.includes("确认选择") && !b.disabled) { b.click(); return; }
      }
    });
    await page.waitForTimeout(800);
  }

  // 5. 入夜
  const nightBtn = page.getByRole("button", { name: /入夜/ });
  if (await nightBtn.isVisible().catch(() => false)) {
    await nightBtn.click();
    await page.waitForTimeout(2000);
    console.log("[TEST] 已进入首夜");
  }

  // 6. 简单验证：确认页面在首夜阶段
  const bodyText = await page.evaluate(() => document.body.textContent || "");
  const hasNightPhase = bodyText.includes("首夜");
  console.log(`[TEST] 首夜阶段: ${hasNightPhase ? "✅" : "❌"}`);

  logStream.end();
});
