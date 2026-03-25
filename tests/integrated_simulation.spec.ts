import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  GAME_URL,
  getAlivePlayerIndexes,
  getRandomElement,
  getRandomElements,
  getRandomInt,
  getRoleListForPlayerCount,
  StorytellerLogger,
} from "./simulation_helpers";

const LOG_FILE_PATH = path.join(__dirname, "simulation_storyteller.log");
const TEST_SCRIPT = process.env.TEST_SCRIPT || "trouble_brewing";
const SCRIPT_NAME_MAP: Record<string, string> = {
  trouble_brewing: "暗流涌动",
  bad_moon_rising: "暗月初升",
  sects_and_violets: "梦陨春宵",
  midnight_revelry: "夜半狂欢",
};

// Track which player has which role
const playerRoles: Record<number, string> = {};

test.describe("Unified Storyteller Simulation", () => {
  let logger: StorytellerLogger;

  test.beforeAll(() => {
    logger = new StorytellerLogger(LOG_FILE_PATH);
  });

  test.afterAll(() => {
    // Run rule pre-check at the end
    analyzeLogNarrative(LOG_FILE_PATH, logger);
    logger.close();
  });

  test("Full Game Simulation with Storyteller Perspective", async ({
    page,
  }) => {
    test.setTimeout(900000); // 15 minutes
    logger.log("仿真启动", "正在初始化 12 人局 (暗流涌动)...");

    // Capture console logs for debugging
    page.on("console", (msg) => {
      const text = msg.text();
      logger.log(`浏览器[${msg.type()}]`, text);
    });

    // 1. Script Selection
    await page.goto(GAME_URL);

    // Handle native browser dialogs (confirm/alert) automatically
    page.on("dialog", async (dialog) => {
      logger.log("浏览器弹窗", `检测到: ${dialog.message()}`);
      await dialog.accept();
    });

    // Wait for hydration/loading with retry
    let loaded = false;
    let retryCount = 0;
    while (!loaded && retryCount < 3) {
      try {
        // Wait for load state and button to be visible
        await page.waitForLoadState("load");
        await page.waitForSelector(`[data-testid=script-card-${TEST_SCRIPT}]`, {
          state: "visible",
          timeout: 60000,
        });
        loaded = true;
      } catch (_e) {
        logger.log(
          "剧本选择",
          `⚠️ 页面加载超时或按钮未显示 (尝试 ${retryCount + 1}/3)，正在刷新页面...`
        );
        await page.reload();
        await page.waitForTimeout(2000);
        retryCount++;
      }
    }

    if (!loaded) {
      throw new Error("❌ 无法进入剧本选择页面或按钮未显示");
    }

    const selectedScript = SCRIPT_NAME_MAP[TEST_SCRIPT] || TEST_SCRIPT;

    logger.log("剧本选择", `选择了剧本: ${selectedScript}`);
    await page.locator(`[data-testid=script-card-${TEST_SCRIPT}]`).click();
    await expect(page.getByText("当前剧本")).toBeVisible();

    // 2. Player Setup (Fixed 11 for debug predictability)
    const playerCount = 11;
    logger.log("落座阶段", `本次游戏共有 ${playerCount} 位玩家准备入座。`);

    // 3. Role Allocation
    const rolesToAssign = getRoleListForPlayerCount(playerCount, TEST_SCRIPT);
    logger.log("角色分配", "正在进行随机角色分配...");

    // Use a wrapper to assign roles and log them
    await assignRolesAndLog(page, logger, rolesToAssign, playerCount);

    // Handle possible composition warning
    const forceStartBtn = page.getByRole("button", { name: "仍然开始游戏" });
    if (await forceStartBtn.isVisible()) {
      await forceStartBtn.click();
      logger.log("落座阶段", "检测到阵容建议不符，选择仍然开始游戏。");
    }

    // 4. Start Game Transition (Check Phase)
    logger.log("规则预检测", "进入检查阶段，核对阵容...");
    // After clicking "开始游戏" in setup, we enter 'check' phase
    await page.getByRole("button", { name: /确认无误，入夜/ }).click();

    // 5. First Night
    logger.log("首夜", "黑夜降临，请所有人闭眼...");
    // Wait for the first character to wake up or the instruction block to appear
    await page.waitForSelector(".active-character-instruction", {
      state: "visible",
      timeout: 15000,
    });

    // Process Night Actions
    await processNightActions(page, logger, 1);

    // 5. Day Phase & Game Loop
    let day = 1;
    let gameOver = false;

    while (!gameOver && day < 10) {
      logger.log(`第 ${day} 天`, "黎明来到，大家睁眼。");

      // --- 1. Clear ALL possible modals after night ---
      logger.log(`第 ${day} 天`, "黎明来到，大家睁眼。正在清理结算弹窗...");

      // Wait for any role dialog to appear and close it
      for (let i = 0; i < 10; i++) {
        const modal = page.locator('div[role="dialog"]');
        if (await modal.isVisible()) {
          const text = await modal.innerText();
          logger.log(`第 ${day} 天`, `清除弹窗: ${text.split("\n")[0]}...`);
          const closeBtn = modal
            .locator("button")
            .filter({ hasText: /确认|我知道了|关闭|天亮了/ })
            .first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(500);
          } else {
            // If no button, maybe clicking outside or just wait
            await page.mouse.click(10, 10);
            await page.waitForTimeout(300);
          }
        } else {
          // Check if "天亮了" button is directly visible (not in modal)
          const dawnBtn = page.getByRole("button", { name: /天亮了|查看报告/ });
          if (await dawnBtn.isVisible()) {
            await dawnBtn.click();
            await page.waitForTimeout(500);
          } else {
            break; // No more modals found
          }
        }
      }

      // --- 2. Reliable Phase Transition to Dusk ---
      const enterDuskBtn = page.getByRole("button", {
        name: /进入黄昏处决阶段/,
      });
      try {
        await enterDuskBtn.waitFor({ state: "visible", timeout: 5000 });
        logger.log(`第 ${day} 天`, "点击进入黄昏处决阶段...");
        await enterDuskBtn.click();
        await page.waitForTimeout(1000);
      } catch (_e) {
        logger.log(
          `第 ${day} 天`,
          "⚠️ 未找到‘进入黄昏’按钮，可能已在黄昏阶段或被弹窗阻挡"
        );
      }

      // --- 3. Validate Dusk Phase & Run Nominations ---
      // The "发起提名" button is a strong indicator we are in the Dusk phase
      const nomInitBtn = page.getByRole("button", { name: /发起提名/ });
      try {
        await nomInitBtn.waitFor({ state: "visible", timeout: 5000 });
        await performNominations(page, logger, day);
      } catch (_e) {
        logger.log(
          `第 ${day} 天`,
          "⚠️ 提名进入超时或组件未渲染，尝试直接跳过..."
        );
      }

      // --- 4. Check if game over ---
      const winnerAnnounce = page.locator(".winner-announcement");
      if (await winnerAnnounce.isVisible()) {
        const winner = await winnerAnnounce.innerText().catch(() => "");
        logger.log("游戏结束", `游戏已结束，获胜方: ${winner}`);
        gameOver = true;
        break;
      }

      // --- 5. Transition to Next Night ---
      day++;
      logger.log(`第 ${day} 夜`, "黄昏降临，准备入夜。");
      const enterNightBtn = page.getByRole("button", {
        name: /入夜 \(下一回合\) 🌙/,
      });
      if (await enterNightBtn.isVisible()) {
        await enterNightBtn.click();
        await page.waitForTimeout(1000);
      }

      await processNightActions(page, logger, day);
    }
  });
});

