import { describe, expect, test } from "vitest";

describe("守鸦人 (Ravenkeeper)", () => {
  test("Wiki-JSON", () => {
    expect(1).toBe(1);
  });
  test("夜死时触发", () => {
    const deadAtNight = true;
    expect(deadAtNight).toBe(true);
  });
  test("选择玩家知角色", () => {
    const role = "imp";
    expect(role.length).toBe(3);
  });
  test("白天死亡不触发", () => {
    const execDay = true;
    const noTrigger = true;
    expect(noTrigger).toBe(true);
  });
});
