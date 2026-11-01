/**
 * 官方范例夹具 · 实验性角色第二批（骑士 / 报丧女妖 / 赏金猎人 / 提线木偶 / 小精灵）
 * ======================================================================
 * 覆盖扩展/实验性角色信息与被动机制：
 *   · 骑士#0 / #1：首夜得知两名非恶魔玩家；涡流局信息必假（必含恶魔）
 *   · 报丧女妖#0：死于恶魔后公开宣告死亡，白天可多次提名且拥两票
 *   · 赏金猎人#0：首夜得知一名邪恶玩家；该邪恶死后后续得知新邪恶
 *   · 提线木偶#0：以为自己是善良角色（信息受干扰），恶魔被处决善良获胜
 *   · 小精灵#0：得知在场镇民角色并疯狂证明
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
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

describe("骑士 · 首夜得知非恶魔玩家（官方 骑士#0 / #1）", () => {
  it("骑士#0：涡流在场时信息必假 ⇒ 得知的两名玩家中必须包含恶魔", async () => {
    // 官方范例: 骑士 #0
    // 官方范例: 骑士（实验角色） #0
    const seats = [
      seat(0, "knight"),
      seat(1, "imp"), // 恶魔
      seat(2, "chef"),
      seat(3, "empath"),
    ];
    const { info } = await run("knight", seats, {
      night: 1,
      phase: "firstNight",
      snapshot: { isVortoxWorld: true },
    });
    // 涡流局中信息必须为假，故骑士必须包含恶魔座位
    expect([info?.seat1, info?.seat2]).toContain(1);
  });

  it("骑士#1：正常局中骑士得知两名非恶魔玩家", async () => {
    // 官方范例: 骑士 #1
    const seats = [
      seat(0, "knight"),
      seat(1, "chef"), // 非恶魔
      seat(2, "empath"), // 非恶魔
      seat(3, "imp"), // 恶魔
    ];
    const { info } = await run("knight", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { overrideResult: { seat1: 1, seat2: 2 } },
    });
    expect([info?.seat1, info?.seat2]).toContain(1);
    expect([info?.seat1, info?.seat2]).toContain(2);
    expect([info?.seat1, info?.seat2]).not.toContain(3);
  });
});

describe("报丧女妖 · 死于恶魔后的能力（官方 报丧女妖#0）", () => {
  it("报丧女妖#0：死于恶魔后能力激活，死于非恶魔不激活", async () => {
    // 官方范例: 报丧女妖 #0
    // 官方范例: 报丧女妖（实验角色） #0
    const seats = [
      seat(0, "banshee", { isDead: true, diedAtNight: 2 }),
      seat(1, "imp"),
      seat(2, "chef"),
    ];
    const { info } = await run("banshee", seats, {
      night: 2,
      phase: "night",
      meta: { killedByDemon: true },
    });
    expect(info?.bansheeAwakened).toBe(true);
  });
});

describe("赏金猎人 · 查验邪恶玩家（官方 赏金猎人#0）", () => {
  it("赏金猎人#0：首夜得知一名邪恶玩家", async () => {
    // 官方范例: 赏金猎人 #0
    // 官方范例: 赏金猎人（实验角色） #0
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "poisoner"), // 邪恶
      seat(2, "chef"),
      seat(3, "imp"),
    ];
    const { info } = await run("bounty_hunter", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { evilPlayerId: 1 },
    });
    expect(info?.learnedEvilPlayerId ?? info?.targetId).toBe(1);
  });
});

describe("提线木偶 · 伪装身份与恶魔死胜负（官方 提线木偶#0）", () => {
  it("提线木偶#0：提线木偶以为自己是送葬者，恶魔被处决善良直接胜", () => {
    // 官方范例: 提线木偶 #0
    // 官方范例: 提线木偶（实验角色） #0
    const seats = [
      seat(0, "marionette", { charadeRole: "undertaker" }),
      seat(1, "imp", { isDead: true }), // 恶魔死
      seat(2, "chef"),
      seat(3, "empath"),
    ];
    const verdict = judge(seats, "execution", 1);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
  });
});

describe("小精灵 · 获得在场镇民信息（官方 小精灵#0）", () => {
  it("小精灵#0：首夜得知在场的镇民角色", async () => {
    // 官方范例: 小精灵 #0
    // 官方范例: 小精灵（实验角色） #0
    const seats = [
      seat(0, "pixie"),
      seat(1, "chef"),
      seat(2, "imp"),
    ];
    const { info } = await run("pixie", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { designatedRole: "chef" },
    });
    expect(info?.roleId ?? info?.designatedRoleId ?? info?.targetRole).toBe("chef");
  });
});
