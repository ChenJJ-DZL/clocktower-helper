/**
 * 信息真值矩阵（L1-v4）——「弹窗内容是否正确」的唯一权威判据
 * ======================================================================
 * 背景：L1 角色矩阵只判「有产出 / 文案无脏值」，**不判内容对不对**。
 *   实测过的代价：图书管理员曾报「2号和10号之中有一名是【间谍】」，
 *   候选对里根本没有外来者 —— 这类错误在「非空 + 无脏值」下全绿。
 *
 * 本矩阵的做法：**先按座位表独立算出真值，再与能力产出的信息对账**。
 *   真值计算一律直接用 `role.type`（demon/minion 视为邪恶），
 *   不调用被测角色自己的辅助函数，避免「用被测代码验证被测代码」。
 *
 * 每个信息角色跑两遍：
 *   ① 正常世界 → 产出必须**等于**真值；
 *   ② 涡流世界（`isVortoxWorld`）→ 产出必须**不等于**真值（官方：涡流在场
 *      镇民信息必定错误，哪怕该角色同时醉酒/中毒）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";
import { roles } from "../../../app/data";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";

/** roleId → ability（`buildAbilityMap()` 的 key 是 abilityId，须按 roleId 反查） */
const BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

/**
 * ⚠️⚠️ 每条用例前清空「一次性能力」使用登记。
 *
 * `consumeLimitedAbility` 写的是**模块级** registry（按 seatId 记），
 * 同一文件里前一条用例用过裁缝，后一条就会直接 `aborted: "女裁缝已经使用过能力了"`
 * —— 实测导致 2 条假红，且假红原因与应用逻辑完全无关。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

const roleOf = (seats: any[], seatId: number) => seats.find((s) => s.id === seatId)?.role;

/** 独立的「邪恶」判据：只看角色类型，不碰应用的阵营工具 */
const isEvilType = (role: any): boolean =>
  role?.type === "demon" || role?.type === "minion";

// ────────────────────────────────────────────────────────────────────
// 真值计算（独立实现）
// ────────────────────────────────────────────────────────────────────

/** 厨师：环形相邻的两个座位都邪恶 ⇒ 计 1 对（官方不过滤死者） */
function trueChefPairs(seats: any[]): number {
  const n = seats.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (isEvilType(roleOf(seats, i)) && isEvilType(roleOf(seats, (i + 1) % n))) {
      count++;
    }
  }
  return count;
}

/** 共情者：左右两侧**最近的存活**邻居中邪恶人数 */
function trueEmpathEvilNeighbors(seats: any[], selfId: number): number {
  const n = seats.length;
  const alive = (id: number) => {
    const s = seats.find((x) => x.id === ((id % n) + n) % n);
    return s && s.isDead !== true ? s : null;
  };
  const pick = (dir: 1 | -1) => {
    for (let step = 1; step < n; step++) {
      const s = alive(selfId + dir * step);
      if (s) return s;
    }
    return null;
  };
  const left = pick(-1);
  const right = pick(1);
  return [left, right].filter((s) => s && isEvilType(s.role)).length;
}

/** 钟表匠：恶魔到任一爪牙的最短环形距离 */
function trueClockmakerDistance(seats: any[]): number | null {
  const n = seats.length;
  const demons = seats.filter((s) => s.role?.type === "demon").map((s) => s.id);
  const minions = seats.filter((s) => s.role?.type === "minion").map((s) => s.id);
  if (demons.length === 0 || minions.length === 0) return null;
  let best = n;
  for (const d of demons) {
    for (const m of minions) {
      const diff = Math.abs(d - m);
      best = Math.min(best, Math.min(diff, n - diff));
    }
  }
  return best;
}

/** 「两名玩家中有一名是某角色」型信息：真值 = 恰好一人持有该角色 */
function exactlyOneHolds(seats: any[], seat1: number, seat2: number, roleName: string): boolean {
  const holds = (id: number) => roleOf(seats, id)?.name === roleName;
  return holds(seat1) !== holds(seat2);
}

// ────────────────────────────────────────────────────────────────────
// 座位表
// ────────────────────────────────────────────────────────────────────

/**
 * 主棋盘（10 人）：
 *   0 厨师        1 投毒者(爪牙)  2 共情者   3 士兵   4 小恶魔
 *   5 占卜师      6 洗衣妇       7 图书管理员 8 调查员 9 管家(外来者)
 *
 * 刻意让：厨师真值 0（两个邪恶不相邻）、共情者真值 1（左侧投毒者）、
 * 钟表匠真值 3（恶魔 4 与爪牙 1 的环形最短距离）。
 */
const MAIN = [
  "chef",
  "poisoner",
  "empath",
  "soldier",
  "imp",
  "fortune_teller",
  "washerwoman",
  "librarian",
  "investigator",
  "butler",
];

/** 相邻邪恶棋盘：厨师真值 1（投毒者 1 与恶魔 2 相邻） */
const ADJACENT = [
  "chef",
  "poisoner",
  "imp",
  "soldier",
  "empath",
  "fortune_teller",
  "washerwoman",
  "librarian",
  "investigator",
  "butler",
];

const VORTOX = { isVortoxWorld: true };

// ────────────────────────────────────────────────────────────────────

