import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { board, nightInfoFor, queueFor } from "./_tbHarness";

/**
 * 共情者 (Empath) —— 官方：
 * 【角色能力】每个夜晚，你会得知与你邻近的**两名存活的玩家**中邪恶玩家的数量。
 * 【角色简介】「共情者不会探查已死亡的玩家。因此，如果共情者与一位已死亡玩家
 *   相邻，他不会获取到有关死亡玩家的任何信息。取而代之的是，他会获取与那位
 *   死亡玩家同一方向上**最近的存活玩家**。」
 */
describe("共情者 (Empath)", () => {
  initializeAbilityRegistry();

  /** 位 0 共情者；环形邻居 = 位 4 与位 1 */
  const twoEvilNeighbors = () =>
    board(["empath", "imp", "chef", "soldier", "poisoner"]);
  const oneEvilNeighbor = () =>
    board(["empath", "chef", "soldier", "mayor", "poisoner"]);

  it("三个夜晚都唤醒（官方「每个夜晚」）", () => {
    const seats = twoEvilNeighbors();
    for (const night of [1, 2, 3]) {
      expect(queueFor(seats, 0, night)).toContain("empath");
    }
  });

  it("⭐ 邻近两名邪恶 → 2", () => {
    const n = numOfNight(twoEvilNeighbors());
    expect(n).toBe(2);
  });

  it("⭐ 邻近一名邪恶 → 1", () => {
    expect(numOfNight(oneEvilNeighbor())).toBe(1);
  });

  it("⭐ 邻近全善良 → 0", () => {
    const seats = board(["empath", "chef", "soldier", "mayor", "butler"]);
    expect(numOfNight(seats)).toBe(0);
  });

  it("⭐⭐ 官方：不探查死者 —— 邻居死亡时改看同方向最近的存活玩家", () => {
    // 原局：邻居 = 位4(投毒者,邪恶) 与 位1(小恶魔,邪恶) → 2
    const seats = twoEvilNeighbors();
    // 杀掉位 4 → 该方向改看位 3(士兵,善良)；另一侧位 1(小恶魔) 仍存活 → 1
    seats[4] = { ...seats[4], isDead: true, };
    expect(
      numOfNight(seats),
      "死者不参与，且要沿同方向跳到最近的存活玩家（另一侧仍是邪恶）"
    ).toBe(1);

    // 再把位 1 也杀掉 → 两侧都跳过死者 → 邻居变成位3(士兵)与位2(厨师) → 0
    const bothDead = twoEvilNeighbors();
    bothDead[4] = { ...bothDead[4], isDead: true, };
    bothDead[1] = { ...bothDead[1], isDead: true, };
    expect(numOfNight(bothDead), "两侧死者都跳过后应为 0").toBe(0);
  });

  it("⭐ 信息计数恒在 0~2 之间（官方：只报数量，不报是谁）", () => {
    for (const seats of [twoEvilNeighbors(), oneEvilNeighbor()]) {
      const n = numOfNight(seats);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(2);
    }
  });

  it("中毒时给出与常态不同的（假）数字", () => {
    const seats = oneEvilNeighbor();
    const poisoned = seats.map((s) =>
      s.id === 0
        ? { ...s, statusEffects: [{ type: "poisoned", source: "poisoner" }] }
        : s
    );
    expect(numOfNight(poisoned)).not.toBe(numOfNight(seats));
  });

  function numOfNight(seats: any[]): number {
    const { guide } = nightInfoFor(seats, 0, 1);
    const m = String(guide).match(/有\s*(\d+)\s*名/);
    return m ? Number(m[1]) : NaN;
  }
});
