import { expect, test } from "@playwright/test";
import { advanceNightFast, enterFirstNight } from "../helpers/scriptFlow";

/**
 * 🗣️ E2E：**一个黄昏内每名玩家只能提名 1 次 / 被提名 1 次**（官方规则）。
 *
 * 用户实测缺陷（2026-09-14）：
 *   「当前实测可以发起 2 次提名，和被提名 2 次，这不符合游戏规则」
 *
 * 根因（生命周期，非判定条件）：
 *   `GameStage` 的「VOTE_INPUT 弹窗关闭」effect **无条件**调用
 *   `cancelNomination(lastNominator, pendingVoteFor)` —— 投票**已完成**时也把
 *   提名者/被提名者从 nominationRecords 删掉 → 双方资格被恢复。
 *   修复：`submitVotes` 打「已结算」闩锁（utils/nominationEligibility），
 *   弹窗关闭时按闩锁分流，只有**取消**才恢复资格。
 *
 * 本文件在**真实 Chromium** 里走完整链路：
 *   入夜 → 推到白天 → 进黄昏 → 第 1 次提名+计票 → **尝试第 2 次提名** → 必须被拒。
 *
 * ⚠️ 遵循项目 E2E 铁律：
 *   · dev server 由外部先起在 3100（本文件不自起、不配 webServer）
 *   · 绝不用 `waitUntil: "networkidle"`
 *   · 循环里一律 `textContent`，不用 `innerText`
 *   · 决策性突破：把驱动循环塞进 `page.evaluate()`，避免 Node↔浏览器往返
 */

const T = { visible: 25_000, click: 15_000 };

/**
 * 在黄昏阶段读「某座位是否已被标记为本黄昏已提名/已被提名」。
 *
 * ⚠️ 实测 DOM 文案（Playwright accessibility snapshot，2026-09-14）：
 *   座位角标的 **可见文本就是「已提」/「被提」两个短字**，
 *   完整语义在 `title` 属性里（hover 提示）：
 *     · 提名者角标：`title="本黄昏已发起过提名"` → 文本「已提」
 *     · 被提名角标：`title="本黄昏已被提名过"`   → 文本「被提」
 *
 * ⛔ 踩过的坑：曾用 `text.includes("已提名")` 断言 —— 必然 false（DOM 里没有这三个字），
 *   且 `已提名` 还是 `已被提名` 的子串，即使真出现也会互相污染。
 *   ⇒ 这里同时按 **文本短标记 + title 属性** 双路判定，任一命中即算有标记。
 *
 * 用 textContent/blob 一次性取，不触碰布局（E2E 铁律 ④）。
 */
async function readNominationMarkers(page: import("@playwright/test").Page) {
  return (await page.evaluate(() => {
    const text = document.body.textContent || "";
    // 角标短文本：注意排除误伤（如「已提交」）——用 title 属性兜底即可
    const attrText = Array.from(document.querySelectorAll("[title]"))
      .map((el) => el.getAttribute("title") || "")
      .join("\u0001");
    return {
      hasNominatedLabel:
        text.includes("已提") || attrText.includes("本黄昏已发起过提名"),
      hasBeenNominatedLabel:
        text.includes("被提") || attrText.includes("本黄昏已被提名过"),
      // 日志区里判断有没有打出「只能发起一次提名」的拒绝提示
      rejectedNominate: text.includes("只能发起一次提名"),
      rejectedBeNominated: text.includes("只能被提名一次"),
    };
  })) as {
    hasNominatedLabel: boolean;
    hasBeenNominatedLabel: boolean;
    rejectedNominate: boolean;
    rejectedBeNominated: boolean;
  };
}

/**
 * 在页面内完成「选提名者 → 选被提名者 → 确认发起提名 → 计票」，
 * 并回报本次是否真的发起了提名（用于第 1 次成功 / 第 2 次被拒的对比）。
 */
