/**
 * E2E 测试 - 博学者(Savant) 白天能力
 * 场景：博学者使用技能 → 弹窗输入两条信息 → 确认并记录
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

test("博学者(Savant) - 白天技能弹窗两条信息", async ({ page }) => {
  test.setTimeout(120000);

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
  await assignRole("博学者", 0);  // Savant
  await assignRole("筑梦师", 1);
  await assignRole("数学家", 2);
  await assignRole("麻脸巫婆", 3);
  await assignRole("涡流", 4);    // Vortox

  await page.getByRole("button", { name: /开始游戏/ }).click();
  await page.waitForTimeout(1500);
  const confirm = page.getByRole("button", { name: /确认无误/ });
  if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) { await confirm.click(); await page.waitForTimeout(1000); }

  await skipToDay(page);

  // 自动确认对话框
  page.on("dialog", (dialog) => {
    console.log("✅ 对话框:", dialog.message());
    dialog.accept();
  });

  // 使用博学者技能
  const savantBtn = page.locator("button:has-text('博学者')");
  await expect(savantBtn.first()).toBeVisible({ timeout: 5000 });
  await savantBtn.first().click();
  await page.waitForTimeout(1500);

  // SavantResultModal: 两条信息 textarea + "确认并记录" 按钮
  const confirmBtn = page.getByRole("button", { name: "确认并记录" });
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  console.log("✅ 博学者弹窗显示, 确认并记录按钮可见");
  await confirmBtn.click();
  await page.waitForTimeout(500);
  console.log("✅ 博学者: 确认信息完成");
});
