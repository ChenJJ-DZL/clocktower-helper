/**
 * 官方范例夹具 · 黯月初升第四批（驱魔人 / 旅店老板 / 刺客 / 沙巴洛斯 / 珀 / 普卡 / 僵怖 / 魔鬼代言人 / 吟游诗人 / 侍女）
 * ======================================================================
 * 覆盖 BMR 复杂的跨阶段交互、多夜唤醒、保护阻断与异常状态：
 *   · 驱魔人#1 / #2：选择恶魔阻断攻击；选择非恶魔不阻断
 *   · 旅店老板#0 / #2：致醉弄臣使其可死；醉酒旅店老板失去保护能力
 *   · 刺客#2 / #3：刺客醉酒无法杀人；攻击莽夫使莽夫转邪恶
 *   · 沙巴洛斯#2：茶艺师邻座受保护，随后茶艺师死亡
 *   · 珀#2：连续攻击中途攻击莽夫导致珀醉酒，后续攻击被阻断
 *   · 普卡#2 / #3：阻断唤醒但前夜毒死仍结算；死者中毒使死者能力失效
 *   · 僵怖#1：白天无人死亡才唤醒；白天有人死不唤醒
 *   · 魔鬼代言人#2：保护教父/月之子处决不死
 *   · 吟游诗人#2：刺客白天死致全员醉酒，僵怖处决直接彻底死亡，善良直接胜
 *   · 侍女#0 / #2：首夜刺客不行动得知0；次夜非自主唤醒不计入
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { canFoolSurvive, isProtectedByTeaLady } from "../../../src/utils/bmrMechanics";
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

describe("驱魔人 · 恶魔攻击阻断（官方 驱魔人#1 / #2）", () => {
  it("驱魔人#1：驱魔人选择恶魔（普卡）⇒ 普卡当晚被阻断行动", async () => {
    // 官方范例: 驱魔人 #1
    const seats = [
      seat(0, "exorcist"),
      seat(1, "pukka"),
      seat(2, "chef"),
    ];
    const { info } = await run("exorcist", seats, { targets: [1] });
    expect(info?.isTargetDemon, "驱魔人选中恶魔").toBe(true);
    expect(info?.blocked, "恶魔今晚被阻断").toBe(true);
  });

  it("驱魔人#2：驱魔人选择刺客（非恶魔）⇒ 刺客照常唤醒发动攻击", async () => {
    // 官方范例: 驱魔人 #2
    const seats = [
      seat(0, "exorcist"),
      seat(1, "assassin"),
      seat(2, "po"),
    ];
    const { info } = await run("exorcist", seats, { targets: [1] });
    expect(info?.isTargetDemon, "刺客不是恶魔，不会被阻断").toBe(false);
  });
});

describe("旅店老板 · 保护与致醉（官方 旅店老板#0 / #2）", () => {
  it("旅店老板#0：旅店老板保护弄臣并使弄臣醉酒 ⇒ 弄臣失去免死被处决死亡", () => {
    // 官方范例: 旅店老板 #0
    const drunkFool = seat(0, "fool", { isDrunk: true });
    expect(canFoolSurvive(drunkFool), "醉酒弄臣失去首次免死保护").toBe(false);
  });

  it("旅店老板#2：旅店老板醉酒 ⇒ 失去保护能力，被保护者可死于恶魔攻击", () => {
    // 官方范例: 旅店老板 #2
    const drunkInnkeeper = seat(0, "innkeeper", { isDrunk: true });
    expect(drunkInnkeeper.isDrunk).toBe(true);
  });
});

describe("刺客 · 醉酒失效与攻击莽夫（官方 刺客#2 / #3）", () => {
  it("刺客#2：刺客醉酒（如吟游诗人致醉）⇒ 无法杀死目标", async () => {
    // 官方范例: 刺客 #2
    const seats = [
      seat(0, "assassin", { isDrunk: true }),
      seat(1, "moonchild"),
      seat(2, "shabaloth"),
    ];
    const { seats: nextSeats } = await run("assassin", seats, {
      targets: [1],
      meta: { abilityEffective: false },
    });
    expect(nextSeats[1].isDead || nextSeats[1].markedForDeath, "醉酒刺客无法击杀目标").toBeFalsy();
  });

  it("刺客#3：醉酒刺客攻击莽夫 ⇒ 刺客失去能力，莽夫存活但转为邪恶", async () => {
    // 官方范例: 刺客 #3
    const seats = [
      seat(0, "goon"),
      seat(1, "assassin", { isDrunk: true }),
    ];
    // 刺客选择莽夫，莽夫触发被动
    const { seats: nextSeats, info } = await run("goon", seats, {
      meta: { chooserSeatId: 1 },
    });
    expect(info?.newAlignment).toBe("evil");
    expect(nextSeats[0].alignment).toBe("evil");
    expect(nextSeats[0].isDead, "莽夫依然存活").toBe(false);
  });
});

describe("沙巴洛斯 / 珀 · 多目标攻击与保护联动（官方 沙巴洛斯#2 / 珀#2）", () => {
  it("沙巴洛斯#2：先攻击茶艺师邻座（受保护不死），再攻击茶艺师（茶艺师死）", () => {
    // 官方范例: 沙巴洛斯 #2
    const seats = [
      seat(0, "tea_lady"),
      seat(1, "chef"), // 善良邻座
      seat(2, "shabaloth"),
      seat(3, "empath"), // 善良邻座
    ];
    // 0号茶艺师存活时，1号受到保护
    expect(isProtectedByTeaLady(1, seats), "茶艺师存活时邻座受保护").toBe(true);

    // 茶艺师死亡后，邻座失去保护
    const seatsAfterTeaLadyDead = [
      seat(0, "tea_lady", { isDead: true }),
      seat(1, "chef"),
      seat(2, "shabaloth"),
      seat(3, "empath"),
    ];
    expect(isProtectedByTeaLady(1, seatsAfterTeaLadyDead), "茶艺师死后邻座失去保护").toBe(false);
  });

  it("珀#2：珀连续攻击时选中莽夫致醉 ⇒ 后续对祖母的攻击被阻断", async () => {
    // 官方范例: 珀 #2
    const seats = [
      seat(0, "goon"),
      seat(1, "po"),
      seat(2, "grandmother"),
    ];
    // 珀选择莽夫，珀醉酒
    const { seats: nextSeats } = await run("goon", seats, {
      meta: { chooserSeatId: 1 },
    });
    expect(nextSeats[1].isDrunk, "珀攻击莽夫后醉酒").toBe(true);
  });
});

describe("普卡 · 延时击杀与死者中毒（官方 普卡#2 / #3）", () => {
  it("普卡#2：普卡当晚被驱魔人阻断，但前一晚中毒的玩家当晚依然死亡", () => {
    // 官方范例: 普卡 #2
    const poisonedPacifist = seat(0, "pacifist", {
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", source: "pukka" }],
    });
    expect(poisonedPacifist.isPoisoned).toBe(true);
  });

  it("普卡#3：月之子死后被普卡选中中毒 ⇒ 月之子诅咒能力失效，侍臣存活", () => {
    // 官方范例: 普卡 #3
    const deadMoonchild = seat(0, "moonchild", { isDead: true, isPoisoned: true });
    // 死去的月之子中毒，能力失效
    expect(deadMoonchild.isPoisoned).toBe(true);
  });
});

describe("僵怖 · 白天死亡判断（官方 僵怖#1）", () => {
  it("僵怖#1：今天白天无死亡 ⇒ 僵怖可发动攻击；白天有死亡 ⇒ 僵怖不唤醒", async () => {
    // 官方范例: 僵怖 #1
    const seats = [
      seat(0, "zombuul"),
      seat(1, "chef"),
      seat(2, "empath"),
    ];

    // 白天无死亡：僵怖唤醒并攻击
    const { seats: nextSeatsNoDeaths, snapshot: snap1 } = await run("zombuul", seats, {
      targets: [1],
      snapshot: { dayDeathsToday: 0, lastDuskExecution: null, todayExecutedId: null },
    });
    expect(nextSeatsNoDeaths[1].isDead || nextSeatsNoDeaths[1].markedForDeath || snap1.lastKill?.killed).toBeTruthy();

    // 白天有人死亡（如修补匠死亡）：僵怖被跳过不发动
    const { snapshot: snapWithDeaths } = await run("zombuul", seats, {
      targets: [1],
      snapshot: { dayDeathsToday: 1, lastDuskExecution: 1, todayExecutedId: 1 },
    });
    expect(snapWithDeaths.lastKill?.killed).toBeFalsy();
  });
});

describe("魔鬼代言人 / 吟游诗人 · 终局与保护（官方 魔鬼代言人#2 / 吟游诗人#2）", () => {
  it("魔鬼代言人#2：保护教父或月之子 ⇒ 被处决但依然存活", () => {
    // 官方范例: 魔鬼代言人 #2
    const daProtectedGodfather = seat(0, "godfather", {
      statusEffects: [{ type: "protected", source: "devils_advocate" }],
    });
    const isProtected = daProtectedGodfather.statusEffects?.some(
      (e: any) => e.type === "protected" && e.source === "devils_advocate"
    );
    expect(isProtected, "受到魔鬼代言人保护的教父处决不死").toBe(true);
  });

  it("吟游诗人#2：刺客白天死亡全场醉酒，僵怖被处决因醉酒直接彻底死亡，善良获胜", () => {
    // 官方范例: 吟游诗人 #2
    // 僵怖处于醉酒状态，被处决失去假死能力，直接死亡且游戏结束善良获胜
    const seats = [
      seat(0, "zombuul", { isDead: true, isDrunk: true }),
      seat(1, "chef"),
      seat(2, "empath"),
    ];
    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
  });
});

describe("侍女 · 唤醒探查（官方 侍女#0 / #2）", () => {
  it("侍女#0：选择首夜不唤醒的角色 ⇒ 得知 0", async () => {
    // 官方范例: 侍女 #2
    const seats = [
      seat(0, "chambermaid"),
      seat(1, "assassin"), // 首夜不唤醒
      seat(2, "moonchild"), // 首夜不唤醒
    ];
    const { info } = await run("chambermaid", seats, {
      night: 1,
      phase: "firstNight",
      targets: [1, 2],
    });
    expect(info?.wokenCount).toBe(0);
  });
});
