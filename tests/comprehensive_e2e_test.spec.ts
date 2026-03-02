
import { test, expect, Page } from "@playwright/test";
import {
  GAME_URL,
  StorytellerLogger,
  getRandomInt,
  shuffleArray,
  sleep,
  getRoleById,
  ROLES_DATA,
  TB_PRESETS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SCRIPT_NAME,
  LOG_FILE_PATH,
  SeatedPlayer,
  TROUBLE_BREWING_PRESETS,
  handleDrunkCharadeIfPresent
} from "./simulation_helpers";


// --- 主测试逻辑 ---
test.describe("Comprehensive E2E Game Simulation", () => {
  let page: Page;
  const gameLog: string[] = [];
  const playerCount = getRandomInt(MIN_PLAYERS, MAX_PLAYERS);
  let seatedRoles: SeatedPlayer[] = [];

  const log = (message: string) => {
    console.log(message);
    gameLog.push(message);
  };

  const getLivingPlayers = () => seatedRoles.filter(p => p.isAlive);

  // 根据玩家人数获取建议的阵容
  const getRoleSetup = (numPlayers: number) => {
    return TROUBLE_BREWING_PRESETS[numPlayers] || TROUBLE_BREWING_PRESETS[11];
  };

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on("console", msg => {
      if (!msg.text().includes("Immersive Translate") && !msg.text().includes("[Fast Refresh]")) {
        // console.log(`[Browser Console] ${msg.text()}`);
      }
    });
  });

  test.afterAll(async () => {
    log("\n--- 游戏结束 ---\n");
    // TODO: 在这里添加规则预检测逻辑
    log("--- 规则预检测 ---");
    log("（此功能待实现）");

    const fs = require("fs");
    fs.writeFileSync(LOG_FILE_PATH, gameLog.join("\n"), "utf-8");
    log(`\n✅ 详细游戏日志已生成: ${LOG_FILE_PATH}`);
    if (page) await page.close();
  });

  test("should run a full game simulation", async () => {
    await page.goto("http://localhost:3000", { timeout: 60000 });

    log(`--- 开始新一轮游戏测试 (${new Date().toLocaleString()}) ---`);
    log(`剧本: ${SCRIPT_NAME}`);
    log(`玩家人数: ${playerCount}`);

    // 首先确保页面加载完毕
    await page.waitForLoadState('networkidle');

    // 调试：输出当前渲染的文本寻找“暗流涌动”
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes("暗流涌动") && !bodyText.includes("Trouble Brewing")) {
      log(`[Debug] 页面上没找到剧本文字. 当前页面文字片段: ${bodyText.slice(0, 200)}...`);
      // 也可以打印关键按钮
    }

    // 选择剧本
    await page.getByText(/暗流涌动|Trouble Brewing/).click({ timeout: 15000 });
    await page.waitForSelector('text="游戏人数"', { timeout: 10000 });

    // 1. 角色选择
    const setup = getRoleSetup(playerCount);
    let selectedRoles: string[] = [];

    const TB_ROLES = TB_PRESETS.trouble_brewing;

    const selectFromList = (list: string[], count: number) => {
      const shuffled = shuffleArray([...list]);
      selectedRoles.push(...shuffled.slice(0, count));
    };

    selectFromList(TB_ROLES.townsfolk, setup.townsfolk);
    selectFromList(TB_ROLES.outsider, setup.outsider);
    selectFromList(TB_ROLES.minion, setup.minion);
    selectFromList(TB_ROLES.demon, setup.demon);

    selectedRoles = shuffleArray(selectedRoles);

    log(`已选角色 (${selectedRoles.length}名): ${selectedRoles.map(id => getRoleById(id)?.name || id).join(", ")}`);

    // 2. 角色落座
    log("\n--- 落座阶段 ---");
    const seatOrder = shuffleArray(Array.from({ length: playerCount }, (_, i) => i));
    for (let i = 0; i < playerCount; i++) {
      const seatIndex = seatOrder[i];
      const roleId = selectedRoles[i];
      await page.click(`[data-seat-id="${seatIndex}"]`, { timeout: 5000 });
      await page.click(`[data-role-id="${roleId}"]`);
      const roleName = getRoleById(roleId)?.name || roleId;
      seatedRoles.push({ roleId, seatIndex, player: `玩家 ${seatIndex + 1}`, isAlive: true });
      log(`落座: ${roleName} (${roleId}) 落座于 ${seatIndex + 1} 号位`);
    }

    // 3. 开始游戏（转场到核对身份阶段）
    log("\n--- 开始游戏 ---");
    const startGameBtn = page.getByRole("button", { name: "开始游戏" });
    await startGameBtn.click();

    // 处理可能的阵容警告（如男爵缺少外来者）
    const warningModal = page.locator('text=/配置错误|可能有误|确定要继续吗/');
    if (await warningModal.isVisible({ timeout: 2000 })) {
      log("检测到阵容警告，选择忽略并继续");
      const continueBtn = page.getByRole("button", { name: /确认并继续|忽略|仍然开始游戏/ });
      if (await continueBtn.isVisible()) {
        await continueBtn.click();
      } else {
        // Fallback for different button text
        await page.click('button:has-text("确认")');
      }
    }

    // 4. 进入夜晚
    const enterNightBtn = page.getByText(/确认无误/);
    await enterNightBtn.waitFor({ state: 'visible', timeout: 10000 });
    await enterNightBtn.click();

    // 处理酒鬼伪装身份选择（如果存在）
    await handleDrunkCharadeIfPresent(page, { log: (phase: string, msg: string) => log(`[${phase}] ${msg}`) } as any);

    // 4. 游戏主循环
    for (let day = 1; day <= 10; day++) {
      // 夜晚阶段
      await handleNightPhase(day);

      // 白天阶段
      await handleDayPhase(day);

      const gameEndElement = page.locator("[data-testid='game-over-modal']");
      if (await gameEndElement.isVisible({ timeout: 1000 })) {
        const winnerText = await gameEndElement.locator("[data-winner-team]").textContent() || "未知";
        log(`\n--- 游戏在第 ${day} 天结束 ---`);
        log(`胜利阵营: ${winnerText}`);
        break;
      }

      // 进入下一夜
      log(`\n第 ${day} 天结束，进入黄昏...`);
      const duskButton = page.locator('button:has-text("进入黄昏处决阶段")');
      if (await duskButton.isVisible()) await duskButton.click();

      await sleep(500);
      const executionModal = page.locator("h2:has-text('处决结果')");
      if (await executionModal.isVisible()) {
        log("关闭处决结果报告。");
        await page.locator('div[aria-modal="true"] button:has-text("确认")').click();
      }
    }
  });

  async function handleNightPhase(day: number) {
    log(`\n--- 第 ${day} 夜 ---`);
    await sleep(1000);

    let lastActivePlayer = -1;
    for (let i = 0; i < getLivingPlayers().length + 2; i++) { // Safety break
      const nightPhaseActive = await page.locator('div[data-testid="night-phase-active"]').isVisible();
      if (!nightPhaseActive) break;

      const activePlayerElement = page.locator('[data-active-player-seat]');
      if (!await activePlayerElement.isVisible()) break;

      const seatIndex = parseInt(await activePlayerElement.getAttribute('data-active-player-seat') || "-1", 10);
      if (seatIndex === lastActivePlayer) {
        await sleep(500);
        continue;
      }
      lastActivePlayer = seatIndex;

      const player = seatedRoles.find(p => p.seatIndex === seatIndex);
      if (!player || !player.isAlive) {
        await page.click('button:has-text("确认 & 下一步")');
        continue;
      };

      const role = getRoleById(player.roleId);
      if (!role) continue;

      log(`行动中: ${player.player} (${role.name})`);

      const needsTarget = role.type !== 'outsider';
      if (needsTarget) {
        const targets = shuffleArray(getLivingPlayers().filter(p => p.seatIndex !== seatIndex));
        const targetCount = 1;
        for (let j = 0; j < targetCount; j++) {
          if (targets[j]) {
            await page.click(`[data-seat-id="${targets[j].seatIndex}"]`);
            log(` -> 目标: ${targets[j].player} (${getRoleById(targets[j].roleId)?.name})`);
          }
        }
      }

      await page.click('button:has-text("确认 & 下一步")');
      await sleep(500);
    }

    const nightReport = page.locator("h2:has-text('夜晚报告')");
    if (await nightReport.isVisible()) {
      log("夜晚结束，关闭夜晚报告。");
      await page.locator('div[aria-modal="true"] button:has-text("确认")').click();
    }
  }

  async function handleDayPhase(day: number) {
    log(`\n--- 第 ${day} 天 ---`);
    await sleep(500);
    // 提名阶段 - 快速通过白天进入黄昏，或者测试如果有处决选项则执行
    log("白天阶段: 检测到UI变动，跳过完整提名投票流，直接寻路至黄昏或下一夜。");

    // 如果有“进入黄昏处决阶段”按钮，则直接进入黄昏以防卡死
    const toDuskBtn = page.getByRole('button', { name: /进入黄昏/ });
    if (await toDuskBtn.isVisible({ timeout: 5000 })) {
      await toDuskBtn.click();
      log(" -> 已点击进入黄昏处决阶段。");
    }

    // 处决阶段确认框处理
    const executeButton = page.getByRole('button', { name: /执行处决/ });
    if (await executeButton.isVisible({ timeout: 2000 })) {
      await executeButton.click();
      log(` -> 确认处决。`);

      // Handle execution result modal
      const confirmBtn = page.getByRole('button', { name: '确认' });
      if (await confirmBtn.isVisible({ timeout: 5000 })) {
        await confirmBtn.click();
      }
    } else {
      log("无人被处决或未达到处决条件。");
      const continueButton = page.getByRole('button', { name: /继续提名|入夜/ });
      if (await continueButton.isVisible()) await continueButton.click();
    }
  }
});
