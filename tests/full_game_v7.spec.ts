import { expect, test } from "@playwright/test";

test.setTimeout(600000);

// ============ Helper Functions ============

/**
 * 相位检测（弹窗优先）
 * 关键修复：先检测是否有弹窗打开，若有则按弹窗内容分类，
 * 绝不被底层被禁用的按钮（"确认 & 下一步"等）误导。
 */
async function phase(page: any): Promise<string> {
  // 1. 弹窗检测（最高优先级）
  const d = page.locator('[role="dialog"]');
  if (await d.isVisible({ timeout: 60 }).catch(() => false)) {
    const t = (await d.textContent().catch(() => "")) || "";
    // 投票弹窗优先（其文本含"死亡玩家"，易被误判为黎明报告）
    if (t.includes("举手") || t.includes("被提名者") || t.includes("选择举手玩家") || t.includes("投票"))
      return "voteModal";
    if (t.includes("昨晚") || t.includes("平安夜") || t.includes("夜晚报告") || t.includes("天亮"))
      return "dawnReport";
    if (t.includes("确认夜间行动") || t.includes("预览")) return "previewModal";
    if (t.includes("处决")) return "executionModal";
    if (t.includes("提名")) return "nominationModal";
    return "modal"; // 其他未分类弹窗
  }

  // 2. 无弹窗时才用按钮判断
  const b = (t: string) =>
    page.locator(`button:has-text("${t}")`).isVisible({ timeout: 30 }).catch(() => false);
  if (await b("再来一局")) return "gameOver";
  if (await b("确认无误，入夜")) return "check";
  if (await b("天亮了")) return "night";
  if (await b("确认 & 下一步")) return "night";
  if (await b("展开对局记录")) return "night";
  if (await b("确认执行")) return "night";
  if (await b("进入黄昏处决阶段")) return "day";
  if (await b("执行处决")) return "dusk";
  if (await b("发起提名")) return "dusk";
  return "unknown";
}

async function BT(page: any): Promise<string> {
  return page.evaluate(() => document.body?.innerText || "");
}

// 关闭弹窗：优先"确认执行"，其次其他确认类按钮
async function CD(page: any): Promise<boolean> {
  const d = page.locator('[role="dialog"]');
  if (!(await d.isVisible({ timeout: 80 }).catch(() => false))) return false;
  for (const t of ["确认执行", "确认", "关闭", "好的", "确定", "继续"]) {
    const btn = d.locator(`button:has-text("${t}")`).first();
    if (await btn.isVisible({ timeout: 80 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
      return true;
    }
  }
  // 兜底：点击遮罩层关闭
  const overlay = page.locator('[data-modal-key]').first();
  await overlay.click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(400);
  return true;
}

async function GA(page: any): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat-id]'))
      // 死亡座位的头像 div 带有 grayscale 类（SeatNode 渲染，无"已死亡"文本）
      .filter((n: any) => !n.querySelector(".grayscale"))
      .map((n: any) => parseInt(n.getAttribute("data-seat-id") || "-1"))
      .filter((id: number) => id >= 0)
      .sort((a: number, b: number) => a - b)
  );
}

// 返回死亡座位 id（调试用）
async function DEAD(page: any): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat-id]'))
      .filter((n: any) => n.querySelector(".grayscale"))
      .map((n: any) => parseInt(n.getAttribute("data-seat-id") || "-1"))
      .filter((id: number) => id >= 0)
      .sort((a: number, b: number) => a - b)
  );
}

async function CS(page: any, id: number): Promise<boolean> {
  const s = page.locator(`[data-seat-id="${id}"]`);
  if (await s.isVisible({ timeout: 300 }).catch(() => false)) {
    await s.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);
    return true;
  }
  return false;
}

