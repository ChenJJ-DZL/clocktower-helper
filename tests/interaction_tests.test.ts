/**
 * 关键角色交互自动测试
 * 测试最常出 bug 的角色互动组合
 * 使用纯函数 processGameEvent，不需要浏览器
 */

import type { Role, Seat } from "../app/data";
import { initializeSeats, processGameEvent } from "../app/gameLogic";
import { isActorDisabledByPoisonOrDrunk } from "../src/utils/gameRules";
import { validateAbilityPreConditions } from "../src/utils/abilityExecutor";

// ============================================================
// 角色定义
// ============================================================

const imp: Role = { id: "imp", name: "小恶魔", type: "demon" };
const monk: Role = { id: "monk", name: "僧侣", type: "townsfolk" };
const soldier: Role = { id: "soldier", name: "士兵", type: "townsfolk" };
const poisoner: Role = { id: "poisoner", name: "投毒者", type: "minion" };
const empath: Role = { id: "empath", name: "共情者", type: "townsfolk" };
const teaLady: Role = { id: "tea_lady", name: "茶艺师", type: "townsfolk" };
const fool: Role = { id: "fool", name: "弄臣", type: "townsfolk" };
const zombuul: Role = { id: "zombuul", name: "僵怖", type: "demon" };
const innkeeper: Role = { id: "innkeeper", name: "旅店老板", type: "townsfolk" };
const townsfolk: Role = { id: "villager", name: "村民", type: "townsfolk" };

function makeSeats(roles: Role[]): Seat[] {
  const seats = initializeSeats(roles.length);
  roles.forEach((role, i) => {
    seats[i].role = role;
  });
  return seats;
}

// ============================================================
// 基础保护交互
// ============================================================

describe("僧侣 × 小恶魔", () => {
  test("僧侣保护的玩家应该免疫恶魔杀人", () => {
    const seats = makeSeats([townsfolk, monk, imp]);
    // 僧侣保护玩家0
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;

    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs.some((l) => l.includes("僧侣"))).toBe(true);
  });

  test("没被保护的玩家应该被恶魔杀死", () => {
    const seats = makeSeats([townsfolk, imp]);
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(true);
  });
});

describe("士兵 × 小恶魔", () => {
  test("士兵应该免疫恶魔攻击", () => {
    const seats = makeSeats([soldier, imp]);
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs.some((l) => l.includes("士兵"))).toBe(true);
  });

  test("士兵不免疫非恶魔攻击", () => {
    const seats = makeSeats([soldier, townsfolk]);
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "ability",
      killerRoleId: "assassin",
    });

    // 士兵只免疫恶魔攻击，非恶魔攻击应该有效
    // 注意：此处取决于游戏规则，如果刺客可以杀士兵则应为true
    expect(result.seats[0].isDead).toBe(true);
  });
});

describe("茶艺师 × 恶魔", () => {
  test("茶艺师的好邻居应该被保护", () => {
    const seats = makeSeats([townsfolk, teaLady, townsfolk, imp]);
    // 茶艺师在1号位，两个好邻居在0和2号位
    // 试图杀0号位
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs.some((l) => l.includes("茶艺师"))).toBe(true);
  });
});

describe("弄臣 × 恶魔", () => {
  test("弄臣第一次被恶魔杀应该免死", () => {
    const seats = makeSeats([fool, imp]);
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs.some((l) => l.includes("弄臣"))).toBe(true);
  });

  test("弄臣第二次被恶魔杀应该死", () => {
    const seats = makeSeats([fool, imp]);
    seats[0].statusDetails = ["弄臣免死已触发"];
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(true);
  });
});

// ============================================================
// 保护叠加与穿透
// ============================================================