describe("厨师：报的「相邻邪恶对数」必须等于真实对数", () => {
  it("✅ 两个邪恶不相邻 ⇒ 必须报 0", async () => {
    const seats = board(MAIN);
    const truth = trueChefPairs(seats);
    expect(truth, "棋盘构造应产生 0 对").toBe(0);
    const res = await runRole(BY_ROLE.chef, seats, 0, { night: 1, phase: "firstNight" });
    expect(res.meta.abilityResult, "厨师报数与真值不符").toBe(truth);
  });

  it("✅ 两个邪恶相邻 ⇒ 必须报 1", async () => {
    const seats = board(ADJACENT);
    const truth = trueChefPairs(seats);
    expect(truth, "棋盘构造应产生 1 对").toBe(1);
    const res = await runRole(BY_ROLE.chef, seats, 0, { night: 1, phase: "firstNight" });
    expect(res.meta.abilityResult, "厨师报数与真值不符").toBe(truth);
  });

  it("🔴 涡流在场 ⇒ 报数必须与真值不同（信息必假）", async () => {
    const seats = board(ADJACENT);
    const truth = trueChefPairs(seats);
    const res = await runRole(BY_ROLE.chef, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    expect(res.meta.isCorrupted).toBe(true);
    expect(res.meta.abilityResult, "涡流世界厨师仍报出真值 = 信息泄漏").not.toBe(truth);
  });
});

describe("共情者：报的「邪恶邻居数」必须等于真实邻居邪恶数", () => {
  it("✅ 左邻投毒者、右邻士兵 ⇒ 必须报 1", async () => {
    const seats = board(MAIN);
    const truth = trueEmpathEvilNeighbors(seats, 2);
    expect(truth, "棋盘构造应产生 1").toBe(1);
    const res = await runRole(BY_ROLE.empath, seats, 2, { night: 2 });
    expect(res.meta.abilityResult, "共情者报数与真值不符").toBe(truth);
  });

  it("✅ 邻居皆善良 ⇒ 必须报 0", async () => {
    // 把共情者换到 3 号位（两侧是投毒者? 不 —— 1 与 4），另造干净盘
    const clean = [
      "chef",
      "soldier",
      "empath",
      "butler",
      "imp",
      "poisoner",
      "washerwoman",
      "librarian",
      "investigator",
      "fortune_teller",
    ];
    const seats = board(clean);
    const truth = trueEmpathEvilNeighbors(seats, 2);
    expect(truth, "棋盘构造应产生 0").toBe(0);
    const res = await runRole(BY_ROLE.empath, seats, 2, { night: 2 });
    expect(res.meta.abilityResult, "共情者报数与真值不符").toBe(truth);
  });

  it("🔴 涡流在场 ⇒ 报数必须与真值不同", async () => {
    const seats = board(MAIN);
    const truth = trueEmpathEvilNeighbors(seats, 2);
    const res = await runRole(BY_ROLE.empath, seats, 2, { night: 2, snapshot: VORTOX });
    expect(res.meta.isCorrupted).toBe(true);
    expect(res.meta.abilityResult, "涡流世界共情者仍报真值 = 信息泄漏").not.toBe(truth);
  });
});

describe("钟表匠：报的「恶魔与爪牙最短距离」必须等于真实距离", () => {
  it("✅ 主棋盘距离为 3", async () => {
    const seats = board(MAIN);
    const truth = trueClockmakerDistance(seats);
    expect(truth, "棋盘构造应产生 3").toBe(3);
    const res = await runRole(BY_ROLE.clockmaker, seats, 3, {
      night: 1,
      phase: "firstNight",
    });
    expect(res.meta.abilityResult, "钟表匠报距与真值不符").toBe(truth);
  });

  it("✅ 相邻棋盘距离为 1", async () => {
    const seats = board(ADJACENT);
    const truth = trueClockmakerDistance(seats);
    expect(truth).toBe(1);
    const res = await runRole(BY_ROLE.clockmaker, seats, 3, {
      night: 1,
      phase: "firstNight",
    });
    expect(res.meta.abilityResult, "钟表匠报距与真值不符").toBe(truth);
  });
});

describe("占卜师：目标中有恶魔 ⇒ 真；没有 ⇒ 假", () => {
  it("✅ 目标含恶魔（4号）⇒ true", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.fortune_teller, seats, 5, {
      night: 2,
      targets: [3, 4],
    });
    expect(res.meta.abilityResult).toBe(true);
  });

  it("✅ 目标不含恶魔 ⇒ false", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.fortune_teller, seats, 5, {
      night: 2,
      targets: [3, 6],
    });
    expect(res.meta.abilityResult).toBe(false);
  });

  it("✅ 目标含红鲱鱼（非恶魔）⇒ 官方必须报 true", async () => {
    const seats = board(MAIN);
    seats[3] = { ...seats[3], isRedHerring: true }; // 3号士兵被标为红鲱鱼
    const res = await runRole(BY_ROLE.fortune_teller, seats, 5, {
      night: 2,
      targets: [3, 6],
    });
    expect(res.meta.abilityResult, "占卜师红鲱鱼未生效").toBe(true);
  });

  it("🔴 涡流在场 ⇒ 结果必须取反", async () => {
    const seats = board(MAIN);
    const normal = await runRole(BY_ROLE.fortune_teller, seats, 5, {
      night: 2,
      targets: [3, 4],
    });
    const vx = await runRole(BY_ROLE.fortune_teller, seats, 5, {
      night: 2,
      targets: [3, 4],
      snapshot: VORTOX,
    });
    expect(normal.meta.abilityResult).toBe(true);
    expect(vx.meta.abilityResult, "涡流世界占卜师未取反 = 信息泄漏").toBe(false);
  });
});

describe("洗衣妇：报的镇民必须真的在两名候选之一", () => {
  it("✅ 报出的角色是场上真实镇民，且恰好一人持有", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.washerwoman, seats, 6, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    const role = roles.find((x) => x.name === info.roleName);
    expect(role, `洗衣妇报出的角色「${info.roleName}」不是合法角色名`).toBeTruthy();
    expect(role!.type, "洗衣妇只能报镇民").toBe("townsfolk");
    expect(info.seat1).not.toBe(info.seat2);
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      `洗衣妇报「${info.seat1 + 1}号 与 ${info.seat2 + 1}号 中有一名是【${info.roleName}】」，但真值不成立`
    ).toBe(true);
    // 不得把洗衣妇自己算进候选
    expect([info.seat1, info.seat2]).not.toContain(6);
  });

  it("🔴 涡流在场 ⇒ 该信息必须为假", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.washerwoman, seats, 6, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      `涡流世界洗衣妇仍报出真信息（${info.seat1 + 1}号/${info.seat2 + 1}号 中确有一名是【${info.roleName}】）= 信息泄漏`
    ).toBe(false);
  });
});

