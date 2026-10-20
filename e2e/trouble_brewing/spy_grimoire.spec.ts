import { expect, test } from "@playwright/test";
import { enterFirstNight, readSnapshot } from "../helpers/scriptFlow";

/**
 * 暗流涌动 · 间谍专项（2026-10-20）
 * ==================================================================
 * 固定发牌 `seed=4`（发牌专用随机源已可复现）：
 *   1号占卜师 / 2号**间谍** / 3号酒鬼 / 4号小恶魔 / 5号男爵 /
 *   6号守鸦人 / 7号陌客 / 8号调查员 / 9号管家 / 10号士兵 / 11号图书管理员
 *
 * 为什么要单独一局：
 *   此前所有 E2E 遇到间谍就 `test.skip` —— 理由是「查看魔典没有确认按钮，
 *   不可自动驱动」。实测（本文件即证据）该理由**不成立**：
 *   间谍步骤的主推进按钮叫「📋 展开对局记录」（打开魔典）与
 *   「✓ 我已查看完毕 (下一步)」（关闭魔典），只是驱动器正则没收录。
 *
 * 本文件锁三件事：
 *   ① 间谍步骤**能完整驱动**：展开魔典 → 读到真实身份 → 关闭 → 进入白天；
 *   ② 魔典里确实能看到真实角色（4号小恶魔 / 5号男爵），不是空壳；
 *   ③ **图书管理员不得报出「间谍」**（间谍被识别为好人）——
 *      实测旧实现输出「2号和10号之中有一名是【间谍】」，属真信息泄漏。
 */
test.describe("暗流涌动 · 间谍", () => {
  test.setTimeout(240_000);

  test("seed=4：魔典可开可关，且图书管理员不得报出间谍", async ({ page }) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await enterFirstNight(page, 11, "暗流涌动", 4);

    const snap = await readSnapshot(page);
    const roles = (snap?.seats ?? []).map((s: any) => s.role?.id);
    expect(roles, "本局必须含间谍（seed=4 已固定）").toContain("spy");
    expect(roles[1], "2 号应为间谍").toBe("spy");

    const dialogs: string[] = [];
    let sawGrimoire = false;
    let grimoireText = "";
    let sawGrimoireButton = false;
    let reachedDay = false;

    for (let i = 0; i < 70; i++) {
      const st = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const text = (dlg?.textContent || "").replace(/\s+/g, " ");
        const body = (document.body.textContent || "").replace(/\s+/g, "");
        const buttons = Array.from(document.querySelectorAll("button")) as any[];
        const norm = (b: any) => ((b.textContent as string) || "").replace(/\s+/g, "");
        return {
          day: /第\s*\d+\s*天/.test(body) && !/首夜/.test(body.slice(0, 40)),
          hasDialog: !!dlg,
          text,
          isGrimoire: /间谍椭圆魔典|魔典\(全知全景\)/.test(text),
          hasGrimoireEntry: buttons.some((b) => !b.disabled && /展开对局记录/.test(norm(b))),
          needTargets: /请选择目标玩家/.test(text.replace(/\s+/g, "")),
        };
      });

      if (st.day) {
        reachedDay = true;
        break;
      }
      if (st.isGrimoire) {
        sawGrimoire = true;
        grimoireText = st.text;
      }
      if (st.hasGrimoireEntry) sawGrimoireButton = true;
      if (st.hasDialog && st.text) dialogs.push(st.text);

      // 需要选目标时先点两个座位
      if (st.needTargets) {
        await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]') as any;
          if (!dlg) return;
          const seats = (Array.from(dlg.querySelectorAll("button")) as any[]).filter(
            (b) => !b.disabled && /^\d+号?$/.test((b.textContent || "").replace(/\s+/g, ""))
          );
          seats.slice(0, 2).forEach((b) => b.click());
        });
        await page.waitForTimeout(150);
      }

      const clicked = await page.evaluate(() => {
        const norm = (el: any) => ((el?.textContent as string) || "").replace(/\s+/g, "");
        const all = Array.from(document.querySelectorAll("button")) as any[];
        const pick =
          all.find((b) => !b.disabled && /我已查看完毕|展开对局记录/.test(norm(b))) ??
          all.find(
            (b) =>
              !b.disabled &&
              // ⚠️ 必须含「确认选择」：选目标类弹窗（占卜师等）的主按钮是
              //    「确认选择 (2/2)」，漏了它就会卡在选人步骤空转。
              /确认选择|确认&下一步|确认执行|确认结果|确认并进入白天|▶继续/.test(
                norm(b)
              )
          );
        if (!pick) return null;
        pick.click();
        return norm(pick);
      });
      if (!clicked) await page.waitForTimeout(220);
      else await page.waitForTimeout(200);
    }

    // ① 间谍步骤可驱动：既出现了「展开对局记录」入口，也真的弹出了魔典
    expect(sawGrimoireButton, "应出现「展开对局记录」按钮（间谍魔典入口）").toBe(true);
    expect(sawGrimoire, "应弹出「间谍椭圆魔典」").toBe(true);

    // ② 魔典有实质内容：能看到真实身份（本局 4号小恶魔 / 5号男爵）
    expect(grimoireText.length, "魔典内容不应为空壳").toBeGreaterThan(100);
    expect(grimoireText, "魔典必须能看到恶魔（4号小恶魔）").toMatch(/小恶魔|恶魔/);
    expect(grimoireText, "魔典必须能看到爪牙（5号男爵）").toMatch(/男爵/);

    // ③ 图书管理员不得报出「间谍」（间谍被识别为好人）
    const allText = dialogs.join(" | ");
    expect(
      /一名是【间谍】|是【间谍】/.test(allText),
      `信息角色不得把「间谍」当外来者报出。实际弹窗：${allText.slice(0, 400)}`
    ).toBe(false);

    // 整夜可推进到底
    expect(reachedDay, "间谍步骤后必须能进入白天（此前会被 skip 掩盖）").toBe(true);
  });
});
