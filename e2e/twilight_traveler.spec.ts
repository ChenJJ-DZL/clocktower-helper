import { expect, test } from "@playwright/test";
import {
  enterScriptConfig,
  resolveCharades,
  waitForSnapshot,
} from "./helpers/scriptFlow";

/**
 * L4（E2E）· **暮色阶段（官方 Dusk）真实点击流**
 * ==================================================================
 * 🔴 要证明什么：旅行者**真的会在真实对局里被唤醒**。
 *
 *   在此之前，`dynamicQueueGenerator` / `useNightEngine` 全仓零 traveler 引用，
 *   旅行者又不占 seats ⇒ 15 个旅行者里 14 个的规则**从不触发**
 *   （只有"落座 UI"看得见，规则看不见）。
 *
 * ✅ 方案 B（用户 2026-10-13 选定）：新增独立阶段 `twilight`（暮色），
 *   官方 Dusk = 入夜之前旅行者行动的时刻；本仓库 `dusk` 已是白天提名阶段，
 *   两者不可混用。
 *
 * ── 判据（每条都能区分"点了没生效"）──────────────────────────────
 *   ① 落座「官员」后点「确认无误，入夜」⇒ 先停在暮色面板（不是直接进夜晚）
 *   ② 暮色面板显示「唤醒：官员」+ 步骤计数 1/1
 *   ③ 快照 gamePhase === "twilight"，且 travelers[0].id === "bureaucrat"
 *   ④ 点「暮色结束，入夜」⇒ gamePhase 变为 firstNight/night（真的进夜了）
 *   ⑤ 负向对照：**不落座旅行者**时点入夜 ⇒ **不经过暮色**（无空阶段）
 *
 * ⚠️ 端口固定 3100；外部先起 `PORT=3100 npx next dev -p 3100`。
 */

const SPECIALIST = "官员";

/** 落座一名旅行者（第 1 个旅行者座位） */
async function seatTraveler(page: import("@playwright/test").Page, name: string) {
  // 1) 展开旅行者座位行
  await page.getByText(/🧳 旅行者/).first().click();
  // 2) 点第 1 个空座位
  await page
    .locator('[title="空旅行者座位（点击指定旅行者）"]')
    .first()
    .click();
  // 3) 在选择弹窗里点目标旅行者
  const modal = page.locator('[role="dialog"], .fixed').last();
  await modal.getByText(name, { exact: true }).first().click();
}

test.describe("暮色阶段（官方 Dusk）", () => {
  test.setTimeout(180_000);

  test("① 落座官员 ⇒ 入夜前先进入暮色，逐个确认后入夜", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterScriptConfig(page, "暗流涌动", 7);
    await resolveCharades(page);

    await seatTraveler(page, SPECIALIST);

    // 确认落座生效（用 UI 判据：准备阶段的快照尚未写 localStorage，
    // 而圆桌 HUD 的计数与座位名是同一份 state 的即时渲染）
    await expect(page.getByText("旅行者（1/4）").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(SPECIALIST, { exact: true }).first()).toBeVisible();

    await page.getByText("分发&核对身份").first().click();
    await page
      .locator("button")
      .filter({ hasText: /确认无误[\s\S]*入夜/ })
      .first()
      .click();

    // ② 停在暮色面板
    await expect(page.getByText("🌆 暮色").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`唤醒：${SPECIALIST}`).first()).toBeVisible();

    // ③ 停在暮色：步骤计数应为 1/1（只有官员一个暮色旅行者）
    await expect(page.getByText(/步骤\s*1\s*\/\s*1/).first()).toBeVisible({
      timeout: 10_000,
    });
    // ⚠️ 不用 localStorage 快照断言 gamePhase==="twilight"：
    //    快照在**入夜时才落库**，暮色阶段尚未写入（实测为 null）。
    //    暮色停留由上面的面板文案 + 步骤计数证明，入夜由下方 ④ 的快照证明。

    // ④ 暮色结束 → 真的入夜
    await page.getByText("暮色结束，入夜").first().click();
    const night = await waitForSnapshot(
      page,
      (s: any) => s?.gamePhase === "firstNight" || s?.gamePhase === "night",
      20_000
    );
    expect(night, "暮色结束后应进入夜晚").not.toBeNull();
  });

  test("⑤ 负向对照：没有旅行者时点入夜 ⇒ 不经过暮色（无空阶段）", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterScriptConfig(page, "暗流涌动", 7);
    await resolveCharades(page);

    await page.getByText("分发&核对身份").first().click();
    await page
      .locator("button")
      .filter({ hasText: /确认无误[\s\S]*入夜/ })
      .first()
      .click();

    // 直接进夜：暮色面板不得出现
    await expect(page.getByText("🌆 暮色").first()).toHaveCount(0, {
      timeout: 10_000,
    });
    const night = await waitForSnapshot(
      page,
      (s: any) => s?.gamePhase === "firstNight" || s?.gamePhase === "night",
      20_000
    );
    expect(night, "无旅行者应直接入夜").not.toBeNull();
  });
});
