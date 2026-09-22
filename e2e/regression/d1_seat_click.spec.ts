import { expect, test } from "@playwright/test";
import { T } from "../helpers/scriptFlow";

/**
 * D1 修复验证 · 准备阶段「点击座位能否落座」（真实点击流）
 * ==================================================================
 * 背景（修复前）：
 *   `RoundTable.tsx::handleSeatDragStart` 在 **pointerdown 时就立即进入拖拽态**
 *   （设置 activeDragSeatId、显示拖拽浮层）且**无位移阈值**
 *   ⇒ 浮层立刻压在光标下、吃掉后续 mouseup/click
 *   ⇒ 即便是零位移的「轻点」，也永远走拖拽分支 ⇒ `onSeatClick` **永不触发**
 *   ⇒ setup / check 两阶段手动落座全失效。
 *
 * 修复后：
 *   落下只记起点；位移 >4px 才真正进拖拽；抬起时若从未超阈值 ⇒ 判定为「点击」
 *   ⇒ 触发 `onSeatClick(seatId)`。
 *
 * ⚠️ 本用例**刻意不用** `helpers/scriptFlow::enterScriptConfig` ——
 *   它末尾会点「随机落座」，那会绕过手动落座路径。
 */

const SCRIPT = "暗流涌动";
const PLAYER_COUNT = 7;

/** 进入剧本配置页，但**不随机落座**（保留「手动点座位」的机会） */
async function enterConfigNoDeal(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // 选剧本（用 button role 精确锁按钮 —— 见 scriptFlow 里的踩坑注释）
  await page
    .getByRole("button", { name: new RegExp(SCRIPT) })
    .last()
    .click({ timeout: T.click });

  // 等配置页就绪
  const quickStart = page.getByText("⚡ 快速开始").first();
  await expect(quickStart).toBeVisible({ timeout: T.visible });
  await quickStart.click({ timeout: T.click });

  // 选人数
  await page
    .getByText(`${PLAYER_COUNT}人`, { exact: false })
    .first()
    .click({ timeout: T.click });

  // ⚠️ 关键一步：**关闭人数选择弹窗**（点「取消」）。
  //   实测踩坑：不关弹窗的话，弹窗会盖住整个座位区
  //   ⇒ 座位圆圈被判定为「不可点」⇒ locator.click() 15s 超时
  //   （截图已证实：弹窗仍在时座位区被遮住）。
  const cancel = page.getByText("取消", { exact: true }).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click({ timeout: T.click });
  }
  await page.waitForTimeout(600);

  // ⚠️ 到此为止 —— **不点「随机落座」**，座位应全部为空
  await expect(page.getByText(/已分配角色/).first()).toBeVisible({
    timeout: T.visible,
  });
}

test.describe("D1 · 准备阶段点座位落座", () => {
  test("⭐ 点座位圆圈必须真的落座（已分配角色数上升）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await enterConfigNoDeal(page);

    /**
     * 读「已分配角色」计数。
     * ⚠️ 实测页面文本形如：`0/ 15 已分配角色`（**数字与斜杠之间有空格**）。
     * ⚠️ 不能用 Playwright 的 `text=/regex/` 选择器（那不是合法用法），
     *    改用 `body.innerText` + 正则提取。
     */
    const counter = async () => {
      const txt = await page.locator("body").innerText();
      const m = txt.match(/(\d+)\s*\/\s*(\d+)\s*已分配角色/);
      return m ? Number(m[1]) : -1;
    };

    const before = await counter();
    console.log("[D1] 点击前已分配角色数 =", before);
    expect(before, "（前置）未随机落座时初始分配数应为 0").toBe(0);

    /**
     * ⚠️ 选择器要点**真正的可点元素**：
     *   `data-seat-id` 挂在**外层容器**（`SeatNode.tsx:346-347`）上，
     *   而 `onPointerDown` / `onClick` 实际绑在内部的 **`.seat-token`**（`:354`/`:360`）。
     *   实测：直接 `.click()` 外层 `[data-seat-id]` 会因「不可点」而 15s 超时。
     */
    /**
     * ⚠️ 选择器（由 Playwright 的 DOM 快照确定，别再猜）：
     *   `data-seat-id` 容器内的结构是
     *     generic[data-seat-id]  →  button "1"  +  generic "空"
     *   要点的就是**序号 button**（用户口中的「座位序号圆圈」）。
     */
    const token = page.locator("[data-seat-id] button").first();
    await expect(token, "准备阶段应能定位到座位序号圆圈").toBeVisible({
      timeout: T.visible,
    });

    /**
     * ⚠️ 实测：`locator.click()` 对角色卡/座位**没反应**
     *   （而 `dealOnly` 里点普通按钮是正常的）
     *   ⇒ 这两个元素都是 `motion.div`（Framer Motion）包裹、监听 **pointer 事件**，
     *     Playwright 的元素级 click 在这里不可靠。
     *   ⇒ 改用 **`page.mouse` 按坐标发真实鼠标事件**（pointerdown/move/up 都会产生）。
     */
    const clickCenter = async (loc: import("@playwright/test").Locator) => {
      const box = await loc.boundingBox();
      if (!box) throw new Error("元素无 boundingBox");
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.up();
    };

    /**
     * ⚠️ 用**稳定选择器**点角色卡：`GameSetup.tsx:911` 给卡片加了 `data-role-id`。
     *   此前用坐标/文本点击都"看起来选中了"（有白框）却读不到 state，
     *   改用 data 属性精确定位并**验证选中态 class**（`:910` = `ring-2 ring-white`）。
     */
    const card = page.locator('[data-role-id="washerwoman"]').first();
    await expect(card, "角色列表应有 data-role-id=washerwoman 的卡片").toBeVisible({
      timeout: T.visible,
    });
    await card.scrollIntoViewIfNeeded();
    await card.click({ force: true, timeout: T.click });
    await page.waitForTimeout(600);

    const cardSelected = await page.evaluate(() => {
      const el = document.querySelector('[data-role-id="washerwoman"]') as HTMLElement | null;
      return el ? el.className.includes("ring-2") : null;
    });
    console.log("[D1] 角色卡选中态(ring-2) =", cardSelected);
    await page.screenshot({ path: "test-results/d1/step1-role-selected.png" });

    // ② 点座位序号按钮
    await clickCenter(token);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "test-results/d1/step2-seat-clicked.png" });

    const after = await counter();
    console.log("[D1] 已分配角色数 =", after);
    console.log("[D1] 页面报错 =", errors.join(" | ") || "无");

    expect(
      after > before,
      `❌ 选中角色卡（选中态=${cardSelected}）→ 点座位，已分配角色数仍未上升（${before} → ${after}）。`
    ).toBe(true);
  });
});