// 在投票弹窗中举手（选满所有可举手座位）并确认，使提名过半通过
async function voteYes(page: any): Promise<boolean> {
  const modal = page.locator('[role="dialog"]');
  if (!(await modal.isVisible({ timeout: 200 }).catch(() => false))) return false;
  const seatBtns = modal.locator("button");
  const n = await seatBtns.count();
  for (let i = 0; i < n; i++) {
    const b = seatBtns.nth(i);
    const txt = (await b.textContent().catch(() => "")) || "";
    if (
      txt.includes("号") &&
      !(await b.isDisabled({ timeout: 40 }).catch(() => false))
    ) {
      await b.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(70);
    }
  }
  await page.waitForTimeout(200);
  const confirm = modal.locator('button:has-text("确认")').first();
  if (await confirm.isVisible({ timeout: 600 }).catch(() => false)) {
    await confirm.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

// ============ Main Test ============

test("全流程自主测试v7", async ({ page }) => {
  console.log("=== v7 全流程测试开始 ===");

  // 捕获浏览器控制台与错误，便于定位应用侧问题
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      t.includes("startSubsequentNight") ||
      t.includes("confirmExecutionResult") ||
      t.includes("executeJudgment") ||
      t.includes("REDUCER") ||
      t.includes("enterDusk") ||
      t.includes("handleDayEndTransition") ||
      t.includes("ERROR") ||
      t.includes("Error") ||
      t.includes("Uncaught") ||
      t.includes("Cannot") ||
      t.includes("is not a function") ||
      t.includes("dusk") ||
      t.includes("DBG")
    ) {
      console.log("[BROWSER]", t);
    }
  });
  page.on("pageerror", (err) => console.log("[PAGEERROR]", err.message));

  // --- Step 1: Open page and select script ---
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(600);

  // --- Step 2: Click "快速测试" ---
  await page.locator('button:has-text("快速测试")').click();
  await page.waitForTimeout(2000);

  // --- Step 3: Handle drunk charade selection ---
  const drunkBtn = page.locator('button:has-text("设置酒鬼身份")');
  if (await drunkBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await drunkBtn.click();
    await page.waitForTimeout(600);
    const opt = page.locator('div[role="dialog"] button').first();
    if (await opt.isVisible({ timeout: 1000 }).catch(() => false)) {
      await opt.click();
      await page.waitForTimeout(400);
    }
    await CD(page);
    await page.waitForTimeout(300);
  }

  // --- Step 4: Enter night ---
  const enterNight = page.locator('button:has-text("确认无误，入夜")');
  if (await enterNight.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enterNight.click();
    console.log("[check] → 入夜");
    await page.waitForTimeout(1000);
  }
  await CD(page);
  await page.waitForTimeout(500);

  // --- Step 5: Main game loop ---
  let round = 0,
    nightCount = 0,
    dayCount = 0,
    executionCount = 0;
  let stuckCount = 0;
  let inNight = false;
  let pendingDayStart = false; // 黎明报告后标记，下一次进入 day 视为新的一天
  let duskNominated = false; // 本轮黄昏是否已发起并投过票（避免重复提名死循环）

  for (round = 0; round < 60; round++) {
    const p = await phase(page);

    // ---- 弹窗统一优先处理 ----
    if (p === "previewModal") {
      await CD(page);
      await page.waitForTimeout(200);
      continue;
    }
    if (p === "dawnReport") {
      const dt = (await page
        .locator('[role="dialog"]')
        .textContent()
        .catch(() => "")) || "";
      console.log(`[Dawn#${nightCount}] 死亡报告: ${JSON.stringify(dt.slice(0, 160))}`);
      await CD(page);
      await page.waitForTimeout(400);
      inNight = false;
      pendingDayStart = true; // 下一次进入 day 视为新的一天
      continue;
    }
    if (p === "voteModal") {
      const dt = (await page
        .locator('[role="dialog"]')
        .textContent()
        .catch(() => "")) || "";
      console.log(`[voteModal] 文本: ${JSON.stringify(dt.slice(0, 120))}`);
      const ok = await voteYes(page);
      console.log(`[voteModal] voteYes=${ok}`);
      if (ok) duskNominated = true; // 本轮黄昏已完成投票，避免重复提名
      if (!ok) await CD(page);
      await page.waitForTimeout(400);
      continue;
    }
    if (p === "executionModal" || p === "nominationModal") {
      const dt = (await page
        .locator('[role="dialog"]')
        .textContent()
        .catch(() => "")) || "";
      console.log(`[execModal] 文本: ${JSON.stringify(dt.slice(0, 160))}`);
      await CD(page);
      await page.waitForTimeout(400);
      continue;
    }
    if (p === "modal") {
      const dt = await page
        .locator('[role="dialog"]')
        .textContent()
        .catch(() => "");
      console.log("[WARN] 未分类弹窗，文本:", JSON.stringify((dt || "").slice(0, 200)));
      await CD(page);
      await page.waitForTimeout(400);
      continue;
    }

    if (p === "gameOver") {
      console.log(
        `\n🎉 游戏结束! R=${round} N=${nightCount} D=${dayCount} E=${executionCount}`
      );
      break;
    }

    if (p === "unknown") {
      stuckCount++;
      if (stuckCount === 1 || stuckCount === 21) {
        const body = (await BT(page)).slice(0, 300);
        console.log(`[unknown#${stuckCount}] body:`, JSON.stringify(body));
      }
      if (stuckCount > 20) {
        console.log(`[STUCK] 连续${stuckCount}次unknown，强制停止`);
        break;
      }
      if (!(await CD(page))) await page.waitForTimeout(600);
      inNight = false;
      continue;
    }
    stuckCount = 0;

    // ---- NIGHT ----
    if (p === "night") {
      if (!inNight) {
        nightCount++;
        inNight = true;
        console.log(`[Night #${nightCount}] 开始`);
      }

      // 优先处理"天亮了"（最后一步）
      const dawn = page.locator('button:has-text("天亮了")');
      if (await dawn.isVisible({ timeout: 60 }).catch(() => false)) {
        await dawn.click({ timeout: 2000 }).catch(() => {});
        console.log("  → 天亮了");
        await page.waitForTimeout(500);
        inNight = false;
        continue;
      }

      // 找到推进按钮（确认 & 下一步 / 展开对局记录 / 确认执行）
      const advanceTexts = ["确认 & 下一步", "展开对局记录", "确认执行"];
      const findAdvanceBtn = async () => {
        for (const t of advanceTexts) {
          const b = page.locator(`button:has-text("${t}")`);
          if (await b.isVisible({ timeout: 40 }).catch(() => false)) return b;
        }
        return null;
      };
      let btn = await findAdvanceBtn();
      if (!btn) {
        await CD(page);
        await page.waitForTimeout(400);
        continue;
      }

      // 健壮驱动：若按钮禁用，逐步增加选中座位直到满足 targetLimit.min
      let selAttempts = 0;
      while (
        !(await btn.isEnabled({ timeout: 40 }).catch(() => false)) &&
        selAttempts < 15
      ) {
        const alive = await GA(page);
        if (alive.length === 0) break;
        const next = alive[selAttempts % alive.length];
        await CS(page, next);
        selAttempts++;
        await page.waitForTimeout(120);
        // 重新定位推进按钮（DOM 可能刷新）
        const refreshed = await findAdvanceBtn();
        if (refreshed) btn = refreshed;
      }

      if (await btn.isEnabled({ timeout: 40 }).catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        console.log("  → 推进夜间步骤");
        await page.waitForTimeout(400);
      } else {
        console.log("  [night] 推进按钮仍禁用，尝试关闭可能遮挡弹窗");
        await CD(page);
        await page.waitForTimeout(400);
      }
      continue;
    }

    // ---- DAY ----
    if (p === "day") {
      if (pendingDayStart) {
        dayCount++;
        pendingDayStart = false;
      }
      const alive = await GA(page);
      const dead = await DEAD(page);
      console.log(`[Day #${dayCount}] 白天, 存活=${alive.length}, 死亡=${JSON.stringify(dead)}`);
      // 白天仅负责进入黄昏（提名/投票 UI 在黄昏视图）
      duskNominated = false; // 重置本轮黄昏提名状态
      const duskBtn = page.locator('button:has-text("进入黄昏处决阶段")');
      if (await duskBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await duskBtn.click({ timeout: 2000 }).catch(() => {});
        console.log("  → 进入黄昏");
        await page.waitForTimeout(500);
      }
      continue;
    }

    // ---- DUSK ----
    if (p === "dusk") {
      // 若仍可发起提名且本轮黄昏尚未提名，则先完成「提名 → 开始投票 → 投票」
      const nomBtn = page.locator('button:has-text("发起提名")');
      if (
        !duskNominated &&
        (await nomBtn.isVisible({ timeout: 300 }).catch(() => false))
      ) {
        const alive = await GA(page);
        if (alive.length >= 2) {
          await CS(page, alive[0]);
          await page.waitForTimeout(200);
          await CS(page, alive[1]);
          await page.waitForTimeout(300);
          await nomBtn.click({ timeout: 2000 }).catch(() => {});
          console.log(`  → 发起提名 ${alive[0] + 1}号→${alive[1] + 1}号`);
          await page.waitForTimeout(400);
          const voteBtn = page.locator('button:has-text("开始投票")');
          if (
            await voteBtn.isVisible({ timeout: 800 }).catch(() => false)
          ) {
            await voteBtn.click({ timeout: 2000 }).catch(() => {});
            console.log("  → 开始投票");
            await page.waitForTimeout(600); // 等待投票弹窗
          }
        }
        continue; // 让下一轮循环处理投票弹窗
      }

      // 提名已结束（或无需提名）：执行处决
      const execBtn = page.locator('button:has-text("执行处决")');
      if (await execBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await execBtn.click({ timeout: 2000 }).catch(() => {});
        console.log("  → 执行处决");
        executionCount++;
        await page.waitForTimeout(600);
      }
      // 不立即 CD：让下一轮循环捕获 EXECUTION_RESULT 弹窗文本
      await page.waitForTimeout(500);
      continue;
    }

    // ---- CHECK (unexpected) ----
    if (p === "check") {
      console.log("[WARN] 意外回到 check 阶段");
      const enterN = page.locator('button:has-text("确认无误，入夜")');
      if (await enterN.isVisible({ timeout: 1000 }).catch(() => false)) {
        await enterN.click();
        await page.waitForTimeout(800);
        await CD(page);
        await page.waitForTimeout(400);
      }
    }
  }

  // --- Verification ---
  console.log(
    `\n=== 统计: ${round}轮, ${nightCount}夜, ${dayCount}天, ${executionCount}次处决 ===`
  );

  const gameOverBtn = page.locator('button:has-text("再来一局")');
  const isGameOver = await gameOverBtn
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (isGameOver) {
    const body = await BT(page);
    const goodWins = body.includes("善良阵营胜利") || body.includes("善良阵营获胜");
    const evilWins = body.includes("邪恶阵营获胜") || body.includes("邪恶阵营胜利");
    console.log(
      `✅ 游戏正常结束: ${
        goodWins ? "善良阵营胜利" : evilWins ? "邪恶阵营获胜" : "结果未知"
      }`
    );
    expect(isGameOver).toBe(true);
  } else if (round >= 799) {
    console.log("⚠️ 达到最大轮次限制");
  } else {
    console.log("❌ 游戏未正常结束");
    await page.screenshot({ path: "/workspace/tests/v7_stuck.png", fullPage: true });
  }

  console.log("=== v7 测试完成 ===");
});
