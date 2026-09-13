import { expect, test } from "@playwright/test";

/**
 * E2E 冒烟：确认真实浏览器能加载 App 并渲染首屏。
 * 这是「真实点击流」的基础设施自检 —— 先证明能连上、能渲染，再写业务流。
 */
test.describe("E2E 基础设施自检", () => {
  test("① 首页能加载并渲染标题", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/血染|钟楼|说书人/);

    // ⚠️ 不要读完 body 立即断言 —— dev server 首次编译时首屏可能还是空的。
    //    用显式等待，等脚本列表真正渲染出来。
    await expect(page.getByText("请选择剧本")).toBeVisible({ timeout: 30_000 });

    const body = await page.locator("body").innerText();
    expect(body.length, "首屏内容为空").toBeGreaterThan(0);
    expect(errors, `页面报错：${errors.join(" | ")}`).toHaveLength(0);
  });

  test("② 页面存在可交互按钮（未白屏）", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const buttons = page.locator("button");
    await expect(buttons.first()).toBeVisible({ timeout: 30_000 });
    expect(await buttons.count()).toBeGreaterThan(0);
  });
});