describe("图书管理员：报的外来者必须真的在两名候选之一，且不得是间谍", () => {
  it("✅ 报出的角色是场上真实外来者，且恰好一人持有", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.librarian, seats, 7, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    const role = roles.find((x) => x.name === info.roleName);
    expect(role, `图书管理员报出的角色「${info.roleName}」不是合法角色名`).toBeTruthy();
    expect(role!.type, "图书管理员只能报外来者").toBe("outsider");
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      `图书管理员报「${info.seat1 + 1}号 与 ${info.seat2 + 1}号 中有一名是【${info.roleName}】」，但真值不成立`
    ).toBe(true);
  });

  it("🔴 场上只有间谍这类「可被当外来者」的角色 ⇒ 必须报「没有外来者」", async () => {
    const seats = board([
      "librarian",
      "spy",
      "imp",
      "chef",
      "soldier",
      "empath",
      "butler",
      "mayor",
      "ravenkeeper",
      "saint",
    ]);
    // 真外来者：butler(6) / ravenkeeper(8) / saint(9) 都在场 —— 换个只有间谍的盘
    const onlySpy = board(["librarian", "spy", "imp", "chef", "soldier", "empath"]);
    const res = await runRole(BY_ROLE.librarian, onlySpy, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    expect(
      info.roleName,
      "场上 0 名真外来者（间谍被当作好人）⇒ 必须报「没有外来者」，不得报出间谍"
    ).toBe("");
    void seats;
  });

  it("🔴 涡流在场 ⇒ 该信息必须为假", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.librarian, seats, 7, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      "涡流世界图书管理员仍报出真信息 = 信息泄漏"
    ).toBe(false);
  });
});

describe("调查员：报的爪牙必须真的在两名候选之一，且不得是间谍", () => {
  it("✅ 报出的角色是场上真实爪牙，且恰好一人持有", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.investigator, seats, 8, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    const role = roles.find((x) => x.name === info.roleName);
    expect(role, `调查员报出的角色「${info.roleName}」不是合法角色名`).toBeTruthy();
    expect(role!.type, "调查员只能报爪牙").toBe("minion");
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      `调查员报「${info.seat1 + 1}号 与 ${info.seat2 + 1}号 中有一名是【${info.roleName}】」，但真值不成立`
    ).toBe(true);
  });

  it("🔴 间谍是唯一爪牙 ⇒ 必须报「没有爪牙」（间谍被当作好人）", async () => {
    const seats = board(["investigator", "spy", "imp", "chef", "soldier", "empath"]);
    const res = await runRole(BY_ROLE.investigator, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    expect(
      info.roleName,
      "间谍是唯一爪牙时必须报「没有爪牙」，不得报出【间谍】"
    ).toBe("");
  });

  it("🔴 涡流在场 ⇒ 该信息必须为假", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.investigator, seats, 8, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    expect(
      exactlyOneHolds(seats, info.seat1, info.seat2, info.roleName),
      "涡流世界调查员仍报出真信息 = 信息泄漏"
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 第二批：基于「死亡 / 处决」的信息角色
// ════════════════════════════════════════════════════════════════════

describe("送葬者：报的必须是被处决者的真实角色", () => {
  it("✅ 今日处决 4号士兵 ⇒ 必须报「士兵」", async () => {
    const seats = board(MAIN); // 3 = soldier（0 基）
    const res = await runRole(BY_ROLE.undertaker, seats, 0, {
      night: 2,
      snapshot: { todayExecutedId: 3 },
    });
    const info = res.meta.abilityResult;
    expect(info.executedSeatId, "送葬者报错了被处决者").toBe(3);
    expect(info.roleName, "送葬者报出的角色与真实角色不符").toBe("士兵");
  });

  it("✅ 今日处决 1号投毒者 ⇒ 必须报「投毒者」", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.undertaker, seats, 0, {
      night: 2,
      snapshot: { todayExecutedId: 1 },
    });
    expect(res.meta.abilityResult.roleName).toBe("投毒者");
  });

  it("❌ 今日无人被处决 ⇒ 技能必须中止（不得凭空造信息）", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.undertaker, seats, 0, { night: 2 });
    expect(res.aborted, "无人在被处决时送葬者不应产生信息").toBe(true);
    expect(res.meta.abilityResult).toBeUndefined();
  });

  it("🔴 涡流在场 ⇒ 报出的角色必须不是真实角色", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.undertaker, seats, 0, {
      night: 2,
      snapshot: { todayExecutedId: 3, isVortoxWorld: true },
    });
    expect(
      res.meta.abilityResult.roleName,
      "涡流世界送葬者仍报出真实角色 = 信息泄漏"
    ).not.toBe("士兵");
  });
});

describe("守鸦人：报的必须是所选目标的真实角色", () => {
  const diedTonight = (seats: any[], selfId: number, night: number) => {
    const i = seats.findIndex((s: any) => s.id === selfId);
    seats[i] = { ...seats[i], isDead: true, diedAtNight: night };
    return seats;
  };

  it("✅ 当夜死亡且选 1号投毒者 ⇒ 必须报「投毒者」", async () => {
    const seats = diedTonight(board(MAIN), 3, 2);
    const res = await runRole(BY_ROLE.ravenkeeper, seats, 3, {
      night: 2,
      targets: [1],
    });
    expect(res.meta.abilityResult.roleName).toBe("投毒者");
    expect(res.meta.abilityResult.targetId).toBe(1);
  });

  it("✅ 选 4号小恶魔 ⇒ 必须报「小恶魔」", async () => {
    const seats = diedTonight(board(MAIN), 3, 2);
    const res = await runRole(BY_ROLE.ravenkeeper, seats, 3, {
      night: 2,
      targets: [4],
    });
    expect(res.meta.abilityResult.roleName).toBe("小恶魔");
  });

  it("❌ 当夜未死亡 ⇒ 技能必须中止", async () => {
    const seats = board(MAIN);
    const res = await runRole(BY_ROLE.ravenkeeper, seats, 3, {
      night: 2,
      targets: [1],
    });
    expect(res.aborted, "守鸦人未在夜间死亡却产出了信息").toBe(true);
  });

  it("🔴 涡流在场 ⇒ 报出的角色必须不是真实角色", async () => {
    const seats = diedTonight(board(MAIN), 3, 2);
    const res = await runRole(BY_ROLE.ravenkeeper, seats, 3, {
      night: 2,
      targets: [1],
      snapshot: { isVortoxWorld: true },
    });
    expect(
      res.meta.abilityResult.roleName,
      "涡流世界守鸦人仍报出真实角色 = 信息泄漏"
    ).not.toBe("投毒者");
  });
});

