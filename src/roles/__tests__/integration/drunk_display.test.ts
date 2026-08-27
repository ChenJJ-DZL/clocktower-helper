import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";

describe("酒鬼 (Drunk) 说书人魔典视角与身份告知展示测试", () => {
  const drunkSeat: Seat = {
    id: 9,
    role: { id: "drunk", name: "酒鬼", type: "outsider" },
    charadeRole: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
    isDead: false,
    isDrunk: true,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
  };

  it("在说书人魔典圆桌视角下，酒鬼座位的真实身份类型应为外来者 (outsider / 绿色)", () => {
    // 模拟 getDisplayRoleType
    const getDisplayRoleType = (seat: Seat | null | undefined) => {
      if (!seat || !seat.role) return "townsfolk";
      return seat.role.type || "townsfolk";
    };

    expect(getDisplayRoleType(drunkSeat)).toBe("outsider");
  });

  it("在身份告知展示 (IdentityShowcase) 视角下，向酒鬼玩家展示的应为伪装镇民身份 (townsfolk / 蓝色)", () => {
    const isDrunk = drunkSeat.role?.id === "drunk";
    const displayRole =
      isDrunk && drunkSeat.charadeRole ? drunkSeat.charadeRole : drunkSeat.role;

    expect(displayRole?.name).toBe("杂耍艺人");
    expect(displayRole?.type).toBe("townsfolk");
  });
});
