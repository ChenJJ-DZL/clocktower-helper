import { describe, expect, it } from "vitest";
import {
  getDemonKillImmunityType,
  isImmuneToDemonKill,
  isMayorSeat,
  isSoldierSeat,
} from "../../utils/soldierImmunity";
import { seat } from "./_tbHarness";

/**
 * 士兵 (Soldier) —— 官方：
 * 【角色能力】恶魔的负面能力对你无效。
 * 【角色简介】士兵无法因为恶魔的能力而死去。因此，如果小恶魔在夜晚攻击士兵，
 *   无事发生，没有任何人会死亡。**即使发起提名的玩家是恶魔，士兵仍然会因为处决而死亡。**
 *   （即：免疫只针对"恶魔的能力"，不针对处决）
 */
describe("士兵 (Soldier)", () => {
  it("存活且清醒健康的士兵，免疫恶魔击杀", () => {
    expect(isSoldierSeat(seat(0, "soldier"))).toBe(true);
    expect(isImmuneToDemonKill(seat(0, "soldier"))).toBe(true);
  });

  it("中毒 / 醉酒的士兵失去免疫（官方：能力失效）", () => {
    expect(
      isImmuneToDemonKill(
        seat(0, "soldier", { statusEffects: [{ type: "poisoned" }] })
      ),
      "中毒士兵不应再免疫"
    ).toBe(false);
    expect(
      isImmuneToDemonKill(
        seat(0, "soldier", { statusEffects: [{ type: "drunk", permanent: true }] })
      ),
      "醉酒士兵不应再免疫"
    ).toBe(false);
    // 兼容 legacy 布尔位
    expect(isImmuneToDemonKill(seat(0, "soldier", { isPoisoned: true }))).toBe(
      false
    );
    expect(isImmuneToDemonKill(seat(0, "soldier", { isDrunk: true }))).toBe(false);
  });

  it("已死亡的士兵不再免疫（免疫只对存活者成立）", () => {
    expect(isImmuneToDemonKill(seat(0, "soldier", { isDead: true }))).toBe(false);
    expect(getDemonKillImmunityType(seat(0, "soldier", { isDead: true }))).toBeNull();
  });

  it("免疫类型标识：士兵 → soldier", () => {
    expect(getDemonKillImmunityType(seat(0, "soldier"))).toBe("soldier");
  });

  it("免疫是**士兵专属**：其他镇民不免疫", () => {
    for (const rid of ["empath", "chef", "mayor", "virgin"]) {
      expect(isImmuneToDemonKill(seat(0, rid)), `${rid} 不应免疫恶魔击杀`).toBe(
        false
      );
    }
    expect(isSoldierSeat(seat(0, "mayor"))).toBe(false);
    expect(isMayorSeat(seat(0, "soldier"))).toBe(false);
  });
});
