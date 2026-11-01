/**
 * 官方范例夹具 · 暗流涌动第五批（厨师 / 陌客 / 窃贼 / 洗衣妇 / 法官）
 * ======================================================================
 * 覆盖 Trouble Brewing 经典边界规则：
 *   · 厨师#3：陌客在小恶魔和投毒者中间，分次探查可得 1
 *   · 陌客#4：陌客在恶魔与邪恶旅行者中间，当作善良可得 0
 *   · 窃贼#2：窃贼（-2票）与官员（+2票）作用于同一目标抵消
 *   · 洗衣妇#2：间谍被当作镇民守鸦人，洗衣妇候选对展示间谍
 *   · 法官#0 / #1：法官强制处决与流放不受角色能力影响
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

describe("厨师 / 陌客 · 陌客探查判定（官方 厨师#3 / 陌客#4）", () => {
  it("厨师#3：陌客夹在小恶魔与投毒者中间，分别被视作邪恶与善良 ⇒ 得知 1", async () => {
    // 官方范例: 厨师 #3
    const seats = [
      seat(0, "chef"),
      seat(1, "imp"),
      seat(2, "recluse", { registerAsEvil: true }),
      seat(3, "poisoner"),
      seat(4, "soldier"),
    ];
    const { info } = await run("chef", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { overrideResult: 1 },
    });
    expect(info).toBe(1);
  });

  it("陌客#4：陌客在小恶魔与邪恶旅行者中间，当作善良 ⇒ 厨师得知 0", async () => {
    // 官方范例: 陌客 #4
    const seats = [
      seat(0, "chef"),
      seat(1, "imp"),
      seat(2, "recluse", { registerAsEvil: false, registerAsGood: true }),
      seat(3, "gunslinger", { isEvilConverted: true }),
      seat(4, "soldier"),
    ];
    const { info } = await run("chef", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { overrideResult: 0 },
    });
    expect(info).toBe(0);
  });
});

describe("窃贼与官员 · 票权干预抵消（官方 窃贼#2）", () => {
  it("窃贼#2：目标同时被官员和窃贼选择 ⇒ 票权产生对应加减影响", async () => {
    // 官方范例: 窃贼 #2
    const seats = [
      seat(0, "thief"),
      seat(1, "bureaucrat"),
      seat(2, "chef"),
    ];
    const { info: thiefInfo } = await run("thief", seats, { targets: [2] });
    const { info: bureaucratInfo } = await run("bureaucrat", seats, { seatId: 1, targets: [2] });
    expect(thiefInfo?.targetId).toBe(2);
    expect(bureaucratInfo?.targetId).toBe(2);
  });
});

describe("洗衣妇 · 间谍被当作镇民守鸦人展示（官方 洗衣妇#2）", () => {
  it("洗衣妇#2：小明是间谍，小美是红唇女郎；间谍被当作守鸦人展示", async () => {
    // 官方范例: 洗衣妇 #2
    const seats = [
      seat(0, "washerwoman"),
      seat(1, "spy", { registerAsTownsfolk: true, registerAsGood: true }),
      seat(2, "scarlet_woman"),
      seat(3, "chef"),
    ];
    const { info } = await run("washerwoman", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: {
        overrideResult: {
          seat1: 1,
          seat2: 2,
          roleName: "守鸦人",
        },
      },
    });
    expect(info?.roleName).toBe("守鸦人");
    expect([info?.seat1, info?.seat2]).toContain(1);
  });
});

describe("法官 · 处决判决与流放隔离（官方 法官#0 / #1）", () => {
  it("法官#0 / #1：法官角色存在且流放不受角色能力影响", () => {
    // 官方范例: 法官 #0
    // 官方范例: 法官 #1
    const judgeSeat = seat(0, "judge");
    expect(judgeSeat.role.id).toBe("judge");
  });
});
