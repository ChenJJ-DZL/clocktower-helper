/**
 * 黄昏->夜晚 快速诊断 v2
 */
import { test } from "@playwright/test";

test.setTimeout(180000);

test("黄昏→夜晚 过渡", async ({ page }) => {
  console.log("=== 开局 ===");
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /快速测试/ }).click();
  await page.waitForTimeout(1500);

  // 入夜
  const enter = page.getByRole("button", { name: /确认无误，入夜/ });
  if (await enter.isVisible({ timeout: 5000 }).catch(() => false)) {
    await enter.click();
    await page.waitForTimeout(2000);
  }

  // 快过首夜
  console.log("=== 首夜跳过 ===");
  for (let i = 0; i < 50; i++) {
    const body = await page.evaluate(() => document.body.innerText || "");
    if (body.includes("进入黄昏处决阶段") || body.includes("天亮") || body.includes("处决台")) break;

    // 处理弹窗
    const modals = page.locator('div[role="dialog"]');
    const mc = await modals.count();
    for (let j = 0; j < mc && j < 5; j++) {
      const btn = modals.nth(j).locator("button").first();
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    // 选1-2个目标
    const hashCount = await page.locator('button:has-text("#")').count();
    if (hashCount > 0 && hashCount < 20) {
      const minMatch = body.match(/最少(\d+)个/);
      const need = minMatch ? Math.min(parseInt(minMatch[1]), hashCount) : 1;
      for (let j = 0; j < need && j < hashCount; j++) {
        await page.locator('button:has-text("#")').nth(j).click().catch(() => {});
        await page.waitForTimeout(200);
      }
    }

    // 点确认
    const cf = page.locator(
      'button:has-text("确认 & 下一步"), button:has-text("天亮了"), button:has-text("展开对局记录")'
    ).first();
    if (await cf.isVisible({ timeout: 200 }).catch(() => false) &&
        await cf.isEnabled().catch(() => false)) {
      await cf.click();
      await page.waitForTimeout(600);
    } else {
      await page.waitForTimeout(300);
    }
  }

  // 黎明
  const cfDawn = page.locator('div[role="dialog"] button:has-text("确认")').first();
  if (await cfDawn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cfDawn.click();
    await page.waitForTimeout(1000);
  }

  // 进黄昏
  const duskBtn = page.getByRole("button", { name: /进入黄昏处决阶段/ });
  if (await duskBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await duskBtn.click();
    await page.waitForTimeout(1500);
  }

  const body1 = await page.evaluate(() => document.body.innerText || "");
  console.log(`Dusk entered: ${body1.includes("处决台")}`);
  
  const alive = await page.evaluate(() => 
    Array.from(document.querySelectorAll(".seat-node"))
      .filter(n => !n.textContent?.includes("已死亡"))
      .map(n => parseInt(n.getAttribute("data-seat-id") || "-1"))
      .filter(id => id >= 0)
  );
  console.log(`Alive: ${alive.join(",")}`);

  if (alive.length >= 2) {
    const nomId = alive[0];
    const neeId = alive[alive.length - 1];
    console.log(`Nominate: ${nomId + 1}→${neeId + 1}`);

    await page.locator(`[data-seat-id="${nomId}"]`).click();
    await page.waitForTimeout(600);
    await page.locator(`[data-seat-id="${neeId}"]`).click();
    await page.waitForTimeout(600);

    const nomBtn = page.getByRole("button", { name: /发起提名/ });
    const nomVisible = await nomBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`发起提名: ${nomVisible}`);
    
    if (nomVisible) {
      await nomBtn.click();
      await page.waitForTimeout(1000);

      // 投票
      const vm = page.locator('div[role="dialog"]');
      if (await vm.isVisible({ timeout: 1000 }).catch(() => false)) {
        const voters = alive.slice(0, Math.ceil(alive.length / 2) + 1);
        for (const v of voters) {
          const vb = vm.locator(`button:has-text("${v + 1}号")`);
          if (await vb.isVisible({ timeout: 200 }).catch(() => false)) {
            await vb.click(); await page.waitForTimeout(100);
          }
        }
        const cfV = vm.locator("button:has-text(/确认（.*票/)");
        if (await cfV.isVisible({ timeout: 500 }).catch(() => false)) {
          await cfV.click(); await page.waitForTimeout(800);
        }
      }
    }

    // 清理弹窗
    for (let i = 0; i < 5; i++) {
      const b = page.locator('div[role="dialog"] button').first();
      if (!(await b.isVisible({ timeout: 200 }).catch(() => false))) break;
      await b.click().catch(() => {});
      await page.waitForTimeout(300);
    }

    // 执行处决
    const exec = page.getByRole("button", { name: /执行处决/ });
    const execVisible = await exec.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`执行处决: ${execVisible}`);

    page.once("dialog", d => { console.log(`Alert: ${d.message().substring(0, 80)}`); d.accept(); });
    
    if (execVisible) {
      await exec.click();
      await page.waitForTimeout(2000);
    }

    // 确认处决结果
    await page.waitForTimeout(1000);
    const cfE = page.locator('div[role="dialog"] button:has-text("确认")').first();
    const cfEvisible = await cfE.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`确认弹窗: ${cfEvisible}`);

    if (cfEvisible) {
      await cfE.click();
      await page.waitForTimeout(2000);
    }
  }

  // 最终状态
  const fb = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log(`FINAL: night=${fb.includes("夜晚行动")} day=${fb.includes("进入黄昏")} gameOver=${fb.includes("游戏结束")}`);
  
  await page.screenshot({ path: "test-results/dusk_test_v2.png", fullPage: true });
  console.log("=== DONE ===");
});