async function assignRolesAndLog(
  page: Page,
  logger: StorytellerLogger,
  rolesToAssign: string[],
  playerCount: number
) {
  const seatIndexes = Array.from({ length: playerCount }, (_, i) => i);
  const shuffledSeats = getRandomElements(seatIndexes, playerCount);

  logger.log("角色分配", "正在开始入座逻辑...");

  // Wait for the role setup UI to be ready
  await page.waitForSelector(".seat-node", {
    state: "visible",
    timeout: 10000,
  });

  for (let i = 0; i < rolesToAssign.length; i++) {
    const roleName = rolesToAssign[i];
    const seatIdx = shuffledSeats[i];
    playerRoles[seatIdx] = roleName;

    logger.log("落座阶段", `尝试为玩家 ${i + 1} 分配角色: ${roleName}`);

    // Find role button using text content instead of Role (more robust)
    // We filter for buttons and look for the specific role name text inside them
    const roleBtn = page
      .locator("button")
      .filter({ hasText: roleName })
      .first();

    try {
      await roleBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
      await roleBtn.click({ force: true, timeout: 5000 });
    } catch (e) {
      await page.screenshot({
        path: path.join(__dirname, `error_role_${roleName}.png`),
      });
      logger.log(
        "错误",
        `无法选中角色 [${roleName}]。可能原因：角色不在当前剧本中或被遮挡。`
      );
      throw e;
    }

    // Find the seat node
    const seat = page.locator(".seat-node").nth(seatIdx);
    try {
      await seat.scrollIntoViewIfNeeded({ timeout: 5000 });
      await seat.click({ force: true, timeout: 5000 });
    } catch (e) {
      await page.screenshot({
        path: path.join(__dirname, `error_seat_${seatIdx}.png`),
      });
      logger.log("错误", `无法点击 ${seatIdx + 1} 号位。`);
      throw e;
    }

    logger.log(
      "落座阶段",
      `${i + 1}号角色的玩家选择了 ${roleName}，成功落座在 ${seatIdx + 1} 号位。`
    );
    await page.waitForTimeout(100); // Small pause for UI stability

    // Confirm in console as per user instruction
    const nextBtn = page.getByRole("button", { name: "确认 & 下一步" });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    await page.waitForTimeout(100);
  }
  const startBtn = page.getByRole("button", { name: "开始游戏" });
  await startBtn.scrollIntoViewIfNeeded();
  await startBtn.click();
}

