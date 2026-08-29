import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../app/data";
import { applyLegionRoleSwap, shouldApplyLegionSwap } from "../legionSetupSwap";

/**
 * 军团（Legion）开局角色类型反转专项测试
 * 官方 Wiki："如果军团在场，推荐将在场善良和邪恶玩家的数量
 *          在通常的数量上进行反转"
 * 场景：13 镇 + 2 外 + 4 爪 + 3 恶 → 选中 legion 后
 *       原镇民+原外来者 → 军团
 *       原恶魔+原爪牙 → 镇民
 */

function makeSeat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
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
  } as unknown as Seat;
}

const SCRIPT_ROLES: Role[] = [
  { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
];

describe("applyLegionRoleSwap — 军团 setup 角色类型反转", () => {
  it("无军团 → 不应用反转", () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "imp", "demon"),
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    expect(res.applied).toBe(false);
    expect(res.legionCount).toBe(0);
    expect(res.newTownsfolkCount).toBe(0);
    // 原角色保持
    expect(res.seats[0].role?.id).toBe("washerwoman");
    expect(res.seats[1].role?.id).toBe("imp");
  });

  it("有军团 → 应用反转：原镇民+外来者 → legion；原恶魔+爪牙 → townsfolk", () => {
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "drunk", "outsider"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "imp", "demon"),
      makeSeat(4, "legion", "demon"), // 加入军团触发反转
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    expect(res.applied).toBe(true);
    expect(res.legionCount).toBe(2); // 原 1 镇 + 1 外 = 2
    expect(res.newTownsfolkCount).toBe(2); // 原 1 爪 + 1 恶 = 2

    // 0 号原镇民 → legion
    expect(res.seats[0].role?.id).toBe("legion");
    expect(res.seats[0].role?.type).toBe("demon");
    // 1 号原外来者 → legion
    expect(res.seats[1].role?.id).toBe("legion");
    expect(res.seats[1].role?.type).toBe("demon");
    // 2 号原爪牙 → townsfolk (washerwoman)
    expect(res.seats[2].role?.id).toBe("washerwoman");
    expect(res.seats[2].role?.type).toBe("townsfolk");
    // 3 号原恶魔 → townsfolk (librarian - 分配不同角色)
    expect(res.seats[3].role?.id).toBe("librarian");
    expect(res.seats[3].role?.type).toBe("townsfolk");
    // 4 号军团（已是 legion）保持
    expect(res.seats[4].role?.id).toBe("legion");
  });

  it("13 镇 + 2 外 + 4 爪 + 3 恶 完整剧本反转", () => {
    const seats: Seat[] = [
      // 13 镇
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "librarian", "townsfolk"),
      makeSeat(2, "chef", "townsfolk"),
      makeSeat(3, "bounty_hunter", "townsfolk"),
      makeSeat(4, "pixie", "townsfolk"),
      makeSeat(5, "fortune_teller", "townsfolk"),
      makeSeat(6, "monk", "townsfolk"),
      makeSeat(7, "oracle", "townsfolk"),
      makeSeat(8, "town_crier", "townsfolk"),
      makeSeat(9, "juggler", "townsfolk"),
      makeSeat(10, "savant", "townsfolk"),
      makeSeat(11, "farmer", "townsfolk"),
      makeSeat(12, "mayor", "townsfolk"),
      // 2 外
      makeSeat(13, "drunk", "outsider"),
      makeSeat(14, "lunatic", "outsider"),
      // 4 爪
      makeSeat(15, "cerenovus", "minion"),
      makeSeat(16, "evil_twin", "minion"),
      makeSeat(17, "baron", "minion"),
      // 1 爪 (4 个 = 1 个 marionette + 3 个其他) — 这里是 18 号 marionette
      makeSeat(18, "marionette", "minion"),
      // 3 恶
      makeSeat(19, "imp", "demon"),
      makeSeat(20, "vortox", "demon"),
      // 最后一个恶 = legion
      makeSeat(21, "legion", "demon"),
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    expect(res.applied).toBe(true);
    // 13 镇 + 2 外 = 15 镇民/外来者 → legion
    expect(res.legionCount).toBe(15);
    // 4 爪 + 2 恶 (imp + vortox；legion 不算) = 6 → 转换为善良角色
    expect(res.newTownsfolkCount).toBe(6);

    // 前 15 个座位（0-14）应是 legion
    for (let i = 0; i < 15; i++) {
      expect(res.seats[i].role?.id).toBe("legion");
      expect(res.seats[i].role?.type).toBe("demon");
    }
    // 后 7 个座位（15-21）：15-18 爪 + 19-20 恶 = 6 变善良角色；21 号 legion 保持
    for (let i = 15; i <= 20; i++) {
      expect(["townsfolk", "outsider"]).toContain(res.seats[i].role?.type);
    }
    // 21 号军团（legion 自身）保持
    expect(res.seats[21].role?.id).toBe("legion");
  });

  it("反转后 isEvilConverted 标记正确（军团为邪恶转化的镇民）", () => {
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "imp", "demon"),
      makeSeat(2, "legion", "demon"), // 触发反转
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    // 0 号变 legion → isEvilConverted=true（原是镇民）
    expect(res.seats[0].isEvilConverted).toBe(true);
    // 1 号变 townsfolk → isEvilConverted=false（原是恶魔，转为镇民）
    expect(res.seats[1].isEvilConverted).toBe(false);
    // 2 号军团（已是 legion）保持 false
    expect(res.seats[2].isEvilConverted).toBe(false);
  });
});

describe("shouldApplyLegionSwap", () => {
  it("座位中有 legion 时返回 true", () => {
    expect(shouldApplyLegionSwap([makeSeat(0, "legion", "demon")])).toBe(true);
  });
  it("座位中无 legion 时返回 false", () => {
    expect(shouldApplyLegionSwap([makeSeat(0, "imp", "demon")])).toBe(false);
  });
});
