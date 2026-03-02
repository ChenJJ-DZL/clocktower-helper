
import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import {
    GAME_URL,
    StorytellerLogger,
} from "./simulation_helpers";

const LOG_FILE_PATH = path.join(__dirname, "final_verification.log");

test.describe("Final Verification of Day Abilities (Artist & Savant)", () => {
    let logger: StorytellerLogger;

    test.beforeAll(() => {
        logger = new StorytellerLogger(LOG_FILE_PATH);
    });

    test.afterAll(() => {
        logger.close();
    });

    test("Targeted Verification: Artist and Savant Abilities", async ({ page }) => {
        test.setTimeout(900000); // 15 minutes
        logger.log("测试启动", "开始针对性验证：艺术家和博学者的日间技能逻辑...");

        // Capture browser console logs
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[NightLogic]') || text.includes('[DayAction]') || text.includes('[Modal]')) {
                logger.log(`浏览器[${msg.type()}]`, text);
            }
        });

        // Handle dialogs (confirm for using abilities)
        page.on('dialog', async dialog => {
            logger.log("浏览器[dialog]", `处理弹窗: ${dialog.message()}`);
            await dialog.accept();
        });

        // 1. Script Selection
        logger.log("剧本选择", "访问首页并选择《梦陨春宵》剧本...");
        await page.goto(GAME_URL);
        await page.waitForLoadState('networkidle');

        const scriptCard = page.locator('[data-testid="script-card-sects_and_violets"]');
        await expect(scriptCard).toBeVisible({ timeout: 20000 });
        await scriptCard.click();

        await expect(page.getByText("当前剧本")).toBeVisible({ timeout: 20000 });
        logger.log("剧本选择", "成功进入《梦陨春宵》角色分配界面。");

        // 2. Role Allocation
        const targetRoles = [
            { id: 'artist', name: '艺术家' },
            { id: 'savant', name: '博学者' },
            { id: 'pit_hag', name: '麻脸巫婆' },
            { id: 'vortox', name: '涡流' },
            { id: 'philosopher', name: '哲学家' }
        ];

        logger.log("角色分配", `手动分配角色: ${targetRoles.map(r => r.name).join(', ')}`);

        // Debug: Log all buttons found on the page if we stall
        const logVisibleButtons = async () => {
            const buttons = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('button')).map(b => b.innerText.split('\n')[0]);
            });
            logger.log("调试", `当前页面可见按钮: ${buttons.join(', ')}`);
        };

        for (let i = 0; i < targetRoles.length; i++) {
            const role = targetRoles[i];
            const seatIndex = i;

            logger.log("角色分配", `正在为 ${seatIndex + 1} 号位分配 ${role.name}...`);

            try {
                // Wait for the role list and click the role card
                // Using a more flexible locator: any button containing the text
                const roleButton = page.locator('button').filter({ hasText: role.name }).first();
                await expect(roleButton).toBeVisible({ timeout: 15000 });
                await roleButton.click();

                // Wait for the seat and click it
                const seat = page.locator('.seat-node').nth(seatIndex);
                await expect(seat).toBeVisible({ timeout: 10000 });
                await seat.click();

                logger.log("角色分配", `✅ ${role.name} 分配成功。`);
                await page.waitForTimeout(500);
            } catch (e: any) {
                logger.log("错误", `无法分配角色 ${role.name}: ${e.message}`);
                await logVisibleButtons();
                await page.screenshot({ path: path.join(__dirname, `fail_assign_${role.id}.png`) });
                throw e;
            }
        }

        // 3. Start Game
        logger.log("阶段切换", "点击“开始游戏”...");
        try {
            const startBtn = page.getByRole("button", { name: "开始游戏", exact: true });
            await expect(startBtn).toBeVisible({ timeout: 10000 });
            await startBtn.click();
        } catch (e) {
            // Try by text if GetByRole fails
            await page.click('text=开始游戏');
        }

        // Handle composition warning
        try {
            const forceStartBtn = page.getByRole("button", { name: "仍然开始游戏" });
            if (await forceStartBtn.isVisible({ timeout: 5000 })) {
                logger.log("阶段切换", "检测到阵容警告，选择强制开始。");
                await forceStartBtn.click();
            }
        } catch (e) { }

        // 4. First Night
        logger.log("第一夜", "确认无误，入夜...");
        await page.click('text=确认无误，入夜');

        let nightSafety = 0;
        while (nightSafety < 30) {
            const nextActionBtn = page.locator('button').filter({ hasText: /确认 & 下一步/ });
            const dawnBtn = page.getByRole('button', { name: '开始白天' });
            const dawnText = page.locator('text=天亮了').first();
            const nightReportConfirmBtn = page.getByRole('button', { name: '确认' });

            if (await dawnBtn.isVisible() || await dawnText.isVisible() || await nightReportConfirmBtn.isVisible()) {
                logger.log("第一夜", "夜晚行动结束，准备切入白天。");
                await page.screenshot({ path: path.join(__dirname, 'debug_dawn.png') });

                if (await nightReportConfirmBtn.isVisible()) {
                    logger.log("第一夜", "检测到夜晚报告弹窗，点击确认...");
                    await nightReportConfirmBtn.click().catch(() => { });
                    await page.waitForTimeout(1000);
                }

                if (await dawnBtn.isVisible()) {
                    logger.log("第一夜", "检测到天亮按钮，准备进入白天...");
                    await dawnBtn.click().catch(e => logger.log("错误", `点击天亮按钮失败: ${e.message}`));
                    await page.waitForTimeout(2000);
                    break;
                } else if (await dawnText.isVisible()) {
                    logger.log("第一夜", "检测到天亮文本，尝试辅助点击...");
                    await page.click('text=开始白天').catch(() => { });
                    await page.waitForTimeout(2000);
                    break;
                }
            }

            if (await nextActionBtn.isVisible()) {
                const modalTitle = await page.locator('.modal-header, .text-xl.font-bold').first().innerText().catch(() => "弹窗");
                logger.log("第一夜", `确认记录: ${modalTitle.split('\n')[0]}`);

                // Try to select a target if needed (e.g. for Philosopher)
                const targetChoice = page.locator('.target-choice, .seat-node, button.role-item').first();
                if (await targetChoice.isVisible()) {
                    await targetChoice.click().catch(() => { });
                    await page.waitForTimeout(500);
                }

                await nextActionBtn.click();
                await page.waitForTimeout(1000);
            } else {
                await page.waitForTimeout(1000);
            }
            nightSafety++;
        }

        // 5. Day Actions
        logger.log("白天", "大家睁眼，验证各方技能...");
        await page.waitForTimeout(2000); // Wait for day transition

        // --- Verify Artist ---
        logger.log("艺术家验证", "点击艺术家技能按钮...");
        const artistAbilityBtn = page.getByRole("button", { name: /使用 艺术家/ });
        await expect(artistAbilityBtn).toBeVisible({ timeout: 10000 });
        await artistAbilityBtn.click();

        const artistModal = page.locator('div[role="dialog"]');
        // The modal title might have an emoji
        await page.waitForSelector('text=艺术家提问', { timeout: 10000 }).catch(() => logger.log("警告", "未通过文本找到艺术家弹窗"));
        await expect(artistModal).toBeVisible({ timeout: 5000 });
        logger.log("弹窗验证", "艺术家结果弹窗显示成功。");

        const yesButton = artistModal.locator('button').filter({ hasText: "是" });
        await expect(yesButton).toBeVisible();
        await yesButton.click();
        logger.log("艺术家验证", "录入结果：[是]");
        await page.waitForTimeout(1000);

        // --- Verify Savant ---
        logger.log("博学者验证", "点击博学者技能按钮...");
        const savantAbilityBtn = page.getByRole("button", { name: /使用 博学者/ });
        await expect(savantAbilityBtn).toBeVisible({ timeout: 10000 });
        await savantAbilityBtn.click();

        const savantModal = page.locator('div[role="dialog"]');
        await page.waitForSelector('text=博学者信息', { timeout: 10000 }).catch(() => logger.log("警告", "未通过文本找到博学者弹窗"));
        await expect(savantModal).toBeVisible({ timeout: 5000 });
        logger.log("弹窗验证", "博学者结果弹窗显示成功。");

        await savantModal.locator('button').filter({ hasText: "记录" }).first().click();
        logger.log("博学者验证", "点击记录完成操作。");
        await page.waitForTimeout(1000);

        logger.log("最终结果", "✅ 所有验证步骤顺利完成！");
    });
});
