import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import {
  generateAndSortQuickStartLineup,
  getRoleActionSortWeight,
  STANDARD_COMPOSITIONS,
} from "../../../utils/quickStartGenerator";

describe("QuickStartModal (快速开始) 阵容生成与排序测试", () => {
  const tbScript = scripts.find((s) => s.id === "tb") || {
    id: "tb",
    name: "暗流涌动",
    description: "标准入门剧本",
    difficulty: "easy" as const,
    roleIds: [
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "empath",
      "fortune_teller",
      "undertaker",
      "monk",
      "ravenkeeper",
      "virgin",
      "slayer",
      "soldier",
      "mayor",
      "butler",
      "drunk",
      "recluse",
      "saint",
      "poisoner",
      "spy",
      "scarlet_woman",
      "baron",
      "imp",
    ],
  };

  it("应包含 5 至 15 人的官方标准人数配比数据", () => {
    expect(STANDARD_COMPOSITIONS[5]).toEqual({
      townsfolk: 3,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
    expect(STANDARD_COMPOSITIONS[7]).toEqual({
      townsfolk: 5,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
    expect(STANDARD_COMPOSITIONS[10]).toEqual({
      townsfolk: 7,
      outsider: 0,
      minion: 2,
      demon: 1,
    });
    expect(STANDARD_COMPOSITIONS[15]).toEqual({
      townsfolk: 9,
      outsider: 2,
      minion: 3,
      demon: 1,
    });
  });

  it("生成 7 人阵容时应生成 7 名角色且包含 1 恶魔", () => {
    const result = generateAndSortQuickStartLineup(tbScript, roles, 7);
    expect(result.sortedRoles).toHaveLength(7);
    const demonCount = result.sortedRoles.filter(
      (r) => r.type === "demon"
    ).length;
    expect(demonCount).toBe(1);
  });

  it("当抽中男爵时，应自动调整阵容为 +2 外来者 / -2 镇民", () => {
    // 运行多次直至出现男爵或强制模拟测试
    let baronFound = false;
    for (let i = 0; i < 50; i++) {
      const res = generateAndSortQuickStartLineup(tbScript, roles, 10);
      if (res.hasBaron) {
        baronFound = true;
        expect(res.composition.outsider).toBe(2); // 10人基础0外来者 + 2 = 2
        expect(res.composition.townsfolk).toBe(5); // 10人基础7镇民 - 2 = 5
        break;
      }
    }
    // 男爵在爪牙池中应能被抽中
    expect(baronFound).toBe(true);
  });

  it("当抽中酒鬼时，应为其自动指派不在场的镇民伪装身份", () => {
    for (let i = 0; i < 50; i++) {
      const res = generateAndSortQuickStartLineup(tbScript, roles, 9);
      const drunk = res.sortedRoles.find((r) => r.id === "drunk");
      if (drunk) {
        expect(drunk.charadeRole).toBeDefined();
        expect(drunk.charadeRole?.type).toBe("townsfolk");
        expect(drunk.charadeRole?.id).not.toBe("drunk");
        break;
      }
    }
  });

  it("角色应按照阵营（镇民 -> 外来者 -> 爪牙 -> 恶魔）及阵营内行动顺序排序落座", () => {
    const res = generateAndSortQuickStartLineup(tbScript, roles, 10);
    const typeOrder: Record<string, number> = {
      townsfolk: 1,
      outsider: 2,
      minion: 3,
      demon: 4,
    };
    for (let i = 0; i < res.sortedRoles.length - 1; i++) {
      const curr = res.sortedRoles[i];
      const next = res.sortedRoles[i + 1];
      const orderCurr = typeOrder[curr.type];
      const orderNext = typeOrder[next.type];
      expect(orderCurr).toBeLessThanOrEqual(orderNext);
      if (orderCurr === orderNext) {
        expect(getRoleActionSortWeight(curr.id)).toBeLessThanOrEqual(
          getRoleActionSortWeight(next.id)
        );
      }
    }
  });

  it("getRoleActionSortWeight 应正确区分首夜角色、非首夜角色与纯被动角色", () => {
    // 下毒者 (Poisoner) 首夜有行动
    const poisonerWeight = getRoleActionSortWeight("poisoner");
    // 洗衣妇 (Washerwoman) 首夜有行动
    const washerwomanWeight = getRoleActionSortWeight("washerwoman");
    // 僧侣 (Monk) 非首夜有行动
    const monkWeight = getRoleActionSortWeight("monk");
    // 男爵 (Baron) 纯被动
    const baronWeight = getRoleActionSortWeight("baron");

    expect(poisonerWeight).toBeLessThan(1000);
    expect(washerwomanWeight).toBeLessThan(1000);
    expect(monkWeight).toBeGreaterThanOrEqual(1000);
    expect(monkWeight).toBeLessThan(2000);
    expect(baronWeight).toBe(2000);
  });

  it("落座日志应正确生成各座位号与角色的详情清单", () => {
    const mockSeats = [
      { id: 0, role: { id: "soldier", name: "士兵", type: "townsfolk" } },
      { id: 1, role: { id: "saint", name: "圣徒", type: "outsider" } },
      {
        id: 2,
        role: { id: "drunk", name: "酒鬼", type: "outsider" },
        charadeRole: { id: "slayer", name: "猎手", type: "townsfolk" },
      },
      { id: 3, role: { id: "baron", name: "男爵", type: "minion" } },
      { id: 4, role: { id: "imp", name: "小恶魔", type: "demon" } },
    ];

    const seatDetails = mockSeats
      .map((s) => {
        let roleName = s.role?.name || "未知";
        if (s.role?.id === "drunk" && (s as any).charadeRole?.name) {
          roleName = `酒鬼(伪:${(s as any).charadeRole.name})`;
        }
        return `${s.id + 1}号${roleName}`;
      })
      .join("、");

    expect(seatDetails).toBe(
      "1号士兵、2号圣徒、3号酒鬼(伪:猎手)、4号男爵、5号小恶魔"
    );
  });

  it("当抽中军团 (Legion) 时，应自动消除爪牙，善良人数反转为少数，全员剩余均为军团", () => {
    const legionScript = {
      id: "poppyganda",
      name: "罂粟花开",
      description: "含军团剧本",
      difficulty: "hard" as const,
      roleIds: [
        "washerwoman",
        "librarian",
        "investigator",
        "chef",
        "empath",
        "fortune_teller",
        "undertaker",
        "snitch",
        "drunk",
        "poisoner",
        "baron",
        "legion",
      ],
    };

    const res10 = generateAndSortQuickStartLineup(legionScript, roles, 10);
    expect(res10.sortedRoles).toHaveLength(10);
    expect(res10.composition.minion).toBe(0); // 0 爪牙
    expect(res10.composition.townsfolk + res10.composition.outsider).toBe(3); // 10人局 3 善良
    expect(res10.composition.demon).toBe(7); // 10人局 7 军团

    const legions10 = res10.sortedRoles.filter((r) => r.id === "legion");
    expect(legions10).toHaveLength(7);
    const minions10 = res10.sortedRoles.filter((r) => r.type === "minion");
    expect(minions10).toHaveLength(0);

    const res7 = generateAndSortQuickStartLineup(legionScript, roles, 7);
    expect(res7.sortedRoles).toHaveLength(7);
    expect(res7.composition.minion).toBe(0); // 0 爪牙
    expect(res7.composition.townsfolk + res7.composition.outsider).toBe(2); // 7人局 2 善良
    expect(res7.composition.demon).toBe(5); // 7人局 5 军团
  });
});
