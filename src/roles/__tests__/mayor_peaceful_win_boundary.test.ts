/**
 * 镇长和平获胜 —— 官方规则边界契约（2026-09-15 重写）
 *
 * ============================================================
 * 【官方原文】（Blood on the Clocktower Wiki · Mayor）
 *   "If there are just **three** players alive at the end of the day,
 *    and no execution occurred that day, then the game ends and good wins.
 *    Travellers count as players for the Mayor's victory, so must be exiled first."
 *
 *   ⇒ 两个硬条件：① **恰好 3 名玩家存活**（含旅行者）；② **当日无人被处决**。
 *
 * ============================================================
 * 【用户实测局面】（截图 2026-09-15，15 人罂粟花开 W9.14.1）
 *   场上仅 4 人存活，真实阵营 **2 好 : 2 恶**：
 *     4号  镇长      townsfolk  善良  存活
 *     8号  涡流      **实:疯子** 善良  存活   ← 显示涡流，真身是外来者「疯子」
 *     9号  洗脑师    minion     邪恶  存活
 *     13号 小恶魔    demon      邪恶  存活
 *
 * 【本文件要钉死的事实】
 *   1. **4 人存活 → 镇长不触发**（官方要求 just three）。所以"镇长没救场"
 *      在这一点上**不是** bug。
 *   2. 但引擎当时宣布「邪恶阵营胜利 · 存活邪恶 ≥ 存活善良」是**真 bug**
 *      —— 那条规则不存在（见 `game_end_official_contract.test.ts`）。
 *      修复后该局面正确结果 = **游戏继续**：善良次日仍可提名处决小恶魔翻盘。
 *   3. 镇长**在恰好 3 人局**确实能被正确识别并触发和平获胜（能力本身没坏）。
 *
 * ⚠️ 历史教训（2026-09-15，见 skill §21）：本文件初版曾把
 *    「存活邪恶 ≥ 存活善良」当作官方规则写进断言，替 bug 背书。
 *    根因是**先读自家代码、后查官方原文**。此后规则语义分歧一律先查官方原文。
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { seat } from "./_tbHarness";

describe("🏛️ 镇长和平获胜 —— 官方边界（just three players alive）", () => {
  // ── 用户截图局面：4 人存活 ────────────────────────────────────────────
  it("✅ 截图局面：4 人存活（2 好 : 2 恶）→ 游戏继续，**不**判邪恶胜、镇长也不触发", () => {
    const shot = [
      seat(3, "mayor"), // 4号 镇长（善良，存活）
      seat(7, "lunatic", { apparentDemonRole: "vortox" } as any), // 8号 实:疯子（善良）
      seat(8, "cerenovus"), // 9号 洗脑师（邪恶）
      seat(12, "imp"), // 13号 小恶魔（邪恶）
    ];
    const res = checkGameEnd(shot as any, "check_phase", null, {} as any);
    // 4 人存活：官方两条终局条件（恶魔死 / 仅剩 2 人）均未成立 → 继续
    expect(res.isGameOver).toBe(false);
    expect(res.winner).toBeNull();
  });

  it("✅ 截图局面走「平安日」路径 → 4 人存活，镇长不触发（官方要求 just three）", () => {
    const shot = [
      seat(3, "mayor"),
      seat(7, "lunatic", { apparentDemonRole: "vortox" } as any),
      seat(8, "cerenovus"),
      seat(12, "imp"),
    ];
    const res = checkGameEnd(shot as any, "execution", null, {} as any);
    expect(res.reason ?? "").not.toContain("镇长");
  });

  // ── 官方边界：恰好 3 人 ──────────────────────────────────────────────
  it("✅ 恰好 3 人存活（镇长 + 好 + 活恶魔）平安日 → 镇长触发，善良获胜", () => {
    const three = [seat(0, "mayor"), seat(1, "soldier"), seat(2, "imp")];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("镇长");
  });

  it("✅ 镇长 + 恶魔 + 旅行者（3 人存活，非旅行者仅 2 人）平安日 → **善良获胜**（官方善良优先）", () => {
    // 官方两套计数口径**同时成立**，官方裁定善良优先：
    //   ① Mayor（Wiki 原文）："Travellers count as players for the Mayor's victory"
    //      → 存活 3 人（含旅行者）→ 镇长条件成立 → 善良胜
    //   ② Ending the Game："Evil wins if only two players are left alive
    //      (Travelers and Fabled do not count toward this)" → 非旅行者 2 人 → 邪恶胜
    //   ③ "If both teams would win at the same time, good wins." → **善良胜**
    // ⇒ 旧引擎先结算人数阈值 → 误判邪恶；2026-09-16 修正为善良优先。
    const three = [seat(0, "mayor"), seat(1, "imp"), seat(2, "traveler_official")];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("镇长");
  });

  it("✅ 同上是**反派局**：2 名非旅行者（无镇长）+ 1 名旅行者 → 邪恶胜（人数阈值）", () => {
    // 没有镇长时，善良优先规则不适用：非旅行者仅 2 人 → 官方邪恶胜。
    const three = [seat(0, "soldier"), seat(1, "imp"), seat(2, "traveler_official")];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });

  it("⛔ 镇长 + 恶魔 + 2 名旅行者（4 人存活）→ 非旅行者仅 2 人 → 邪恶胜（镇长要求 just three）", () => {
    // 官方 Mayor 要求**恰好 3 人存活**；4 人不触发，只剩人数阈值。
    const four = [
      seat(0, "mayor"),
      seat(1, "imp"),
      seat(2, "traveler_official"),
      seat(3, "traveler_official"),
    ];
    const res = checkGameEnd(four as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });

  it("⛔ 镇长**中毒** + 恶魔 + 旅行者 → 镇长失效 → 只剩人数阈值 → 邪恶胜", () => {
    // 官方 Mayor Tips：若镇长其实是酒鬼，"你不处决则邪恶获胜"。
    const three = [
      seat(0, "mayor", { isPoisoned: true }),
      seat(1, "imp"),
      seat(2, "traveler_official"),
    ];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });

  it("⛔ 4 人存活（镇长 + 2 好 + 活恶魔）平安日 → 不触发镇长，游戏继续", () => {
    const four = [
      seat(0, "mayor"),
      seat(1, "soldier"),
      seat(2, "chef"),
      seat(3, "imp"), // 活恶魔
    ];
    const res = checkGameEnd(four as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(false);
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

  it("⛔ 镇长醉酒 → 不触发和平获胜", () => {
    const three = [
      seat(0, "mayor", { isDrunk: true }),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.reason ?? "").not.toContain("镇长");
  });

  it("⛔ 镇长已死 → 不触发和平获胜", () => {
    const three = [
      seat(0, "mayor", { isDead: true }),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const res = checkGameEnd(three as any, "execution", null, {} as any);
    expect(res.reason ?? "").not.toContain("镇长");
  });
});
