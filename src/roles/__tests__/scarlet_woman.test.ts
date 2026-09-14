import { describe, expect, it } from "vitest";
import { shouldScarletWomanTransform } from "../../utils/gameRules";
import { seat } from "./_tbHarness";

/**
 * 红唇女郎 (Scarlet Woman) —— 官方原文（`officialRoleDocs.json`）：
 * 【角色能力】如果大于等于五名玩家存活时（**旅行者不计算在内**）恶魔死亡，你变成那个恶魔。
 * 【角色简介】「如果在恶魔**死前**有五名或更多的玩家存活；或者说，如果在恶魔**死后**有
 *   **四名**或更多的玩家存活，那么红唇女郎会立刻变成恶魔。」
 *   范例：「有五名玩家存活：小恶魔，红唇女郎，男爵，两名镇民。小恶魔被处决。
 *          红唇女郎变成了小恶魔，且游戏继续。」
 *   「（前提是，红唇女郎此时能力正常生效）」
 *
 * ⚠️ 本函数在恶魔**已死亡之后**调用 → 阈值必须用**死后口径 4**。
 *   修复前写的是 `>= 5`（=要求死前 >= 6），上例会被误判为不触发 → 改判胜负。
 */
describe("红唇女郎 (Scarlet Woman)", () => {
  /** 官方范例场景：恶魔已死，死后存活 4 人 = 死前 5 人 */
  const officialExample = () => [
    seat(0, "imp", { isDead: true }),
    seat(1, "scarlet_woman"),
    seat(2, "baron"),
    seat(3, "empath"),
    seat(4, "chef"),
  ];

  it("⭐ 官方范例：死前 5 人（死后 4 人）恶魔死亡 → 红唇女郎继任", () => {
    const sw = shouldScarletWomanTransform(officialExample());
    expect(sw, "官方范例必须触发继任").not.toBeNull();
    expect(sw?.role?.id).toBe("scarlet_woman");
  });

  it("死后只剩 3 人（死前 4 人）→ 不触发，游戏应结束（善良获胜）", () => {
    const seats = [
      seat(0, "imp", { isDead: true }),
      seat(1, "scarlet_woman"),
      seat(2, "baron"),
      seat(3, "empath"),
    ];
    expect(shouldScarletWomanTransform(seats)).toBeNull();
  });

  it("官方「旅行者不计算在内」：存活 4 人但含旅行者 → 不触发", () => {
    const seats = [
      seat(0, "imp", { isDead: true }),
      seat(1, "scarlet_woman"),
      seat(2, "baron"),
      seat(3, "empath"),
      { ...seat(4, "empath"), role: { id: "scapegoat", name: "替罪羊", type: "traveler" } },
    ];
    expect(shouldScarletWomanTransform(seats as any)).toBeNull();
  });

  it("官方前提「能力正常生效」：醉酒 / 中毒的红唇女郎不继任", () => {
    const drunk = officialExample().map((s) =>
      s.id === 1 ? { ...s, isDrunk: true } : s
    );
    expect(shouldScarletWomanTransform(drunk)).toBeNull();

    const poisoned = officialExample().map((s) =>
      s.id === 1
        ? { ...s, statusEffects: [{ type: "poisoned" }] }
        : s
    );
    expect(
      shouldScarletWomanTransform(poisoned),
      "状态位形式的中毒也必须拦住"
    ).toBeNull();
  });

  it("场上仍有存活恶魔 → 无需继任", () => {
    const seats = officialExample();
    seats[0] = seat(0, "imp"); // 恶魔复活（存活）
    expect(shouldScarletWomanTransform(seats)).toBeNull();
  });

  it("已是恶魔继任者 → 不重复继任", () => {
    const seats = officialExample().map((s) =>
      s.id === 1 ? { ...s, isDemonSuccessor: true } : s
    );
    expect(shouldScarletWomanTransform(seats)).toBeNull();
  });
});
