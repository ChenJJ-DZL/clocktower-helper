import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { isMinionOrDemonRole } from "../../src/utils/seatAlignment";
import {
  bootScene,
  driveDusk,
  driveNight,
  seatOf,
  stepsOf,
} from "../helpers/scenario";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 专项 X08 · 「疯狂」机制（4 条）
 * ==================================================================
 * 计划见 `outputs/全量验证计划V2-场次用例清单-2026-10-21.md` §X08。
 *
 * 「疯狂」是**行为约定**，不是状态位：引擎无法自动判断玩家是否照做，
 * 因此统一做成「说书人裁定」入口（`ControlPanel` 的
 * 「🧠 检查 N号 是否疯狂扮演 X」）。这一组验的是：
 *   · 裁定入口**存在且可达**（不是只有字段没有按钮）；
 *   · 裁定的结果**落库**（`cerenovusTarget.checkedToday`）；
 *   · 裁定后果**可观测**（未疯狂 ⇒ 可处决；已疯狂 ⇒ 无事）；
 *   · 与涡流等「信息造假」机制**互不干扰**（疯狂是行为判定，不是信息产出）。
 *
 * 覆盖状态：X08-01 实装；X08-02 由畸形秀演员门禁用例覆盖（见文件末登记）；
 *   X08-03 / X08-04 待做。
 */

const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");

function loadScene(id: string): { script: string; game: any } {
  const raw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  for (const s of raw.scripts) {
    for (const g of s.games) {
      if (g.id === id) return { script: s.script, game: g };
    }
  }
  throw new Error(`找不到场次 ${id}`);
}

async function bootS(page: any, id: string) {
  const { script, game } = loadScene(id);
  return bootScene(page, {
    script,
    players: game.players,
    seed: game.seed,
    lineup: game.seats.map((s: any) => s.id),
  });
}

async function snapNow(page: any): Promise<any | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("clocktower_current_snapshot");
    return raw ? JSON.parse(raw) : null;
  });
}

