import { describe, expect, it } from "vitest";
import { roleHasNightAction } from "../dynamicQueueGenerator";

/**
 * 🌺 接线回归 · 队列准入闸门不得误伤真实动态插入点
 *
 * `insertIntoWakeQueueAfterCurrent` 的 9 个调用点会插入这些角色，
 * 闸门必须放行 —— 否则会修坏游侠/方古/猩红女郎/复活/理发师等流程。
 */
describe("🌺 队列准入闸门 · 真实调用点必须放行", () => {
  const mustPass: [string, string][] = [
    ["游侠替换角色(镇民)", "washerwoman"],
    ["游侠替换角色(厨子)", "chef"],
    ["复活座位(士兵)", "soldier"],
    ["新小恶魔", "imp"],
    ["方古跳位", "fang_gu"],
    ["理发师交换", "barber"],
    // ⚠️ 猩红女郎继任时 roleOverride 显式传的是 imp（见 useExecutionHandlers.ts:507），
    //    不是 scarlet_woman 本身 —— 闸门按 override 判定，故必须放行 imp。
    ["猩红女郎继任(override=imp)", "imp"],
    ["守鸦人", "ravenkeeper"],
    ["间谍(死后仍唤醒)", "spy"],
  ];

  for (const [label, id] of mustPass) {
    it(`${label} ${id} 必须放行`, () => {
      expect(roleHasNightAction(id), `${id}(${label}) 不应被闸门拦截`).toBe(
        true
      );
    });
  }

  it("纯被动角色必须拦截", () => {
    expect(roleHasNightAction("poppy_grower")).toBe(false);
    expect(roleHasNightAction("baron")).toBe(false);
  });
});
