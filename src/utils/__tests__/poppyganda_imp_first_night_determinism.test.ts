// @vitest-environment node
/**
 * 探针（临时）：验证 imp 首夜 dialog 的「不在场角色」是否因裸 Math.random 而不稳定。
 * 这是「元教训 #0」要求的可达性验证 —— 先证明问题真实存在。
 */
import { describe, it, expect } from "vitest";
import { imp as impDef } from "../../roles/demon/imp";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../roles/core/deterministicRandom";

const ROLES = [
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "monk", name: "僧侣", type: "townsfolk" },
  { id: "soldier", name: "士兵", type: "townsfolk" },
  { id: "mayor", name: "镇长", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
] as any;

function seat(role: any, id: number) {
  return { id, role, isDead: false, isDrunk: false, isPoisoned: false };
}

/**
 * 造一个「有很多不在场角色」的剧本配置 —— 让裸随机的差异可观察。
 * 官方规则：恶魔首夜得知 3 个不在场镇民（不足时最多补 1 名外来者）。
 */
const BIG_ROLES = [
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "monk", name: "僧侣", type: "townsfolk" },
  { id: "soldier", name: "士兵", type: "townsfolk" },
  { id: "mayor", name: "镇长", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "slayer", name: "猎手", type: "townsfolk" },
  { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
  { id: "undertaker", name: "送葬者", type: "townsfolk" },
  { id: "virgin", name: "圣女", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "butler", name: "管家", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
] as any;

/** 只有 5 个座位 → 大量不在场镇民 → 洗牌差异显性 */
const BIG_SEATS: any[] = [
  seat({ id: "librarian", name: "图书管理员", type: "townsfolk" }, 0),
  seat({ id: "chef", name: "厨师", type: "townsfolk" }, 1),
  seat({ id: "monk", name: "僧侣", type: "townsfolk" }, 2),
  seat({ id: "poisoner", name: "投毒者", type: "minion" }, 3),
  seat({ id: "imp", name: "小恶魔", type: "demon" }, 4),
];

describe("【探针】imp 首夜 dialog 不在场角色稳定性", () => {
  it("同一 context（注入确定性 rng）连续调用 12 次，输出应当唯一", () => {
    const seats: any[] = [
      seat({ id: "librarian", name: "图书管理员", type: "townsfolk" }, 0),
      seat({ id: "chef", name: "厨师", type: "townsfolk" }, 1),
      seat({ id: "monk", name: "僧侣", type: "townsfolk" }, 2),
      seat({ id: "poisoner", name: "投毒者", type: "minion" }, 3),
      seat({ id: "imp", name: "小恶魔", type: "demon" }, 4),
    ];
    const roleDef: any = impDef;
    if (!roleDef?.firstNight?.dialog) {
      console.log("⚠️ 未找到 imp.firstNight.dialog，跳过");
      return;
    }

    const mkCtx = () => ({
      seats,
      poppyGrowerDead: true, // 无罂粟种植者影响 → 走告知爪牙分支
      selfId: 4,
      roles: ROLES,
      /**
       * ⭐ 生产真实调用：`nightInfoGenerator.ts:211` 每次生成夜间信息时
       * **新建**一个 `createDeterministicRandom(nightInfoSeed(roleId, seatId, nightCount))`。
       * 因此「重新进入该步 / 玩家结果页」都会从头取同一序列 ⇒ 必须得到同一结果。
       */
      rng: createDeterministicRandom(nightInfoSeed("imp", 4, 1)),
    });

    const outs = new Set<string>();
    for (let i = 0; i < 12; i++) {
      // 每次重建 context（等价于"重新算一次夜间信息"）
      const d = roleDef.firstNight.dialog(4, true, mkCtx() as any);
      outs.add(String(d.wake));
    }
    console.log(`[探针] 12 次独立调用产生 ${outs.size} 种不同输出`);
    [...outs].slice(0, 4).forEach((o) => console.log("   ", o));

    // 注入确定性 rng 后，同夜同座位必须唯一 → 预演 == 结算
    expect(outs.size, "imp 首夜 dialog 输出应当唯一（走注入 rng）").toBe(1);
  });

  it("【防假绿】不注入 rng（回退裸 Math.random）时输出不稳定 —— 证明上面那条断言在测确定性", () => {
    const roleDef: any = impDef;
    // 刻意不提供 rng → 生产回退 `Math.random`
    const mkCtx = () => ({
      seats: BIG_SEATS,
      poppyGrowerDead: true,
      selfId: 4,
      roles: BIG_ROLES,
    } as any);

    const outs = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const d = roleDef.firstNight.dialog(4, true, mkCtx());
      outs.add(String(d.wake));
    }
    console.log(`[防假绿] 无 rng 时 120 次调用产生 ${outs.size} 种输出`);
    [...outs].slice(0, 3).forEach((o) => console.log("   ", o));

    // ⭐ 关键：证明"输出唯一"这一属性确实由 rng 决定 —— 去掉它就会不唯一。
    expect(
      outs.size,
      "无 rng 时应当出现多种输出（否则说明该断言没在测确定性，需重新设计）"
    ).toBeGreaterThan(1);
  });
});
