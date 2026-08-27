import { describe, expect, test } from "vitest";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "./dynamicQueueGenerator";

function seat(id: number, roleId: string, opts: any = {}) {
  return {
    id,
    role: { id: roleId, name: roleId, type: opts.type ?? "townsfolk" },
    charadeRole: opts.charadeRole ?? null,
    isDead: opts.isDead ?? false,
    isAlive: !(opts.isDead ?? false),
  };
}

describe("dynamicQueueGenerator", () => {
  const chefEntry: NightOrderEntry = {
    roleId: "chef",
    roleName: "厨师",
    firstNightPriority: 1,
    otherNightPriority: 0,
    firstNightOnly: true,
    otherNightOnly: false,
    wakeMessage: "chef_wake",
    abilityId: "chef_first_night_ability",
  };

  test("酒鬼伪装成厨师时按厨师身份入队", () => {
    const snapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [
        seat(0, "washerwoman"),
        seat(1, "drunk", {
          type: "outsider",
          charadeRole: { id: "chef", name: "厨师", type: "townsfolk" },
        }),
      ],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: true,
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].seatId).toBe(1);
    expect(queue[0].roleId).toBe("chef");
  });

  test("首夜角色在其他夜晚直接跳过", () => {
    const snapshot = {
      nightCount: 2,
      gamePhase: "night",
      seats: [seat(0, "chef"), seat(1, "investigator")],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: false,
    });
    expect(queue).toHaveLength(0);
  });

  test("首夜已结束后即使夜序重置为首夜也不再唤醒首夜角色", () => {
    const snapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      hasCompletedFirstNight: true,
      seats: [seat(0, "washerwoman"), seat(1, "chef")],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: true,
    });
    expect(queue).toHaveLength(0);
  });
});
