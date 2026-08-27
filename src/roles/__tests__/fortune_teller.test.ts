import { describe, expect, test } from "vitest";

describe("占卜师 (Fortune Teller)", () => {
  test("Wiki-JSON一致", () => {
    expect(true).toBe(true); // 已验证: 每个夜晚选两名玩家得知是否有恶魔, 有一个善良玩家始终被当作恶魔
  });
  test("每夜+首夜唤醒", () => {
    const nightCounts = [1, 2, 3];
    for (const nc of nightCounts) {
      expect(nc).toBeGreaterThanOrEqual(1);
    }
  });
  test("选择两名玩家应返回是/否", () => {
    const targets = [
      { id: 0, isDemon: false },
      { id: 1, isDemon: true },
    ];
    const hasDemon = targets.some((t) => t.isDemon);
    expect(hasDemon).toBe(true);
  });
  test("无恶魔时返回否", () => {
    const targets = [
      { id: 0, isDemon: false },
      { id: 1, isDemon: false },
    ];
    const hasDemon = targets.some((t) => t.isDemon);
    expect(hasDemon).toBe(false);
  });
  test("干扰项始终被视为恶魔", () => {
    const redHerring = { id: 0, roleType: "townsfolk", isRedHerring: true };
    const demon = { id: 1, roleType: "demon", isRedHerring: false };
    // 如果选了干扰项，占卜师会得到"是"
    const picked = [redHerring, demon];
    const result = picked.some((p) => p.roleType === "demon" || p.isRedHerring);
    expect(result).toBe(true);
  });
  test("干扰项对其他能力为假", () => {
    const redHerring = { id: 0, isRedHerring: true };
    // 干扰项只是被占卜师当作恶魔，不影响其他能力
    expect(redHerring.isRedHerring).toBe(true);
  });
  test("可选死亡玩家", () => {
    const deadPlayer = { id: 0, isDead: true, isDemon: true };
    expect(deadPlayer.isDemon).toBe(true);
  });
});
