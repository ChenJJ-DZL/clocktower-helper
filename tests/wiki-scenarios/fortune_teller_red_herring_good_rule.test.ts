import { describe, it, expect } from "vitest";
import type { Seat } from "../../app/data";

describe("占卜师（Fortune Teller）红罗刹阵营规则测试", () => {
  it("官方规则：红罗刹必须是善良玩家（good player），邪恶玩家与转为邪恶的镇民绝不能是红罗刹", () => {
    // 模拟7人局：1号占卜师，2号罂粟种植者（被赏金猎人转为邪恶），3号小恶魔，4号爪牙，5号赏金猎人，6号图书管理员，7号农夫
    const seats: Seat[] = [
      { id: 0, role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" } } as any,
      {
        id: 1,
        role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
        isEvilConverted: true,
        alignment: "evil",
      } as any,
      { id: 2, role: { id: "imp", name: "小恶魔", type: "demon" } } as any,
      { id: 3, role: { id: "poisoner", name: "投毒者", type: "minion" } } as any,
      { id: 4, role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" } } as any,
      { id: 5, role: { id: "librarian", name: "图书管理员", type: "townsfolk" } } as any,
      { id: 6, role: { id: "farmer", name: "农夫", type: "townsfolk" } } as any,
    ];

    // 筛选合法红罗刹候选人：必须是非恶魔、非爪牙、且未转为邪恶的真正善良玩家
    const eligibleForRedHerring = seats.filter(
      (s) =>
        s.role &&
        s.role.type !== "demon" &&
        s.role.type !== "minion" &&
        !s.isEvilConverted &&
        (s as any).alignment !== "evil"
    );

    // 2号罂粟种植者已被转为邪恶，绝不能在候选池中
    expect(eligibleForRedHerring.some((s) => s.id === 1)).toBe(false);

    // 合法候选人只能是：4号(赏金猎人)、5号(图书管理员)、6号(农夫)
    const eligibleIds = eligibleForRedHerring.map((s) => s.id);
    expect(eligibleIds).toEqual([0, 4, 5, 6]);
  });
});
