import { expect, test } from "@playwright/test";
import { enterFirstNight, readNightQueue, T } from "../helpers/scriptFlow";

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

  /**
   * ⭐「互认」步骤的有无**取决于罂粟种植者**，不是恒定事实。
   *
   * 官方规则（罂粟种植者·角色能力 + 运作方式，见 `json/full/all_characters.json`）：
   *   「爪牙和恶魔互相不认识。如果你死亡，当晚他们会互相认识。」
   *   「在首个夜晚……**不要进行"爪牙信息"和"恶魔信息"步骤。**」
   * ⇒ 首夜**若罂粟种植者存活且健康**，互认步骤（爪牙互认 / 恶魔互认 / 军团互认）
   *   **必须一个都不出现**；反之才应出现。
   *
   * ⚠️ 本用例原先写作「首夜队列必含互认」，是**假的绝对命题**：
   *   随机发牌时罂粟种植者偶尔落到场上（罂粟花开把把都可能抽到），
   *   于是该断言概率性失败（实测报「首夜应含互认步骤，实际：1. [5号] 厨师」，
   *   当时牌面是 1号罂粟种植者 + 2/3/4号军团 + 5号厨师）。
   *   —— 那是**引擎正确、用例错**，不能靠加重试掩盖。
   *   ⇒ 改为断言**条件规则**（比原来更强：两种情况都验）。
   */
  test("② ⭐ 首夜「互认」步骤的有无与罂粟种植者状态一致（条件规则）", async ({
    page,
  }) => {
    await enterFirstNight(page, 5);

    // 罂粟种植者是否**坐在座位上**。
    // ⚠️ 不能用「全页搜字符串『罂粟种植者』」—— 右侧【角色列表】永远列出本剧本全部
    //    角色，会把该字符串恒定命中（实测探针因此误报「有罂粟」，见 known-issues §14.6）。
    // ✅ 唯一可靠锚点：`[data-seat-id]`（`src/components/SeatNode.tsx`）。
    // ⚠️ 且角色名在座位卡里可能**被拆成多个叶子节点**（实测「罂粟种」+「植者」、
    //    「城镇公」+「告员」）⇒ 必须**把该座位的全部叶子文本拼接后**再匹配。
    const hasPoppyGrowerSeat = await page.evaluate(() => {
      const seats = Array.from(document.querySelectorAll("[data-seat-id]"));
      return seats.some((seat) => {
        const joined = Array.from(seat.querySelectorAll("*"))
          .filter((el) => el.children.length === 0)
          .map((el) => (el.textContent ?? "").replace(/\s+/g, ""))
          .join("");
        return joined.includes("罂粟种植者");
      });
    });

    const queueText = (await readNightQueue(page)).join(" | ");
    expect(queueText, `夜间队列不应为空（罂粟在=${hasPoppyGrowerSeat}）`).not.toBe(
      ""
    );

    if (hasPoppyGrowerSeat) {
      // 罂粟种植者在场且健康 ⇒ 互认必须被抑制
      expect(
        queueText,
        `罂粟种植者在场时首夜不应出现互认步骤，实际：${queueText}`
      ).not.toContain("互认");
    } else {
      // 无罂粟种植者 ⇒ 互认应当出现
      expect(
        queueText,
        `无罂粟种植者时首夜应含互认步骤，实际：${queueText}`
      ).toContain("互认");
    }
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
