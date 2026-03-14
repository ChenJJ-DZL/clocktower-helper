import path from "node:path";
import { expect, test } from "@playwright/test";
import { GAME_URL, StorytellerLogger } from "./simulation_helpers";

const LOG_FILE_PATH = path.join(__dirname, "targeted_role_test.log");

test.describe("Targeted Role Verification (Artist & Savant)", () => {
  let logger: StorytellerLogger;

  test.beforeAll(() => {
    logger = new StorytellerLogger(LOG_FILE_PATH);
  });

  test.afterAll(() => {
    logger.close();
  });

  test("Verify Artist and Savant Day Abilities", async ({ page }) => {
    test.setTimeout(300000); // 5 minutes

    // Auto-accept all window dialogs (alerts, confirms)
    page.on("dialog", (dialog) => dialog.accept());

    page.on("pageerror", (exception) => {
      logger.log("浏览器[pageerror]", `Uncaught exception: "${exception}"`);
    });

    logger.log("测试启动", "开始验证艺术家和博学者的昼间技能...");

    page.on("console", (msg) => {
      logger.log(`浏览器[${msg.type()}]`, msg.text());
    });

    // 1. Script Selection
    await page.goto(GAME_URL);
    await page.waitForLoadState("load");

    // Choose S&V (or any script containing them)
    const scriptCard = page.locator(
      "[data-testid=script-card-sects_and_violets]"
    );
    await scriptCard.waitFor({ state: "visible", timeout: 10000 });
    await scriptCard.click();

    await expect(page.getByText("当前剧本")).toBeVisible({ timeout: 10000 });

    // 2. Setup (5 players for speed)
    const _playerCount = 5;
    // Logic might require certain number of players for standard distribution,
    // but let's try to just select the roles manually.

    // Manually select roles: Artist, Savant, and 1 Minion, 1 Demon, 1 other
    const targetRoles = ["艺术家", "博学者", "女巫", "方古", "哲学家"];

    logger.log("角色手动分配", `选取角色: ${targetRoles.join(", ")}`);

    for (let i = 0; i < targetRoles.length; i++) {
      const roleName = targetRoles[i];
      const roleBtn = page.locator(`button:has-text("${roleName}")`);
      await roleBtn.waitFor({ state: "visible", timeout: 10000 });
      await roleBtn.click();
      await page.locator(".seat-node").nth(i).click();
      logger.log("角色分配", `${roleName} 落座于 ${i + 1} 号位。`);
    }

    // Start game
    const startBtn = page.getByRole("button", {
      name: "开始游戏",
      exact: true,
    });
    await startBtn.waitFor({ state: "visible", timeout: 5000 });
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    try {
      const stillStartBtn = page.getByRole("button", { name: "仍然开始游戏" });
      await stillStartBtn.waitFor({ state: "visible", timeout: 2000 });
      await stillStartBtn.click();
    } catch (_e) {
      // It's okay if it doesn't appear
    }

    // 3. First Night
    logger.log("第一夜", "确认无误，入夜...");
    await page.waitForSelector("text=确认无误，入夜");
    await page.click("text=确认无误，入夜");

    let nightSafety = 0;
    while (nightSafety < 30) {
      const nextActionBtn = page
        .locator("button")
        .filter({ hasText: /确认(&\s*下一步)?/ });
      const dawnBtn = page.getByRole("button", { name: "开始白天" });
      const dawnText = page.locator("text=天亮了").first();
      const nightReportConfirmBtn = page
        .getByRole("button", { name: "确认", exact: true })
        .first();

      const isDawnVisible =
        (await dawnBtn.isVisible()) || (await dawnText.isVisible());
      const isNightReportVisible = await nightReportConfirmBtn.isVisible();

      logger.log(
        "Debug",
        `Loop ${nightSafety}: isDawnVisible=${isDawnVisible}, isNightReport=${isNightReportVisible}`
      );

      if (isDawnVisible || isNightReportVisible) {
        logger.log("第一夜", "夜晚行动结束，准备切入白天。");
        if (isNightReportVisible) {
          console.log("TESTING: CLICKING NIGHT REPORT CONFIRM");
          await nightReportConfirmBtn.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(1000); // 确保等待 React 状态更新
        }

        // Clicking nightReportConfirm transitions to day, so checking dawnBtn again might fail!
        // We should break if we hit either dawn OR night report!
        break;
      }

      if (await nextActionBtn.isVisible()) {
        const targetChoice = page
          .locator(".target-choice, .seat-node, button.role-item")
          .filter({ hasNotText: "确认选择" })
          .first();
        if (await targetChoice.isVisible()) {
          await targetChoice
            .click({ force: true, timeout: 2000 })
            .catch(() => {});
          await page.waitForTimeout(500);
        }
        const confirmChoice = page
          .locator("button")
          .filter({ hasText: "确认选择" })
          .first();
        if (await confirmChoice.isVisible()) {
          await confirmChoice
            .click({ force: true, timeout: 2000 })
            .catch(() => {});
          await page.waitForTimeout(500);
        }
        await nextActionBtn
          .click({ force: true, timeout: 2000 })
          .catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        await page.waitForTimeout(1000);
      }
      nightSafety++;
    }

    // 4. Dawn
    logger.log("游戏流程", "处理天亮结算...");

    // Wait for and click Night Death Report Modal (confirmation)
    const nightDeathBtn = page.getByRole("button", { name: "确认" });
    await nightDeathBtn
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    if (await nightDeathBtn.isVisible()) {
      await nightDeathBtn.click();
      await page.waitForTimeout(500);
    }

    // Wait for and click Dawn Report Overlay (Start Day)
    const startDayBtn = page.getByRole("button", { name: "开始白天" });
    await startDayBtn
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    if (await startDayBtn.isVisible()) {
      await startDayBtn.click();
      await page.waitForTimeout(500);
    }

    // 5. Day Actions
    logger.log("游戏流程", "开始验证日间技能...");

    // --- Test Artist ---
    logger.log("艺术家验证", "尝试发动艺术家技能...");
    const artistBtn = page.getByRole("button", { name: /使用 艺术家/ });
    await expect(artistBtn).toBeVisible();
    await artistBtn.click();

    // Verify Artist Modal
    logger.log("艺术家验证", "验证艺术家结果弹窗...");
    const artistModal = page.locator('div[role="dialog"]');
    await expect(artistModal).toContainText("提问：");

    // Record result
    await artistModal.locator("button").filter({ hasText: "是" }).click();
    await page.waitForTimeout(500);

    // --- Test Savant ---
    logger.log("博学者验证", "尝试发动博学者技能...");
    const savantBtn = page.getByRole("button", { name: /使用 博学者/ });
    await expect(savantBtn).toBeVisible();
    await savantBtn.click();

    // Verify Savant Modal
    logger.log("博学者验证", "验证博学者结果弹窗...");
    const savantModal = page.locator('div[role="dialog"]');
    await expect(savantModal).toContainText("信息 A");
    await expect(savantModal).toContainText("信息 B");

    await savantModal.locator("button").filter({ hasText: "记录" }).click();
    await page.waitForTimeout(500);

    logger.log("测试完毕", "✅ 艺术家和博学者昼间技能验证成功！");
  });
});
