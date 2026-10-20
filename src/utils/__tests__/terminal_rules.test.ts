/**
 * 🏁 终局四条判据测试
 * ======================================================================
 * 判据来源：官方通用胜负
 *   ① 恶魔死 ⇒ 善良胜
 *   ② 存活仅 2 人（旅行者/传奇不计）⇒ 邪恶胜
 *   ③ 同时达成 ⇒ 善良优先
 *   ④ 都不成立 ⇒ 不得终局（expected = null）
 */
import { describe, expect, it } from "vitest";
import { verifyTerminalOutcome } from "../terminalRules";

const s = (id: number, type: string, dead = false) => ({
  id,
  role: { id: `r${id}`, type },
  isDead: dead,
});

describe("终局四条", () => {
  it("恶魔已死 ⇒ 善良胜", () => {
    const r = verifyTerminalOutcome({
      seats: [
        s(0, "townsfolk"),
        s(1, "townsfolk"),
        s(2, "minion"),
        s(3, "demon", true),
      ],
      winner: "good",
    });
    expect(r.ok).toBe(true);
    expect(r.expected).toBe("good");
    expect(r.demonAlive).toBe(false);
  });

  it("恶魔存活 + 存活恰好 2 人 ⇒ 邪恶胜", () => {
    const r = verifyTerminalOutcome({
      seats: [
        s(0, "demon"),
        s(1, "townsfolk"),
        s(2, "townsfolk", true),
        s(3, "minion", true),
      ],
      winner: "evil",
    });
    expect(r.ok).toBe(true);
    expect(r.expected).toBe("evil");
    expect(r.aliveCount).toBe(2);
  });

  it("旅行者不计入存活阈值 ⇒ 3 人（含 1 旅行者）= 实际 2 人 ⇒ 邪恶胜", () => {
    const r = verifyTerminalOutcome({
      seats: [
        s(0, "demon"),
        s(1, "townsfolk"),
        s(2, "traveler"),
        s(3, "townsfolk", true),
      ],
      winner: "evil",
    });
    expect(r.aliveCount).toBe(2);
    expect(r.expected).toBe("evil");
    expect(r.ok).toBe(true);
  });

  it("双方同时达成 ⇒ 善良优先", () => {
    // 恶魔已死 + 存活仅 2 人
    const r = verifyTerminalOutcome({
      seats: [s(0, "townsfolk"), s(1, "minion"), s(2, "demon", true)],
      winner: "good",
    });
    expect(r.expected).toBe("good");
    expect(r.ok).toBe(true);
  });

  it("判反 ⇒ 报红并说明原因", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon"), s(1, "townsfolk"), s(2, "townsfolk", true)],
      winner: "good",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("判反");
  });

  it("四条都不成立且无胜因 ⇒ 不得终局", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon"), s(1, "townsfolk"), s(2, "minion")],
      winner: "evil",
    });
    expect(r.expected).toBeNull();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没有依据");
  });

  it("UI 没有胜方文字 ⇒ 报红", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon", true), s(1, "townsfolk"), s(2, "minion")],
      winner: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没有可读的胜方");
  });
  it("四条都不成立，但胜因是专属规则（圣徒被处决）⇒ 合法终局", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon"), s(1, "townsfolk"), s(2, "minion"), s(3, "saint", true)],
      winner: "evil",
      winReason: "圣徒被处决",
    });
    expect(r.ok).toBe(true);
    expect(r.special).toBe(true);
    expect(r.expected).toBeNull();
  });

  it("四条都不成立，胜因是剧本级自动获胜（游园惊梦）⇒ 合法终局", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon"), s(1, "townsfolk"), s(2, "townsfolk"), s(3, "minion")],
      winner: "evil",
      winReason: "游园惊梦：固定天数后自动获胜",
    });
    expect(r.ok).toBe(true);
    expect(r.special).toBe(true);
  });

  it("四条都不成立且胜因是自造文案 ⇒ 仍然报红", () => {
    const r = verifyTerminalOutcome({
      seats: [s(0, "demon"), s(1, "townsfolk"), s(2, "townsfolk"), s(3, "minion")],
      winner: "evil",
      winReason: "我觉得该结束了",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("没有依据");
  });
});
