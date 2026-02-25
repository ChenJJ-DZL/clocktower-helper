
import { test, expect, Page } from "@playwright/test";
import { Role, roles as ROLES_DATA } from "../app/data";

// --- 常量与配置 ---
const MIN_PLAYERS = 9;
const MAX_PLAYERS = 15;
const SCRIPT_NAME = "Trouble Brewing";
const LOG_FILE_PATH = "detailed_game_log.txt";

// --- 类型定义 ---
interface SeatedPlayer {
  roleId: string;
  seatIndex: number;
  player: string;
  isAlive: boolean;
}

// --- 工具函数 ---
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffleArray = <T>(array: T[]): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


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

  const getRoleById = (roleId: string) => ROLES_DATA.find(r => r.id === roleId);
  const getLivingPlayers = () => seatedRoles.filter(p => p.isAlive);

  // 根据玩家人数获取建议的阵容
  const getRoleSetup = (numPlayers: number) => {
    if (numPlayers >= 13) return { townsfolk: 9, outsider: 2, minion: 1, demon: 1 };
    if (numPlayers >= 10) return { townsfolk: 7, outsider: 1, minion: 1, demon: 1 };
    return { townsfolk: 5, outsider: 2, minion: 1, demon: 1 }; // 9 players
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
    await page.close();
  });

  test("should run a full game simulation", async () => {
    await page.goto("http://localhost:3000", { timeout: 60000 });

    log(`--- 开始新一轮游戏测试 (${new Date().toLocaleString()}) ---`);
    log(`剧本: ${SCRIPT_NAME}`);
    log(`玩家人数: ${playerCount}`);

    // 1. 角色选择
    const setup = getRoleSetup(playerCount);
    let selectedRoles: string[] = [];
    const rolePool = shuffleArray([...ROLES_DATA]);

    const selectRolesFromTeam = (team: 'townsfolk' | 'outsider' | 'minion' | 'demon', count: number) => {
      const teamRoles = rolePool.filter(r => r.type === team).map(r => r.id);
      selectedRoles.push(...teamRoles.slice(0, count));
    };

    selectRolesFromTeam('townsfolk', setup.townsfolk);
    selectRolesFromTeam('outsider', setup.outsider);
    selectRolesFromTeam('minion', setup.minion);
    selectRolesFromTeam('demon', setup.demon);
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

    // 3. 进入夜晚
    await page.click('button:has-text("确认无误，入夜")');

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
    // 提名阶段 - 随机一位玩家提名另一位
    const livingPlayers = getLivingPlayers();
    if (livingPlayers.length < 3) return;

    const nominator = shuffleArray(livingPlayers)[0];
    const nominee = shuffleArray(livingPlayers.filter(p => p.seatIndex !== nominator.seatIndex))[0];

    log(`${nominator.player} (${getRoleById(nominator.roleId)?.name}) 发起提名。`);
    await page.click('[data-testid="start-nomination-button"]');
    await page.click(`[data-seat-id="${nominator.seatIndex}"]`); // 选择提名者
    await page.click(`[data-seat-id="${nominee.seatIndex}"]`);   // 选择被提名者
    await page.click('button:has-text("确认提名")');
    log(` -> ${nominator.player} 提名了 ${nominee.player} (${getRoleById(nominee.roleId)?.name})`);

    // 投票阶段
    log("进行投票...");
    await sleep(500);
    const voteModal = page.locator('h2:has-text("投票开始")');
    if (!await voteModal.isVisible()) return;

    const livingVoters = getLivingPlayers();
    let votesFor = 0;
    for (const voter of livingVoters) {
      // 随机投票
      const voteButton = Math.random() > 0.5
        ? voteModal.locator(`~ button:has-text("${voter.player}")`)
        : null;
      if (voteButton) {
        await voteButton.click();
        log(` -> ${voter.player} 投票给 ${nominee.player}`);
        votesFor++;
      } else {
        log(` -> ${voter.player} 没有投票`);
      }
    }

    await page.click('button:has-text("确认投票结果")');
    log(`投票结束. ${nominee.player} 获得 ${votesFor} 票。`);

    // 处决阶段
    if (votesFor > livingPlayers.length / 2) {
      log(`${nominee.player} 被放上处决台。`);
      const executeButton = page.locator('button:has-text("执行处决")');
      if (await executeButton.isVisible()) {
        await executeButton.click();
        log(` -> 确认处决 ${nominee.player}。`);
        const executedPlayer = seatedRoles.find(p => p.seatIndex === nominee.seatIndex);
        if (executedPlayer) executedPlayer.isAlive = false;
      }
    } else {
      log("票数不足，无人被处决。");
      const continueButton = page.locator('button:has-text("继续提名")');
      if (await continueButton.isVisible()) await continueButton.click();
    }
  }
});
