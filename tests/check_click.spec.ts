import { test } from "@playwright/test";
test("check click", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(2000);
  const hasConfig = await page.getByText("快速测试").isVisible().catch(() => false);
  console.log(`快速测试可见: ${hasConfig}, 错误: ${errors.length ? errors.join("|") : "无"}`);
  if (hasConfig) {
    await page.locator("text=快速测试").click();
    await page.waitForTimeout(4000);
    const hasGame = await page.getByText(/核对身份|酒鬼|入夜/).isVisible().catch(() => false);
    console.log(`游戏界面可见: ${hasGame}`);
  }
});