describe("保护叠加", () => {
  test("刺客应该能穿透僧侣保护", () => {
    const seats = makeSeats([townsfolk, monk, townsfolk]);
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;

    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "ability",
      killerRoleId: "assassin",
    });

    // 刺客攻击穿透保护
    expect(result.seats[0].isDead).toBe(true);
  });

  test("旅店老板应该能保护两个玩家", () => {
    const seats = makeSeats([townsfolk, innkeeper, townsfolk, imp]);
    // 旅店老板保护自己和0号
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;
    seats[1].isProtected = true;
    seats[1].protectedBy = 1;

    // 尝试杀0号
    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
  });
});

// ============================================================
// 僵怖假死
// ============================================================

describe("僵怖假死逻辑", () => {
  test("僵怖首次被处决应该假死", () => {
    const seats = makeSeats([zombuul, townsfolk]);
    seats[0].zombuulLives = 1;
    seats[0].isFirstDeathForZombuul = false;

    const result = processGameEvent(seats, "day", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "execution",
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.seats[0].isFirstDeathForZombuul).toBe(true);
    expect(result.seats[0].zombuulLives).toBe(0);
    expect(result.logs.some((l) => l.includes("假死"))).toBe(true);
  });

  test("僵怖第二次被杀应该真死", () => {
    const seats = makeSeats([zombuul, townsfolk]);
    seats[0].zombuulLives = 0;
    seats[0].isFirstDeathForZombuul = true;

    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
    });

    expect(result.seats[0].isDead).toBe(true);
  });
});

// ============================================================
// 旅店老板保护
// ============================================================

describe("旅店老板保护", () => {
  test("旅店老板保护恶魔杀不死", () => {
    const seats = makeSeats([townsfolk, innkeeper, imp]);
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;

    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    expect(result.seats[0].isDead).toBe(false);
  });

  test("旅店老板保护处决可以杀死", () => {
    const seats = makeSeats([townsfolk, innkeeper]);
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;

    // 旅店老板保护不免疫处决
    const result = processGameEvent(seats, "day", {
      type: "EXECUTE_PLAYER",
      targetId: 0,
    });

    // 处决不受旅店老板保护影响
    expect(result.seats[0].isDead).toBe(true);
  });
});

// ============================================================
// 中毒状态
// ============================================================

describe("中毒判定", () => {
  test("被投毒的玩家应该被判定为中毒", () => {
    const seats = makeSeats([townsfolk, poisoner]);
    seats[0].statusDetails = ["投毒（首夜清除）"];

    const poisoned = isActorDisabledByPoisonOrDrunk(seats[0]);
    expect(poisoned).toBe(true);
  });

  test("中毒的僧侣不能保护玩家", () => {
    const seats = makeSeats([townsfolk, monk, imp]);
    // 僧侣中毒但仍然标记保护
    seats[0].isProtected = true;
    seats[0].protectedBy = 1;
    seats[1].isPoisoned = true;
    seats[1].statusDetails = ["投毒（首夜清除）"];

    const result = processGameEvent(seats, "night", {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
      killerRoleId: "imp",
    });

    // 因为僧侣中毒，保护不生效，玩家应该死
    expect(result.seats[0].isDead).toBe(true);
  });
});

// ============================================================
// 茶艺师处决保护
// ============================================================

describe("茶艺师处决保护", () => {
  test("茶艺师的好邻居被处决应该被保护", () => {
    const seats = makeSeats([townsfolk, teaLady, townsfolk]);
    const result = processGameEvent(seats, "day", {
      type: "EXECUTE_PLAYER",
      targetId: 0,
    });

    expect(result.seats[0].isDead).toBe(false);
    expect(result.logs.some((l) => l.includes("茶艺师"))).toBe(true);
  });
});

// ============================================================
// 能力执行器测试
// ============================================================

describe("abilityExecutor 前置校验", () => {
  test("死亡的玩家应该被阻止行动", () => {
    const seats = makeSeats([townsfolk, imp]);
    seats[0].isDead = true;

    const result = validateAbilityPreConditions(seats[0], [], seats);

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("死亡");
  });
});
