import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";
import { getRegistration } from "../../utils/gameRules";
import { r, seat } from "./_tbHarness";

/**
 * 间谍 (Spy) —— 官方：
 * 【角色能力】每个夜晚，你能查看魔典。
 *   你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。
 * 【角色简介】间谍知道所有人的具体角色。间谍看起来像是善良一员，但实际上是邪恶的。
 */
describe("间谍 (Spy)", () => {
  // ⚠️ 必须前置：否则 ENGINE_CONFIG.fullNightOrder 会退化（条目缺失 → 假绿）
  initializeAbilityRegistry();

  const spy = seat(0, "spy");

  it("默认注册为**善良镇民**（官方：可能被当作善良阵营 / 镇民角色）", () => {
    const reg = getRegistration(spy as any);
    expect(reg.alignment).toBe("Good");
    expect(reg.roleType).toBe("townsfolk");
    expect(reg.registersAsTownsfolk).toBe(true);
    expect(reg.registersAsOutsider).toBe(true);
  });

  it("真值是邪恶爪牙（注册是「被当作」，不是真变）", () => {
    expect(r("spy").type).toBe("minion");
    const reg = getRegistration(spy as any);
    expect(reg.registersAsDemon, "间谍不应被当作恶魔").toBe(false);
  });

  it("说书人设 `registerAsEvil` / 关闭伪装时，注册回邪恶爪牙", () => {
    const forced = getRegistration({ ...spy, registerAsEvil: true } as any);
    expect(forced.alignment).toBe("Evil");
    expect(forced.roleType).toBe("minion");

    const off = getRegistration(spy as any, null, "off");
    expect(off.alignment).toBe("Evil");
    expect(off.roleType).toBe("minion");
  });

  it("官方「即使你已死亡」：间谍死后仍可被唤醒查看魔典", () => {
    const entry = (ENGINE_CONFIG.fullNightOrder as any[]).find(
      (e) => e.roleId === "spy"
    );
    expect(entry, "夜序表缺少间谍条目").toBeDefined();
    expect(
      entry.deadActorWakes,
      "间谍必须 deadActorWakes=true（唯一死后仍唤醒的角色）"
    ).toBe(true);
  });

  it("间谍在首夜与其他夜晚都应被唤醒（官方「每个夜晚」）", () => {
    expect(spy.isDead).toBe(false);
    const reg = getRegistration({ ...spy, isDead: true } as any);
    expect(reg.alignment, "死亡不改变注册结果").toBe("Good");
  });
});
