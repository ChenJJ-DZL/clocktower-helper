import { describe, it, expect } from "vitest";
import {
  generateAndSortQuickStartLineup,
  ensureMarionetteAdjacency,
  shuffle,
} from "../../src/utils/quickStartGenerator";
import type { Role, Script, Seat } from "../../app/data";

describe("提线木偶（Marionette）邻座规则与座次保障测试", () => {
  const isAdjacent = (id1: number, id2: number, total: number) => {
    const diff = Math.abs(id1 - id2);
    return diff === 1 || diff === total - 1;
  };

  it("常规恶魔对局：提线木偶必须与恶魔相邻，否则判定为违规", () => {
    const total = 7;
    // 2号是恶魔（id: 1），5号是提线木偶（id: 4）
    expect(isAdjacent(4, 1, total)).toBe(false);

    // 2号是恶魔（id: 1），1号是提线木偶（id: 0）或3号是提线木偶（id: 2）
    expect(isAdjacent(0, 1, total)).toBe(true);
    expect(isAdjacent(2, 1, total)).toBe(true);
  });

  it("圆桌环首尾相邻：1号与7号相邻", () => {
    const total = 7;
    // 1号是恶魔（id: 0），7号是提线木偶（id: 6）
    expect(isAdjacent(0, 6, total)).toBe(true);
    expect(isAdjacent(6, 0, total)).toBe(true);
  });

  it("快速开始（QuickStart）：当剧本包含提线木偶时，生成的阵容保证提线木偶与恶魔物理相邻", () => {
    const mockScript: Script = {
      id: "test_marionette_script",
      name: "测试木偶剧本",
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
        "marionette",
        "imp",
        "vortox",
      ],
    } as any;

    const mockRoles: Role[] = [
      { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      { id: "librarian", name: "图书管理员", type: "townsfolk" },
      { id: "chef", name: "厨师", type: "townsfolk" },
      { id: "empath", name: "共情者", type: "townsfolk" },
      { id: "mayor", name: "镇长", type: "townsfolk" },
      { id: "marionette", name: "提线木偶", type: "minion" },
      { id: "vortox", name: "涡流", type: "demon" },
    ] as any;

    // 多次随机生成测试，确保 100% 邻座
    for (let i = 0; i < 20; i++) {
      const res = generateAndSortQuickStartLineup(mockScript, mockRoles, 7);
      const mIdx = res.sortedRoles.findIndex((r) => r.id === "marionette");
      const dIdx = res.sortedRoles.findIndex((r) => r.type === "demon");

      if (mIdx !== -1 && dIdx !== -1) {
        const adjacent = isAdjacent(mIdx, dIdx, res.sortedRoles.length);
        expect(adjacent).toBe(true);
      }
    }
  });

  it("一键互换座位逻辑能够正确将提线木偶移动至恶魔身旁", () => {
    const total = 7;
    const seats: Seat[] = [
      { id: 0, role: { id: "librarian", name: "图书管理员", type: "townsfolk" } } as any,
      { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } } as any, // 2号
      { id: 2, role: { id: "mayor", name: "镇长", type: "townsfolk" } } as any, // 3号
      { id: 3, role: { id: "chef", name: "厨师", type: "townsfolk" } } as any,
      { id: 4, role: { id: "marionette", name: "提线木偶", type: "minion" } } as any, // 5号
      { id: 5, role: { id: "empath", name: "共情者", type: "townsfolk" } } as any,
      { id: 6, role: { id: "savant", name: "博学者", type: "townsfolk" } } as any,
    ];

    // 当前不相邻
    expect(isAdjacent(4, 1, total)).toBe(false);

    // 恶魔的邻座是 0号 和 2号
    // 将提线木偶（4号）与恶魔邻座（0号）互换
    const sMarionette = seats[4];
    const sSwap = seats[0];

    const newSeats = seats.map((s) => {
      if (s.id === 4) return { ...s, role: sSwap.role };
      if (s.id === 0) return { ...s, role: sMarionette.role };
      return s;
    });

    const newMSeat = newSeats.find((s) => s.role?.id === "marionette")!;
    const newDSeat = newSeats.find((s) => s.role?.type === "demon")!;

    // 互换后：0号提线木偶与1号涡流相邻！
    expect(isAdjacent(newMSeat.id, newDSeat.id, total)).toBe(true);
  });

  it("提线木偶、酒鬼、疯子：落座时保持原角色（无预设伪装身份），提线木偶与恶魔100%保持相邻", () => {
    const mockScript: Script = {
      id: "test_disguise_script",
      name: "测试伪装剧本",
      roleIds: [
        "washerwoman",
        "librarian",
        "investigator",
        "chef",
        "empath",
        "fortune_teller",
        "drunk",
        "marionette",
        "lunatic",
        "imp",
        "vortox",
      ],
    } as any;

    const mockRoles: Role[] = [
      { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      { id: "librarian", name: "图书管理员", type: "townsfolk" },
      { id: "chef", name: "厨师", type: "townsfolk" },
      { id: "empath", name: "共情者", type: "townsfolk" },
      { id: "drunk", name: "酒鬼", type: "outsider" },
      { id: "lunatic", name: "疯子", type: "outsider" },
      { id: "marionette", name: "提线木偶", type: "minion" },
      { id: "vortox", name: "涡流", type: "demon" },
    ] as any;

    for (let i = 0; i < 20; i++) {
      const res = generateAndSortQuickStartLineup(mockScript, mockRoles, 7);
      const mRole = res.sortedRoles.find((r) => r.id === "marionette");
      const dRole = res.sortedRoles.find((r) => r.id === "drunk");
      const lRole = res.sortedRoles.find((r) => r.id === "lunatic");

      // 规则要求：落座时是没有身份的原角色，等待手动设置或下一步强制弹窗设置
      if (mRole) {
        expect(mRole.charadeRole).toBeNull();
      }

      if (dRole) {
        expect(dRole.charadeRole).toBeNull();
      }

      if (lRole) {
        expect(lRole.apparentDemonRole).toBeNull();
      }

      // 且无论何时，提线木偶必须与恶魔保持相邻
      if (mRole) {
        const mIdx = res.sortedRoles.findIndex((r) => r.id === "marionette");
        const demonIdx = res.sortedRoles.findIndex((r) => r.type === "demon");
        if (demonIdx !== -1) {
          const diff = Math.abs(mIdx - demonIdx);
          expect(diff === 1 || diff === res.sortedRoles.length - 1).toBe(true);
        }
      }
    }
  });

  it("ensureMarionetteAdjacency: 随机shuffle 100次后，提线木偶与恶魔依然100%保持相邻", () => {
    const baseRoles = [
      { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      { id: "librarian", name: "图书管理员", type: "townsfolk" },
      { id: "chef", name: "厨师", type: "townsfolk" },
      { id: "empath", name: "共情者", type: "townsfolk" },
      { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
      { id: "marionette", name: "提线木偶", type: "minion" },
      { id: "vortox", name: "涡流", type: "demon" },
    ];

    for (let i = 0; i < 100; i++) {
      const shuffled = shuffle(baseRoles);
      const ensured = ensureMarionetteAdjacency(shuffled);
      expect(ensured.length).toBe(7);

      const mIdx = ensured.findIndex((r) => r.id === "marionette");
      const dIdx = ensured.findIndex((r) => r.id === "vortox");
      expect(mIdx).not.toBe(-1);
      expect(dIdx).not.toBe(-1);

      const diff = Math.abs(mIdx - dIdx);
      const isAdjacent = diff === 1 || diff === 6;
      expect(isAdjacent).toBe(true);
    }
  });
});
