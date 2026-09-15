/**
 * 终局判定 —— 真实浏览器冒烟（2026-09-15）
 *
 * ⚠️ 本文件**只做冒烟**：验证应用可加载、标题正确、设置页可见。
 *    **它不、也无法**断言引擎判定结果 —— Next dev 的 chunk 路径不稳定，
 *    `import("/_next/static/chunks/...")` 拿不到 `checkGameEnd`。
 *
 *    引擎判定的真实断言在：
 *      · `src/roles/__tests__/game_end_official_contract.test.ts`（9 例）
 *      · `src/roles/__tests__/mayor_peaceful_win_boundary.test.ts`（9 例）
 *    两者 import 的是**真实引擎模块**（非 mock），覆盖用户实测局面。
 *
 *    本文件存在的意义：确保「改了引擎后，应用整体仍能起来」——
 *    补上单测覆盖不到的打包/运行时链路。
 */
import { test, expect } from "@playwright/test";

test.describe("🏆 终局判定改动后的应用冒烟", () => {
  test("设置页可加载（引擎改动未破坏打包/运行时）", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("请选择剧本")).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveTitle(/血染钟楼/);
  });
});
