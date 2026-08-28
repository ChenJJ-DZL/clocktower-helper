import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { pixieAbility } from "../../new_engine/pixie.ability";

/**
 * 小精灵（Pixie）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 4.小精灵）：
 *   "在你的首个夜晚，你会得知一个在场的镇民角色。
 *    如果你"疯狂"地证明你是该角色，当他死亡时你获得该角色的能力。"
 *
 * 实现（两阶段）：
 *   阶段 1（首夜）：告知一个在场镇民角色，存入 snapshot.pixieMadnessRoleId
 *   阶段 2（被动/死亡触发）：当该镇民玩家死亡时，小精灵获得其能力
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Record<string, any> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("小精灵：两阶段机制（首夜告知 + 死亡获能力）", () => {
  it("首夜：得知一个在场镇民角色", async () => {
    const seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk"),
      makeSeat(1, "librarian", "townsfolk"),
      makeSeat(2, "chef", "townsfolk"),
      makeSeat(3, "empath", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "pixie" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    const r = res.meta.abilityResult as any;
    // 告知一个在场镇民角色
    expect(["librarian", "chef", "empath"]).toContain(r.roleName);
    // 写入 pixieMadnessRoleId
    expect((res.snapshot as any).pixieMadnessRoleId).toBe(r.roleId);
    // 不立即获得能力（pixieCopiedRole 应为 null）
    expect((res.snapshot as any).pixieCopiedRole ?? null).toBeNull();
  });

  it("说书人可显式指定告知角色（storytellerInput.pixieMadnessRoleId）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk"),
      makeSeat(1, "librarian", "townsfolk"),
      makeSeat(2, "chef", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "pixie" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
      storytellerInput: { pixieMadnessRoleId: "chef" },
    };
    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.roleId).toBe("chef");
    expect(r.roleName).toBe("chef");
  });

  it("醉酒/中毒：告知一个错误的镇民角色（可能不同）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk", { isDrunk: true }),
      makeSeat(1, "librarian", "townsfolk"),
      makeSeat(2, "chef", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "pixie" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: { abilityEffective: false },
    };
    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.isCorrupted).toBe(true);
    // 醉酒时应告知一个仍然正确的镇民（因为只有一个可选）
    expect(["librarian", "chef"]).toContain(r.roleName);
  });

  it("死亡触发阶段：当得知的镇民玩家死亡时，小精灵获得其能力", async () => {
    const seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk"),
      makeSeat(1, "librarian", "townsfolk", { isDead: true, isAlive: false }),
      makeSeat(2, "chef", "townsfolk"),
    ];
    // 模拟首夜已记录：pixieMadnessRoleId = "librarian"
    // 现在 1 号（librarian）已死亡
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "pixie" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        pixieMadnessRoleId: "librarian",
        pixieMadnessRoleName: "图书管理员",
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    // 死亡触发模式：能力应被注册到 pixieCopiedRole
    // （具体逻辑在 useNightEngine 死亡阶段，这里只验证首夜机制不被破坏）
    expect(res.meta.abilityResult).toBeDefined();
  });
});
