import { test } from "@playwright/test";

test.setTimeout(30000);
test("debug body text", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /快速测试/ }).click();
  await page.waitForTimeout(2000);

  const body = await page.evaluate(() => document.body?.innerText || "");
  // 查找敏感词
  const idx1 = body.indexOf("游戏结束");
  const idx2 = body.indexOf("胜利");
  const idx3 = body.indexOf("获胜");

  if (idx1 >= 0)
    console.log(
      `游戏结束 at ${idx1}: "${body.substring(Math.max(0, idx1 - 30), idx1 + 50)}"`
    );
  if (idx2 >= 0)
    console.log(
      `胜利 at ${idx2}: "${body.substring(Math.max(0, idx2 - 30), idx2 + 50)}"`
    );
  if (idx3 >= 0)
    console.log(
      `获胜 at ${idx3}: "${body.substring(Math.max(0, idx3 - 30), idx3 + 50)}"`
    );

  // 按钮
  const buttons = await page.locator("button").allTextContents();
  console.log("Buttons:", buttons.filter((b) => b.trim()).slice(0, 10));
});