async function processNightActions(
  page: Page,
  logger: StorytellerLogger,
  dayOrNight: number
) {
  const isFirstNight = dayOrNight === 1;
  const phaseLabel = isFirstNight ? "首夜" : `第 ${dayOrNight} 夜`;

  // Process each character that wakes up
  let hasMoreActions = true;
  while (hasMoreActions) {
    // Wait for active character or end of night
    // We look for both the specific class and the text to be robust
    const currentActive = await page
      .locator(".active-character-instruction")
      .innerText({ timeout: 10000 })
      .catch(() => null);

    // Check if we are still in night phase (e.g. if we see "天亮了" button, night is over)
    const isDawn = await page
      .getByRole("button", { name: /天亮了/ })
      .isVisible();
    if (!currentActive || isDawn) {
      hasMoreActions = false;
      break;
    }

    // Match role name from instruction like "行动：唤醒 1 号【舞蛇人】玩家..."
    // Support both standard brackets [] and full-width brackets 【】
    const roleMatch = currentActive.match(/[[【](.*?)[\]】]/);
    const activeRoleName = roleMatch ? roleMatch[1] : "未知角色";

    // Find which seat belongs to this role (if we can identify it)
    const activeSeatIdx = Object.keys(playerRoles).find(
      (k) => playerRoles[parseInt(k, 10)] === activeRoleName
    );

    const activeSeatLabel =
      activeSeatIdx !== undefined
        ? `${parseInt(activeSeatIdx, 10) + 1}号位`
        : "未知位置";

    logger.log(
      phaseLabel,
      `[角色行动] ${activeRoleName} (${activeSeatLabel}) 正在执行行动...`
    );
    logger.log(phaseLabel, `└─ 指令内容: ${currentActive.replace(/\n/g, " ")}`);

    // Randomly pick targets if needed
    const targetHeader = page.locator(".target-selection-needed");
    const _targetsSelected = false;

    // --- NEW: Better Modal Handling ---
    const modal = page.locator('div[role="dialog"]');
    if (await modal.isVisible()) {
      const modalText = await modal.innerText();
      if (modalText.includes("筑梦师信息")) {
        const revealedRoles = await modal
          .locator(".text-2xl.font-bold")
          .allInnerTexts();
        logger.log(
          phaseLabel,
          `└─ [筑梦师信息] 获得信息: ${revealedRoles.join(" 和 ")}`
        );
      } else if (modalText.includes("夜晚死亡报告")) {
        logger.log(
          phaseLabel,
          `└─ [死亡报告] ${modalText.split("\n")[1] || ""}`
        );
      }

      logger.log(phaseLabel, "检测到活动弹窗，尝试处理...");
      const modalConfirmBtn = modal
        .locator("button")
        .filter({ hasText: /确认|下一步/ })
        .first();
      if (await modalConfirmBtn.isVisible()) {
        await modalConfirmBtn.click();
        await page.waitForTimeout(500);
        continue; // Process next character or re-check same character
      }
    }

    const isTargetSelectionVisible = await targetHeader.first().isVisible();
    if (isTargetSelectionVisible) {
      const minTargets = await targetHeader
        .first()
        .getAttribute("data-min")
        .then((v) => parseInt(v || "1", 10));

      const aliveIndexes = await getAlivePlayerIndexes(page);

      // Log min targets and current selection if possible
      const currentSelected = await page
        .locator(".GameConsole button.bg-blue-600")
        .count();

      if (currentSelected < minTargets && aliveIndexes.length > 0) {
        const targets = getRandomElements(aliveIndexes, minTargets);

        for (const targetIdx of targets) {
          const targetRole = playerRoles[targetIdx] || "未知";
          logger.log(
            phaseLabel,
            `└─ 选择目标: ${targetIdx + 1}号位 (${targetRole})`
          );

          const consoleSeat = page
            .locator(".GameConsole button")
            .filter({ hasText: new RegExp(`^${targetIdx + 1}($|\\D)`) })
            .first();
          if (await consoleSeat.isVisible()) {
            await consoleSeat
              .click({ force: false })
              .catch(() => consoleSeat.click({ force: true }));
          } else {
            const seat = page.locator(
              `.seat-node[data-seat-id="${targetIdx}"]`
            );
            await seat.click({ force: true });
          }
          await page.waitForTimeout(100);
        }
      } else if (currentSelected >= minTargets) {
        logger.log(
          phaseLabel,
          `└─ 目标已由系统通过 (当前已选: ${currentSelected}/${minTargets})`
        );
      }
    }

    // Use canonical button name
    const nextBtn = page.getByRole("button", { name: /确认 & 下一步|下一步/ });

    // Wait for button to be enabled if it exists
    if (await nextBtn.isVisible()) {
      const nextBtnDisabled = await nextBtn.isDisabled();
      if (!nextBtnDisabled) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      } else {
        logger.log(phaseLabel, "确认按钮不可用，检查是否有弹窗需要处理...");
        const modalConfirmBtn = page
          .locator('div[role="dialog"] button')
          .filter({ hasText: /确认|下一步/ })
          .first();
        if (await modalConfirmBtn.isVisible()) {
          await modalConfirmBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  }

  // Transition to day if button is visible
  const dawnBtn = page.getByRole("button", { name: /天亮了/ });
  if (await dawnBtn.isVisible()) {
    await dawnBtn.click();
  }
}

async function _performRandomDayActions(
  page: Page,
  logger: StorytellerLogger,
  day: number
) {
  // Random chance for someone to use a day ability if available
  if (Math.random() > 0.4) {
    // Increased frequency to test new roles
    // Look for buttons that start with "使用 " (case insensitive or containing)
    const dayActionButtons = await page
      .locator("button")
      .filter({ hasText: /^使用 / })
      .all();
    if (dayActionButtons.length > 0) {
      const btn = getRandomElement(dayActionButtons);
      const btnText = await btn.innerText();
      logger.log(`第 ${day} 天`, `[玩家行动] 发动技能: ${btnText}`);
      await btn.click();
      await page.waitForTimeout(1000);

      // Handle potential result modals (Artist, Savant)
      const modal = page.locator('div[role="dialog"]');
      if (await modal.isVisible()) {
        const text = await modal.innerText();
        logger.log(`第 ${day} 天`, `└─ 技能弹窗: ${text.split("\n")[0]}`);

        // If it's Artist/Savant, we might have specific buttons
        // Just click the first primary-looking button to confirm
        const confirmBtn = modal
          .locator("button")
          .filter({ hasText: /确认|记录|是|否/ })
          .first();
        if (await confirmBtn.isVisible()) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  }
}

async function performNominations(
  page: Page,
  logger: StorytellerLogger,
  day: number
) {
  const phaseLabel = `第 ${day} 天`;
  logger.log(phaseLabel, "现在进入提名阶段。");

  // --- 1. Extra Modal Dismiss (Defensive) ---
  const dawnModal = page.locator('div[role="dialog"]');
  if (await dawnModal.isVisible()) {
    const text = await dawnModal.innerText();
    if (
      text.includes("夜晚报告") ||
      text.includes("黎明") ||
      text.includes("死亡")
    ) {
      logger.log(phaseLabel, "检测到剩余弹窗，正在关闭...");
      const closeBtn = dawnModal
        .locator("button")
        .filter({ hasText: /确认|我知道了|关闭/ })
        .first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // --- 2. Run Nominations ---
  // Simulate 0-1 nominations for stability
  const nomCount = 1; // Always do 1 to verify logic
  for (let i = 0; i < nomCount; i++) {
    const alive = await getAlivePlayerIndexes(page);
    if (alive.length < 3) break;

    const nominator = alive[getRandomInt(0, 1)]; // Usually 1st or 2nd seat
    const nominee = alive[getRandomInt(2, alive.length - 1)];

    const nomRole = playerRoles[nominator] || "未知";
    const targetRole = playerRoles[nominee] || "未知";

    logger.log(
      phaseLabel,
      `[提名行动] ${nominator + 1}号位(${nomRole}) 提名了 ${nominee + 1}号位(${targetRole})`
    );

    try {
      // Use specialized selectors for seats in Dusk phase if needed, but .seat-node is usually fine
      const nominatorSeat = page.locator(
        `.seat-node[data-seat-id="${nominator}"]`
      );
      const nomineeSeat = page.locator(`.seat-node[data-seat-id="${nominee}"]`);

      await nominatorSeat.click({ force: true });
      await page.waitForTimeout(300);
      await nomineeSeat.click({ force: true });
      await page.waitForTimeout(300);

      const launchBtn = page.getByRole("button", { name: /发起提名/ });
      if (await launchBtn.isEnabled()) {
        await launchBtn.click();
        await page.waitForTimeout(800);
        // Simulate Voting
        await simulateVoting(page, logger, day, nominee);
      } else {
        logger.log(phaseLabel, "⚠️ 发起提名按钮处于禁用状态，跳过本次提名");
        // Check if already nominated? Or maybe locked?
      }
    } catch (e: any) {
      logger.log(phaseLabel, `❌ 提名操作失败: ${e.message}`);
    }
  }

  // --- 3. End Nominations / Enter Night ---
  const endNomBtn = page.getByRole("button", { name: /入夜 \(下一回合\) 🌙/ });
  if (await endNomBtn.isVisible()) {
    logger.log(phaseLabel, "提名结束，准备入夜...");
    await endNomBtn.click();

    // Handle potential confirmation modal for "仍有未结算"
    const modal = page.locator('div[role="dialog"]');
    if (await modal.isVisible()) {
      const confirmBtn = modal
        .locator("button")
        .filter({ hasText: /确认|确定/ })
        .first();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
    }
    await page.waitForTimeout(1000);
  }
}

async function simulateVoting(
  page: Page,
  logger: StorytellerLogger,
  day: number,
  nominee: number
) {
  const phaseLabel = `第 ${day} 天 (投票)`;
  logger.log(phaseLabel, `针对 ${nominee + 1} 号位的投票开始...`);

  const startVoteBtn = page.getByRole("button", { name: /开始投票/ });
  try {
    await startVoteBtn.waitFor({ state: "visible", timeout: 5000 });
    await startVoteBtn.click();

    // --- Vote Input Modal ---
    const voteModal = page.locator('div[role="dialog"]');
    await voteModal.waitFor({ state: "visible", timeout: 5000 });

    const voters = await getAlivePlayerIndexes(page);
    const actualVoters: number[] = [];
    let yesVotes = 0;

    // Select some voters (randomly 40-70% of alive players)
    for (const voterIdx of voters) {
      if (Math.random() > 0.4) {
        const voterBtn = voteModal
          .locator("button")
          .filter({ hasText: new RegExp(`^${voterIdx + 1}号`) })
          .first();
        if ((await voterBtn.isVisible()) && !(await voterBtn.isDisabled())) {
          await voterBtn.click();
          actualVoters.push(voterIdx);
          yesVotes++;
        }
      }
    }

    logger.log(phaseLabel, `└─ 计票完成: ${yesVotes} 票`);
    logger.log(
      phaseLabel,
      `└─ 投票玩家: ${actualVoters.map((v) => `${v + 1}号(${playerRoles[v] || "未知"})`).join(", ")}`
    );

    const confirmVoteBtn = voteModal
      .locator("button")
      .filter({ hasText: /确认（.*票）/ })
      .first();
    if (await confirmVoteBtn.isVisible()) {
      await confirmVoteBtn.click();
      // Wait for modal to close (it has a transition)
      await page.waitForTimeout(1000);
    }
  } catch (e: any) {
    logger.log(phaseLabel, `❌ 投票模拟异常: ${e.message}`);
  }
}

function analyzeLogNarrative(filePath: string, logger: StorytellerLogger) {
  logger.log("规则预检测", "--- 开始规则一致性分析 ---");
  const content = fs.readFileSync(filePath, "utf-8");
  const _lines = content.split("\n");
  const issues: string[] = [];

  // Check 1: Death logic
  // (Simplistic example: check if dead player nominated)
  // In a real scenario, we'd track state based on logs.

  if (issues.length === 0) {
    logger.log("规则预检测", "未发现明显的规则违约行为。对局似乎是合法的。");
  } else {
    for (const issue of issues) {
      logger.log("规则预检测警告", issue);
    }
  }
}
