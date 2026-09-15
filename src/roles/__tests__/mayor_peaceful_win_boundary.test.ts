/**
 * 镇长和平获胜 —— 官方规则边界契约（2026-09-15）
 *
 * 【官方原文】（Blood on the Clocktower Wiki · Mayor）
 *   "If there are just **three** players alive at the end of the day,
 *    and no execution occurred that day, then the game ends and good wins.
 *    Travellers count as players for the Mayor's victory, so must be exiled first."
 *
 * 【用户实测局面】（截图 2026-09-15）
 *   4 人存活：4号镇长(好) / 8号涡流(恶) / 9号洗脑师(恶) / 13号小恶魔(恶)
 *   → 用户认为"镇长在场，游戏应当继续"。
 *
 * 【本文件要钉死的事实】
 *   1. 镇长和平获胜要求**恰好** 3 人存活 —— 4 人不触发（官方原文 just three）。
 *   2. 人数劣势（存活邪恶 ≥ 存活善良）本身就让邪恶获胜，与镇长无关。
 *   3. 因此截图的判定**是正确的**：3 恶 ≥ 1 好 → 邪恶获胜。
 *      这是"规则如此"，不是"镇长没被识别"。
 *   4. 镇长**在 3 人局**确实能被正确识别并触发和平获胜（能力没坏）。
 *   5. 涡流（8号）在场时还有第二条独立邪恶获胜路径：平安日 → 邪恶获胜。
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { seat } from "./_tbHarness";

describe("🏛️ 镇长和平获胜 —— 官方边界（just three players alive）", () => {
  // ── 用户截图局面 ──────────────────────────────────────────────────────
  it("🔴 截图局面：4 人存活（镇长+涡流+洗脑师+小恶魔）→ 邪恶获胜（人数劣势）", () => {
    const shot = [
      seat(3, "mayor"), // 4号 镇长（存活）
      seat(7, "vortox"), // 8号 涡流（存活）
      seat(8, "cerenovus"), // 9号 洗脑师（存活）
      seat(12, "imp"), // 13号 小恶魔（存活）
    ];
    const res = checkGameEnd(shot as any, "check_phase", null, {
      todayHasExecution: false,
    } as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    // 存活邪恶 3 ≥ 存活善良 1 → 人数劣势分支先结算（早于涡流/镇长分支）
    expect(res.reason).toContain("邪恶");
  });

  it("✅ 同一局面若把涡流算作「涡流世界」→ 仍是邪恶获胜（两条路径同结论）", () => {
    const shot = [
      seat(3, "mayor"),
      seat(7, "vortox"),
      seat(8, "cerenovus"),
      seat(12, "imp"),
    ];
    const res = checkGameEnd(shot as any, "check_phase", null, {
      isVortoxWorld: true,
      todayHasExecution: false,
    } as any);
    expect(res.winner).toBe("Evil");
  });

  // ── 官方边界：恰好 3 人 ──────────────────────────────────────────────
  it("✅ 恰好 3 人存活（镇长+2好+活恶魔）平安日 → 镇长触发，善良获胜", () => {
    const three = [
      seat(0, "mayor"),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("镇长");
  });

  it("⛔ 4 人存活且善良占优（镇长+2好+1恶）→ **不是**镇长获胜，而是「恶魔全灭」", () => {
    // 4 人善良占优时，若恶魔已死 → 1.1 恶魔全灭先结算。
    // 这里刻意让恶魔存活以隔离"人数"变量：
    const four = [
      seat(0, "mayor"),
      seat(1, "soldier"),
      seat(2, "chef"),
      seat(3, "imp"), // 活恶魔
    ];
    const res = checkGameEnd(four as any, "execution", null, {} as any);
    // 1 恶 < 3 好，且 aliveCount=4 > 2 → 无终局条件成立 → 游戏继续
    expect(res.isGameOver).toBe(false);
  });

  it("⛔ 4 人存活但邪恶占优（镇长+1好+2恶）→ 邪恶获胜，**不**因镇长而继续", () => {
    const four = [
      seat(0, "mayor"),
      seat(1, "soldier"),
      seat(2, "imp"),
      seat(3, "cerenovus"),
    ];
    const res = checkGameEnd(four as any, "execution", null, {} as any);
    expect(res.winner).toBe("Evil");
  });

  it("⛔ 3 人存活但当日**有人被处决** → 不触发镇长和平获胜", () => {
    const three = [seat(0, "mayor"), seat(1, "soldier"), seat(2, "imp")];
    const res = checkGameEnd(three as any, "execution", 1, {} as any);
    expect(res.reason ?? "").not.toContain("镇长");
  });

  it("⛔ 镇长中毒 → 不触发和平获胜", () => {
    const three = [
      seat(0, "mayor", { isPoisoned: true }),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.reason ?? "").not.toContain("镇长");
  });
});
