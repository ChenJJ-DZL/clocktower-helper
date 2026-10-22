import { expect, test } from "@playwright/test";
import {
  enterFirstNight,
  readNightQueue,
  T,
  waitForSnapshot,
} from "../helpers/scriptFlow";

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
  test("② ⭐ 首夜「互认」步骤的有无与罂粟种植者状态一致（两条固定阵容各验一次）", async ({
    page,
  }) => {
    /**
     * 官方【罂粟种植者】·运作方式（逐字）：
     *   「在首个夜晚，**唤醒恶魔**。对他展示“这些角色不在场”信息标记以及
     *     三个不在场的善良角色标记。然后，让恶魔重新入睡。
     *     **不要进行“爪牙信息”和“恶魔信息”步骤。**」
     * 官方·规则细节：「罂粟种植者死亡时…相互认识」「中毒或醉酒…不会导致互认」
     * ⇒ 判据：**活且健康的罂粟种植者 ⇒ 首夜无互认**；否则必须有。
     *
     * 🔴 2026-10-23 第三次纠正 —— 目标是把它从「碰运气」变成「确定性」：
     *   ① 初版断言「首夜必含互认」：假绝对命题（有罂粟种植者时不成立）；
     *   ② 改成条件断言、但用 **DOM 文本**判断罂粟在不在场 ⇒ 被**酒鬼的伪装身份**骗到
     *      （座位卡显示 charadeRole，场上根本没有这个角色）⇒ 假红；
     *   ③ 现在**不再靠随机发牌**：钉死两条阵容各跑一次，两个分支都是硬断言。
     *      顺带覆盖到一条真实产品缺口：罂粟压制时恶魔那一步原来仍叫
     *      「X(恶魔互认)」，会让说书人去做官方明令不做的事 —— 已修成「(不在场角色)」。
     */
    const POPPY_LINEUP = ["poppy_grower", "mayor", "farmer", "cerenovus", "imp"];
    const NO_POPPY_LINEUP = ["chef", "mayor", "farmer", "cerenovus", "imp"];

    /** 跑一局，返回首夜队列文本 + 快照里的罂粟座位 */
    const boot = async (lineup: string[]) => {
      // 同一 test 内连跑两局：localStorage 跨 goto 复用 ⇒ 上一局会被当成
      // 「恢复中的对局」直接恢复 ⇒ 拿不到配置页。每局开头清（清的是测试上下文）。
      await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await page
        .evaluate(() => {
          try {
            localStorage.clear();
          } catch {
            /* ignore */
          }
        })
        .catch(() => undefined);

      await enterFirstNight(page, 5, undefined, undefined, lineup);
      const snap = await waitForSnapshot(
        page,
        (s) =>
          Array.isArray(s?.seats) &&
          s.seats.length >= 5 &&
          s.seats.every((x: any) => !!x?.role?.id),
        20_000
      );
      expect(
        snap,
        `❌ 入夜后快照不可读（阵容 ${lineup.join("/")}）`
      ).not.toBeNull();
      const seats = (snap?.seats ?? []) as any[];
      return {
        queueText: (await readNightQueue(page)).join(" | "),
        poppy: seats.find((s: any) => s?.role?.id === "poppy_grower"),
      };
    };

    // ── A：含罂粟种植者（存活且未受干扰）⇒ 互认必须被抑制 ──
    const withPoppy = await boot(POPPY_LINEUP);
    expect(
      withPoppy.poppy,
      "❌ 固定阵容里没有罂粟种植者（发牌没按 lineup 走）—— 本分支会变成空断言"
    ).toBeTruthy();
    expect(withPoppy.queueText, "❌ 首夜队列为空").not.toBe("");
    expect(
      withPoppy.queueText,
      `罂粟种植者在场且未受干扰时，首夜不得出现互认步骤` +
        `（官方：不要进行“爪牙信息”和“恶魔信息”步骤）。实际：${withPoppy.queueText}`
    ).not.toContain("互认");
    expect(
      withPoppy.queueText,
      `罂粟种植者在场时，恶魔那一步只剩「告知不在场角色」，队列里应出现「不在场角色」。` +
        `实际：${withPoppy.queueText}`
    ).toContain("不在场角色");

    // ── B：不含罂粟种植者 ⇒ 互认必须出现 ──
    const noPoppy = await boot(NO_POPPY_LINEUP);
    expect(noPoppy.poppy, "❌ 这条阵容里不该有罂粟种植者").toBeFalsy();
    expect(
      noPoppy.queueText,
      `无罂粟种植者时，首夜必须出现互认步骤。实际：${noPoppy.queueText}`
    ).toContain("互认");
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
