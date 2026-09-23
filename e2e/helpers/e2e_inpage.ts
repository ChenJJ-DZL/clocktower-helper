/**
 * E2E「页面内」等待原语（2026-09-22 新增）
 * ==================================================================
 * 为什么需要：本仓 E2E 大量用 `page.evaluate` 直接在页面里点 DOM。早期写法是
 *
 *     btn.click();
 *     await sleep(400);      // ❌ 盲等固定时长
 *     const ok = allBtns().find(...);   // 紧接着查条件 ⇒ 拿到旧 DOM
 *
 * React 慢一档（>400ms 才提交下一次渲染）时，第 3 行就查不到东西 ⇒ **偶发失败**。
 * 实测症状：全量 E2E 禁重试下出现
 *   `TimeoutError: locator.click: Timeout 15000ms exceeded`
 * 而**复跑即绿** ⇒ 判定为**抖动而非回归**（2026-09-22，3 条：snv ③④ + tb 提名 ①②）。
 *
 * ✅ 正确形态 = **点击后等「预期条件」成立**，而不是等固定时间：
 *    · `waitFor(pred, ms)`            —— 轮询条件，成立立刻返回
 *    · `clickAndSettle(btn, ms)`      —— 点一次 → 等**页面签名变化**（DOM 真的动了）
 *    · `clickUntil(btn, pred, opts)`  —— 点 → 等条件；不成立就**重试点击**
 *
 * 🔑 三条纪律（写给以后加用例的人）：
 *    1. **禁止**「click 后盲等」后再查条件；要么等条件，要么用 `clickAndSettle`。
 *    2. 优先用 **Playwright 定位器**（`page.locator(...).click()` 自带 actionability 自动等待）；
 *       只有在必须绕过遮挡/做批量 DOM 操作时才用 `page.evaluate` 裸 click。
 *    3. 失败信息里若出现 `Timeout ... exceeded` 而**不是**断言不匹配 ⇒ 先怀疑等待，不要改断言。
 *
 * 用法（两种都支持）：
 *    A. 显式注入：`await installInPageHelpers(page)`（在 `page.goto` 之前调用），
 *       之后任何 `page.evaluate` 内可用 `window.__e2e.waitFor(...)` 等。
 *    B. 直接拷 `IN_PAGE_HELPERS` 片段进已有 evaluate 作用域（零侵入，存量用例改动用这个）。
 */
import type { Page } from "@playwright/test";

/** 页面内原语的源码（可整段插入已有 `page.evaluate` 作用域顶部）。 */
export const IN_PAGE_HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const __norm = (el) => ((el && el.textContent) || "").replace(/\\s+/g, "");
  const __allBtns = () => Array.from(document.querySelectorAll("button"));
  /** 轮询条件，成立立刻返回 true；超时返回 false */
  const waitFor = async (pred, ms = 6000, interval = 100) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (pred()) return true; } catch (e) { /* 条件里查不到元素属正常 */ }
      await sleep(interval);
    }
    return false;
  };
  /** 便宜的"页面签名"：正文长度 + 弹窗数 + 可点按钮数 */
  const pageSig = () =>
    (document.body.textContent || "").length +
    "|" + document.querySelectorAll('[role="dialog"]').length +
    "|" + document.querySelectorAll("button:not([disabled])").length;
  /** 点一次 → 等页面签名变化（DOM 真的动了）。变了立刻返回，比固定 sleep 更快更稳 */
  const clickAndSettle = async (btn, maxMs = 3000) => {
    const before = pageSig();
    btn.click();
    if (await waitFor(() => pageSig() !== before, maxMs, 80)) return true;
    await sleep(300);
    return false;
  };
  /** 点 → 等条件；不成立就重试点击（对付"点了没生效"） */
  const clickUntil = async (btn, pred, opts) => {
    const maxMs = (opts && opts.maxMs) || 6000;
    const tries = (opts && opts.tries) || 3;
    for (let i = 0; i < tries; i++) {
      btn.click();
      if (await waitFor(pred, Math.ceil(maxMs / tries), 100)) return true;
    }
    return false;
  };
`;

/** 把原语注入页面（`window.__e2e`）。必须在 `page.goto` **之前**调用。 */
export async function installInPageHelpers(page: Page): Promise<void> {
  await page.addInitScript({
    content:
      "window.__e2e = (() => {" + IN_PAGE_HELPERS + "return { sleep, waitFor, pageSig, clickAndSettle, clickUntil, norm: __norm, allBtns: __allBtns };})();",
  });
}