async function attemptNomination(
  page: import("@playwright/test").Page,
  nominatorIdx: number,
  nomineeIdx: number
): Promise<{
  clickedSeats: boolean;
  confirmAppeared: boolean;
  voteModalAppeared: boolean;
  stillNominating: boolean;
}> {
  return (await page.evaluate(
    async ({ nominatorIdx, nomineeIdx }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const norm = (el: any) =>
        ((el?.textContent as string) || "").replace(/\s+/g, "");
      const allBtns = () =>
        Array.from(document.querySelectorAll("button")) as any[];

      // 圆桌座位按钮：UI 实测其文本就是**纯座位号**（`"1"` / `"2"` …，无「号」后缀）。
      // 注意排除计票面板里的「N号」卡片与「0:01」计时器。
      const seatBtns = allBtns().filter((b) => /^[1-9]\d*$/.test(norm(b)));
      if (seatBtns.length < 2) {
        return {
          clickedSeats: false,
          confirmAppeared: false,
          voteModalAppeared: false,
          stillNominating: false,
        };
      }

      const n = seatBtns[Math.min(nominatorIdx, seatBtns.length - 1)];
      const m = seatBtns[Math.min(nomineeIdx, seatBtns.length - 1)];

      n.click();
      await sleep(350);
      m.click();
      await sleep(350);

      // 选完后应出现「确认发起提名」按钮（showConfirm）
      const confirmBtn = allBtns().find(
        (b) => /确认发起提名|确认/.test(norm(b)) && !b.disabled
      );
      const confirmAppeared = !!confirmBtn;
      if (confirmBtn) {
        confirmBtn.click();
        await sleep(900);
      }

      // 计票面板出现？
      const bodyText = () => document.body.textContent || "";
      let voteModalAppeared = false;
      for (let i = 0; i < 20; i++) {
        if (/举手表决计票|当前被提名者/.test(bodyText())) {
          voteModalAppeared = true;
          break;
        }
        await sleep(150);
      }

      // 有计票面板就直接确认（计 0 票也算完成结算）
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const ok = (Array.from(dlg.querySelectorAll("button")) as any[]).find(
          (b) => /确认/.test(norm(b)) && !b.disabled
        );
        if (ok) {
          ok.click();
          await sleep(900);
        }
      }

      await sleep(600);
      const stillNominating = /提名中/.test(document.body.textContent || "");
      return {
        clickedSeats: true,
        confirmAppeared,
        voteModalAppeared,
        stillNominating,
      };
    },
    { nominatorIdx, nomineeIdx }
  )) as {
    clickedSeats: boolean;
    confirmAppeared: boolean;
    voteModalAppeared: boolean;
    stillNominating: boolean;
  };
}

/** 从「第 N 天」推进到黄昏阶段（点「日落」/「进入黄昏」之类） */
async function enterDusk(page: import("@playwright/test").Page) {
  return (await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const allBtns = () =>
      Array.from(document.querySelectorAll("button")) as any[];

    for (let i = 0; i < 60; i++) {
      const t = document.body.textContent || "";
      if (/黄昏|提名/.test(t) && !/第\s*\d+\s*天/.test(t)) return "dusk";
      const b = allBtns().find(
        (x) =>
          /黄昏|日落|提名阶段|进入提名/.test(norm(x)) && !x.disabled
      );
      if (b) {
        b.click();
        await sleep(500);
        continue;
      }
      await sleep(250);
    }
    return /黄昏|提名/.test(document.body.textContent || "") ? "dusk" : "timeout";
  })) as "dusk" | "timeout";
}

/** 判断当前页面是否已终局（「游戏结束 · X 阵营获胜」对话框出现） */
async function isGameOver(page: import("@playwright/test").Page) {
  return (await page.evaluate(() =>
    /游戏结束|阵营获胜|阵营胜利/.test(document.body.textContent || "")
  )) as boolean;
}

/** 点「主页」回到设置页，准备重开一局 */
async function backToHome(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const btns = Array.from(document.querySelectorAll("button")) as any[];
    const home = btns.find((b) => /主页/.test((b.textContent || "").trim()));
    if (home) {
      home.click();
      await sleep(800);
    }
  });
}

