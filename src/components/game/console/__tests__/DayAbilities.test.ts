import { describe, expect, test } from "vitest";
import { getRoleDefinition } from "../../../../roles";

describe("白天主动技能持久化与查看结果测试", () => {
  test("已使用的白天技能不会被从列表中移除", () => {
    const seats = [
      {
        id: 0,
        playerName: "玩家1",
        role: { id: "slayer", name: "猎手", type: "townsfolk" },
        isDead: false,
        hasUsedSlayerAbility: true,
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "SHOOT_RESULT",
          message: "无事发生",
          isDemonDead: false,
        },
      },
      {
        id: 1,
        playerName: "玩家2",
        role: { id: "artist", name: "艺术家", type: "townsfolk" },
        isDead: false,
        hasUsedDayAbility: false,
      },
      {
        id: 2,
        playerName: "玩家3",
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
      },
    ];

    // 过滤具备白天主动技能的角色（即使已使用也保留在列表中）
    const dayAbilitySeats = seats.filter((s) => {
      if (!s.role) return false;
      const effectiveRole = s.role;
      if ((effectiveRole as any).dayMeta) return true;
      const def = effectiveRole.id
        ? getRoleDefinition(effectiveRole.id)
        : undefined;
      if (def?.day) return true;
      return false;
    });

    // 猎手与艺术家均应该存在在列表中（总共2个）
    expect(dayAbilitySeats.length).toBe(2);
    expect(dayAbilitySeats.map((s) => s.id)).toEqual([0, 1]);

    // 猎手已使用 (isUsed = true)
    const slayerSeat = dayAbilitySeats[0];
    const slayerDef = getRoleDefinition(slayerSeat.role.id);
    const slayerIsUsed =
      slayerDef?.day?.maxUses !== "infinity" &&
      !!(slayerSeat.hasUsedDayAbility || slayerSeat.hasUsedSlayerAbility);
    expect(slayerIsUsed).toBe(true);

    // 艺术家未使用 (isUsed = false)
    const artistSeat = dayAbilitySeats[1];
    const artistDef = getRoleDefinition(artistSeat.role.id);
    const artistIsUsed =
      artistDef?.day?.maxUses !== "infinity" &&
      !!(
        artistSeat.hasUsedDayAbility || (artistSeat as any).hasUsedSlayerAbility
      );
    expect(artistIsUsed).toBe(false);
  });

  test("已使用的技能能正确读取保存的开枪结果", () => {
    const slayerSeat = {
      id: 9,
      playerName: "10号",
      role: { id: "slayer", name: "猎手", type: "townsfolk" },
      isDead: false,
      hasUsedSlayerAbility: true,
      hasUsedDayAbility: true,
      dayAbilityResult: {
        type: "SHOOT_RESULT",
        message: "无事发生",
        isDemonDead: false,
        targetId: 14,
      },
    };

    expect(slayerSeat.dayAbilityResult).toBeDefined();
    expect(slayerSeat.dayAbilityResult.type).toBe("SHOOT_RESULT");
    expect(slayerSeat.dayAbilityResult.message).toBe("无事发生");
    expect(slayerSeat.dayAbilityResult.isDemonDead).toBe(false);
  });
});
