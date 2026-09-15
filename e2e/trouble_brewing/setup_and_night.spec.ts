import { expect, test } from "@playwright/test";
import {
  DEFAULT_SCRIPT,
  dealOnly,
  enterFirstNight,
  expectNightQueueNonEmpty,
  readAssigned,
  readCamps,
  resolveCharades,
  T,
} from "../helpers/scriptFlow";

/**
 * 暗流涌动（Trouble Brewing）· **落座与发牌 真实点击流**
 *
 * 与 `e2e/poppyganda/*` 同一套夹具（`helpers/scriptFlow`），只是剧本名换掉。
 * 覆盖：选剧本（暗流涌动）→ 快速开始 → 选人数 → 随机落座
 *      → 断言发牌完整性 / 阵营配额 → 配置伪装 → 分发&核对身份 → 可入夜
 *
 * ⚠️ 暗流涌动为 **7-15 人**（`app/data.ts`），故人数用例取 7 / 9 / 12。
 * ⚠️ 暗流涌动含**酒鬼 / 陌客**，会触发「伪装身份」配置流程
 *    （钉子户：酒鬼必须配置 charadeRole，否则信息会泄漏真值）。
 */
const SCRIPT = "暗流涌动";

test.describe("暗流涌动 · 落座与发牌", () => {
  test("① 首页剧本列表包含「暗流涌动」，且无页面报错", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/血染|钟楼|说书人/);
    await expect(page.getByText("请选择剧本")).toBeVisible({ timeout: T.visible });
    await expect(page.getByText(SCRIPT).first()).toBeVisible({
      timeout: T.visible,
    });
    expect(errors, `页面报错：${errors.join(" | ")}`).toHaveLength(0);
  });

  test("② ⭐ 7 人局（最低人数）发牌完整：7/7 且阵营合计 == 7", async ({ page }) => {
    await dealOnly(page, 7, SCRIPT);
    const a = await readAssigned(page);
    expect(a, "未找到「N/N 已分配角色」").not.toBeNull();
    expect(a!.done, "7 人局应有 7 个角色已分配").toBe(7);
    expect(a!.total).toBe(7);

    const c = await readCamps(page);
    expect(c, "未找到阵营分布").not.toBeNull();
    expect(
      c!.村民 + c!.外来者 + c!.爪牙 + c!.恶魔,
      `阵营分布总和应为 7，实际 ${JSON.stringify(c)}`
    ).toBe(7);
  });

  test("③ ⭐ 12 人局发牌完整：12/12 且阵营合计 == 12", async ({ page }) => {
    await dealOnly(page, 12, SCRIPT);
    const a = await readAssigned(page);
    expect(a).not.toBeNull();
    expect(a!.done).toBe(12);
    expect(a!.total).toBe(12);

    const c = await readCamps(page);
    expect(c).not.toBeNull();
    expect(
      c!.村民 + c!.外来者 + c!.爪牙 + c!.恶魔,
      `阵营分布总和应为 12，实际 ${JSON.stringify(c)}`
    ).toBe(12);
  });

  test("④ ⭐ 恶魔恰好 1 名（暗流涌动只有小恶魔）", async ({ page }) => {
    await dealOnly(page, 9, SCRIPT);
    const c = await readCamps(page);
    expect(c).not.toBeNull();
    expect(c!.恶魔, `暗流涌动恶魔应为 1，实际 ${c!.恶魔}`).toBe(1);
  });

  test("⑤ ⭐ 爪牙数量随人数递增（7人=1 / 12人≥2）", async ({ page }) => {
    await dealOnly(page, 7, SCRIPT);
    const c7 = await readCamps(page);
    expect(c7, "7 人局未读到阵营分布").not.toBeNull();
    expect(c7!.爪牙, "7 人局爪牙应为 1").toBe(1);

    await dealOnly(page, 12, SCRIPT);
    const c12 = await readCamps(page);
    expect(c12, "12 人局未读到阵营分布").not.toBeNull();
    expect(c12!.爪牙, "12 人局爪牙应 ≥ 2").toBeGreaterThanOrEqual(2);
  });

  test("⑥ ⭐ 含酒鬼/陌客时须先配置「伪装身份」，点「随机」后即可继续入夜", async ({
    page,
  }) => {
    await dealOnly(page, 9, SCRIPT);
    const resolved = await resolveCharades(page);
    console.log(`  （本局是否需要配置伪装：${resolved}）`);

    await page.getByText("分发&核对身份").first().click({ timeout: T.click });
    const enterNight = page
      .locator("button")
      .filter({ hasText: /确认无误[\s\S]*入夜/ })
      .first();
    await expect(enterNight).toBeVisible({ timeout: T.visible });
  });

  test("⑦ 夹具默认剧本仍为罂粟花开（向后兼容未破坏）", async () => {
    expect(DEFAULT_SCRIPT).toBe("罂粟花开");
  });
});

test.describe("暗流涌动 · 夜间流程点击流", () => {
  test("① ⭐ 入夜后「夜晚行动顺序」渲染出唤醒队列（形如 `1. [N号] 角色`）", async ({
    page,
  }) => {
    await enterFirstNight(page, 9, SCRIPT);
    const queue = await expectNightQueueNonEmpty(page, "9 人首夜");
    for (const line of queue) {
      expect(line, `队列项格式异常：${line}`).toMatch(/^\d+\.\s*\[\d+号\]\s*\S+/);
    }
  });

  test("② ⭐ 首夜队列含「互认」相关系统步骤", async ({ page }) => {
    await enterFirstNight(page, 9, SCRIPT);
    const text = (await expectNightQueueNonEmpty(page, "9 人首夜")).join(" | ");
    expect(text, `首夜应含互认步骤，实际：${text}`).toContain("互认");
  });

  test("③ 入夜后说书人控制台有实质内容（不空白）", async ({ page }) => {
    await enterFirstNight(page, 9, SCRIPT);
    await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({
      timeout: T.visible,
    });
    const body = await page.locator("body").innerText();
    expect(body.length, "入夜后页面内容过短").toBeGreaterThan(200);
    expect(body, "应含说书人控制台标识").toMatch(
      /说书人控制台|说书人Tips|行动顺序/
    );
  });

  test("④ 夜间处于运行态（运行中 / 暂停），证明流程真的在走", async ({ page }) => {
    await enterFirstNight(page, 9, SCRIPT);
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/运行中|暂停/);
  });

  test("⑤ ⭐ 队列中的座位号在玩家人数范围内（不越界）", async ({ page }) => {
    const playerCount = 9;
    await enterFirstNight(page, playerCount, SCRIPT);
    const queue = await expectNightQueueNonEmpty(page, `${playerCount} 人首夜`);

    const nums = queue
      .map((l) => l.match(/\[(\d+)号\]/)?.[1])
      .filter(Boolean)
      .map(Number);
    for (const no of nums) {
      expect(no, `座位号 ${no} 越界（人数 ${playerCount}）`).toBeGreaterThanOrEqual(1);
      expect(no).toBeLessThanOrEqual(playerCount);
    }
  });

  test("⑥ ⭐ 12 人局同样能入夜且队列非空（换人数复验）", async ({ page }) => {
    await enterFirstNight(page, 12, SCRIPT);
    const queue = await expectNightQueueNonEmpty(page, "12 人首夜");
    const nums = queue
      .map((l) => l.match(/\[(\d+)号\]/)?.[1])
      .filter(Boolean)
      .map(Number);
    for (const no of nums) {
      expect(no).toBeLessThanOrEqual(12);
    }
  });
});