describe("神谕者：报的「已死邪恶人数」必须等于真实死邪恶数", () => {
  /** 造「1 投毒者(爪牙) 与 4 小恶魔 都已死」的棋盘 */
  const deadEvil = (seats: any[]) => {
    seats[1] = { ...seats[1], isDead: true };
    seats[4] = { ...seats[4], isDead: true };
    return seats;
  };

  it("✅ 两个邪恶已死、其余善良存活 ⇒ 必须报 2", async () => {
    const seats = deadEvil(board(MAIN));
    const truth = seats.filter((s: any) => s.isDead && isEvilType(s.role)).length;
    expect(truth).toBe(2);
    const res = await runRole(BY_ROLE.oracle, seats, 0, { night: 2 });
    expect(res.meta.abilityResult.deadEvilCount, "神谕者报数与真值不符").toBe(truth);
    expect(
      res.meta.abilityResult.finalCount,
      "清醒时最终显示数必须等于真值"
    ).toBe(truth);
  });

  it("✅ 只有 1 名邪恶已死 ⇒ 必须报 1", async () => {
    const seats = board(MAIN);
    seats[1] = { ...seats[1], isDead: true };
    const truth = seats.filter((s: any) => s.isDead && isEvilType(s.role)).length;
    expect(truth).toBe(1);
    const res = await runRole(BY_ROLE.oracle, seats, 0, { night: 2 });
    expect(res.meta.abilityResult.finalCount).toBe(truth);
  });

  it("🔴 涡流在场 ⇒ 最终显示数必须与真值不同", async () => {
    const seats = deadEvil(board(MAIN));
    const res = await runRole(BY_ROLE.oracle, seats, 0, {
      night: 2,
      snapshot: VORTOX,
    });
    const truth = seats.filter((s: any) => s.isDead && isEvilType(s.role)).length;
    expect(
      res.meta.abilityResult.finalCount,
      "涡流世界神谕者仍报出真值 = 信息泄漏"
    ).not.toBe(truth);
  });
});

describe("智者：非「被恶魔杀死」时不得产出信息", () => {
  it("❌ killedByDemon=false ⇒ 不得给出任何座位（found 必须为 false）", async () => {
    const seats = board(MAIN);
    seats[3] = { ...seats[3], isDead: true, diedAtNight: 2 };
    const res = await runRole(BY_ROLE.sage, seats, 3, {
      night: 2,
      targets: [4],
      storytellerInput: { killedByDemon: false },
    });
    /**
     * ⚠️ 判据校正：智者的实现是「不产出信息」（`abilityResult.targetIds = []`、
     *   `found = false`），**不是** `aborted = true`。
     *   第一版断言 `aborted === true` ⇒ 假红（应用行为正确，判据写错）。
     *   正确的判据是「没有把任何座位当作邪恶指给玩家」。
     */
    const info = res.meta.abilityResult;
    expect(info.found, "智者未被恶魔杀死却产出了信息").toBe(false);
    expect(info.targetIds, "智者未被恶魔杀死却指出了座位").toEqual([]);
  });

  it("✅ killedByDemon=true ⇒ 产出信息且指向恶魔", async () => {
    const seats = board(MAIN);
    seats[3] = { ...seats[3], isDead: true, diedAtNight: 2 };
    const res = await runRole(BY_ROLE.sage, seats, 3, {
      night: 2,
      targets: [4],
      storytellerInput: { killedByDemon: true },
    });
    const info = res.meta.abilityResult;
    expect(info.found, "智者被恶魔杀死却未产出信息").toBe(true);
    expect(info.targetIds, "智者信息未指向恶魔座位").toContain(4);
  });
});

// ════════════════════════════════════════════════════════════════════
// 第三批：梦境 / 投票类 / 指向类信息
// ════════════════════════════════════════════════════════════════════

/** 把主棋盘 0 号位换成被测角色，邪恶布局不变（1=投毒者，4=小恶魔） */
const withSelf = (roleId: string) => {
  const layout = [...MAIN];
  layout[0] = roleId;
  return board(layout);
};

