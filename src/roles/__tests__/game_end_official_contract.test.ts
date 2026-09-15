/**
 * 终局胜负条件 —— **官方规则契约**（2026-09-15 修正）
 *
 * ============================================================
 * 【官方原文】（Blood on the Clocktower 规则书 · Running the Game → Ending the Game）
 *   "Repeat day and night until one team wins. Death is not the end—if a team wins,
 *    all its players win, whether alive or dead.
 *      · Good wins if the Demon dies.
 *      · **Evil wins if only two players are left alive** (Travelers and Fabled do not
 *        count toward this).
 *      · **If both teams would win at the same time, good wins.**
 *    Some characters (e.g. the Scarlet Woman) keep the game going after the Demon dies.
 *    In some editions multiple Demons can be alive at once—all must die for good to win.
 *    You may end the game early when victory is certain for one team (e.g. all remaining
 *    players are evil, so good cannot nominate the Demon), but use your best judgment:
 *    **if there is any way for the losing team to win, keep the game going.**"
 *
 *   Glossary · Evil："Evil wins when just 2 players are alive (not counting Travelers)."
 *   Glossary · Win："Good wins when the Demon dies; evil wins when only two players are
 *    alive (not counting Travelers)."
 *
 *   ⚠️ 官方**没有**「存活邪恶 ≥ 存活善良」这条终局规则。
 *      那是一条**固定阈值**规则：**仅剩 2 人存活**。
 *      （"any way for the losing team to win → keep the game going" 更进一步说明：
 *       只要善良还有任何翻盘手段，就不能提前判负。）
 *
 * ============================================================
 * 【本文件钉死的缺陷】（用户 2026-09-15 实测报告 + 截图）
 *
 *   截图局面（15 人局，仅 4 人存活，真实阵营 2 好 : 2 恶）：
 *     4号  镇长      townsfolk  善良  存活
 *     8号  涡流      **实:疯子** 善良  存活   ← 显示涡流，真身是外来者「疯子」
 *     9号  洗脑师    minion     邪恶  存活
 *     13号 小恶魔    demon      邪恶  存活
 *
 *   引擎却直接宣布「邪恶阵营胜利」，理由「邪恶阵营人数占优（存活邪恶 ≥ 存活善良）」。
 *   ⇒ 2 好 : 2 恶、存活 4 人，**远未满足「仅剩 2 人存活」**，
 *     且善良还有明确翻盘路径（次日提名处决小恶魔 → 恶魔死 → 善良胜）。
 *     **这是违反官方规则的提前判负。**
 *
 *   根因：`app/gameLogic.ts` 分支 1.5 `aliveEvil.length >= aliveGood.length`
 *         —— 该分支于 commit 7c42dbc（2026-07-15）被凭空插入，
 *            提交信息未提，也无任何缺陷报告支撑，属**杜撰规则**。
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { seat } from "./_tbHarness";

/** 用户截图的精确 4 人存活局面 */
const userBoard = () => [
  seat(3, "mayor"), // 4号 镇长（善良，存活）
  seat(7, "lunatic", { apparentDemonRole: "vortox" } as any), // 8号 实:疯子（善良，存活）
  seat(8, "cerenovus"), // 9号 洗脑师（邪恶，存活）
  seat(12, "imp"), // 13号 小恶魔（邪恶，存活）
];

describe("🏆 终局条件 · 官方规则契约（evil wins only when 2 players alive）", () => {
  // ── 核心：用户截图局面 ────────────────────────────────────────────────
  it("🔴 用户截图局面：4 人存活、2 好 : 2 恶 → **游戏必须继续**（不得提前判邪恶胜）", () => {
    const res = checkGameEnd(userBoard() as any, "check_phase", null, {} as any);
    expect(
      res.isGameOver,
      `4 人存活时官方无任何终局条件成立，但引擎判了「${res.winner}：${res.reason}」`
    ).toBe(false);
  });

  it("🔴 同上局面走「平安日」路径 → 同样不得仅因人数判邪恶胜", () => {
    // 注意：4 人局若同时是涡流世界（8号显示涡流但真身是疯子 → 不是涡流世界），
    // 不触发涡流平安日规则。此处 options 不传 isVortoxWorld。
    const res = checkGameEnd(userBoard() as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(false);
  });

  it("🔴 3 人存活、2 恶 : 1 好（无镇长）→ 游戏继续（善良次日仍可提名处决恶魔）", () => {
    const three = [seat(0, "soldier"), seat(1, "imp"), seat(2, "cerenovus")];
    const res = checkGameEnd(three as any, "check_phase", null, {} as any);
    expect(res.isGameOver).toBe(false);
  });

  it("🔴 3 人存活、3 恶 : 0 好（全邪恶）→ 邪恶获胜（善良无法提名恶魔）", () => {
    // 官方 allow-early-end 例子："all remaining players are evil, so good cannot
    // nominate the Demon"。此时邪恶无对手，应判邪恶胜。
    const three = [seat(0, "imp"), seat(1, "cerenovus"), seat(2, "baron")];
    const res = checkGameEnd(three as any, "check_phase", null, {} as any);
    expect(res.winner).toBe("Evil");
    expect(res.isGameOver).toBe(true);
  });

  // ── 官方固定阈值：仅剩 2 人 ──────────────────────────────────────────
  it("✅ 仅剩 2 人存活（1 恶 + 1 好）→ 邪恶获胜（官方 evil wins if only two alive）", () => {
    const two = [seat(0, "soldier"), seat(1, "imp")];
    const res = checkGameEnd(two as any, "check_phase", null, {} as any);
    expect(res.winner).toBe("Evil");
  });

  it("✅ 仅剩 2 人存活（2 好，恶魔已死）→ 恶魔全灭先于人数，善良获胜", () => {
    const two = [seat(0, "soldier"), seat(1, "chef")];
    const res = checkGameEnd(two as any, "check_phase", null, {} as any);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("恶魔");
  });

  // ── 「善良还有翻盘路径就不能提前判负」 ────────────────────────────────
  it("🔴 4 人存活、3 恶 : 1 好 → 官方未到阈值；应继续（善良仍可次日处决恶魔）", () => {
    const four = [
      seat(0, "mayor"),
      seat(1, "imp"),
      seat(2, "cerenovus"),
      seat(3, "baron"),
    ];
    const res = checkGameEnd(four as any, "check_phase", null, {} as any);
    expect(res.isGameOver).toBe(false);
  });

  it("🔴 5 人存活、4 恶 : 1 好 → 官方未到阈值；应继续", () => {
    const five = [
      seat(0, "mayor"),
      seat(1, "imp"),
      seat(2, "cerenovus"),
      seat(3, "baron"),
      seat(4, "assassin"),
    ];
    const res = checkGameEnd(five as any, "check_phase", null, {} as any);
    expect(res.isGameOver).toBe(false);
  });

  // ── 旅行者不计入 ────────────────────────────────────────────────────
  it("✅ 旅行者不计入「仅剩 2 人」阈值：1 恶 + 1 好 + 1 旅行者 → 仍邪恶获胜", () => {
    // ⚠️ 用 `app/data.ts` 里确定 type=traveler 的 `traveler_official` 占位角色。
    //    注意 `scapegoat` 在 `app/data.ts` 里是 outsider（无名之墓），
    //    但在 `src/data/rolesData.json` 里是 traveler —— 双数据源不一致（另案处理）。
    const s = [seat(0, "soldier"), seat(1, "imp"), seat(2, "traveler_official")];
    const res = checkGameEnd(s as any, "check_phase", null, {} as any);
    expect(res.winner).toBe("Evil");
  });
});
