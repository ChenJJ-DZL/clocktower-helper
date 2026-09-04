import { describe, expect, it } from "vitest";
import type { Seat } from "../../src/types/game";
import { generateDynamicNightQueue } from "../../src/utils/dynamicQueueGenerator";
import { nightOrderParser } from "../../src/utils/nightOrderParser";
import { jugglerAbility } from "../../src/roles/new_engine/juggler.ability";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";

describe("杂耍艺人（Juggler）白天判定与当晚唤醒告知流程", () => {
  const fullNightOrder = [
    ...nightOrderParser.getFirstNightOrder().map((item) => ({
      roleId: item.roleId,
      roleName: item.roleName || item.roleId,
      firstNightPriority: item.firstNightOrder,
      otherNightPriority: item.otherNightOrder,
      firstNightOnly: true,
      wakeMessage: item.wakeCondition || "",
      abilityId: `${item.roleId}_night_ability`,
    })),
    ...nightOrderParser.getOtherNightOrder().map((item) => ({
      roleId: item.roleId,
      roleName: item.roleName || item.roleId,
      firstNightPriority: item.firstNightOrder,
      otherNightPriority: item.otherNightOrder,
      firstNightOnly: false,
      wakeMessage: item.wakeCondition || "",
      abilityId: `${item.roleId}_night_ability`,
    })),
  ];

  it("首夜杂耍艺人绝不入队", () => {
    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
        roleId: "juggler",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
      } as any,
    ];

    const snapshot: any = {
      nightCount: 1,
      seats,
      gamePhase: "firstNight",
    };

    const queue = generateDynamicNightQueue(fullNightOrder, snapshot, {
      isFirstNight: true,
    });
    const hasJuggler = queue.some((node) => node.roleId === "juggler");
    expect(hasJuggler).toBe(false);
  });

  it("非首夜如果白天没有使用技能，杂耍艺人不入队", () => {
    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
        roleId: "juggler",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        hasUsedDayAbility: false,
      } as any,
    ];

    const snapshot: any = {
      nightCount: 2,
      seats,
      gamePhase: "night",
    };

    const queue = generateDynamicNightQueue(fullNightOrder, snapshot, {
      isFirstNight: false,
    });
    const hasJuggler = queue.some((node) => node.roleId === "juggler");
    expect(hasJuggler).toBe(false);
  });

  it("白天说书人记录猜对 3 次后，当晚非首夜杂耍艺人成功入队", () => {
    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
        roleId: "juggler",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "JUGGLER_JUDGE",
          correctCount: 3,
          message: "杂耍艺人公开猜测：得知的数字为 3",
        },
      } as any,
    ];

    const snapshot: any = {
      nightCount: 2,
      seats,
      gamePhase: "night",
    };

    const queue = generateDynamicNightQueue(fullNightOrder, snapshot, {
      isFirstNight: false,
    });
    const hasJuggler = queue.some((node) => node.roleId === "juggler");
    expect(hasJuggler).toBe(true);
  });

  it("当晚执行杂耍艺人夜间能力，正确读取记录的数字并输出【得知的数字为X】", async () => {
    const seats: Seat[] = [
      {
        id: 3,
        role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
        roleId: "juggler",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "JUGGLER_JUDGE",
          correctCount: 3,
        },
      } as any,
    ];

    const ctx: any = {
      actionNode: {
        seatId: 3,
        roleId: "juggler",
        abilityId: "juggler_guess",
        otherNightPriority: 100,
        timing: "night",
      },
      snapshot: {
        gamePhase: "night",
        nightCount: 2,
        seats,
      },
      meta: {},
    };

    const pipe = {
      preCheck: jugglerAbility.preCheck,
      calculate: jugglerAbility.calculate,
      stateUpdate: jugglerAbility.stateUpdate,
      postProcess: jugglerAbility.postProcess,
    };

    const res = await runFullAbilityPipeline(pipe, ctx);
    expect(res.aborted).toBeFalsy();
    expect(res.meta.displayInfo).toBeDefined();
    expect(res.meta.displayInfo.type).toBe("juggler_info");
    expect(res.meta.displayInfo.log).toContain("得知的数字为3");
  });

  it("猜对 0 次时同样正确告知【得知的数字为0】", async () => {
    const seats: Seat[] = [
      {
        id: 1,
        role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
        roleId: "juggler",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "JUGGLER_JUDGE",
          correctCount: 0,
        },
      } as any,
    ];

    const ctx: any = {
      actionNode: {
        seatId: 1,
        roleId: "juggler",
        abilityId: "juggler_guess",
        otherNightPriority: 100,
        timing: "night",
      },
      snapshot: {
        gamePhase: "night",
        nightCount: 2,
        seats,
      },
      meta: {},
    };

    const pipe = {
      preCheck: jugglerAbility.preCheck,
      calculate: jugglerAbility.calculate,
      stateUpdate: jugglerAbility.stateUpdate,
      postProcess: jugglerAbility.postProcess,
    };

    const res = await runFullAbilityPipeline(pipe, ctx);
    expect(res.aborted).toBeFalsy();
    expect(res.meta.displayInfo.correctCount).toBe(0);
    expect(res.meta.displayInfo.log).toContain("得知的数字为0");
  });
});
