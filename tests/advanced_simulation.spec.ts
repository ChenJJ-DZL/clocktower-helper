import { test, expect, Page } from "@playwright/test";
import {
  GAME_URL,
  StorytellerLogger,
  assignRandomRoles,
  analyzeLog,
  REPORT_FILE_PATH,
  getRoleById,
  sleep,
  shuffleArray,
  getRandomInt,
  getAlivePlayerIndexes,
  ROLE_ACTIONS,
  getRandomElement
} from "./simulation_helpers";

// --- 测试主流程 ---
test.describe("高级游戏模拟器", () => {
  let logger: StorytellerLogger;

  // 在所有测试开始前，初始化一次 Logger
  test.beforeAll(async () => {
    logger = new StorytellerLogger(REPORT_FILE_PATH);
  });

  // 在所有测试结束后，关闭 Logger 并进行分析
  test.afterAll(async () => {
    analyzeLog(REPORT_FILE_PATH, logger);
    logger.close();
  });

  test("随机化对局测试", async ({ page }) => {
    const SCRIPT_NAME = process.env.SCRIPT_NAME || "暗流涌动";
    logger.log("剧本选择", `测试开始，选择剧本: ${SCRIPT_NAME}`);

    // --- 1. 导航和剧本选择 ---
    await page.goto(GAME_URL);
    await page
      .getByRole("button", { name: new RegExp(SCRIPT_NAME, "i") })
      .click();
    await page.waitForSelector('text="游戏人数"', { timeout: 10000 });
    await expect(page.getByText("游戏人数")).toBeVisible();
    logger.log("设置阶段", "进入角色分配界面。");

    // --- 2. 随机分配角色 ---
    const playerCount = getRandomInt(9, 15);
    const assignedRoles = await assignRandomRoles(page, logger, playerCount);
    await page.waitForTimeout(500);

    // --- 3. 开始游戏 ---
    const startBtn = page.getByRole("button", { name: /开始游戏|Start Game/i });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    logger.log("游戏开始", "对局设置完成，游戏开始。");

    const enterNightBtn = page.getByRole("button", { name: /入夜|Night/i });
    await expect(enterNightBtn).toBeVisible();
    await enterNightBtn.click();
    logger.log("游戏流程", "确认完毕，进入首夜。");

    // ===================================
    // --- 4. 首夜模拟 ---
    // ===================================
    const nightQueue = await page.locator(".night-order-preview-item").allTextContents();
    logger.log("首夜", `夜晚行动顺序: ${nightQueue.join(" -> ")}`);

    for (const roleName of nightQueue) {
      const cleanRoleName = roleName.replace(/\s*\d+号\s*/, '').trim();
      const roleMeta = ROLE_ACTIONS[cleanRoleName];

      if (roleMeta) {
        await expect(page.getByText(`轮到 ${cleanRoleName} 行动`)).toBeVisible({ timeout: 15000 });

        if (roleMeta.targetCount > 0) {
          const alivePlayers = await getAlivePlayerIndexes(page);
          const targets = getRandomElement(alivePlayers.filter(i => i + 1 !== parseInt(roleName))); // 避免选择自己
          const targetSeat = page.locator('.seat-node').nth(targets);
          await targetSeat.click();
          logger.log('首夜', `${roleName}(${cleanRoleName}) 对 ${targets + 1}号玩家 使用了技能。`);
          // 等待可能的模态框
          if (roleMeta.type === 'poison' || roleMeta.type === 'kill') {
            const modal = page.getByRole('dialog');
            await expect(modal).toBeVisible({ timeout: 2000 });
            await modal.getByRole('button', { name: '确认' }).click();
          }
        } else {
          logger.log('首夜', `${roleName}(${cleanRoleName}) 无目标行动，直接确认。`);
        }
      }

      const confirmBtn = page.getByRole("button", { name: /确认|Confirm|下一步/ });
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();
      await page.waitForTimeout(200);
    }

    logger.log("游戏流程", "首夜结束。");

    // ===================================
    // --- 5. 白天模拟 ---
    // ===================================
    await expect(page.getByText(/昨晚.*死亡/)).toBeVisible({ timeout: 10000 });
    const deathReport = await page.locator('.modal-body').textContent();
    logger.log("白天", `夜晚死亡报告: ${deathReport?.trim()}`);
    await page.getByRole("button", { name: "确认" }).click();

    // --- 随机提名 ---
    await expect(page.getByText(/发起提名/)).toBeVisible();
    const alivePlayers = await getAlivePlayerIndexes(page);
    const nominatorIndex = getRandomElement(alivePlayers);
    const nomineeIndex = getRandomElement(alivePlayers.filter(i => i !== nominatorIndex));
    logger.log("提名阶段", `${nominatorIndex + 1}号玩家 发起提名。`);
    await page.locator(".seat-node").nth(nominatorIndex).click();
    await page.getByRole("button", { name: "发起提名" }).click();

    logger.log("提名阶段", `提名为 ${nomineeIndex + 1}号玩家。`);
    await page.locator('.seat-node').nth(nomineeIndex).click();
    await page.getByRole("button", { name: "确认" }).click();

    // --- 随机投票 ---
    await expect(page.getByText(/开始投票/)).toBeVisible();
    await page.getByRole("button", { name: /开始投票/i }).click();

    await expect(page.getByText(/请输入票数/)).toBeVisible();
    const voteCount = getRandomInt(1, Math.floor(alivePlayers.length / 2) + 1);
    logger.log("投票阶段", `对 ${nomineeIndex + 1}号玩家 投出 ${voteCount} 票。`);
    await page.getByLabel(/票数输入框/).fill(voteCount.toString());
    await page.getByRole("button", { name: "提交" }).click();

    // --- 处决 ---
    await expect(page.getByText(/执行处决/)).toBeVisible();
    await page.getByRole("button", { name: /执行处决/i }).click();

    const executionResultModal = page.getByRole('dialog', { name: /处决结果/ });
    await expect(executionResultModal).toBeVisible();
    const executionResult = await executionResultModal.textContent();
    logger.log("处决阶段", `处决结果: ${executionResult?.trim()}`);
    await executionResultModal.getByRole("button", { name: "确认" }).click();

    logger.log("游戏流程", "第一轮对局模拟结束。");
    await page.waitForTimeout(3000); // 等待最终日志
  });
});
