import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { seat } from "./_tbHarness";

/**
 * 圣徒 (Saint) —— 官方：
 * 【角色能力】如果你**死于处决**，你的阵营落败。
 * 【角色简介】「如果圣徒因处决而死亡，游戏结束。善良阵营落败，邪恶阵营获胜。
 *   如果圣徒因处决以外的任何方式死亡——例如被恶魔杀死——游戏仍会继续。」
 *
 * ⚠️ 造局注意：`checkGameEnd` 里 **存活邪恶 ≥ 存活善良** 会先判邪恶获胜，
 *    所以验证"圣徒被处决"之外的场景必须保证善良方人数占优，
 *    否则会因人数判据提前返回 Evil（看起来像圣徒触发，实为人数判据）。
 */
describe("圣徒 (Saint)", () => {
  /** 5 席：1 邪恶 vs 3 善良（人数占优，避免误触人数判据） */
  const live = () => [
    seat(0, "saint"),
    seat(1, "imp"),
    seat(2, "empath"),
    seat(3, "chef"),
    seat(4, "mayor"),
  ];

  it("⭐⭐ 圣徒被处决 → 游戏立即结束，**邪恶获胜**", () => {
    const res = checkGameEnd(live() as any, "execution", 0);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reason).toContain("圣徒");
  });

  it("⭐ 圣徒被**恶魔杀死**（非处决）→ 游戏继续", () => {
    const seats = live();
    seats[0] = { ...seats[0], isDead: true, };
    const res = checkGameEnd(seats as any, "night_death", null);
    expect(res.isGameOver, "夜杀圣徒不应结束游戏").toBe(false);
    expect(res.reason ?? "").not.toContain("圣徒");
  });

  it("被处决的是别人 → 与圣徒无关", () => {
    const res = checkGameEnd(live() as any, "execution", 2);
    expect(res.reason ?? "").not.toContain("圣徒");
  });

  it("中毒 / 醉酒的圣徒被处决 → 能力失效，邪恶不因圣徒获胜", () => {
    // ⚠️ 判据用 `isPoisoned` 布尔位（生产由 computeIsPoisoned 在缝合处同步），
    //    只写 statusEffects 不足以表达"已中毒"。
    const poisoned = live();
    poisoned[0] = {
      ...poisoned[0],
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "poisoner" }],
    };
    const res = checkGameEnd(poisoned as any, "execution", 0);
    expect(res.reason ?? "").not.toContain("圣徒");
  });

  it("醉酒的圣徒被处决 → 同样不触发", () => {
    const drunkSaint = live();
    drunkSaint[0] = { ...drunkSaint[0], isDrunk: true };
    const res = checkGameEnd(drunkSaint as any, "execution", 0);
    expect(res.reason ?? "").not.toContain("圣徒");
  });
});
