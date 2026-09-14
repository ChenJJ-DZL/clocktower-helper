import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { board, nightInfoFor, queueFor } from "./_tbHarness";

/**
 * 图书管理员 (Librarian) —— 官方：
 * 【角色能力】在你的**首个夜晚**，你会得知两名玩家和一个外来者角色：
 *   这两名玩家之一是该角色（**或者你会得知没有外来者在场**）。
 */
describe("图书管理员 (Librarian)", () => {
  initializeAbilityRegistry();
  const withOutsider = () =>
    board(["librarian", "saint", "chef", "imp", "poisoner"]);
  const noOutsider = () => board(["librarian", "chef", "empath", "imp", "poisoner"]);

  it("首夜唤醒；第 2 / 3 夜不再唤醒（官方「在你的首个夜晚」）", () => {
    const seats = withOutsider();
    expect(queueFor(seats, 0, 1)).toContain("librarian");
    expect(queueFor(seats, 0, 2)).not.toContain("librarian");
    expect(queueFor(seats, 0, 3)).not.toContain("librarian");
  });

  it("⭐ 场上有外来者 → 给出「X号和Y号其中一位是【外来者】」", () => {
    const { guide } = nightInfoFor(withOutsider(), 0, 1);
    expect(guide).toMatch(/其中一位是/);
    expect(guide, "应指向场上真实存在的外来者").toMatch(/圣徒/);
    expect(guide, "必须给出两名玩家").toMatch(/\d+号.*\d+号/);
  });

  it("⭐⭐ 场上**没有**外来者 → 必须明说「没有外来者在场」（官方明文分支）", () => {
    const { guide } = nightInfoFor(noOutsider(), 0, 1);
    expect(guide, `无外来者分支未命中，实际文案：${guide}`).toMatch(
      /没有外来者/
    );
  });

  it("被干扰（中毒）时仍会唤醒，但不得给出与常态相同的真值文案", () => {
    const seats = withOutsider();
    expect(queueFor(seats, 0, 1)).toContain("librarian");
    const poisoned = seats.map((s) =>
      s.id === 0
        ? { ...s, statusEffects: [{ type: "poisoned", source: "poisoner" }] }
        : s
    );
    const normal = nightInfoFor(seats, 0, 1).guide;
    const corrupted = nightInfoFor(poisoned, 0, 1).guide;
    expect(corrupted).not.toBe(normal);
  });
});
