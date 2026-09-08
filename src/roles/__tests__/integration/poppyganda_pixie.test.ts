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

  it("首夜 targetConfig 必须为 { min: 0, max: 0 } 无需选择目标", () => {
    expect(pixieAbility.targetConfig.min).toBe(0);
    expect(pixieAbility.targetConfig.max).toBe(0);
  });

  it("醉酒/中毒/涡流：告知一个不在场的镇民角色（虚假信息）", async () => {
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
    // 醉酒/中毒时必须告知不在场的角色
    expect(["librarian", "chef"]).not.toContain(r.roleId);
    expect(res.meta.displayInfo?.log).toContain(r.roleName);
  });

  it("死亡触发阶段：当临摹镇民死亡时，小精灵角色不变并获得能力", async () => {
    const { checkAndUpdatePixieAbility } = await import("../../../utils/pixieHelper");
    const seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk", {
        pixieMadnessRoleId: "fortune_teller",
        pixieMadnessRoleName: "占卜师",
      }),
      makeSeat(1, "fortune_teller", "townsfolk", { isDead: true, isAlive: false }),
      makeSeat(2, "chef", "townsfolk"),
    ];

    const logs: string[] = [];
    const updatedSeats = checkAndUpdatePixieAbility(seats, (msg) => logs.push(msg));

    const pixieSeat = updatedSeats.find((s) => s.id === 0);
    // 角色依然是小精灵，不改变
    expect(pixieSeat?.role?.id).toBe("pixie");
    // 获得占卜师能力
    expect((pixieSeat as any).pixieCopiedRole).toBe("fortune_teller");
    expect((pixieSeat as any).pixieHasAbility).toBe(true);
    expect((pixieSeat as any).statusDetails).toContain("能力已激活");
    expect((pixieSeat as any).statusDetails).toContain("获得死去镇民能力:占卜师");
    expect(logs.length).toBeGreaterThan(0);
  });

  it("后续夜晚队列：临摹镇民死后，小精灵在原角色的顺位被唤醒", async () => {
    const { generateDynamicNightQueue } = await import("../../../utils/dynamicQueueGenerator");
    const { ENGINE_CONFIG } = await import("../../../hooks/useNightEngine");
    const { checkAndUpdatePixieAbility } = await import("../../../utils/pixieHelper");

    let seats: Seat[] = [
      makeSeat(0, "pixie", "townsfolk", {
        pixieMadnessRoleId: "fortune_teller",
        pixieMadnessRoleName: "占卜师",
      }),
      makeSeat(1, "fortune_teller", "townsfolk", { isDead: true, isAlive: false }),
      makeSeat(2, "imp", "demon"),
    ];

    // 占卜师死亡激活小精灵能力
    seats = checkAndUpdatePixieAbility(seats);

    const snapshot: any = {
      seats,
      gamePhase: "night",
      nightCount: 2,
      hasCompletedFirstNight: true,
    };

    const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, {
      isFirstNight: false,
    });

    // 队列中应包含 0 号小精灵执行占卜师能力
    const ftNode = queue.find((n) => n.roleId === "fortune_teller");
    expect(ftNode).toBeDefined();
    expect(ftNode?.seatId).toBe(0); // 小精灵的座位号
  });
});
