import { expect, test, type Page } from "@playwright/test";
import { enterScriptConfig } from "../helpers/scriptFlow";
import { measureCenterHud } from "../helpers/centerHudGeometry";

/**
 * 回归检测：圆桌中央面板不得与座位环重叠（**含旅行者 / 传奇角色场景**）
 * ==================================================================
 * 背景（2026-10-19，iPhone 横屏实测）：
 *   · 默认两按钮：面板 594×284，四角对内沿归一化 **1.018**（贴边）
 *   · **有旅行者**：面板 530×344 → **0.986**，与 2/13 号座位矩形实交 346px²
 *   · **选中传奇角色**（三按钮换行）：556×331 → **1.005**，实交 487px²
 *   ⇒ 旅行者/传奇角色会让中央面板「纵向长高 / 横向撑宽」，是重叠的高发场景。
 *
 * 修法（本用例锁住的回归面）：
 *   ① 旅行者座位行改单行胶囊（min-w-[92px] py-0.5）
 *   ② 面板纵向压缩（px-4 py-4 gap-2）
 *   ③ 三按钮文案瘦身 + 按钮行 `flex-wrap max-w-[540px]`（换行而非撑宽）
 *
 * 判据：面板四角对「座位内沿椭圆」归一化 **< 0.95**，且与任何座位**矩形相交为 0**。
 * 几何算法见 `e2e/helpers/centerHudGeometry.ts`（注意不能用平均 |dx| 估半径）。
 *
 * ⭐ 双主题都测（铁律 9）：两主题几何应一致，只允许颜色差异。
 */

const MODAL = '[role="dialog"][aria-modal="true"]';
const FABLED_SEAT = 'button[title="选择传奇角色（落座确认后锁定）"]';
const EMPTY_TRAVELER_SEAT = 'button[title="空旅行者座位（点击指定旅行者）"]';

/** 进入准备阶段（15 人局 · 罂粟花开） */
async function enterSetup15(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, "罂粟花开", 15);
}

/** 展开旅行者座位行并实际落座 1 名旅行者（官员） */
async function withOneTraveler(page: Page) {
  await page
    .locator("button")
    .filter({ hasText: /旅行者\s*0\/4/ })
    .first()
    .click();
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(4);
  await page.locator(EMPTY_TRAVELER_SEAT).first().click();
  const modal = page.locator(MODAL);
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await modal.locator("button.w-full").filter({ hasNotText: "清空该座位" }).first().click();
  // 落座后弹「旅行者阵营」确认框（官方：说书人决定善良/邪恶）——不阻塞量测，点掉
  const good = page.getByRole("button", { name: /善良/ }).first();
  await good.click({ timeout: 5_000 }).catch(() => {});
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(3);
}

/** 选中 1 个传奇角色（按钮行变三按钮） */
async function withOneFabled(page: Page) {
  await page.locator(FABLED_SEAT).click();
  const modal = page.locator(MODAL);
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await modal
    .locator("button.w-full")
    .filter({ hasNotText: /清空|移除/ })
    .first()
    .click();
  await expect(page.locator(FABLED_SEAT)).toContainText("传奇角色 1/1");
}

for (const theme of ["classic", "modern"] as const) {
  for (const scenario of ["base", "traveler", "fabled"] as const) {
    test(`${scenario} / ${theme}：中央面板不压座位环`, async ({ page }) => {
      // 主题必须在页面加载前注入（ThemeContext 首帧预热读 localStorage）
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("clocktower_theme", t);
        } catch {}
      }, theme);

      await enterSetup15(page);
      if (scenario === "traveler") await withOneTraveler(page);
      if (scenario === "fabled") await withOneFabled(page);

      // 给布局一帧稳定时间（framer-motion / ResizeObserver）
      await page.waitForTimeout(700);

      const g = await measureCenterHud(page);

      // ① 四角必须留在座位内沿椭圆内，且留出可见间隙（< 0.95）
      expect(
        g.maxCornerInner,
        `${scenario}/${theme} 面板 ${g.panel.w}×${g.panel.h} 四角越界：inner=${g.maxCornerInner.toFixed(3)}`
      ).toBeLessThan(0.95);

      // ② 与任何座位矩形都不得相交（真重叠 = 直接红）
      expect(
        g.overlapSeats,
        `${scenario}/${theme} 面板与座位矩形相交：${JSON.stringify(g.overlapSeats)}`
      ).toEqual([]);
    });
  }
}

test("双主题同场景几何一致（只许颜色不同，不许布局不同）", async ({ browser }) => {
  for (const scenario of ["base", "traveler", "fabled"] as const) {
    const dims: Record<string, { w: number; h: number }> = {};
    for (const theme of ["classic", "modern"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      await ctx.addInitScript((t) => {
        try {
          window.localStorage.setItem("clocktower_theme", t);
        } catch {}
      }, theme);
      const page = await ctx.newPage();
      await enterSetup15(page);
      if (scenario === "traveler") await withOneTraveler(page);
      if (scenario === "fabled") await withOneFabled(page);
      await page.waitForTimeout(700);
      const g = await measureCenterHud(page);
      dims[theme] = g.panel;
      await ctx.close();
    }
    // 像素取整容差 2px
    expect(
      Math.abs(dims.classic.w - dims.modern.w),
      `${scenario} 两主题宽度不一致：${JSON.stringify(dims)}`
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(dims.classic.h - dims.modern.h),
      `${scenario} 两主题高度不一致：${JSON.stringify(dims)}`
    ).toBeLessThanOrEqual(2);
  }
});
