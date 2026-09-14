import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { countChefEvilPairsForUi } from "../new_engine/chef.ability";
import { board, nightInfoFor, queueFor, seat } from "./_tbHarness";

/**
 * 厨师 (Chef) —— 官方：
 * 【角色能力】在你的**首个夜晚**，你会得知场上邻座的邪恶玩家有多少对。
 * 【角色简介】「两名相邻而坐的玩家为一对，然而每名玩家都能分别与两侧的玩家各
 *   组成一对。因此，两名相邻而坐的玩家是一对，三名相邻而坐的玩家是两对，
 *   四名相邻而坐的玩家是……」
 * 【规则细节】「厨师的能力探查的是相邻玩家，且**并未加"存活"这一附加条件**。」
 */
describe("厨师 (Chef)", () => {
  initializeAbilityRegistry();

  /** 位 0 厨师；邪恶位于位 1、2（相邻） */
  const adjacentEvil = () =>
    board(["chef", "imp", "poisoner", "empath", "soldier"]);
  /** 邪恶不相邻：位 1 与位 3 */
  const apartEvil = () => board(["chef", "imp", "empath", "poisoner", "soldier"]);

  it("首夜唤醒；第 2 / 3 夜不再唤醒（官方「在你的首个夜晚」）", () => {
    const seats = adjacentEvil();
    expect(queueFor(seats, 0, 1)).toContain("chef");
    expect(queueFor(seats, 0, 2)).not.toContain("chef");
    expect(queueFor(seats, 0, 3)).not.toContain("chef");
  });

  it("⭐⭐ 两名邪恶相邻 → 1 对", () => {
    expect(countChefEvilPairsForUi(adjacentEvil())).toBe(1);
    const { guide } = nightInfoFor(adjacentEvil(), 0, 1);
    expect(guide).toMatch(/1\s*对/);
  });

  it("⭐ 两名邪恶不相邻 → 0 对", () => {
    const seats = apartEvil();
    expect(countChefEvilPairsForUi(seats)).toBe(0);
    expect(nightInfoFor(seats, 0, 1).guide).toMatch(/0\s*对/);
  });

  it("⭐ 环形座位：首尾相邻也要计入", () => {
    // 位 1 与位 4 隔着位 0（不相邻）→ 0 对
    const apart = board(["chef", "imp", "empath", "soldier", "poisoner"]);
    expect(countChefEvilPairsForUi(apart)).toBe(0);
    // 位 0 与位 4 在**环形**上相邻 → 1 对（线性排列会漏掉这一对）
    const wrap = board(["imp", "empath", "soldier", "soldier", "poisoner"]);
    expect(
      countChefEvilPairsForUi(wrap),
      "圆形座位：最后一个座位与第一个座位也构成一对"
    ).toBe(1);
  });

  it("⭐ 官方「未加存活这一附加条件」→ 已死亡玩家仍参与计算", () => {
    const seats = adjacentEvil();
    seats[1] = { ...seats[1], isDead: true, };
    expect(
      countChefEvilPairsForUi(seats),
      "死者仍应计入相邻邪恶对"
    ).toBe(1);
  });

  it("⭐ 陌客登记为邪恶时可被计入（官方范例：说书人可给出正确信息）", () => {
    const seats = board(["chef", "recluse", "poisoner", "empath", "soldier"]);
    // 陌客默认登记为邪恶 → 与投毒者相邻 → 1 对
    expect(countChefEvilPairsForUi(seats)).toBe(1);
  });

  it("中毒时给出**不超过棋盘物理上界**的假值（回归：旧实现会给出 5 对）", () => {
    const seats = board(["chef", "imp", "poisoner", "empath", "soldier"]);
    const cap = Math.max(0, 2 - 1); // 邪恶 2 人 → 相邻对物理上界 1
    const poisoned = seats.map((s) =>
      s.id === 0
        ? { ...s, statusEffects: [{ type: "poisoned", source: "poisoner" }] }
        : s
    );
    const n = Number(
      String(nightInfoFor(poisoned, 0, 1).guide).match(/有\s*(\d+)\s*对/)?.[1]
    );
    expect(n).not.toBeNaN();
    expect(n, `假对数 ${n} 不应超过棋盘上界 ${cap}`).toBeLessThanOrEqual(cap);
  });

  it("座位号对外一律「N号」：角色卡不存在 0 号", () => {
    const s = seat(0, "chef");
    expect(s.id).toBe(0);
    // 对外展示永远是 id + 1
    expect(s.id + 1).toBe(1);
  });
});
