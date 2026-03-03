
import { test, expect, Page } from "@playwright/test";
import {
    GAME_URL,
    StorytellerLogger,
    getRandomInt,
    shuffleArray,
    sleep,
    getRoleById,
    ROLES_DATA,
    SeatedPlayer,
    getAlivePlayerIndexes
} from "./simulation_helpers";

test.describe("Expansion Roles Specific Tests", () => {
    let page: Page;
    const logFilePath = "expansion_test_log.txt";
    let logger: StorytellerLogger;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        logger = new StorytellerLogger(logFilePath);
    });

    test.afterAll(async () => {
        logger.close();
        if (page) await page.close();
    });

    test.beforeEach(async () => {
        await page.goto(GAME_URL);
        // Ensure page is loaded
        await page.waitForLoadState('networkidle');
    });

    test("Tinker at-will death via Storyteller console", async () => {
        logger.log("测试", "--- 开始验证修补匠猝死技能 ---");

        // 1. Setup game with Tinker
        await page.getByText(/暗月初升|Bad Moon Rising/).click();

        // Choose 9 players
        const playerCount = 9;

        // Assign roles manually to control the test
        // Seat 0: Tinker
        await page.getByRole("button", { name: "修补匠" }).click();
        await page.locator('.seat-node').nth(0).click();

        // Fill other seats with generic townsfolk
        const roles = ['祖母', '水手', '侍女', '驱魔人', '旅店老板', '赌徒', '造谣者', '僵怖'];
        for (let i = 1; i < playerCount; i++) {
            await page.getByRole("button", { name: roles[i - 1] }).click();
            await page.locator('.seat-node').nth(i).click();
        }

        await page.getByRole("button", { name: "开始游戏" }).click();

        // Skip setup/check phase
        await page.getByText(/确认无误/).click();

        // Should be night 1, skip night actions
        await skipNightActions(page, logger);

        // Day 1
        logger.log("测试", "进入第一天，准备触发修补匠爆毙");

        // Look for Tinker's day ability in the console
        const tinkerAbilityBtn = page.locator('button:has-text("使用 修补匠")');
        await expect(tinkerAbilityBtn).toBeVisible({ timeout: 10000 });

        // Handle confirm dialog (ATTACH BEFORE CLICK)
        page.once('dialog', async dialog => {
            expect(dialog.message()).toContain('猝死');
            await dialog.accept();
        });

        // Click use
        await tinkerAbilityBtn.click();

        // Wait for death animation/state update
        await expect(page.locator('.seat-node').nth(0)).toContainText('已死亡');
        logger.log("测试", "✅ 修补匠已成功爆毙");
    });

    test("Moonchild revenge kill logic", async () => {
        logger.log("测试", "--- 开始验证月之子派生死亡 ---");

        await page.getByText(/暗月初升|Bad Moon Rising/).click();

        // Seat 0: Moonchild (Outsider)
        // Seat 1: Grandmother (Good)
        // Seat 2: Zombuul (Evil)
        await page.getByRole("button", { name: "月之子" }).click();
        await page.locator('.seat-node').nth(0).click();
        await page.getByRole("button", { name: "祖母" }).click();
        await page.locator('.seat-node').nth(1).click();
        await page.getByRole("button", { name: "僵怖" }).click();
        await page.locator('.seat-node').nth(2).click();

        // Fill rest
        const rest = ['水手', '侍女', '驱魔人', '教父', '赌徒', '造谣者'];
        for (let i = 3; i < 9; i++) {
            await page.getByRole("button", { name: rest[i - 3] }).click();
            await page.locator('.seat-node').nth(i).click();
        }

        await page.getByRole("button", { name: "开始游戏" }).click();
        await page.getByText(/确认无误/).click();
        await skipNightActions(page, logger);

        // Day 1: Nominate and execute Moonchild
        logger.log("测试", "提名并处决月之子");
        await page.locator('.seat-node').nth(1).click({ force: true }); // Nominator
        await page.locator('.seat-node').nth(0).click({ force: true }); // Nominee (Moonchild)
        await page.getByRole("button", { name: "发起提名" }).click();
        await page.getByRole("button", { name: "开始投票" }).click();

        // Bulk vote
        const voteCountText = await page.locator('button:has-text("确认")').textContent();
        // Since it's a simulation, just click enough voters or use a "force vote" if available
        // Here we'll just click all voters in the modal
        const voters = await page.locator('div[role="dialog"] button:has-text("号")').all();
        for (const v of voters) await v.click();

        await page.locator('button:has-text("确认")').click();
        await sleep(1000);

        await page.getByRole("button", { name: "执行处决" }).click();
        await page.locator('button:has-text("确认处决")').click();

        // Moonchild should be dead and trigger revenge modal
        logger.log("测试", "处决完成，检查月之子报仇弹窗");
        await expect(page.locator('text=/月之子.*选择.*诅咒/')).toBeVisible({ timeout: 5000 });

        // Select seat 1 (Grandmother)
        await page.locator('div[role="dialog"] button:has-text("2号")').click();
        await page.locator('button:has-text("确认选择")').click();

        logger.log("测试", "已选择诅咒目标，准备入夜");
        await page.getByRole("button", { name: "入夜" }).click();
        await page.locator('button:has-text("确认")').click();

        // Night 2 should process the death
        await skipNightActions(page, logger);

        // Morning report: Grandmother should be dead
        await expect(page.locator('text=/2号.*死亡/')).toBeVisible({ timeout: 5000 });
        logger.log("测试", "✅ 月之子仇杀成功，祖母在夜晚死亡");
    });

    test("Mastermind extra day prevention of game over", async () => {
        logger.log("测试", "--- 开始验证主谋额外一天逻辑 ---");

        await page.getByText(/暗月初升|Bad Moon Rising/).click();

        // Seat 0: Mastermind (Minion)
        // Seat 1: Pukka (Demon)
        // Seat 2: Grandmother (Good)
        await page.getByRole("button", { name: "主谋" }).click();
        await page.locator('.seat-node').nth(0).click();
        await page.getByRole("button", { name: "普卡" }).click();
        await page.locator('.seat-node').nth(1).click();

        // Fill rest with 3 more players to have 5 total (standard minimum for demon death check)
        const rest = ['祖母', '水手', '侍女'];
        for (let i = 2; i < 5; i++) {
            await page.getByRole("button", { name: rest[i - 2] }).click();
            await page.locator('.seat-node').nth(i).click();
        }

        await page.getByRole("button", { name: "开始游戏" }).click();
        await page.getByText(/确认无误/).click();
        await skipNightActions(page, logger);

        // Day 1: Execute Demon (Pukka)
        logger.log("测试", "处决恶魔，检查主谋是否锁死游戏结束");
        await page.locator('.seat-node').nth(2).click({ force: true });
        await page.locator('.seat-node').nth(1).click({ force: true });
        await page.getByRole("button", { name: "发起提名" }).click();
        await page.getByRole("button", { name: "开始投票" }).click();
        const voters = await page.locator('div[role="dialog"] button:has-text("号")').all();
        for (const v of voters) await v.click();
        await page.locator('button:has-text("确认")').click();
        await sleep(1000);

        await page.getByRole("button", { name: "执行处决" }).click();
        await page.locator('button:has-text("确认处决")').click();

        // Game should NOT end
        const gameOverModal = page.locator("[data-testid='game-over-modal']");
        await expect(gameOverModal).not.toBeVisible({ timeout: 3000 });

        logger.log("测试", "✅ 恶魔死亡但游戏未结束（主谋生效）");

        // Verify we can enter next night
        await expect(page.getByRole("button", { name: "入夜" })).toBeVisible();
    });

    test("Devil's Advocate protection prevents execution death", async () => {
        logger.log("测试", "--- 开始验证魔鬼代言人保护逻辑 ---");

        await page.getByText(/暗月初升|Bad Moon Rising/).click();

        // Seat 0: Devil's Advocate (Minion)
        // Seat 1: Zombuul (Demon)
        // Seat 2: Grandmother (Good)
        await page.getByRole("button", { name: "魔鬼代言人" }).click();
        await page.locator('.seat-node').nth(0).click();
        await page.getByRole("button", { name: "僵怖" }).click();
        await page.locator('.seat-node').nth(1).click();

        const rest = ['祖母', '水手', '侍女', '驱魔人', '旅店老板'];
        for (let i = 2; i < 7; i++) {
            await page.getByRole("button", { name: rest[i - 2] }).click();
            await page.locator('.seat-node').nth(i).click();
        }

        await page.getByRole("button", { name: "开始游戏" }).click();
        await page.getByText(/确认无误/).click();

        // Night 1: DA protects Demon (Seat 1)
        logger.log("测试", "魔鬼代言人保护恶魔");
        // DA action usually involves selecting a target
        await page.locator('.seat-node').nth(1).click();
        await page.getByRole("button", { name: "确认 & 下一步" }).click();
        await skipNightActions(page, logger);

        // Day 1: Try to execute Demon
        logger.log("测试", "尝试处决受保护的恶魔");
        await page.locator('.seat-node').nth(2).click({ force: true });
        await page.locator('.seat-node').nth(1).click({ force: true });
        await page.getByRole("button", { name: "发起提名" }).click();
        await page.getByRole("button", { name: "开始投票" }).click();
        const voters = await page.locator('div[role="dialog"] button:has-text("号")').all();
        for (const v of voters) await v.click();
        await page.locator('button:has-text("确认")').click();
        await sleep(1000);

        await page.getByRole("button", { name: "执行处决" }).click();
        await page.locator('button:has-text("确认处决")').click();

        // Should see "No execution" or execution animation skipped
        await expect(page.locator('text=/处决未生效|活了下来/')).toBeVisible({ timeout: 5000 });
        logger.log("测试", "✅ 魔鬼代言人保护成功，恶魔未死亡");
    });

    test("No-Dashii proximity poisoning", async () => {
        logger.log("测试", "--- 开始验证诺-达希中毒逻辑 ---");

        await page.getByText(/梦陨春宵|Sects & Violets/).click();

        // Seat 0: Townsfolk 1 (Good)
        // Seat 1: No-Dashii (Demon)
        // Seat 2: Townsfolk 2 (Good)
        // Seat 3: Minion (Evil)
        await page.getByRole("button", { name: "钟表匠" }).click();
        await page.locator('.seat-node').nth(0).click();
        await page.getByRole("button", { name: "诺-达希" }).click();
        await page.locator('.seat-node').nth(1).click();
        await page.getByRole("button", { name: "筑梦师" }).click();
        await page.locator('.seat-node').nth(2).click();

        const rest = ['洗脑师', '变种人', '心上人', '卖花女孩'];
        for (let i = 3; i < 7; i++) {
            await page.getByRole("button", { name: rest[i - 3] }).click();
            await page.locator('.seat-node').nth(i).click();
        }

        await page.getByRole("button", { name: "开始游戏" }).click();

        // Check poisoning state (represented in UI by a red border or icon in the Grimoire/Console)
        // In this project, storyteller sees 'isPoisoned' in the console night info or seat node.
        logger.log("测试", "检查邻居中毒状态");

        // Open Grimoire or check seat nodes
        const seat0 = page.locator('.seat-node').nth(0);
        const seat2 = page.locator('.seat-node').nth(2);

        // Check for 'is-poisoned' class or similar
        await expect(seat0).toHaveClass(/poisoned/);
        await expect(seat2).toHaveClass(/poisoned/);

        logger.log("测试", "✅ 诺-达希邻居初始中毒成功");
    });
});

async function skipNightActions(page: Page, logger: StorytellerLogger) {
    for (let i = 0; i < 20; i++) {
        const nightPhaseActive = await page.locator('div[data-testid="night-phase-active"]').isVisible();
        if (!nightPhaseActive) break;

        const nextBtn = page.locator('button:has-text("确认 & 下一步")');
        if (await nextBtn.isVisible()) {
            await nextBtn.click();
            await sleep(300);
        } else {
            break;
        }
    }

    const nightReport = page.locator("h2:has-text('夜晚报告')");
    if (await nightReport.isVisible()) {
        await page.locator('div[aria-modal="true"] button:has-text("确认")').click();
    }
}
