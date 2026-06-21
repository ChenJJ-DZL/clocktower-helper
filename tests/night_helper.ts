import { type Page } from "@playwright/test";

/**
 * 通用夜间跳过循环 v7
 * 强化处理：双阶段目标选择(选目标后再选角色)、S&V特殊角色交互、增强弹窗识别
 * 兼容 TB / BMR / S&V / 自定义剧本
 */
export async function skipToDay(page: Page) {
  for (let i = 0; i < 100; i++) {
    // ── 1. 白天检测 ──
    const duskBtn = page.locator("button:has-text('进入黄昏处决阶段'), button:has-text('发起提名')").first();
    if (await duskBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      for (let m = 0; m < 10; m++) {
        const modal = page.locator("[data-modal-key], .fixed.inset-0.z-50").first();
        if (!(await modal.isVisible({ timeout: 100 }).catch(() => false))) break;
        const closeBtn = modal.locator("button:not([disabled])").first();
        if (await closeBtn.isVisible({ timeout: 100 }).catch(() => false)) {
          await closeBtn.click().catch(() => {}); await page.waitForTimeout(300);
        } else break;
      }
      await page.waitForTimeout(2000);
      return;
    }

    // ── 2. 夜晚报告弹窗 ──
    if (await page.locator("h2:has-text('夜晚报告'), text=昨晚, text=平安夜").first()
      .isVisible({ timeout: 200 }).catch(() => false)) {
      await page.getByRole("button", { name: "确认" }).click().catch(() => {});
      await page.waitForTimeout(800); continue;
    }

    // ── 3. 天亮按钮 ──
    const dawn = page.getByRole("button", { name: /开始白天|天亮了/ });
    if (await dawn.isVisible({ timeout: 200 }).catch(() => false)) {
      await dawn.click().catch(() => {}); await page.waitForTimeout(1500); continue;
    }

    // ── 4. "确认 & 下一步"优先 ──
    const nextBtn = page.locator("button").filter({ hasText: /确认.*下一步|下一步|确认/ }).first();
    if (await nextBtn.isVisible({ timeout: 200 }).catch(() => false) &&
        await nextBtn.isEnabled().catch(() => false)) {
      try { await nextBtn.click({ timeout: 500, force: true }); await page.waitForTimeout(400); continue; }
      catch { /* fall through */ }
    }

    // ── 5. 处理模态弹窗 + 双阶段选择 ──
    const modal = page.locator("[data-modal-key], .fixed.inset-0.z-50").first();
    if (await modal.isVisible({ timeout: 100 }).catch(() => false)) {
      const modalKey = await modal.getAttribute("data-modal-key").catch(() => "") ?? "";
      const modalText = await modal.innerText().catch(() => "") ?? "";
      let handled = false;

      // 占卜师结果弹窗 → 点击"是"
      if (modalKey.includes("占卜师") || modalText.includes("占卜师")) {
        const btn = modal.locator("button:has-text('是'),button:has-text('确认')").first();
        if (await btn.isVisible({ timeout: 200 }).catch(() => false)) { await btn.click(); handled = true; }
      }

      // S&V 角色选择弹窗(麻脸巫婆/洗脑师等选目标后再选角色)
      if (!handled && (modalText.includes("选择角色") || modalText.includes("变成") ||
                       modalText.includes("展示") || modalText.includes("疯狂"))) {
        const roleBtn = modal.locator("button:not([disabled])").first();
        if (await roleBtn.isVisible({ timeout: 200 }).catch(() => false)) { await roleBtn.click(); handled = true; }
      }

      // 通用弹窗 → 点第一个可用按钮
      if (!handled) {
        const btn = modal.locator("button:not([disabled])").first();
        if (await btn.isVisible({ timeout: 200 }).catch(() => false)) { await btn.click(); handled = true; }
      }

      if (handled) {
        await page.waitForTimeout(500);
        // 弹窗关闭后等待确认按钮(多轮: 处理双阶段选择)
        for (let w = 0; w < 20; w++) {
          // 可能弹出了新的选择弹窗→继续处理
          const newModal = page.locator("[data-modal-key], .fixed.inset-0.z-50").first();
          if (await newModal.isVisible({ timeout: 100 }).catch(() => false)) {
            const btn2 = newModal.locator("button:not([disabled])").first();
            if (await btn2.isVisible({ timeout: 100 }).catch(() => false)) {
              await btn2.click(); await page.waitForTimeout(300); continue;
            }
          }
          // 确认按钮可用→点击
          if (await nextBtn.isVisible({ timeout: 100 }).catch(() => false) &&
              await nextBtn.isEnabled().catch(() => false)) {
            try { await nextBtn.click({ timeout: 500, force: true }); await page.waitForTimeout(400); } catch {}
            break;
          }
          await page.waitForTimeout(300);
        }
        continue;
      }
    }

    // ── 6. 选目标(跳过已激活的) ──
    let clickedHash = false;
    for (let c = 1; c < 20; c++) {
      const hashBtn = page.locator("button:has-text('#')").nth(c);
      if (!(await hashBtn.isVisible({ timeout: 200 }).catch(() => false))) break;
      await hashBtn.click(); await page.waitForTimeout(300);
      clickedHash = true;
      if (await nextBtn.isVisible({ timeout: 200 }).catch(() => false) &&
          await nextBtn.isEnabled().catch(() => false)) {
        try { await nextBtn.click({ timeout: 500, force: true }); await page.waitForTimeout(400); } catch {}
        break;
      }
    }

    // ── 7. 兜底: 点击第一个非禁用按钮(非系统按钮) ──
    if (!clickedHash) {
      const anyBtn = page.locator("button:not([disabled])").first();
      const text = await anyBtn.innerText().catch(() => "") ?? "";
      if (text && !text.includes("相克") && !text.includes("主页") && !text.includes("重置") &&
          !text.includes("历史") && !text.includes("展开") && !text.includes("刷新")) {
        await anyBtn.click().catch(() => {}); await page.waitForTimeout(300); continue;
      }
    }

    await page.waitForTimeout(1000);
  }
}
