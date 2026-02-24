
import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import {
    GAME_URL,
    StorytellerLogger,
    getRandomElement,
} from "./simulation_helpers";

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
        logger.log("测试启动", "开始验证艺术家和博学者的昼间技能...");

        page.on('console', msg => {
            logger.log(`浏览器[${msg.type()}]`, msg.text());
        });

        // 1. Script Selection
        await page.goto(GAME_URL);
        await page.waitForLoadState('load');

        // Choose S&V (or any script containing them)
        await page.locator('[data-testid=script-card-sects_and_violets]').click();
        await expect(page.getByText("当前剧本")).toBeVisible();

        // 2. Setup (5 players for speed)
        const playerCount = 5;
        // Logic might require certain number of players for standard distribution,
        // but let's try to just select the roles manually.

        // Manually select roles: Artist, Savant, and 1 Minion, 1 Demon, 1 other
        const targetRoles = ['艺术家', '博学者', '女巫', '方古', '哲学家'];

        logger.log("角色手动分配", `选取角色: ${targetRoles.join(', ')}`);

        for (let i = 0; i < targetRoles.length; i++) {
            const roleName = targetRoles[i];
            await page.getByRole("button", { name: new RegExp(`^${roleName}$`, "i") }).click();
            await page.locator('.seat-wrapper').nth(i).click();
            logger.log("角色分配", `${roleName} 落座于 ${i + 1} 号位。`);
        }

        // Start game
        const startBtn = page.getByRole("button", { name: "开始游戏" });
        if (await startBtn.isVisible()) {
            await startBtn.click();
        }

        const stillStartBtn = page.getByRole("button", { name: "仍然开始游戏" });
        if (await stillStartBtn.isVisible()) {
            await stillStartBtn.click();
        }

        // 3. First Night
        logger.log("游戏流程", "进入首夜...");
        await page.waitForSelector('text=确认并开始首夜');
        await page.click('text=确认并开始首夜');

        // Skip night actions for speed
        while (await page.locator('text=确认 & 下一步').isVisible()) {
            await page.click('text=确认 & 下一步');
            await page.waitForTimeout(500);
        }

        // 4. Dawn
        logger.log("游戏流程", "进入天亮...");
        const dawnBtn = page.locator('text=天亮了');
        if (await dawnBtn.isVisible()) {
            await dawnBtn.click();
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
        await artistModal.locator('button').filter({ hasText: "是" }).click();
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

        await savantModal.locator('button').filter({ hasText: "记录" }).click();
        await page.waitForTimeout(500);

        logger.log("测试完毕", "✅ 艺术家和博学者昼间技能验证成功！");
    });
});
