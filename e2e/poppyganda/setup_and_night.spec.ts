import { expect, test } from "@playwright/test";
import { readAssigned, readCamps, resolveCharades, T } from "../helpers/poppy";

/**
 * 罂粟花开 · **落座与发牌 真实点击流**
 *
 * 覆盖：选剧本（罂粟花开）→ 进入配置 → ⚡快速开始 → 选人数 → 🎲随机落座
 *      → 断言发牌完整性 / 阵营配额 → 配置伪装 → 分发&核对身份 → 可入夜
 *
 * ⚠️ 前置坑位见 `e2e/helpers/poppy.ts` 顶部注释
 *    （networkidle / webServer / 3100 端口 / 提线木偶伪装必须先配置）。
 */
test.describe("罂粟花开 · 落座与发牌", () => {
  /** 落座到「分发&核对身份」可见为止（不点入夜） */
  async function deal(page: any, n: number) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator('div:has-text("罂粟花开")')
      .filter({ hasText: "进入配置" })
      .last()
      .getByText("进入配置")
      .first()
      .click({ timeout: T.click });
    await page.getByText("⚡ 快速开始").first().click({ timeout: T.click });
    await page
      .getByText(`${n}人`, { exact: false })
      .first()
      .click({ timeout: T.click });
    await page.getByText("随机落座").first().click({ timeout: T.click });
    await expect(page.getByText("分发&核对身份").first()).toBeVisible({
      timeout: T.visible,
    });
  }

  test("① 首页剧本列表包含「罂粟花开」，且无页面报错", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/血染|钟楼|说书人/);
    await expect(page.getByText("请选择剧本")).toBeVisible({ timeout: T.visible });
    await expect(page.getByText("罂粟花开").first()).toBeVisible({
      timeout: T.visible,
    });
    expect(errors, `页面报错：${errors.join(" | ")}`).toHaveLength(0);
  });

  test("② ⭐ 随机落座后 9 名玩家全部被分配角色（9/9）", async ({ page }) => {
    await deal(page, 9);
    const a = await readAssigned(page);
    expect(a, "未找到「N/N 已分配角色」").not.toBeNull();
    expect(a!.done, "9 人局应有 9 个角色已分配").toBe(9);
    expect(a!.total).toBe(9);
  });

  test("③ ⭐ 阵营分布总数 == 玩家人数（不多分不少分）", async ({ page }) => {
    await deal(page, 9);
    const c = await readCamps(page);
    expect(c, "未找到阵营分布").not.toBeNull();
    expect(
      c!.村民 + c!.外来者 + c!.爪牙 + c!.恶魔,
      `阵营分布总和应为 9，实际 ${JSON.stringify(c)}`
    ).toBe(9);
  });

  test("④ ⭐ 恶魔数量 ≥ 1（军团局允许多个军团，均计入恶魔）", async ({ page }) => {
    await deal(page, 9);
    const c = await readCamps(page);
    expect(c).not.toBeNull();
    expect(c!.恶魔).toBeGreaterThanOrEqual(1);
  });

  test("⑤ 7 人局同样发牌完整", async ({ page }) => {
    await deal(page, 7);
    const a = await readAssigned(page);
    expect(a, "未找到「N/N 已分配角色」").not.toBeNull();
    expect(a!.done).toBe(7);
    const c = await readCamps(page);
    expect(c).not.toBeNull();
    expect(c!.村民 + c!.外来者 + c!.爪牙 + c!.恶魔).toBe(7);
  });

  test("⑥ ⭐ 含提线木偶/酒鬼时须先配置「伪装身份」，点「随机」后即可继续入夜", async ({
    page,
  }) => {
    await deal(page, 5);
    const resolved = await resolveCharades(page);
    console.log(`  （本局是否需要配置伪装：${resolved}）`);

    await page.getByText("分发&核对身份").first().click({ timeout: T.click });
    const enterNight = page
      .locator("button")
      .filter({ hasText: /确认无误[\s\S]*入夜/ })
      .first();
    await expect(enterNight).toBeVisible({ timeout: T.visible });
  });
});
