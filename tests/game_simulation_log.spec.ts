import { test, expect, Page } from "@playwright/test";
import fs from "fs";

// =============================================
// --- 测试配置 ---
// =============================================
const GAME_URL = "http://localhost:3000";
const LOG_FILE_PATH = "simulation-log.txt";
const PLAYER_COUNT = 5;
const SCRIPT_NAME = /暗流涌动|Trouble Brewing/i;
const ROLES_TO_ASSIGN = [
  { roleName: "小恶魔", seatIndex: 0 },
  { roleName: "投毒者", seatIndex: 1 },
  { roleName: "洗衣妇", seatIndex: 2 },
  { roleName: "图书管理员", seatIndex: 3 },
  { roleName: "调查员", seatIndex: 4 },
];

// =============================================
// --- Helper 函数 ---
// =============================================

/**
 * 捕获所有控制台日志并写入文件
 * @param page Playwright Page 对象
 * @param logFilePath 日志文件路径
 */
function captureConsoleLogs(page: Page, logFilePath: string) {
  const logStream = fs.createWriteStream(logFilePath, { flags: "w" });
  const startTime = new Date();

  logStream.write(`====== 游戏模拟日志 ======
`);
  logStream.write(`测试开始于: ${startTime.toISOString()}
`);
  logStream.write(`=========================

`);

  page.on("console", async (msg) => {
    const time = new Date().toLocaleTimeString();
    const type = msg.type();
    const text = msg.text();
    const logLine = `[${time}] [${type}] ${text}
`;

    // 打印到测试运行器的控制台
    process.stdout.write(logLine);

    // 写入日志文件
    logStream.write(logLine);
  });

  // 在测试结束时关闭文件流
  test.afterAll(async () => {
    logStream.write(`
====== 测试结束 ======
`);
    logStream.end();
  });
}

/**
 * 分配角色
 * @param page
 * @param roleName
 * @param seatIndex
 */
async function assignRole(page: Page, roleName: string, seatIndex: number) {
  console.log(`[TEST] 分配角色: ${roleName} -> ${seatIndex + 1}号位`);

  // 点击角色卡
  const roleBtn = page.getByRole("button", { name: new RegExp(roleName, "i") });
  await expect(roleBtn).toBeVisible();
  await roleBtn.click();

  // 点击座位
  const emptySeats = await page
    .locator('div.cursor-pointer:has-text("空"), button:has-text("空")')
    .all();
  if (emptySeats.length <= seatIndex) {
    throw new Error(
      `座位数量不足：找到 ${emptySeats.length} 个空位，但需要分配第 ${seatIndex + 1} 个。`
    );
  }
  const seatElement = emptySeats[seatIndex];
  await expect(seatElement).toBeVisible();
  await seatElement.click();
  await page.waitForTimeout(200); // 等待状态更新
}

/**
 * 在夜晚为某个角色执行行动
 * @param page
 * @param roleName 角色名，用于日志
 * @param actionDescription 行动描述
 * @param actionFn 具体行动的函数
 */
async function performNightAction(
  page: Page,
  roleName: string,
  actionDescription: string,
  actionFn: () => Promise<void>
) {
  console.log(`[TEST] 夜晚行动: ${roleName} - ${actionDescription}`);
  // 等待当前行动角色的提示出现
  await expect(page.getByText(`轮到 ${roleName} 行动`)).toBeVisible({
    timeout: 15000,
  });

  await actionFn(); // 执行具体操作

  // 点击确认按钮
  const confirmBtn = page.getByRole("button", { name: /确认|Confirm|下一步/ });
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await page.waitForTimeout(500); // 等待过渡动画和状态更新
}

// =============================================
// --- 测试主体 ---
// =============================================

