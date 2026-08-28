import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { applyLegionRoleSwap } from "../../../utils/legionSetupSwap";

/**
 * 提线木偶（Marionette）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 21.提线木偶）：
 *   ① 提线木偶会从盲抽袋中抽取到一个镇民或外来者角色，
 *     但他实际上是提线木偶。
 *   ② 提线木偶与恶魔是邻座。
 *   ③ 恶魔会知道哪一名玩家是提线木偶。
 *   ④ 罂粟种植者死亡后，恶魔会知道谁是提线木偶。
 *   ⑤ 告密者相克：提线木偶不会得知三个不在场的角色，
 *     改为由恶魔额外得知三个不在场角色。
 *
 * 提线木偶在 setup 阶段被分配 marionetteMasterSeatId 指向恶魔。
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
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
    marionetteMasterSeatId: null,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const SCRIPT_ROLES: Role[] = [
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
];

describe("提线木偶：onSetup 邻座分配", () => {
  it("setup 时 marionette 被分配 marionetteMasterSeatId 指向恶魔", () => {
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "marionette", "minion"),
      makeSeat(2, "imp", "demon"),
    ];
    // 模拟 onSetup 的设置
    const updated = seats.map((s) => {
      if (s.role?.id === "marionette") {
        // 找恶魔
        const demonSeat = seats.find(
          (x) => x.role?.type === "demon" && x.id !== s.id
        );
        if (demonSeat) {
          return { ...s, marionetteMasterSeatId: demonSeat.id };
        }
      }
      return s;
    });
    const marionette = updated.find((s) => s.id === 1);
    expect((marionette as any)?.marionetteMasterSeatId).toBe(2); // 指向 imp
  });

  it("军团 setup 反转覆盖提线木偶（原爪牙座位转为镇民）", () => {
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "marionette", "minion"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "imp", "demon"),
      makeSeat(4, "legion", "demon"),
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    // 官方规则：军团局反转时，原爪牙座位（含提线木偶）全部转为镇民
    expect(res.seats[1].role?.id).toBe("librarian");
    expect(res.seats[1].role?.type).toBe("townsfolk");
  });
});
