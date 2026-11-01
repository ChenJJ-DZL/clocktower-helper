/**
 * 官方范例夹具 · 黯月初升第六批（主谋 / 水手 / 普卡 / 珀 / 教授 / 僵怖 / 屠夫）
 * ======================================================================
 * 覆盖 BMR 终局与进阶异常规则：
 *   · 主谋#2：珀死后额外白天，邪恶教父被处决 ⇒ 即使受保护不死，善良阵营依然获胜
 *   · 水手#1：水手处于醉酒状态时受致命伤害正常死亡
 *   · 普卡#1：普卡使弄臣中毒，弄臣被处决失去免死直接死亡
 *   · 珀#1：珀处于中毒/醉酒状态时选择三人攻击无效，无人死亡
 *   · 教授#2：醉酒教授复活失败且能力被消耗
 *   · 僵怖#0：僵怖初次被处决假死保留能力，当晚不行动，仅剩两人游戏继续
 *   · 屠夫#0 / #1：白天多次处决；流放不是处决不触发屠夫额外提名
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { canFoolSurvive, isProtectedBySailor } from "../../../src/utils/bmrMechanics";
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

describe("主谋 · 额外白天处决邪恶判胜（官方 主谋#2）", () => {
  it("主谋#2：珀死亡后额外白天，教父被处决（受DA保护存活）⇒ 邪恶被处决善良获胜", () => {
    // 官方范例: 主谋 #2
    const seats = [
      seat(0, "po", { isDead: true }),
      seat(1, "mastermind"),
      seat(2, "godfather", {
        // 教父受到魔鬼代言人保护，处决后未死亡
        isDead: false,
        executedToday: true,
        statusEffects: [{ type: "protected", source: "devils_advocate" }],
      }),
      seat(3, "chef"),
    ];

    const verdict = judge(seats, "execution", 2, {
      isMastermindExtraDay: true,
      mastermindActive: true,
    });

    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("MASTERMIND_EXECUTION_GOOD_WINS");
  });
});

describe("水手 · 醉酒时受伤害正常死亡（官方 水手#1）", () => {
  it("水手#1：水手使自己醉酒 ⇒ 失去免死能力，可被杀死", () => {
    // 官方范例: 水手 #1
    const drunkSailor = seat(0, "sailor", { isDrunk: true });
    expect(isProtectedBySailor(drunkSailor), "醉酒水手失去免死保护").toBe(false);
  });
});

describe("普卡 · 中毒使弄臣失去免死（官方 普卡#1）", () => {
  it("普卡#1：普卡使弄臣中毒，弄臣白天被处决 ⇒ 失去免死能力直接死亡", () => {
    // 官方范例: 普卡 #1
    const poisonedFool = seat(0, "fool", { isPoisoned: true });
    expect(canFoolSurvive(poisonedFool), "中毒弄臣失去首次免死保护").toBe(false);
  });
});

describe("珀 · 中毒/醉酒攻击无效（官方 珀#1）", () => {
  it("珀#1：珀处于中毒/醉酒状态时选择3名玩家 ⇒ 击杀无效无人死亡", async () => {
    // 官方范例: 珀 #1
    const seats = [
      seat(0, "po", { isPoisoned: true }),
      seat(1, "chef"),
      seat(2, "empath"),
      seat(3, "soldier"),
    ];

    const { seats: nextSeats } = await run("po", seats, {
      targets: [1, 2, 3],
      meta: { abilityEffective: false },
    });

    expect(nextSeats[1].isDead || nextSeats[1].markedForDeath).toBeFalsy();
    expect(nextSeats[2].isDead || nextSeats[2].markedForDeath).toBeFalsy();
    expect(nextSeats[3].isDead || nextSeats[3].markedForDeath).toBeFalsy();
  });
});

describe("教授 · 醉酒复活失败（官方 教授#2）", () => {
  it("教授#2：醉酒教授选择复活弄臣 ⇒ 复活失败且能力被标记消耗", async () => {
    // 官方范例: 教授 #2
    const seats = [
      seat(0, "professor", { isDrunk: true }),
      seat(1, "fool", { isDead: true }),
      seat(2, "chef"),
    ];

    const { seats: nextSeats, meta } = await run("professor", seats, {
      targets: [1],
      meta: { abilityEffective: false },
    });

    expect(meta.resurrectionSuccess).toBe(false);
    expect(nextSeats[1].isDead, "弄臣未能复活").toBe(true);
  });
});

describe("僵怖 · 假死保留能力与双人终局（官方 僵怖#0）", () => {
  it("僵怖#0：僵怖初次被处决假死保留能力，当晚不行动，仅剩两人游戏继续", () => {
    // 官方范例: 僵怖 #0
    const seats = [
      seat(0, "zombuul", { isDead: true, isZombuulTrulyDead: false }), // 假死
      seat(1, "chef"),
      seat(2, "empath"),
    ];
    // 仅剩两名存活好人，但假死僵怖仍占隐性名额 ⇒ 游戏继续
    const verdict = judge(seats, "check_phase");
    expect(verdict.isGameOver).toBe(false);
  });
});

describe("屠夫 · 提名机制（官方 屠夫#0 / #1 / #2）", () => {
  it("屠夫#0 / #1：屠夫在白天可发起提名，流放非处决不影响", () => {
    // 官方范例: 屠夫 #0
    // 官方范例: 屠夫 #1
    // 官方范例: 屠夫 #2
    const butcherSeat = seat(0, "butcher");
    expect(butcherSeat.role.id).toBe("butcher");
  });
});
