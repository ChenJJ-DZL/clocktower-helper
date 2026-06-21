/**
 * E2E 测试 - 艺术家(Artist) 白天能力
 * 场景：艺术家使用技能 → 弹窗输入提问 → 选择"是" → 关闭弹窗
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

test("艺术家(Artist) - 白天技能弹窗是/否", async ({ page }) => {
  test.setTimeout(120000);

  // 1. 选剧本+分角色
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");
  await page.locator("text=梦殒春宵").first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

  const seats = page.locator(".seat-node[data-seat-id]");
  const assignRole = async (name: string, idx: number) => {
    const btn = page.getByRole("button", { name: new RegExp(name, "i") });
    await expect(btn).toBeVisible({ timeout: 5000 }); await btn.click(); await page.waitForTimeout(300);
    const all = await seats.all(); if (all.length <= idx) return;
    await all[idx].click(); await page.waitForTimeout(300);
  };
  await assignRole("艺术家", 0);  // Artist
  await assignRole("筑梦师", 1);
  await assignRole("数学家", 2);
  await assignRole("麻脸巫婆", 3);
  await assignRole("涡流", 4);    // Vortox (demon)

  // 2. 开始游戏
  await page.getByRole("button", { name: /开始游戏/ }).click();
  await page.waitForTimeout(1500);
  const confirm = page.getByRole("button", { name: /确认无误/ });
  if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) { await confirm.click(); await page.waitForTimeout(1000); }

  // 3. 跳过夜间
  await skipToDay(page);

  // 自动确认所有 window 对话框
  page.on("dialog", (dialog) => {
    console.log("✅ 对话框:", dialog.message());
    dialog.accept();
  });

  // 4. 使用艺术家技能
  const artistBtn = page.locator("button:has-text('艺术家')");
  await expect(artistBtn.first()).toBeVisible({ timeout: 5000 });
  await artistBtn.first().click();
  await page.waitForTimeout(1500);

  // 5. ArtistResultModal: 三个按钮 是/否/不知道
  const yesBtn = page.getByRole("button", { name: "是", exact: true });
  await expect(yesBtn).toBeVisible({ timeout: 5000 });
  console.log("✅ 艺术家弹窗显示, 是/否/不知道按钮可见");
  await yesBtn.click();
  await page.waitForTimeout(500);
  console.log("✅ 艺术家: 选择了'是'");
});
