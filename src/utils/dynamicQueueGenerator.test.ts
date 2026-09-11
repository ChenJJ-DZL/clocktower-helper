import { describe, expect, test } from "vitest";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "./dynamicQueueGenerator";
import { EVIL_CONVERTED_NOTICE_ID } from "./nightStepIds";

function seat(id: number, roleId: string, opts: any = {}) {
  return {
    id,
    role: { id: roleId, name: roleId, type: opts.type ?? "townsfolk" },
    charadeRole: opts.charadeRole ?? null,
    isDead: opts.isDead ?? false,
    isAlive: !(opts.isDead ?? false),
  };
}

/** 测试用的厨师夜间条目（多个 describe 共用，故置于模块作用域） */
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

describe("dynamicQueueGenerator", () => {
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

describe("赏金猎人「阵营告知」步骤（官方：首夜立即告知其已属于邪恶阵营）", () => {
  const mkConverted = (id: number) => ({
    ...seat(id, "chef"),
    isEvilConverted: true,
    alignment: "evil",
    statusDetails: ["转为邪恶"],
  });

  test("首夜：告知步骤排在其他夜间信息之前，且行动者 = 被转变的那名镇民", () => {
    const snapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [
        seat(0, "bounty_hunter"),
        mkConverted(1),
        seat(2, "imp", { type: "demon" }),
      ],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: true,
    });
    expect(queue.length).toBeGreaterThanOrEqual(2);
    // 第一步就是阵营告知（官方强调"在给出其他夜晚信息之前"）
    expect(queue[0].roleId).toBe(EVIL_CONVERTED_NOTICE_ID);
    expect(queue[0].seatId).toBe(1);
    // 厨师的夜间信息被排在它之后
    expect(queue[queue.length - 1].roleId).toBe("chef");
  });

  test("没有人被转变为邪恶时不生成该步骤", () => {
    const snapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [seat(0, "bounty_hunter"), seat(1, "chef"), seat(2, "imp", { type: "demon" })],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: true,
    });
    expect(queue.some((n) => n.roleId === EVIL_CONVERTED_NOTICE_ID)).toBe(false);
  });

  test("非首夜不生成该步骤（告知只在首夜发生一次）", () => {
    const snapshot = {
      nightCount: 2,
      gamePhase: "night",
      seats: [seat(0, "bounty_hunter"), mkConverted(1), seat(2, "imp", { type: "demon" })],
      statusEffects: {},
    };
    const queue = generateDynamicNightQueue([chefEntry], snapshot as any, {
      isFirstNight: false,
    });
    expect(queue.some((n) => n.roleId === EVIL_CONVERTED_NOTICE_ID)).toBe(false);
  });
});