describe("梦境者：两名候选角色中必须恰好一位是目标的真实角色", () => {
  it("✅ 目标为邪恶（4号小恶魔）⇒ roleA/roleB 必有一个是「小恶魔」", async () => {
    const seats = withSelf("dreamer");
    const actual = roleOf(seats, 4)!.id;
    const res = await runRole(BY_ROLE.dreamer, seats, 0, {
      night: 2,
      targets: [4],
      storytellerInput: { roleA: undefined, roleB: undefined },
    });
    const info = res.meta.abilityResult;
    expect(info.actualRole.id).toBe(actual);
    const hits = [info.roleA.id, info.roleB.id].filter((id: string) => id === actual);
    expect(hits.length, "梦境者的两名候选里必须恰好一位是真实角色").toBe(1);
  });

  it("✅ 目标为善良（3号士兵）⇒ 同理", async () => {
    const seats = withSelf("dreamer");
    const actual = roleOf(seats, 3)!.id;
    const res = await runRole(BY_ROLE.dreamer, seats, 0, {
      night: 2,
      targets: [3],
    });
    const info = res.meta.abilityResult;
    const hits = [info.roleA.id, info.roleB.id].filter((id: string) => id === actual);
    expect(hits.length).toBe(1);
  });

  it("🔴 涡流在场 ⇒ 两名候选必须**都不是**真实角色", async () => {
    const seats = withSelf("dreamer");
    const actual = roleOf(seats, 4)!.id;
    const res = await runRole(BY_ROLE.dreamer, seats, 0, {
      night: 2,
      targets: [4],
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    const hits = [info.roleA.id, info.roleB.id].filter((id: string) => id === actual);
    expect(hits.length, "涡流世界梦境者仍给出真实角色 = 信息泄漏").toBe(0);
  });
});

describe("卖花女：报的「恶魔今天投票了吗」必须等于真实投票情况", () => {
  it("✅ 恶魔投过票 ⇒ 必须报 true", async () => {
    const seats = withSelf("flowergirl");
    const res = await runRole(BY_ROLE.flowergirl, seats, 0, {
      night: 2,
      snapshot: { demonVotedToday: true },
    });
    const info = res.meta.abilityResult;
    expect(info.hasVoted, "卖花女报的与真实投票情况不符").toBe(true);
    expect(info.actualVoted).toBe(true);
  });

  it("✅ 恶魔没投票 ⇒ 必须报 false", async () => {
    const seats = withSelf("flowergirl");
    const res = await runRole(BY_ROLE.flowergirl, seats, 0, {
      night: 2,
      snapshot: { demonVotedToday: false },
    });
    expect(res.meta.abilityResult.hasVoted).toBe(false);
  });

  it("🔴 涡流在场 ⇒ 必须反转（真值 true 时报 false）", async () => {
    const seats = withSelf("flowergirl");
    const res = await runRole(BY_ROLE.flowergirl, seats, 0, {
      night: 2,
      snapshot: { demonVotedToday: true, isVortoxWorld: true },
    });
    expect(
      res.meta.abilityResult.hasVoted,
      "涡流世界卖花女未反转 = 信息泄漏"
    ).toBe(false);
  });
});

describe("城镇公告员：报的「爪牙今天提名了吗」必须等于真实情况", () => {
  it("✅ 爪牙提名过 ⇒ 必须报 true", async () => {
    const seats = withSelf("town_crier");
    const res = await runRole(BY_ROLE.town_crier, seats, 0, {
      night: 2,
      snapshot: { minionNominatedToday: true },
    });
    expect(res.meta.abilityResult.minionNominated).toBe(true);
  });

  it("✅ 爪牙没提名 ⇒ 必须报 false", async () => {
    const seats = withSelf("town_crier");
    const res = await runRole(BY_ROLE.town_crier, seats, 0, {
      night: 2,
      snapshot: { minionNominatedToday: false },
    });
    expect(res.meta.abilityResult.minionNominated).toBe(false);
  });

  it("🔴 中毒 ⇒ 必须反转", async () => {
    const seats = withSelf("town_crier");
    seats[0] = { ...seats[0], isPoisoned: true };
    const res = await runRole(BY_ROLE.town_crier, seats, 0, {
      night: 2,
      snapshot: { minionNominatedToday: true },
    });
    expect(
      res.meta.abilityResult.minionNominated,
      "中毒的城镇公告员仍报真值 = 信息泄漏"
    ).toBe(false);
  });
});

describe("贵族：指出的三名玩家中必须恰好一位邪恶", () => {
  it("✅ 真值：三人中恰一位邪恶，且不含自己", async () => {
    const seats = withSelf("noble");
    const res = await runRole(BY_ROLE.noble, seats, 0, { night: 1, phase: "firstNight" });
    const info = res.meta.abilityResult;
    const trio = [info.seat1, info.seat2, info.seat3];
    const evilCount = trio.filter((id: number) => isEvilType(roleOf(seats, id))).length;
    expect(evilCount, "贵族指出的三人中邪恶人数必须恰好为 1").toBe(1);
    expect(trio, "贵族不得把自己算进三人").not.toContain(0);
    expect(new Set(trio).size, "贵族不得重复指同一人").toBe(3);
  });

  it("🔴 涡流在场 ⇒ 三人中邪恶人数不得为 1", async () => {
    const seats = withSelf("noble");
    const res = await runRole(BY_ROLE.noble, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    const trio = [info.seat1, info.seat2, info.seat3];
    const evilCount = trio.filter((id: number) => isEvilType(roleOf(seats, id))).length;
    expect(evilCount, "涡流世界贵族仍报出「三人中一位邪恶」= 信息泄漏").not.toBe(1);
  });
});

describe("骑士：指出的两名玩家的角色都**不是恶魔**", () => {
  /**
   * ⚠️ 判据以**本项目官方文档**为准，不是英文原版：
   *   `src/data/officialRoleDocs.json` 原文——
   *   「骑士会得知角色不为恶魔的玩家。在骑士的首个夜晚，他会得知两名玩家，
   *     这两名玩家的角色都不是恶魔。……骑士得知的玩家可以是镇民、外来者
   *     甚至爪牙，但骑士不会知道他所得知的玩家的具体角色类型。」
   *
   * 第一版断言写成「两人中恰一位是爪牙」（英文原版 Knight 的规则）⇒ 假红。
   * 教训：本项目的角色名与英文原版并非 1:1，判据必须回查 officialRoleDocs。
   */
  it("✅ 真值：两人都不是恶魔，且不含自己", async () => {
    const seats = withSelf("knight");
    const res = await runRole(BY_ROLE.knight, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    const pair = [info.seat1, info.seat2];
    const demonCount = pair.filter(
      (id: number) => roleOf(seats, id)?.type === "demon"
    ).length;
    expect(demonCount, "骑士真信息里不得包含恶魔").toBe(0);
    expect(pair, "骑士不得把自己算进两人").not.toContain(0);
    expect(info.seat1).not.toBe(info.seat2);
  });

  it("🔴 涡流在场 ⇒ 两人里必须包含恶魔（信息必假）", async () => {
    const seats = withSelf("knight");
    const res = await runRole(BY_ROLE.knight, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: VORTOX,
    });
    const info = res.meta.abilityResult;
    const pair = [info.seat1, info.seat2];
    const demonCount = pair.filter(
      (id: number) => roleOf(seats, id)?.type === "demon"
    ).length;
    expect(
      demonCount,
      "涡流世界骑士仍报出「两人都不是恶魔」= 信息泄漏"
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("修行者：报的方向必须是「最近的邪恶」的方向", () => {
  it("✅ 顺时针最近的邪恶在 1号（1 步）、逆时针在 4号（6 步）⇒ 必须报「右」", async () => {
    const seats = withSelf("shugenja");
    const res = await runRole(BY_ROLE.shugenja, seats, 0, {
      night: 1,
      phase: "firstNight",
      storytellerInput: {}, // 不等距 ⇒ 不需要说书人裁决
    });
    expect(res.meta.abilityResult.sunDirection, "修行者方向与真实最近邪恶不符").toBe("右");
  });

  it("🔴 涡流在场 ⇒ 必须反向报「左」", async () => {
    const seats = withSelf("shugenja");
    const res = await runRole(BY_ROLE.shugenja, seats, 0, {
      night: 1,
      phase: "firstNight",
      storytellerInput: {},
      snapshot: VORTOX,
    });
    expect(
      res.meta.abilityResult.sunDirection,
      "涡流世界修行者未反向 = 信息泄漏"
    ).toBe("左");
  });
});

describe("杂耍艺人：报的「猜对人数」必须等于真实猜对数", () => {
  const guessesBoard = () => withSelf("juggler");

  it("✅ 两条猜测一对一错 ⇒ 必须报 1", async () => {
    const seats = guessesBoard();
    const res = await runRole(BY_ROLE.juggler, seats, 0, {
      night: 2,
      storytellerInput: {
        guesses: [
          { targetSeatId: 1, roleName: "投毒者" }, // 1 = poisoner，猜对
          { targetSeatId: 3, roleName: "共情者" }, // 3 = soldier，猜错
        ],
      },
    });
    const info = res.meta.abilityResult;
    const truth = [
      { id: 1, name: "投毒者" },
      { id: 3, name: "共情者" },
    ].filter((g) => roleOf(seats, g.id)?.name === g.name).length;
    expect(truth).toBe(1);
    expect(info.realCount, "杂耍艺人算出的猜对数与真值不符").toBe(truth);
    expect(info.correctCount).toBe(truth);
  });

  it("✅ 两条全对 ⇒ 必须报 2", async () => {
    const seats = guessesBoard();
    const res = await runRole(BY_ROLE.juggler, seats, 0, {
      night: 2,
      storytellerInput: {
        guesses: [
          { targetSeatId: 1, roleName: "投毒者" },
          { targetSeatId: 4, roleName: "小恶魔" },
        ],
      },
    });
    expect(res.meta.abilityResult.correctCount).toBe(2);
  });

  it("✅ 两条全错 ⇒ 必须报 0", async () => {
    const seats = guessesBoard();
    const res = await runRole(BY_ROLE.juggler, seats, 0, {
      night: 2,
      storytellerInput: {
        guesses: [
          { targetSeatId: 1, roleName: "士兵" },
          { targetSeatId: 4, roleName: "投毒者" },
        ],
      },
    });
    expect(res.meta.abilityResult.correctCount).toBe(0);
  });

  it("🔴 涡流在场 ⇒ 告知数必须与真值不同", async () => {
    const seats = guessesBoard();
    const res = await runRole(BY_ROLE.juggler, seats, 0, {
      night: 2,
      snapshot: VORTOX,
      storytellerInput: {
        guesses: [
          { targetSeatId: 1, roleName: "投毒者" },
          { targetSeatId: 3, roleName: "共情者" },
        ],
      },
    });
    expect(
      res.meta.abilityResult.correctCount,
      "涡流世界杂耍艺人仍报出真实猜对数 = 信息泄漏"
    ).not.toBe(res.meta.abilityResult.realCount);
  });
});

// ════════════════════════════════════════════════════════════════════
// 第五批：数值统计 / 身份核对 / 指向类信息
// ════════════════════════════════════════════════════════════════════

describe("数学家：报的「异常能力次数」必须等于真实异常次数", () => {
  it("✅ 真实异常 3 次 ⇒ 必须报 3", async () => {
    const seats = withSelf("mathematician");
    const res = await runRole(BY_ROLE.mathematician, seats, 0, {
      night: 2,
      snapshot: { abnormalAbilityCount: 3 },
    });
    expect(res.meta.abilityResult.actualCount, "数学家算出的异常数与真值不符").toBe(3);
    expect(res.meta.abilityResult.abnormalCount).toBe(3);
  });

  it("✅ 真实异常 0 次 ⇒ 必须报 0", async () => {
    const seats = withSelf("mathematician");
    const res = await runRole(BY_ROLE.mathematician, seats, 0, {
      night: 2,
      snapshot: { abnormalAbilityCount: 0 },
    });
    expect(res.meta.abilityResult.abnormalCount).toBe(0);
  });

  it("🔴 中毒 ⇒ 告知数必须与真值不同", async () => {
    /**
     * ⚠️ 干扰必须走**座位状态**（`isPoisoned`），不能只塞 `meta.abilityEffective`：
     *   `abilityPriorityCalculation` 中间件会按座位状态**覆盖**该字段，
     *   注入的 false 会被算回 true ⇒ 判据静默失效（第一版就这么假绿的）。
     */
    const seats = withSelf("mathematician");
    seats[0] = { ...seats[0], isPoisoned: true };
    const res = await runRole(BY_ROLE.mathematician, seats, 0, {
      night: 2,
      snapshot: { abnormalAbilityCount: 3 },
    });
    expect(
      res.meta.abilityResult.abnormalCount,
      "中毒的数学家仍报真实异常数 = 信息泄漏"
    ).not.toBe(3);
  });
});

describe("祖母：报的「孙子」必须是自己被指定的那名玩家", () => {
  const boardWithGrandchild = (grandchildId: number) => {
    const seats = withSelf("grandmother");
    seats[0] = { ...seats[0], grandchildId };
    return seats;
  };

  it("✅ 指定孙子为 3号士兵 ⇒ 必须报士兵", async () => {
    const seats = boardWithGrandchild(3);
    const res = await runRole(BY_ROLE.grandmother, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    expect(info.grandchildId).toBe(3);
    expect(info.grandchildRoleName, "祖母报出的孙子角色与真实角色不符").toBe("士兵");
    expect(info.grandchildRoleId).toBe("soldier");
  });

  it("✅ 未指定孙子 ⇒ 必须明确返回 -1（不得瞎报）", async () => {
    const seats = withSelf("grandmother");
    const res = await runRole(BY_ROLE.grandmother, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    expect(res.meta.abilityResult.grandchildId).toBe(-1);
  });

  it("🔴 中毒 ⇒ 报出的孙子不得是真实指定者", async () => {
    const seats = boardWithGrandchild(3);
    // ⚠️ 祖母的 preCheck 读 `statusEffects` 里的 poisoned/drunk，不读布尔位 ⇒ 两者都要写
    seats[0] = {
      ...seats[0],
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "poisoner" }],
    };
    const res = await runRole(BY_ROLE.grandmother, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    expect(
      res.meta.abilityResult.grandchildId,
      "中毒的祖母仍报出真实孙子 = 信息泄漏"
    ).not.toBe(3);
  });
});

describe("侍女：报的「被唤醒人数」必须等于真实唤醒数", () => {
  const withWakes = (wakes: number[]) => {
    const results: Record<string, any> = {};
    wakes.forEach((id, i) => {
      results[`role${i}`] = { seatId: id };
    });
    return results;
  };

  it("✅ 目标 1号/2号 中 1 人被唤醒 ⇒ 必须报 1", async () => {
    const seats = withSelf("chambermaid");
    const res = await runRole(BY_ROLE.chambermaid, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: { _abilityResults: withWakes([1, 5]) },
    });
    expect(res.meta.abilityResult.wokenCount, "侍女报的唤醒人数与真值不符").toBe(1);
  });

  it("✅ 两目标都被唤醒 ⇒ 必须报 2", async () => {
    const seats = withSelf("chambermaid");
    const res = await runRole(BY_ROLE.chambermaid, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: { _abilityResults: withWakes([1, 2]) },
    });
    expect(res.meta.abilityResult.wokenCount).toBe(2);
  });

  it("✅ 两目标都没被唤醒 ⇒ 必须报 0", async () => {
    const seats = withSelf("chambermaid");
    const res = await runRole(BY_ROLE.chambermaid, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: { _abilityResults: withWakes([5, 6]) },
    });
    expect(res.meta.abilityResult.wokenCount).toBe(0);
  });

  it("🔴 涡流在场 ⇒ 告知数必须与真值不同", async () => {
    const seats = withSelf("chambermaid");
    const res = await runRole(BY_ROLE.chambermaid, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: { _abilityResults: withWakes([1]), isVortoxWorld: true },
    });
    expect(
      res.meta.abilityResult.wokenCount,
      "涡流世界侍女仍报真实唤醒数 = 信息泄漏"
    ).not.toBe(1);
  });
});

describe("裁缝：报的「两人是否同阵营」必须等于真实阵营关系", () => {
  it("✅ 爪牙 vs 镇民 ⇒ 不同阵营", async () => {
    const seats = withSelf("seamstress");
    const res = await runRole(BY_ROLE.seamstress, seats, 0, {
      night: 2,
      targets: [1, 3],
    });
    const info = res.meta.abilityResult;
    const truth = isEvilType(roleOf(seats, 1)) === isEvilType(roleOf(seats, 3));
    expect(truth, "棋盘构造应为不同阵营").toBe(false);
    expect(info.actualSameAlignment, "裁缝算出的阵营关系与真值不符").toBe(truth);
    expect(info.sameAlignment).toBe(truth);
  });

  it("✅ 两名善良 ⇒ 同阵营", async () => {
    const seats = withSelf("seamstress");
    const res = await runRole(BY_ROLE.seamstress, seats, 0, {
      night: 2,
      targets: [3, 5],
    });
    expect(res.meta.abilityResult.sameAlignment).toBe(true);
  });

  it("🔴 中毒 ⇒ 必须给出与真值相反的答案", async () => {
    const seats = withSelf("seamstress");
    seats[0] = {
      ...seats[0],
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "poisoner" }],
    };
    const res = await runRole(BY_ROLE.seamstress, seats, 0, {
      night: 2,
      targets: [1, 3],
    });
    expect(
      res.meta.abilityResult.sameAlignment,
      "中毒的裁缝仍报真值 = 信息泄漏"
    ).not.toBe(res.meta.abilityResult.actualSameAlignment);
  });
});

describe("小精灵：报的镇民必须**在场**", () => {
  const inPlayTownsfolk = (seats: any[]) =>
    seats.filter((s) => s.role?.type === "townsfolk").map((s) => s.role.id);

  it("✅ 未受干扰 ⇒ 报出的角色必须是在场镇民", async () => {
    const seats = withSelf("pixie");
    const inPlay = inPlayTownsfolk(seats);
    const res = await runRole(BY_ROLE.pixie, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    expect(info.isCorrupted).toBe(false);
    expect(
      inPlay,
      `小精灵报出【${info.roleName}】，但它不在场（在场镇民：${inPlay.join(",")}）`
    ).toContain(info.roleId);
  });

  it("🔴 中毒 ⇒ 报出的镇民必须**不在场**（信息必假）", async () => {
    const seats = withSelf("pixie");
    seats[0] = {
      ...seats[0],
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "poisoner" }],
    };
    const inPlay = inPlayTownsfolk(seats);
    const res = await runRole(BY_ROLE.pixie, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const info = res.meta.abilityResult;
    expect(info.isCorrupted).toBe(true);
    expect(
      inPlay,
      `中毒的小精灵报出【${info.roleName}】，而它确实在场 = 信息泄漏`
    ).not.toContain(info.roleId);
  });
});

describe("提刑官：被提名者的角色必须报对，恶魔则必须伪装成善良", () => {
  const withNomination = (targetId: number) => {
    const seats = withSelf("inspector");
    return { seats, snap: { inspectorNomination: { targetId } } };
  };

  it("✅ 被提名者是 3号士兵 ⇒ 必须如实报「士兵」", async () => {
    const { seats, snap } = withNomination(3);
    const res = await runRole(BY_ROLE.inspector, seats, 0, { night: 2, snapshot: snap });
    const info = res.meta.abilityResult;
    expect(info.isDemon).toBe(false);
    expect(info.revealedRoleId, "提刑官把非恶魔的角色报错了").toBe("soldier");
  });

  it("🔴 被提名者是 4号小恶魔 ⇒ 必须报成**非恶魔**的善良角色", async () => {
    const { seats, snap } = withNomination(4);
    const res = await runRole(BY_ROLE.inspector, seats, 0, { night: 2, snapshot: snap });
    const info = res.meta.abilityResult;
    expect(info.isDemon).toBe(true);
    expect(
      info.revealedRoleId,
      "提刑官把恶魔的真实角色直接报出来了 = 信息泄漏"
    ).not.toBe("imp");
    const revealed = roles.find((r) => r.id === info.revealedRoleId);
    expect(
      ["townsfolk", "outsider"],
      "提刑官对恶魔的伪装必须是善良角色"
    ).toContain(revealed?.type);
  });
});

describe("女祭司：受干扰时必须换成**另一名**玩家", () => {
  it("🔴 涡流在场 ⇒ 报出的玩家必须与正常世界不同", async () => {
    const normal = await runRole(BY_ROLE.high_priestess, withSelf("high_priestess"), 0, {
      night: 2,
    });
    const vx = await runRole(BY_ROLE.high_priestess, withSelf("high_priestess"), 0, {
      night: 2,
      snapshot: VORTOX,
    });
    expect(normal.meta.abilityResult.targetId, "正常世界必须给出玩家").not.toBeNull();
    expect(
      vx.meta.abilityResult.targetId,
      "涡流世界女祭司仍报同一名玩家 = 信息泄漏"
    ).not.toBe(normal.meta.abilityResult.targetId);
  });
});

describe("猎人：报的目标角色必须是该玩家的真实角色", () => {
  it("✅ 追捕 3号士兵 ⇒ 必须报「soldier」", async () => {
    const seats = withSelf("huntsman");
    const res = await runRole(BY_ROLE.huntsman, seats, 0, {
      night: 2,
      targets: [3],
    });
    expect(res.meta.abilityResult.targetRole, "猎人报的目标角色与真值不符").toBe(
      roleOf(seats, 3)!.id
    );
  });

  it("🔴 涡流在场 ⇒ 报出的角色必须不是真实角色", async () => {
    const seats = withSelf("huntsman");
    const res = await runRole(BY_ROLE.huntsman, seats, 0, {
      night: 2,
      targets: [3],
      snapshot: VORTOX,
    });
    expect(
      res.meta.abilityResult.targetRole,
      "涡流世界猎人仍报出真实角色 = 信息泄漏"
    ).not.toBe(roleOf(seats, 3)!.id);
  });
});

describe("赏金猎人：报出的玩家必须是**真的邪恶**", () => {
  it("✅ 未受干扰 ⇒ 报出的玩家真实阵营为邪恶", async () => {
    const seats = withSelf("bounty_hunter");
    const res = await runRole(BY_ROLE.bounty_hunter, seats, 0, {
      night: 2,
      storytellerInput: { targetId: 1, evilFound: true },
    });
    const info = res.meta.abilityResult;
    /**
     * ⚠️ 不允许「读到 null 就 return」：那会让判据**永远跳过**（本项目铁律 ②）。
     *   棋盘里明确有邪恶玩家（1号投毒者、4号小恶魔），必须真的报出一个。
     */
    expect(info.targetId, "棋盘里有邪恶玩家，赏金猎人却什么也没报").not.toBeNull();
    expect(
      isEvilType(roleOf(seats, info.targetId)),
      `赏金猎人报出 ${info.targetId + 1}号，但该玩家真实阵营为善良`
    ).toBe(true);
  });

  it("🔴 涡流在场 ⇒ 报出的玩家必须**不是**邪恶（信息必假）", async () => {
    const seats = withSelf("bounty_hunter");
    const res = await runRole(BY_ROLE.bounty_hunter, seats, 0, {
      night: 2,
      snapshot: VORTOX,
      storytellerInput: { targetId: 1, evilFound: true },
    });
    const info = res.meta.abilityResult;
    expect(info.targetId, "涡流世界赏金猎人应当给出假目标，却什么也没报").not.toBeNull();
    expect(
      isEvilType(roleOf(seats, info.targetId)),
      "涡流世界赏金猎人仍报出真邪恶玩家 = 信息泄漏"
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 覆盖率自检：登记表里的角色必须都有真值判据
// ════════════════════════════════════════════════════════════════════

describe("覆盖率自检：信息真值矩阵必须覆盖全部「自产假值」角色", () => {
  /**
   * 本文件已写真实值判据的角色。
   *
   * ⚠️ 与 `utils/corruptedInfo::ENGINE_SELF_FAKING_ROLE_IDS`（27 角色）比对：
   *   那张登记表的定义是「引擎自己会改写 abilityResult 的角色」——
   *   它们正是**最需要内容对账**的一批（双掩码翻真、假值恰好等于真值等）。
   *   新增登记项却漏写真值判据时，本条会红。
   */
  const COVERED = new Set([
    "chef",
    "empath",
    "clockmaker",
    "fortune_teller",
    "washerwoman",
    "librarian",
    "investigator",
    "undertaker",
    "ravenkeeper",
    "oracle",
    "sage",
    "dreamer",
    "flowergirl",
    "town_crier",
    "noble",
    "knight",
    "shugenja",
    "juggler",
    "mathematician",
    "grandmother",
    "chambermaid",
    "seamstress",
    "pixie",
    "inspector",
    "high_priestess",
    "huntsman",
    "bounty_hunter",
  ]);

  it("27 个自产假值角色必须全部有真值判据（缺一个就红）", async () => {
    const { ENGINE_SELF_FAKING_ROLE_IDS } = await import(
      "../../utils/corruptedInfo"
    );
    const registered = [...(ENGINE_SELF_FAKING_ROLE_IDS as Set<string>)].sort();
    const missing = registered.filter((id) => !COVERED.has(id));
    const extra = [...COVERED].filter(
      (id) => !(ENGINE_SELF_FAKING_ROLE_IDS as Set<string>).has(id)
    );
    expect(
      missing,
      `以下角色已登记为「自产假值」但**没有**信息真值判据：${missing.join(", ")}`
    ).toEqual([]);
    expect(
      extra,
      `以下角色写了真值判据但不在登记表里（须复核它是否真的自产假值）：${extra.join(", ")}`
    ).toEqual([]);
  });
});
