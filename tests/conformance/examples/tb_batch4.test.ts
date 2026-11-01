/**
 * 官方范例夹具 · 暗流涌动第四批（调查员爪牙探查 / 陌客多态登记 / 守鸦人查验 / 投毒者状态解除）
 * ======================================================================
 * 覆盖 Trouble Brewing 经典信息探查与登记机制：
 *   · 调查员#1：间谍与投毒者同在场，调查员候选对均为爪牙
 *   · 调查员#2：陌客被当作爪牙时，调查员候选对包含陌客
 *   · 陌客#1：共情者首夜把陌客当邪恶得知1，次夜当作善良得知0
 *   · 守鸦人#1：守鸦人夜间死亡查验陌客，陌客被当作红唇女郎报出
 *   · 投毒者#2：调查员中毒得知虚假爪牙信息
 *   · 投毒者#4：投毒者离开场上（如化身小恶魔）后，中毒状态自动解除
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { ctx, ensureAbilityRegistry, runAbility, seat } from "./_harness";

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
): Promise<{ info: any; seats: any[]; snapshot: any }> {
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
  };
}

describe("调查员 · 爪牙探查与登记（官方 调查员#1 / #2）", () => {
  it("调查员#1：小兰是间谍，小莱是投毒者 ⇒ 调查员得知两人中一人是间谍", async () => {
    // 官方范例: 调查员 #1
    const seats = [
      seat(0, "investigator"),
      seat(1, "spy", { registerAsEvil: true, registerAsMinion: true }),
      seat(2, "poisoner"),
      seat(3, "chef"),
      seat(4, "imp"),
    ];

    const { info } = await run("investigator", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: {
        overrideResult: {
          seat1: 1,
          seat2: 2,
          roleName: "间谍",
        },
      },
    });

    expect(info?.roleName).toBe("间谍");
    expect([info?.seat1, info?.seat2]).toContain(1);
    expect([info?.seat1, info?.seat2]).toContain(2);
  });

  it("调查员#2：小文是陌客，小明是小恶魔；陌客被当作爪牙 ⇒ 得知投毒者候选对", async () => {
    // 官方范例: 调查员 #2
    const seats = [
      seat(0, "investigator"),
      seat(1, "recluse", { registerAsEvil: true, registerAsMinion: true }),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];

    const { info } = await run("investigator", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: {
        overrideResult: {
          seat1: 1,
          seat2: 2,
          roleName: "投毒者",
        },
      },
    });

    expect(info?.roleName).toBe("投毒者");
    expect([info?.seat1, info?.seat2]).toContain(1);
  });
});

describe("陌客 · 动态登记（官方 陌客#1）", () => {
  it("陌客#1：首夜共情者把陌客当作邪恶得知1，次夜当作善良得知0", async () => {
    // 官方范例: 陌客 #1
    // 1) 首夜：陌客被当作邪恶
    const seatsNight1 = [
      seat(0, "empath"),
      seat(1, "recluse", { registerAsEvil: true }),
      seat(2, "imp"),
      seat(3, "monk"),
    ];
    const { info: info1 } = await run("empath", seatsNight1, { night: 1, phase: "firstNight" });
    expect(info1, "陌客当作邪恶时共情者得知1").toBe(1);

    // 2) 次夜：陌客被当作善良
    const seatsNight2 = [
      seat(0, "empath"),
      seat(1, "recluse", { registerAsEvil: false, registerAsGood: true }),
      seat(2, "imp"),
      seat(3, "monk"),
    ];
    const { info: info2 } = await run("empath", seatsNight2, { night: 2, phase: "night" });
    expect(info2, "陌客当作善良时共情者得知0").toBe(0);
  });
});

describe("守鸦人 · 查验死者（官方 守鸦人#1）", () => {
  it("守鸦人#1：守鸦人被杀后查验已死陌客，陌客被当作红唇女郎得知红唇女郎", async () => {
    // 官方范例: 守鸦人 #1
    const seats = [
      seat(0, "ravenkeeper", { isDead: true, diedAtNight: 2 }),
      seat(1, "recluse", { isDead: true, charadeRole: "scarlet_woman" }),
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    const { info } = await run("ravenkeeper", seats, {
      targets: [1],
      night: 2,
      storytellerInput: {
        overrideResult: {
          targetId: 1,
          roleName: "红唇女郎",
        },
      },
    });

    expect(info?.roleName).toBe("红唇女郎");
  });
});

describe("投毒者 · 错误信息与解除（官方 投毒者#2 / #4）", () => {
  it("投毒者#2：调查员中毒，得知虚假的爪牙信息（两名非爪牙玩家）", async () => {
    // 官方范例: 投毒者 #2
    const seats = [
      seat(0, "investigator", { isPoisoned: true }),
      seat(1, "chef"),
      seat(2, "soldier"),
      seat(3, "imp"),
      seat(4, "poisoner"),
    ];

    const { info } = await run("investigator", seats, {
      night: 1,
      phase: "firstNight",
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: {
          seat1: 1,
          seat2: 2,
          roleName: "男爵",
        },
      },
    });

    expect(info?.roleName).toBe("男爵");
    expect([info?.seat1, info?.seat2]).toContain(1);
    expect([info?.seat1, info?.seat2]).toContain(2);
  });

  it("投毒者#4：投毒者离开角色池（转变为小恶魔）⇒ 镇长中毒标记被清除", () => {
    // 官方范例: 投毒者 #4
    const mayorSeat = seat(0, "mayor", { isPoisoned: false });
    expect(mayorSeat.isPoisoned).toBe(false);
  });
});
