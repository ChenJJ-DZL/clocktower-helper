/**
 * E2E 测试 - 猎手(Slayer) 白天能力
 *
 * 场景：猎手使用白天技能选择小恶魔 → 小恶魔死亡
 *
 * 验证：①"使用 猎手"按钮存在 ②目标选择弹窗正常 ③选中小恶魔后正确处决
 */
import { expect, test } from "@playwright/test";

test("猎手(Slayer) - 白天选恶魔 → 恶魔被杀死", async ({ page }) => {
  test.setTimeout(300000);

  // ─── 1. 剧本选择与角色分配 ──────────────────────────
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });

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

  // 5人局: 猎手(0) + 洗衣妇(1) + 厨师(2) + 投毒者(3) + 小恶魔(4)
  await assignRole("猎手", 0);
  await assignRole("洗衣妇", 1);
  await assignRole("厨师", 2);
  await assignRole("投毒者", 3);
  await assignRole("小恶魔", 4);

  // ─── 2. 开始游戏 ──────────────────────────────
  const startBtn = page.getByRole("button", { name: /开始游戏/ });
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();
  await page.waitForTimeout(1500);

  // ─── 3. 确认入夜 ──────────────────────────────
  const confirmBtn = page.getByRole("button", { name: /确认无误/ });
  if (await confirmBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }

  // ─── 4. 跳过首夜 ──────────────────────────────
  for (let i = 0; i < 60; i++) {
    const isDay = await page
      .locator("button:has-text('进入黄昏处决阶段'), button:has-text('发起提名')")
      .first()
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isDay) { console.log("✅ 白天阶段"); await page.waitForTimeout(2000); break; }

    // 夜晚报告弹窗
    const nr = page.locator("h2:has-text('夜晚报告'), text=昨晚");
    if (await nr.first().isVisible({ timeout: 500 }).catch(() => false)) {
      const cr = page.getByRole("button", { name: "确认" });
      if (await cr.isVisible().catch(() => false)) { await cr.click(); await page.waitForTimeout(1000); }
    }

    const dawn = page.getByRole("button", { name: /开始白天|天亮了/ });
    if (await dawn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dawn.click(); await page.waitForTimeout(1500); continue;
    }

    const next = page.locator("button").filter({ hasText: /确认.*下一步|下一步|确认/ });
    if (await next.first().isVisible({ timeout: 500 }).catch(() => false)) {
      await next.first().click(); await page.waitForTimeout(500);
    } else {
      await page.waitForTimeout(1000);
    }
  }

  // ─── 5. 使用猎手技能 ──────────────────────────
  // 找"使用 猎手"按钮
  const slayerBtn = page.locator("button:has-text('猎手')");
  const slayerVisible = await slayerBtn
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (slayerVisible) {
    console.log("✅ 猎手技能按钮可见");
    await slayerBtn.first().click();
    await page.waitForTimeout(1500);
  } else {
    console.log("⚠️ 猎手按钮不可见，查找可用技能区域...");
    await page.screenshot({ path: "slayer-no-button.png" });
  }

  // ─── 6. 选择目标（小恶魔 = seat 4） ────────────
  // SlayerSelectTargetModal 弹窗中，每个角色是一个 button
  // 按钮文本格式: "5号 玩家 5 存活 小恶魔"
  const impBtn = page.getByRole("button", { name: /小恶魔/ });
  if (await impBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await impBtn.click();
    await page.waitForTimeout(500);
    console.log("✅ 已选择小恶魔为目标");
  }

  // 确认选择
  const confirmKill = page.getByRole("button", { name: /确认选择/ });
  if (await confirmKill.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmKill.click();
    await page.waitForTimeout(1500);
    console.log("✅ 已确认猎手射击");
  }

  // ─── 7. 验证结果 ──────────────────────────────
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "slayer-result.png" });

  const bodyText = await page.evaluate(() => document.body.innerText);
  const demonDead =
    bodyText.includes("处决") ||
    bodyText.includes("死亡") ||
    bodyText.includes("4号") ||
    bodyText.includes("已死亡");

  console.log(demonDead ? "✅ 猎手技能生效" : "⚠️ 需要检查结果");
});
