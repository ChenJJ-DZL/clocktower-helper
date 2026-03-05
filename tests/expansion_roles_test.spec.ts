
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
        // Capture browser console
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[') || text.includes('Error') || text.includes('Warning')) {
                logger.log("应用", text);
            }
        });
        await page.goto(GAME_URL);
        // Ensure page is loaded
        await page.waitForLoadState('networkidle');
    });

    test("Tinker at-will death via Storyteller console", async () => {
        logger.log("测试", "--- 开始验证修补匠猝死技能 ---");

        // 1. Setup game with Tinker
        await page.getByText(/黯月初升|Bad Moon Rising/).click();

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
        await expect(page.locator('.seat-node').nth(0)).toContainText('已死亡', { timeout: 10000 });
        logger.log("测试", "✅ 修补匠已成功爆毙");
    });

    test("Moonchild revenge kill logic", async () => {
        test.setTimeout(120000); // 2 minutes for full game setup and day 1
        logger.log("测试", "--- 开始验证月之子派生死亡 ---");

        // 1. Select expansion and WAIT for role tokens to load
        const expansionBtn = page.getByText(/黯月初升|Bad Moon Rising/);
        await expansionBtn.click();

        // Wait for a role button that is specific to this expansion to be visible
        // Using a more robust selector and retry logic
        const grandmotherBtn = page.getByRole('button', { name: /祖母|GRANDMOTHER/i });
        await expect(grandmotherBtn.first()).toBeVisible({ timeout: 15000 });
        logger.log("测试", "剧本选择成功，角色按钮已加载");

        // Seat 0: Moonchild (Outsider)
        // Seat 1: Grandmother (Good)
        // Seat 2: Zombuul (Evil)
        const selectRole = async (roleName: string, seatIdx: number) => {
            // Map common Chinese names to IDs for more robust selection
            const nameToId: Record<string, string> = {
                "月之子": "moonchild",
                "祖母": "grandmother",
                "僵怖": "zombuul",
                "水手": "sailor",
                "侍女": "chambermaid",
                "驱魔人": "exorcist",
                "旅店老板": "innkeeper",
                "赌徒": "gambler",
                "造谣者": "gossip",
                "教父": "godfather",
                "主谋": "mastermind",
                "普卡": "pukka",
                "魔鬼代言人": "devils_advocate",
                "钟表匠": "clockmaker",
                "筑梦师": "dreamer",
                "洗脑师": "cerenovus",
                "变种人": "mutant",
                "心上人": "sweetheart",
                "卖花女孩": "flowergirl",
                "吟游诗人": "minstrel",
            };

            const roleId = nameToId[roleName];
            const btn = roleId
                ? page.locator(`button[data-role-id="${roleId}"]`)
                : page.locator('.role-token-button').filter({ hasText: roleName });
            try {
                // Ensure it's attached and scroll it into view (out of fold)
                await btn.waitFor({ state: 'attached', timeout: 10000 });
                await btn.scrollIntoViewIfNeeded();
                await expect(btn).toBeVisible({ timeout: 5000 });

                await btn.click({ force: true });

                const seat = page.locator('.seat-node').nth(seatIdx);
                await seat.scrollIntoViewIfNeeded();
                await seat.click({ force: true });

                await page.waitForTimeout(300);
            } catch (e) {
                // Diagnostic logging
                const allButtons = await page.locator('.role-token-button').all();
                const btnTexts = [];
                for (const b of allButtons) {
                    const text = await b.textContent();
                    btnTexts.push(text?.trim().split('\n')[0]); // Just the first line (Chinese name)
                }
                const errorMsg = `未找到或无法点击角色按钮 "${roleName}"。可以看到的按钮: ${btnTexts.join(', ')}`;
                logger.log("错误", errorMsg);
                console.error(errorMsg);
                throw e;
            }
        };

        await selectRole("月之子", 0);
        await selectRole("祖母", 1);
        await selectRole("僵怖", 2);

        // Fill rest
        const rest = ['水手', '侍女', '驱魔人', '教父', '赌徒', '造谣者'];
        for (let i = 3; i < 9; i++) {
            await selectRole(rest[i - 3], i);
        }

        await page.getByRole("button", { name: "开始游戏" }).click();
        await page.getByText(/确认无误/).click();
        await skipNightActions(page, logger);

        // Day 1: Nominate and execute Moonchild
        logger.log("测试", "提名并处决月之子");

        // Wait for Day Phase
        await expect(page.locator('text=/第\\s*1\\s*天|Day\\s*1/')).toBeVisible({ timeout: 15000 });

        await page.locator('.seat-node').nth(1).click({ force: true }); // Nominator
        await page.locator('.seat-node').nth(0).click({ force: true }); // Nominee (Moonchild)

        const nomadBtn = page.getByRole("button", { name: "发起提名" });
        await expect(nomadBtn).toBeVisible({ timeout: 5000 });
        await nomadBtn.click();
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
        await expect(page.locator('text=/月之子.*陪葬/')).toBeVisible({ timeout: 10000 });

        // Select seat 1 (2号 is Grandmother)
        // Note: MoonchildKillModal buttons are direct click-to-confirm
        await page.locator('button:has-text("2号")').click();

        logger.log("测试", "已选择诅咒目标，准备入夜");
        await page.getByRole("button", { name: "入夜" }).click();
        await page.locator('button:has-text("确认")').click();

        // Night 2 should process the death
        await skipNightActions(page, logger);

        // Morning report: Grandmother (Seat 1) should be dead
        const grandmotherSeat = page.locator('.seat-node').nth(1);
        await expect(grandmotherSeat).toContainText('已死亡', { timeout: 10000 });
        logger.log("测试", "✅ 月之子仇杀成功，祖母在夜晚死亡（通过座位状态确认）");
    });

    test("Mastermind extra day prevention of game over", async () => {
        logger.log("测试", "--- 开始验证主谋额外一天逻辑 ---");

        await page.getByText(/黯月初升|Bad Moon Rising/).click();

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

        await page.getByText(/黯月初升|Bad Moon Rising/).click();

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
        await expect(seat2).toHaveClass(/poisoned/);

        logger.log("测试", "✅ 诺-达希邻居初始中毒成功");
    });

    test("Grandmother grandchild assignment and death trigger", async () => {
        logger.log("测试", "--- 开始验证祖母孙子连带死亡逻辑 ---");

        await page.getByText(/黯月初升|Bad Moon Rising/).click();

        // 1. Setup Roles
        // Seat 0: Grandmother (Townsfolk)
        // Seat 1: Sailor (Townsfolk - will be the grandchild)
        // Seat 2: Zombuul (Demon)
        const selectRole = async (roleName: string, id: string, seatIdx: number) => {
            const btn = page.locator(`button[data-role-id="${id}"]`);
            try {
                await btn.waitFor({ state: 'attached', timeout: 10000 });
                await btn.scrollIntoViewIfNeeded();
                await expect(btn).toBeVisible({ timeout: 5000 });

                await btn.click({ force: true });
                await page.waitForTimeout(200); // Wait for selectedRole to sync

                const seat = page.locator('.seat-node').nth(seatIdx);
                await seat.scrollIntoViewIfNeeded();
                logger.log("测试", `点击座位 ${seatIdx + 1}`);
                await seat.click({ force: true });

                await page.waitForTimeout(500); // Wait for changeRole/onSetup
            } catch (e) {
                logger.log("错误", `未找到或无法点击角色按钮 "${roleName}" (${id})`);
                throw e;
            }
        };

        await selectRole("吟游诗人", "minstrel", 1);
        await selectRole("祖母", "grandmother", 0);
        await selectRole("僵怖", "zombuul", 2);

        // Fill remaining with generic good roles present in expansion script
        const rest = [
            { id: "chambermaid", name: "侍女" },
            { id: "exorcist", name: "驱魔人" },
            { id: "innkeeper", name: "旅店老板" },
            { id: "gambler", name: "赌徒" },
            { id: "pacifist", name: "和平主义者" },
            { id: "tea_lady", name: "茶艺师" }
        ];
        for (let i = 3; i < 9; i++) {
            await selectRole(rest[i - 3].name, rest[i - 3].id, i);
        }

        await page.getByRole("button", { name: "开始游戏" }).click();
        await page.getByText(/确认无误/).click();

        // 2. Night 1: Verify Grandma's information action
        logger.log("测试", "开始核通知并跳过首夜");
        await skipNightActions(page, logger);

        // 3. Day 1: Prepare for Demon Kill
        logger.log("测试", "第一天：进入黄昏并入夜");
        await page.getByRole("button", { name: "进入黄昏处决阶段" }).click();
        await page.getByRole("button", { name: /入夜/ }).click();

        // 4. Night 2: Demon kills Grandchild (Seat 1)
        logger.log("测试", "第二夜：恶魔击杀孙子（吟游诗人）");

        await skipNightActions(page, logger, async () => {
            const loc = page.locator('.active-character-instruction');
            const cnt = await loc.count().catch(() => 0);
            const instructionText = cnt > 0 ? await loc.first().textContent().catch(() => "") : "";
            logger.log("测试", `[NightAction] cnt: ${cnt}, text: ${instructionText}`);

            if (instructionText && /僵怖/.test(instructionText)) {
                logger.log("测试", "遇到僵怖回合，锁定击杀1号");
                await page.locator('.seat-node').nth(1).click({ force: true }).catch(() => { });
                return true;
            }
            return false;
        });

        await skipNightActions(page, logger);

        // 5. Morning: Both Grandchild (Seat 1) and Grandmother (Seat 0) should be dead
        logger.log("测试", "黎明：核对死亡状态");

        const grandmaSeat = page.locator('.seat-node').nth(0);
        const grandchildSeat = page.locator('.seat-node').nth(1);

        await expect(grandmaSeat).toContainText('已死亡', { timeout: 15000 });
        await expect(grandchildSeat).toContainText('已死亡', { timeout: 15000 });

        logger.log("测试", "✅ 孙子死亡导致祖母殉情验证成功");
    });
});

