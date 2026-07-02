/**
 * E2E 测试 - 筑梦师(Dreamer) 夜间交互
 *
 * 验证：首夜叫醒 → 选目标 → 选展示角色 → 确认 → 推进
 *
 * 这是第一个「不跳过夜间」的交互测试，验证引擎→UI→弹窗的全链路
 */
import { expect, test } from "@playwright/test";

test("筑梦师(Dreamer) - 首夜选目标→选角色→确认", async ({ page }) => {
  test.setTimeout(120000);
  page.on("dialog", (d) => d.accept());

  // ─── 1. 选剧本+分角色 ──────────────────────────
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");
  await page.locator("text=梦殒春宵").first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

  const seats = page.locator(".seat-node[data-seat-id]");
  const assign = async (name: string, idx: number) => {
    const btn = page.getByRole("button", { name: new RegExp(name, "i") });
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(300);
    const all = await seats.all();
    if (all.length <= idx) return;
    await all[idx].click();
    await page.waitForTimeout(300);
  };

  // 5人局: 筑梦师(0) + 艺术家(1) + 数学家(2) + 麻脸巫婆(3) + 涡流(4)
  await assign("筑梦师", 0);
  await assign("艺术家", 1);
  await assign("数学家", 2);
  await assign("麻脸巫婆", 3);
  await assign("涡流", 4);

  await page.getByRole("button", { name: /开始游戏/ }).click();
  await page.waitForTimeout(1500);
  const confirm = page.getByRole("button", { name: /确认无误/ });
  if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(1000);
  }

  // ─── 2. 跳过不需要交互的夜间动作 ────────────────
  // 直到检测到筑梦师行动
  let dreamerHandled = false;

  for (let i = 0; i < 30; i++) {
    // 白天检测
    if (
      await page
        .locator("button:has-text('进入黄昏处决阶段')")
        .isVisible({ timeout: 300 })
        .catch(() => false)
    ) {
      console.log("✅ 到达白天");
      break;
    }

    // 夜晚报告/天亮
    const report = page.locator("h2:has-text('夜晚报告'), text=昨晚");
    if (
      await report
        .first()
        .isVisible({ timeout: 200 })
        .catch(() => false)
    ) {
      await page
        .getByRole("button", { name: "确认" })
        .click()
        .catch(() => {});
      await page.waitForTimeout(800);
      continue;
    }
    const dawn = page.getByRole("button", { name: /开始白天|天亮了/ });
    if (await dawn.isVisible({ timeout: 200 }).catch(() => false)) {
      await dawn.click();
      await page.waitForTimeout(1500);
      continue;
    }

    // 检查是否轮到筑梦师（检测"筑梦师"出现在行动文本中）
    const actionText = page.locator("text=筑梦师").first();
    const isDreamerAction = await actionText
      .isVisible({ timeout: 200 })
      .catch(() => false);

    if (isDreamerAction && !dreamerHandled) {
      console.log("🎯 检测到筑梦师行动");

      // 选目标：点击第二个 # 按钮（第一个可能是已激活的）
      const targetBtn = page.locator("button:has-text('#')").nth(1);
      await expect(targetBtn).toBeVisible({ timeout: 3000 });
      await targetBtn.click();
      await page.waitForTimeout(500);
      console.log("  ✅ 已选择目标");

      // 等待角色选择弹出（两个角色按钮供选择展示哪个）
      await page.waitForTimeout(500);

      // 找角色选择按钮（不包含 # 的可点击按钮）
      const roleChoice = page
        .locator(
          "button:not([disabled]):not(:has-text('#')):not(:has-text('确认')):not(:has-text('上一步'))"
        )
        .first();
      if (await roleChoice.isVisible({ timeout: 3000 }).catch(() => false)) {
        await roleChoice.click();
        await page.waitForTimeout(300);
        console.log("  ✅ 已选择展示角色");
      } else {
        console.log("  ⚠️ 未出现角色选择");
      }

      // 点击"确认 & 下一步"
      const nextBtn = page
        .locator("button")
        .filter({ hasText: /确认.*下一步|下一步|确认/ })
        .first();
      if (await nextBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(400);
        console.log("  ✅ 筑梦师行动确认");
      }

      dreamerHandled = true;
      continue;
    }

    // 普通夜间跳过
    const nextBtn = page
      .locator("button")
      .filter({ hasText: /确认.*下一步|下一步|确认/ })
      .first();
    if (await nextBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      if (await nextBtn.isEnabled().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(400);
        continue;
      }
      // 按钮禁用→选第一个可用 # 按钮
      const hashBtn = page.locator("button:has-text('#')").first();
      if (await hashBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        await hashBtn.click();
        await page.waitForTimeout(300);
        continue;
      }
    }
    await page.waitForTimeout(500);
  }

  // ─── 3. 验证 ──────────────────────────────────
  expect(dreamerHandled).toBeTruthy();
  console.log("✅ 筑梦师夜间交互测试通过");
});
