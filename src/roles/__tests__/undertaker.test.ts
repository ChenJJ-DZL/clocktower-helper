import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { board, nightInfoFor, queueFor } from "./_tbHarness";

/**
 * 送葬者 (Undertaker) —— 官方：
 * 【角色能力】每个夜晚*，你会得知今天白天死于**处决**的玩家的角色。
 * 【角色简介】「只有死于处决的玩家才会被送葬者得知是哪一种角色。」
 *   「送葬者会在**除首个夜晚以外**的每晚醒来，因为在首个夜晚之前不会有任何处决发生。」
 *   若当天无人死于处决 → 不唤醒（`requiresExecutedToday` 门控）。
 */
describe("送葬者 (Undertaker)", () => {
  initializeAbilityRegistry();

  /** 位 1 已被处决死亡 */
  const executedBoard = () => {
    const seats = board(["undertaker", "saint", "chef", "imp", "poisoner"]);
    seats[1] = { ...seats[1], isDead: true, executedToday: true };
    return seats;
  };

  it("⭐ 首夜不唤醒（官方：首个夜晚之前不会有任何处决）", () => {
    const seats = executedBoard();
    expect(queueFor(seats, 0, 1, { todayExecutedId: 1 })).not.toContain(
      "undertaker"
    );
  });

  it("⭐⭐ 当天**无人**死于处决 → 第 2 / 3 夜也不唤醒（不白跑一趟）", () => {
    const seats = board(["undertaker", "chef", "empath", "imp", "poisoner"]);
    expect(queueFor(seats, 0, 2)).not.toContain("undertaker");
    expect(queueFor(seats, 0, 3)).not.toContain("undertaker");
  });

  it("⭐⭐ 当天有人死于处决 → 第 2 / 3 夜唤醒", () => {
    const seats = executedBoard();
    for (const night of [2, 3]) {
      expect(
        queueFor(seats, 0, night, { todayExecutedId: 1 }),
        `第${night}夜应唤醒`
      ).toContain("undertaker");
    }
  });

  it("⭐ 唤醒后给出被处决玩家的**角色名**（不是座位名）", () => {
    const seats = executedBoard();
    const { guide } = nightInfoFor(seats, 0, 2);
    expect(guide).toMatch(/圣徒/);
  });

  it("⭐ 官方：处决以外方式死亡（如夜杀）不算 —— 只看 executedToday 标记", () => {
    // 有人夜里死了，但没有处决标记 → 不唤醒
    const nightDeath = board(["undertaker", "chef", "empath", "imp", "poisoner"]);
    nightDeath[1] = { ...nightDeath[1], isDead: true, };
    expect(
      queueFor(nightDeath, 0, 2, { deadThisNight: [1] })
    ).not.toContain("undertaker");
  });
});
