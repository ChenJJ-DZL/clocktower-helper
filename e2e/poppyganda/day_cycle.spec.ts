import { expect, test } from "@playwright/test";
import { advanceNightFast, enterFirstNight, T } from "../helpers/poppy";

/**
 * 罂粟花开 · **夜 → 白天 → 黄昏 → 次日 完整点击流**
 *
 * 驱动策略：`advanceNightFast()` / `driveToDay()` —— 把整个驱动循环塞进
 * `page.evaluate()` 在页面内跑，避开 Node↔浏览器往返。
 *
 * ⚠️ 性能铁律：循环内判断相位必须用 `textContent`（不触发布局）；
 *    用 `innerText`（100~300ms/次）会把整体拖到分钟级并导致 Worker 卡死
 *    —— 这是从 6 分 42 秒超时降到 26 秒的**唯一根因**。
 *
 * ⚠️ 其他关键坑位见 `e2e/helpers/poppy.ts`。
 */

/**
 * 🔒 固定 5 人阵容（3 镇民 / 0 外来者 / 1 爪牙 / 1 恶魔）—— 2026-10-23 转正时钉死。
 *
 * 为什么不能用随机发牌：
 *   随机抽到洗脑师（cerenovus）或畸形秀演员（mutant）时，白天进入黄昏按钮会被替换为
 *   「需先完成洗脑师判定【疯狂洗脑】」门禁（disabled），直接点「进入黄昏」必然超时
 *   （门禁分支已由 `cerenovus_notice_queue.spec.ts` 与 `x08_madness.spec.ts` 专项覆盖）。
 *   保留占卜师（2 目标）+ 镜像双子（1 目标），完整覆盖首夜选人交互 + 昼/黄昏阶段切换。
 */
const LINEUP = ["fortune_teller", "mayor", "savant", "evil_twin", "imp"];

test.describe("罂粟花开 · 夜→白天→黄昏→次日 点击流", () => {
  test("⭐ 完整链路：首夜 → 第 1 天（白天）→ 进入黄昏处决阶段", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await enterFirstNight(page, 5, undefined, undefined, LINEUP);
    let body = await page.locator("body").innerText();
    expect(body, "入夜后应显示首夜标记").toMatch(/首夜|第\s*1\s*夜/);

    expect(await advanceNightFast(page), "未能推进到白天").toBe("day");
    body = await page.locator("body").innerText();
    expect(body, "应显示「第 1 天」").toMatch(/第\s*1\s*天/);

    const dusk = page
      .locator("button")
      .filter({ hasText: /进入黄昏|处决阶段/ })
      .first();
    await expect(dusk, "白天应渲染「进入黄昏处决阶段」入口").toBeVisible({
      timeout: T.visible,
    });
    await dusk.click({ timeout: T.click });
    await page.waitForTimeout(2500);

    body = await page.locator("body").innerText();
    expect(body).toMatch(/黄昏|处决|提名|投票/);
  });

  test("⭐ 黄昏阶段渲染出提名与处决台（门槛 / 步骤 / 上台规则）", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await enterFirstNight(page, 5, undefined, undefined, LINEUP);
    expect(await advanceNightFast(page), "未进入白天").toBe("day");

    await page
      .locator("button")
      .filter({ hasText: /进入黄昏|处决阶段/ })
      .first()
      .click({ timeout: T.click });
    await page.waitForTimeout(2500);

    const body = await page.locator("body").innerText();
    expect(body, "缺少提名/处决台标题").toMatch(/处决台|提名/);
    expect(body, "缺少投票门槛").toMatch(/门槛|票/);
    expect(body, "缺少处决规则说明").toMatch(/上台|处决/);
    await expect(
      page.locator("button").filter({ hasText: /确认发起提名/ }).first()
    ).toBeVisible({ timeout: T.visible });
    await expect(
      page.locator("button").filter({ hasText: /入夜/ }).first()
    ).toBeVisible({ timeout: T.visible });
  });
});