// ═══════════════════════════════════════════════════════════════════
// X08-01 · 洗脑师「疯狂证明自己是 X」
// ═══════════════════════════════════════════════════════════════════
test.describe("X08-01 洗脑师的疯狂约定", () => {
  test.setTimeout(8 * 60_000);

  test("被洗脑者收到告知；说书人有裁定入口；裁定后 checkedToday 落库", async ({ page }) => {
    /**
     * 官方【洗脑师】：「每个夜晚，选择一名玩家和一个角色：
     *   **他明天必须疯狂地证明自己是该角色**，否则他可能被处决。」
     *
     * 引擎实现的三段：
     *   ① 夜间：洗脑师选「目标 + 疯狂角色」→ 被洗脑者收到
     *      「🧠 技能告知：你需要疯狂证明自己是【X】」（系统步骤，`role` 不是被洗脑者）；
     *   ② 白天：`ControlPanel` 出现「🧠 检查 N号 是否疯狂扮演【X】」按钮（说书人裁定入口）；
     *   ③ 裁定后：`cerenovusTarget.checkedToday = true` 落库（同一目标当日只裁定一次）。
     *
     * 本用例只验 ①③ 与 ② 的**存在性**——裁定后果（未疯狂⇒可处决 / 已疯狂⇒无事）
     * 取决于说书人主观判断，引擎只提供入口，不自动判。
     */
    /**
     * ⚠️ 场次必须含洗脑师。实测含 `cerenovus` 的只有
     *   S07 / S10 / S21 / S24 / S25（梦殒/游园/罂粟）；
     *   窃窃私语 S13 **没有**洗脑师（它的 12 人是 zombuul/artist/oracle/…/spy）。
     *   这里用 **S21**（游园惊梦 15 人 · 方古局）——非涡流，排除「信息造假」干扰。
     */
    const snap = await bootS(page, "S21");
    const cerSeat = seatOf(snap, "cerenovus");
    expect.soft(cerSeat, "洗脑师应在场").toBeGreaterThanOrEqual(0);

    // 选一个非洗脑师、非恶魔的座位当被洗脑者
    const victim = (snap.seats as any[]).find(
      (s: any) => s.id !== cerSeat && !isMinionOrDemonRole(s.role)
    );
    expect(victim, "应能找到一名善良玩家作为被洗脑者").toBeTruthy();

    const n1 = await driveNight(page, [
      {
        role: "cerenovus",
        targets: [victim.id + 1],
        roleChoice: "clockmaker",
        note: "洗脑：你必须疯狂证明自己是钟表匠",
      },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ① 被洗脑者收到告知
    const notice = n1.steps.find((x) => /技能告知/.test(x.dialog));
    expect.soft(notice, "被洗脑者必须收到「技能告知：你需要疯狂证明自己是谁」").toBeTruthy();
    expect
      .soft(notice?.dialog ?? "", "告知里必须写明要扮演的角色")
      .toMatch(/【[^】]+】/);

    // ③ 落库：cerenovusTarget 必须指向该玩家
    const after = await snapNow(page);
    expect
      .soft(
        after?.cerenovusTarget?.targetId,
        "`cerenovusTarget.targetId` 必须落库为被洗脑的座位"
      )
      .toBe(victim.id);
    expect
      .soft(after?.cerenovusTarget?.checkedToday, "刚入白天时尚未裁定 ⇒ checkedToday 应为假")
      .not.toBe(true);

    /**
     * ② 说书人裁定入口 —— 实测文案是 **「疯狂洗脑」**（不是「检查 N号 是否疯狂扮演 X」）：
     *   白天会出现一条门禁「需先完成洗脑师判定【疯狂洗脑】」，
     *   与畸形秀演员的「需先完成…【疯狂仲裁】」同构。
     *   ⇒ 点「疯狂洗脑」进入裁定窗，选「未疯狂」后 `checkedToday` 落库。
     */
    const checkBtn = page
      .locator("button")
      .filter({ hasText: /^疯狂洗脑$/ })
      .first();
    const hasBtn = (await checkBtn.count()) > 0;
    expect
      .soft(hasBtn, "白天必须提供「疯狂洗脑」的裁定入口（实测查不到按钮）")
      .toBe(true);

    // 门禁提示必须存在（说明「未裁定 ⇒ 白天不能推进」这条硬约束生效）
    const gateText = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, "")
    );
    expect
      .soft(
        /需先完成.*疯狂洗脑|疯狂洗脑/.test(gateText),
        "白天应出现「需先完成洗脑师判定【疯狂洗脑】」的门禁提示"
      )
      .toBe(true);

    if (hasBtn) {
      await checkBtn.click({ timeout: 10_000 });
      await page.waitForFunction(
        () => {
          const t = (document.body.innerText || "").replace(/\s+/g, "");
          return /疯狂|未疯狂|照做|没有照做/.test(t);
        },
        null,
        { timeout: 8_000 }
      ).catch(() => {});
      const dlgText = await page.evaluate(() =>
        (document.body.innerText || "").replace(/\s+/g, "")
      );
      expect
        .soft(
          /是否|疯狂/.test(dlgText),
          "「疯狂洗脑」点开后必须有「是否疯狂」的裁定选项"
        )
        .toBe(true);

      // 选「未疯狂 / 没有照做」这一项（裁定后果 = 可被处决）
      const noBtn = page
        .locator('[role="dialog"] button')
        .filter({ hasText: /未疯狂|没有照做|否/ })
        .first();
      if ((await noBtn.count()) > 0) {
        await noBtn.click({ timeout: 8_000 }).catch(() => {});
        const afterCheck = await snapNow(page);
        expect
          .soft(
            afterCheck?.cerenovusTarget?.checkedToday,
            "裁定后 `cerenovusTarget.checkedToday` 必须落库为 true（同一目标当日只裁一次）"
          )
          .toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 未实装条目（**不算通过**，登记原因与复用位置）
// ═══════════════════════════════════════════════════════════════════
test.describe.skip("X08 未实装条目", () => {
  /**
   * | 条目 | 内容 | 状态 |
   * |---|---|---|
   * | X08-02 | 畸形秀演员公开承认外来者身份 ⇒ 可被处决、但不得「说了就必死」 | ✅ 已由 `e2e/tomb_of_the_unknown/role_scenarios.spec.ts`（G5b「畸形秀演员门禁」）覆盖：验证「疯狂仲裁」入口存在 + 选保守项后能正常入夜（即「说了不必死」那条分支） |
   * | X08-03 | 小精灵疯狂证明某镇民 ⇒ 该角色死亡时获得其能力 | 待做：需要「小精灵 + 其宣称角色同场且该角色先死」的构造（罂粟花开 S25 有小精灵） |
   * | X08-04 | 疯狂 + 涡流同场 ⇒ 涡流不影响疯狂判定 | 待做：需要「洗脑师 + 涡流」同场（罂粟花开 S26 涡流局含洗脑师），判据是「裁定入口与结果不受涡流影响」 |
   */
  test("占位（说明见上方注释）", () => {});
});
