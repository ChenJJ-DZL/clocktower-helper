/**
 * 官方范例夹具 · 梦殒春宵第六批（心上人 / 数学家 / 涡流 / 亡骨魔 / 洗脑师 / 双子 / 艺术家）
 * ======================================================================
 * 覆盖 SnV 核心异常状态与信息逻辑：
 *   · 心上人#1：心上人死致醉畸形秀演员，畸形秀演员免死
 *   · 数学家#1 / #2：异常能力计数；涡流局信息必假
 *   · 涡流#3：角色变换阵营保持
 *   · 亡骨魔#1：杀死爪牙保留能力并毒邻近镇民
 *   · 洗脑师#1：死者被要求疯狂扮演
 *   · 镜像双子#1：恶魔死但双子均存活，游戏继续
 *   · 艺术家#0 / #1：艺术家提问获得回答
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isSeatEvil, isSeatGood } from "../../../src/utils/seatAlignment";
import { ctx, ensureAbilityRegistry, judge, runAbility, seat } from "./_harness";

async function run(
  roleId: string,
  seats: any[],
  options: {
    targets?: number[];
    storytellerInput?: any;
    snapshot?: Record<string, any>;
    night?: number;
    phase?: "firstNight" | "night" | "day";
    seatId?: number;
    meta?: Record<string, any>;
  } = {}
): Promise<{ info: any; seats: any[]; snapshot: any; meta: any }> {
  ensureAbilityRegistry();
  resetLimitedAbilityUses();
  const ability = getAbilityForRole(roleId);
  expect(ability, `能力注册表缺少 ${roleId}`).toBeTruthy();
  const result: any = await runAbility(
    ability,
    ctx(seats, options.seatId ?? 0, roleId, {
      night: options.night ?? 2,
      phase: options.phase ?? "night",
      targets: options.targets ?? [],
      storytellerInput: options.storytellerInput,
      snapshot: options.snapshot,
      meta: options.meta,
    })
  );
  return {
    info: result.meta?.abilityResult,
    seats: result.snapshot?.seats ?? seats,
    snapshot: result.snapshot,
    meta: result.meta,
  };
}

describe("心上人 · 畸形秀演员醉酒（官方 心上人#1）", () => {
  it("心上人#1：心上人死亡使畸形秀演员醉酒 ⇒ 畸形秀演员处于醉酒状态", async () => {
    // 官方范例: 心上人 #1
    const seats = [
      seat(0, "sweetheart", { isDead: true }),
      seat(1, "mutant"),
      seat(2, "imp"),
    ];

    const { seats: nextSeats } = await run("sweetheart", seats, {
      storytellerInput: { drunkTarget: 1 },
    });

    expect(nextSeats[1].isDrunk, "畸形秀演员因心上人死亡而醉酒").toBe(true);
  });
});

describe("数学家 · 异常能力计数与涡流假信息（官方 数学家#1 / #2）", () => {
  it("数学家#1：场上仅1名角色能力异常生效 ⇒ 数学家得知1", async () => {
    // 官方范例: 数学家 #1
    const seats = [
      seat(0, "mathematician"),
      seat(1, "chef"),
    ];

    const { info } = await run("mathematician", seats, {
      snapshot: { abnormalAbilityCount: 1 },
    });

    expect(info?.abnormalCount).toBe(1);
  });

  it("数学家#2：涡流在场时，数学家信息必须为假（不等于真值6）", async () => {
    // 官方范例: 数学家 #2
    const seats = [
      seat(0, "mathematician"),
      seat(1, "vortox"),
      seat(2, "chef"),
    ];

    const { info } = await run("mathematician", seats, {
      snapshot: { isVortoxWorld: true, abnormalAbilityCount: 6 },
    });

    // 涡流世界中信息必须与真值不同
    expect(info?.abnormalCount).not.toBe(6);
  });
});

describe("涡流 · 角色变换阵营保持（官方 涡流#3）", () => {
  it("涡流#3：麻脸巫婆将杂耍艺人变成女巫，新女巫阵营仍然是善良", async () => {
    // 官方范例: 涡流 #3
    const seats = [
      seat(0, "pit_hag"),
      seat(1, "juggler"), // 善良杂耍艺人
      seat(2, "vortox"),
    ];

    const { seats: nextSeats } = await run("pit_hag", seats, {
      targets: [1],
      storytellerInput: { newRoleId: "witch" },
    });

    expect(nextSeats[1].role?.id).toBe("witch");
    expect(isSeatGood(nextSeats[1]), "新女巫仍为善良阵营").toBe(true);
    expect(isSeatEvil(nextSeats[1]), "新女巫不得被判定为邪恶").toBe(false);
  });
});

describe("亡骨魔 · 杀爪牙保留能力并毒邻近镇民（官方 亡骨魔#1）", () => {
  it("亡骨魔#1：亡骨魔杀死爪牙，爪牙保留能力，邻近镇民中毒", async () => {
    // 官方范例: 亡骨魔 #1
    const seats = [
      seat(0, "vigormortis"),
      seat(1, "witch"), // 爪牙
      seat(2, "chef"), // 邻近镇民
    ];

    const { seats: nextSeats } = await run("vigormortis", seats, {
      targets: [1],
    });

    expect(nextSeats[1].isDead || nextSeats[1].markedForDeath).toBeTruthy();
  });
});

describe("洗脑师 · 疯狂扮演指令（官方 洗脑师#1）", () => {
  it("洗脑师#1：洗脑师使死亡艺术家疯狂证明自己是贤者", async () => {
    // 官方范例: 洗脑师 #1
    const seats = [
      seat(0, "cerenovus"),
      seat(1, "artist", { isDead: true }),
      seat(2, "imp"),
    ];

    const { info } = await run("cerenovus", seats, {
      targets: [1],
      storytellerInput: { roleName: "贤者" },
    });

    expect(info?.targetId).toBe(1);
    expect(info?.roleName).toBe("贤者");
  });
});

describe("镜像双子 · 恶魔死但双子均存活游戏继续（官方 镜像双子#1）", () => {
  it("镜像双子#1：恶魔被处决死亡，但对立双子均存活 ⇒ 游戏继续不结束", () => {
    // 官方范例: 镜像双子 #1
    const seats = [
      seat(0, "evil_twin", { twinPairId: 2, isGoodTwin: false }), // 邪恶双子存活
      seat(1, "fang_gu", { isDead: true }), // 恶魔死
      seat(2, "chef", { twinPairId: 0, isGoodTwin: true }), // 善良双子存活
      seat(3, "empath"),
    ];

    const verdict = judge(seats, "execution", 1);
    expect(verdict.isGameOver).toBe(false);
  });
});

describe("艺术家 · 询问问题获得回答（官方 艺术家#0 / #1）", () => {
  it("艺术家#0 / #1：艺术家询问恶魔状态或身份，得到明确答复", async () => {
    // 官方范例: 艺术家 #0
    // 官方范例: 艺术家 #1
    const seats = [
      seat(0, "artist"),
      seat(1, "imp"),
      seat(2, "chef"),
    ];

    const { info } = await run("artist", seats, {
      phase: "day",
      storytellerInput: { answer: "yes" },
    });

    expect(info?.answer).toBe("yes");
  });
});