test("游戏模拟与日志记录", async ({ page }) => {
  // --- 1. 设置：启动日志捕获 ---
  captureConsoleLogs(page, LOG_FILE_PATH);
  console.log(`[TEST] 控制台日志将被记录到: ${LOG_FILE_PATH}`);

  // --- 2. 导航和剧本选择 ---
  console.log(`[TEST] 导航到 ${GAME_URL}`);
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: SCRIPT_NAME }).click();
  await expect(page.getByText("游戏人数")).toBeVisible();

  // --- 3. 分配角色 ---
  for (const { roleName, seatIndex } of ROLES_TO_ASSIGN) {
    await assignRole(page, roleName, seatIndex);
  }

  // --- 4. 开始游戏 ---
  console.log("[TEST] 点击开始游戏");
  const startBtn = page.getByRole("button", { name: /开始游戏|Start Game/i });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  console.log("[TEST] 点击确认，进入夜晚");
  const enterNightBtn = page.getByRole("button", { name: /入夜|Night/i });
  await expect(enterNightBtn).toBeVisible();
  await enterNightBtn.click();

  // --- 5. 第一个夜晚 ---
  console.log("[TEST] --- 第一个夜晚开始 ---");

  // 投毒者 (2号) -> 毒 3号
  await performNightAction(page, "投毒者", "选择 3 号玩家", async () => {
    await page.locator('.seat-node').nth(2).click(); // 点击3号座位
  });

  // 等待毒药确认模态框
  console.log("[TEST] 投毒者: 确认下毒");
  const poisonConfirmModal = page.getByRole('dialog', { name: /确认下毒/i });
  await expect(poisonConfirmModal).toBeVisible();
  await poisonConfirmModal.getByRole('button', { name: '确认' }).click();


  // 洗衣妇 (3号) - 无目标
  await performNightAction(
    page,
    "洗衣妇",
    "无目标，直接确认",
    async () => { }
  );

  // 图书管理员 (4号) - 无目标
  await performNightAction(
    page,
    "图书管理员",
    "无目标，直接确认",
    async () => { }
  );

  // 调查员 (5号) - 无目标
  await performNightAction(
    page,
    "调查员",
    "无目标，直接确认",
    async () => { }
  );

  // 小恶魔 (1号) -> 杀 4号
  await performNightAction(page, "小恶魔", "选择 4 号玩家", async () => {
    await page.locator('.seat-node').nth(3).click(); // 点击4号座位
  });

  // 等待击杀确认模态框
  console.log("[TEST] 小恶魔: 确认击杀");
  const killConfirmModal = page.getByRole('dialog', { name: /确认击杀/i });
  await expect(killConfirmModal).toBeVisible();
  await killConfirmModal.getByRole('button', { name: '确认' }).click();


  // --- 6. 白天阶段 ---
  console.log("[TEST] --- 白天阶段开始 ---");

  // 等待夜晚死亡报告
  await expect(page.getByText(/昨晚.*死亡/)).toBeVisible({ timeout: 10000 });
  console.log("[TEST] 点击确认夜晚死亡报告");
  await page.getByRole("button", { name: "确认" }).click();

  // 提名阶段
  await expect(page.getByText(/发起提名/)).toBeVisible();
  console.log("[TEST] 1号 提名 2号");
  await page.locator('.seat-node').nth(0).click(); // 点击1号座位
  await page.locator('.seat-node').nth(1).click(); // 点击2号作为被提名人
  await page.getByRole("button", { name: /发起提名/ }).click();
  await page.waitForTimeout(500);


  // 投票阶段
  await expect(page.getByText(/开始投票/)).toBeVisible();
  console.log("[TEST] 点击开始投票");
  await page.getByRole("button", { name: /开始投票/i }).click();

  // 说书人输入票数
  await expect(page.getByText(/请输入票数/)).toBeVisible();
  console.log("[TEST] 输入 3 票");
  await page.getByLabel(/票数输入框/).fill("3");
  await page.getByRole("button", { name: "提交" }).click();

  // 处决阶段
  await expect(page.getByText(/执行处决/)).toBeVisible();
  console.log("[TEST] 点击执行处决");
  await page.getByRole("button", { name: /执行处决/i }).click();
  await page.waitForTimeout(500);

  // 确认处决结果
  await expect(page.getByText(/处决结果/)).toBeVisible();
  console.log("[TEST] 确认处决结果");
  await page.getByRole("button", { name: "确认" }).click();

  console.log("[TEST] --- 模拟结束 ---");
  await page.waitForTimeout(5000); // 等待最后的日志
});
