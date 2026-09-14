import { describe, expect, it } from "vitest";
import { getRegistration } from "../../utils/gameRules";
import { r, seat } from "./_tbHarness";

/**
 * 陌客 (Recluse) —— 官方：
 * 【角色能力】你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。
 * 【角色简介】如果任何角色的能力会探查或影响邪恶玩家，陌客可能会被那名角色当作邪恶阵营。
 */
describe("陌客 (Recluse)", () => {
  const recluse = seat(0, "recluse");

  it("默认注册为**邪恶**，且同时可注册为恶魔与爪牙（官方：三者皆可能）", () => {
    const reg = getRegistration(recluse as any);
    expect(reg.alignment).toBe("Evil");
    expect(reg.registersAsDemon, "陌客应可被当作恶魔").toBe(true);
    expect(reg.registersAsMinion, "陌客应可被当作爪牙").toBe(true);
  });

  it("说书人手动指定 `registerAsEvil = false` 时，注册为**善良外来者**", () => {
    const reg = getRegistration({ ...recluse, registerAsEvil: false } as any);
    expect(reg.alignment).toBe("Good");
    expect(reg.roleType).toBe("outsider");
    expect(reg.registersAsDemon).toBe(false);
    expect(reg.registersAsMinion).toBe(false);
  });

  it("官方「即使你已死亡」→ 死亡不改变其注册结果", () => {
    const dead = getRegistration({ ...recluse, isDead: true } as any);
    expect(dead.alignment).toBe("Evil");
    expect(dead.registersAsDemon).toBe(true);
  });

  it("真值侧仍是外来者（注册是「被当作」，不是真变）", () => {
    expect(r("recluse").type).toBe("outsider");
  });
});