/**
 * 开局跑到黄昏，并保证这局**没有提前终局**。
 *
 * ⚠️ 为什么需要"重试"（2026-09-14 实测踩坑）：
 *   5 人局 = 1 恶魔 + 1 爪牙 + 3 善良。若首夜恶魔刀中善良玩家 →
 *   存活变成 2 善良 vs 2 邪恶 → **立刻触发「存活邪恶 ≥ 存活善良」终局**。
 *   此时页面弹出「游戏结束 · 邪恶阵营获胜」→ 圆桌座位全部点不动 →
 *   用例会以"第 1 次提名应进入计票面板 = false"报红，**报错方向完全被误导**。
 *
 * ⚠️ 为什么不改成 7 人局：7 人局角色池会引入「间谍查看魔典」这类
 *   **没有确认按钮**的队列步骤，通用驱动循环处理不了 → `advanceNightFast`
 *   直接熔断返回 timeout（实测 test① 由绿转红）。人数一变，夹具假设就失效。
 *   ⇒ 保持 5 人局（夹具已验证），用**重开重试**规避终局随机性。
 *
 * @returns "dusk" 成功；"gave-up" 连续多局都首夜终局（极小概率）
 */
async function setupToDusk(page: import("@playwright/test").Page) {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await backToHome(page);

    await enterFirstNight(page, 5, "暗流涌动");
    const reached = await advanceNightFast(page);
    expect(reached, `第 ${attempt} 次开局：应能推完首夜抵达白天`).toBe("day");

    if (await isGameOver(page)) {
      // 首夜就终局（恶魔刀中善良）→ 这局没法测提名，重开
      continue;
    }

    const dusk = await enterDusk(page);
    if (dusk === "dusk") return { status: "dusk" as const, attempt };
    // 没进黄昏也重开一次试试
  }
  return { status: "gave-up" as const, attempt: MAX_ATTEMPTS };
}

test.describe("🗣️ 黄昏提名上限（每名玩家各限 1 次）", () => {
  test("① 完成第 1 次提名+计票后，**同一黄昏内**该玩家不能再发起第 2 次提名", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const setup = await setupToDusk(page);
    expect(
      setup.status,
      "应在若干次重开后拿到一局「首夜未终局」的对局"
    ).toBe("dusk");

    // ── 第 1 次提名：0 号提名 3 号（这里用前两个可选座位） ──
    const first = await attemptNomination(page, 0, 3);
    expect(first.clickedSeats, "黄昏里应能点到座位").toBe(true);
    expect(first.confirmAppeared, "第 1 次提名应弹出确认按钮").toBe(true);
    expect(first.voteModalAppeared, "第 1 次提名应进入计票面板").toBe(true);

    // 投票完成后，「已提名 / 已被提名」标记**必须保留**
    const afterFirst = await readNominationMarkers(page);
    expect(
      afterFirst.hasNominatedLabel || afterFirst.hasBeenNominatedLabel,
      "投票完成后本黄昏的已提名/已被提名标记必须保留（不得被清除）"
    ).toBe(true);

    // ── 第 2 次提名：同一个人再试一次 → 必须被拒 ──
    const second = await attemptNomination(page, 0, 2);
    const afterSecond = await readNominationMarkers(page);

    // 判定：要么确认按钮根本不出现（UI 层已禁用），
    //       要么出现了但日志打出「只能发起一次提名」
    const blockedByUi = !second.confirmAppeared || !second.voteModalAppeared;
    const blockedByGuard =
      afterSecond.rejectedNominate || afterSecond.rejectedBeNominated;
    expect(
      blockedByUi || blockedByGuard,
      "第 2 次提名必须被拒绝（UI 禁用 或 执行层守卫拦截），实测均未拦截 = 缺陷复现"
    ).toBe(true);
  });

  test("② 被提名过的座位，在同一黄昏内不能再被提名（换提名者也不行）", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const setup = await setupToDusk(page);
    expect(
      setup.status,
      "应在若干次重开后拿到一局「首夜未终局」的对局"
    ).toBe("dusk");

    // 第 1 次提名：0 → 3
    const first = await attemptNomination(page, 0, 3);
    expect(first.voteModalAppeared, "第 1 次提名应进入计票面板").toBe(true);

    // 第 2 次：**换一个提名者**（1 号）去提名同一个被提名者（3 号）→ 必须被拒
    const second = await attemptNomination(page, 1, 3);
    const after = await readNominationMarkers(page);

    const blockedByUi = !second.confirmAppeared || !second.voteModalAppeared;
    const blockedByGuard = after.rejectedBeNominated;
    expect(
      blockedByUi || blockedByGuard,
      "同一座位在同一黄昏被第 2 次提名必须被拒绝"
    ).toBe(true);
  });
});