async function skipNightActions(page: Page, logger: StorytellerLogger, onTargetNeeded?: () => Promise<boolean>) {
    logger.log("测试", "开始跳过夜晚步骤...");
    // Initial wait for animation
    await page.waitForTimeout(1000);

    for (let i = 0; i < 100; i++) {
        try {
            // 1. Check for Day Phase indicators FIRST to exit early
            const nomadBtn = page.getByRole("button", { name: "发起提名" });
            const dayIndicator = page.getByRole("button", { name: "进入黄昏处决阶段" });

            const isDay = await nomadBtn.isVisible({ timeout: 100 }).catch(() => false) ||
                await dayIndicator.isVisible({ timeout: 100 }).catch(() => false);

            if (isDay) {
                logger.log("测试", "探测到白天阶段标识，停止跳过夜晚");
                return;
            }

            // 2. Check for Night Report
            const nightReport = page.locator("h2:has-text('夜晚报告')");
            if (await nightReport.isVisible({ timeout: 100 }).catch(() => false)) {
                logger.log("测试", "探测到夜晚报告，点击确认");
                const reportConfirm = page.locator('div[aria-modal="true"] button:has-text("确认")');
                if (await reportConfirm.isVisible({ timeout: 100 }).catch(() => false)) {
                    await reportConfirm.click({ force: true });
                    await page.waitForTimeout(500);
                }
                continue;
            }

            // 3. Check for STORYTELLER_SELECT modal (说书人选择目标)
            const stSelectHeading = page.locator('h3:has-text("说书人选择目标")');
            if (await stSelectHeading.isVisible({ timeout: 100 }).catch(() => false)) {
                logger.log("测试", "探测到说书人选择弹窗");
                // Click a player button inside the modal to select a target
                const playerBtns = page.locator('button:has-text("号")').filter({ hasNotText: '确认选择' });
                const playerCount = await playerBtns.count().catch(() => 0);
                if (playerCount > 0) {
                    // Click first available (non-disabled) player
                    for (let pi = 0; pi < playerCount; pi++) {
                        const pBtn = playerBtns.nth(pi);
                        if (!await pBtn.isDisabled().catch(() => true)) {
                            await pBtn.click({ force: true }).catch(() => { });
                            break;
                        }
                    }
                    await page.waitForTimeout(200);
                }
                // Try to click 确认选择
                const stConfirmBtn = page.locator('button:has-text("确认选择")');
                if (await stConfirmBtn.isVisible({ timeout: 200 }).catch(() => false) &&
                    !await stConfirmBtn.isDisabled().catch(() => true)) {
                    logger.log("测试", "说书人选择弹窗：点击确认选择");
                    await stConfirmBtn.click({ force: true });
                } else {
                    // Fallback: click 取消
                    const cancelBtn = page.locator('button:has-text("取消")');
                    if (await cancelBtn.isVisible({ timeout: 100 }).catch(() => false)) {
                        logger.log("测试", "说书人选择弹窗：点击取消");
                        await cancelBtn.click({ force: true });
                    }
                }
                await page.waitForTimeout(500);
                continue;
            }

            // 4. Check for specific Check Phase button
            const checkConfirmBtn = page.locator('button:has-text("确认无误")');
            if (await checkConfirmBtn.isVisible({ timeout: 100 }).catch(() => false)) {
                logger.log("测试", "探测到核对身份确认按钮，点击确认");
                await checkConfirmBtn.click({ force: true });
                await page.waitForTimeout(500);
                continue;
            }

            // 4. Check for general confirmation buttons (Confirm, Next, Storyteller selected)
            const confirmBtn = page.locator('button:has-text("确认"), button:has-text("下一步"), button:has-text("Confirm"), button:has-text("说书人选好了"), button:has-text("我记住了"), button:has-text("Got it")').first();
            if (await confirmBtn.isVisible({ timeout: 100 }).catch(() => false)) {
                let targetHandled = false;
                if (onTargetNeeded) {
                    targetHandled = await onTargetNeeded();
                }

                if (await confirmBtn.isDisabled().catch(() => true)) {
                    if (!targetHandled) {
                        logger.log("测试", "检测到确认按钮被禁用，尝试随机选择目标...");
                        // Try multiple seat pairs to avoid self-targeting deadlock
                        // IMPORTANT: Avoid seats 0 (Grandmother) and 1 (Grandchild) to prevent Innkeeper protection interference
                        const seatPairs = [[3, 4], [6, 7], [2, 3]];
                        for (const [a, b] of seatPairs) {
                            await page.locator('.seat-node').nth(a).click({ force: true }).catch(() => { });
                            await page.locator('.seat-node').nth(b).click({ force: true }).catch(() => { });
                            await page.waitForTimeout(200);
                            if (!await confirmBtn.isDisabled().catch(() => true)) break;
                        }
                        await page.waitForTimeout(300);
                    }
                }

                await page.waitForTimeout(100);

                if (!await confirmBtn.isDisabled().catch(() => true)) {
                    const btnText = await confirmBtn.textContent();
                    logger.log("测试", `点击确认/下一步按钮: ${btnText}`);
                    await confirmBtn.click({ force: true });
                    await page.waitForTimeout(500);
                }
                continue;
            }

            // 5. Check if we are stuck on a "Guide" display
            const guidePanel = page.locator('.night-guide-panel');
            if (await guidePanel.isVisible({ timeout: 100 }).catch(() => false)) {
                logger.log("测试", "探测到指示面板但未发现确认按钮，尝试等待...");
            }

            // Short wait before next poll
            await page.waitForTimeout(500);
        } catch (e: any) {
            logger.log("错误", `skipNightActions 循环出错: ${e.message}`);
            if (e.message.includes('closed') || e.message.includes('Target')) break;
        }
    }
    logger.log("测试", "跳过夜晚步骤循环结束");
}
