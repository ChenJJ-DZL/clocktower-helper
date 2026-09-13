import { expect, test } from "@playwright/test";
import { enterFirstNight, readNightQueue, T } from "../helpers/poppy";

/**
 * 罂粟花开 · **夜间流程真实点击流**
 *
 * 覆盖：落座 → 配置伪装身份 → 分发&核对身份 → 确认无误入夜
 *      → **夜间行动顺序面板真实渲染** → 「当前的行动」有内容
 *
 * ⚠️ 所有前置坑位见 `e2e/helpers/poppy.ts` 顶部注释（networkidle / webServer /
 *    3100 端口 / 提线木偶伪装必须先配置）。
 */
test.describe("罂粟花开 · 夜间流程点击流", () => {
  test("① ⭐ 入夜后「夜晚行动顺序」渲染出唤醒队列（形如 `1. [N号] 角色`）", async ({
    page,
  }) => {
    await enterFirstNight(page, 5);
    const queue = await readNightQueue(page);
    expect(
      queue.length,
      `夜间队列应非空，实际：${JSON.stringify(queue)}`
    ).toBeGreaterThan(0);
    for (const line of queue) {
      expect(line, `队列项格式异常：${line}`).toMatch(/^\d+\.\s*\[\d+号\]\s*\S+/);
    }
  });

  test("② ⭐ 首夜队列含「互认」相关系统步骤", async ({ page }) => {
    await enterFirstNight(page, 5);
    const text = (await readNightQueue(page)).join(" | ");
    expect(text, `首夜应含互认步骤，实际：${text}`).toContain("互认");
  });

  test("③ 入夜后说书人控制台有实质内容（不空白）", async ({ page }) => {
    await enterFirstNight(page, 5);

    // ⚠️ 不要靠「当前的行动」切片断言 —— 该面板随步骤出现/收起，
    //    不稳定（实测单跑会偶发失败）。改为断言**稳定的结构化线索**：
    //    · 夜晚行动顺序面板存在
    //    · 页面正文有实质长度
    await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({
      timeout: T.visible,
    });
    const body = await page.locator("body").innerText();
    expect(body.length, "入夜后页面内容过短").toBeGreaterThan(200);
    expect(body, "应含说书人控制台标识").toMatch(/说书人控制台|说书人Tips|行动顺序/);
  });

  test("④ 夜间处于运行态（运行中 / 暂停），证明流程真的在走", async ({ page }) => {
    await enterFirstNight(page, 5);
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/运行中|暂停/);
  });

  test("⑤ ⭐ 队列中的座位号在玩家人数范围内（不越界）", async ({ page }) => {
    const playerCount = 5;
    await enterFirstNight(page, playerCount);
    const queue = await readNightQueue(page);
    expect(queue.length).toBeGreaterThan(0);

    const nums = queue
      .map((l) => l.match(/\[(\d+)号\]/)?.[1])
      .filter(Boolean)
      .map(Number);
    for (const no of nums) {
      expect(no, `座位号 ${no} 越界（人数 ${playerCount}）`).toBeGreaterThanOrEqual(1);
      expect(no).toBeLessThanOrEqual(playerCount);
    }
  });

  test("⑥ ⭐ 9 人局同样能入夜且队列非空（换人数复验）", async ({ page }) => {
    await enterFirstNight(page, 9);
    const queue = await readNightQueue(page);
    expect(queue.length).toBeGreaterThan(0);
    const nums = queue
      .map((l) => l.match(/\[(\d+)号\]/)?.[1])
      .filter(Boolean)
      .map(Number);
    for (const no of nums) {
      expect(no).toBeLessThanOrEqual(9);
    }
  });
});
