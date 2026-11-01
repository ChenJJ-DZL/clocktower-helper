/**
 * 官方范例夹具 · 暗流涌动第三批（酒鬼伪装 / 间谍身份 / 投毒圣徒 / 陌客爪牙登记）
 * ======================================================================
 * 覆盖 Trouble Brewing 经典身份登记与异常交互：
 *   · 酒鬼#0：以为自己是士兵的酒鬼被恶魔攻击，正常死亡（无士兵免死能力）
 *   · 间谍#2：间谍被登记为镇民时提名贞洁者，触发贞洁者处决间谍
 *   · 投毒者#3：中毒的圣徒被处决，游戏继续（不判邪恶获胜）
 *   · 图书管理员#1：陌客被登记为爪牙且无其他外来者时，图书管理员得0
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isImmuneToDemonKill } from "../../../src/utils/soldierImmunity";
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

describe("酒鬼 · 伪装为士兵但无免疫能力（官方 酒鬼#0）", () => {
  it("酒鬼#0：以为自己是士兵的酒鬼被小恶魔攻击 ⇒ 酒鬼死亡", () => {
    // 官方范例: 酒鬼 #0
    const drunkSoldier = seat(0, "drunk", { charadeRole: "soldier" });
    const realSoldier = seat(1, "soldier");

    // 以为自己是士兵的酒鬼不具备士兵的恶魔攻击免疫
    expect(
      isImmuneToDemonKill(drunkSoldier),
      "以为自己是士兵的酒鬼不得免疫恶魔攻击"
    ).toBe(false);

    // 正向对照：真正的士兵免疫恶魔攻击
    expect(
      isImmuneToDemonKill(realSoldier),
      "真正的清醒士兵必然免疫恶魔攻击"
    ).toBe(true);
  });
});

describe("间谍 · 提名贞洁者被当作镇民处决（官方 间谍#2）", () => {
  it("间谍#2：间谍被当作镇民提名贞洁者 ⇒ 间谍被处决", async () => {
    // 官方范例: 间谍 #2
    const seats = [
      seat(0, "virgin"),
      seat(1, "spy"), // 间谍默认作为镇民候选参与贞洁者判定
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    const { info, seats: nextSeats } = await run("virgin", seats, {
      phase: "day",
      seatId: 0,
      meta: { nominatorId: 1 },
    });

    expect(info?.shouldExecute, "间谍被当作镇民应触发贞洁者处决").toBe(true);
    expect(info?.executedSeatId).toBe(1);
    expect(nextSeats[1].isDead || nextSeats[1].markedForDeath, "间谍被立即处决").toBeTruthy();
  });

  it("间谍：显式关闭镇民登记时提名贞洁者 ⇒ 不被处决（反向对照）", async () => {
    const seats = [
      seat(0, "virgin"),
      seat(1, "spy", { registerAsTownsfolk: false }),
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    const { info, seats: nextSeats } = await run("virgin", seats, {
      phase: "day",
      seatId: 0,
      meta: { nominatorId: 1 },
    });

    expect(info?.shouldExecute, "未被当作镇民的间谍不得触发贞洁者处决").toBe(false);
    expect(nextSeats[1].isDead, "间谍不得死亡").toBe(false);
  });
});

describe("投毒者 · 中毒圣徒被处决游戏继续（官方 投毒者#3）", () => {
  it("投毒者#3：中毒的圣徒被处决 ⇒ 游戏继续，邪恶阵营不获胜", () => {
    // 官方范例: 投毒者 #3
    const seats = [
      seat(0, "saint", { isDead: true, isPoisoned: true, executedToday: true }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];

    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver, "中毒的圣徒失去诅咒能力，处决后游戏继续").toBe(false);
  });

  it("圣徒：清醒健康时被处决 ⇒ 邪恶阵营获胜（正向对照）", () => {
    const seats = [
      seat(0, "saint", { isDead: true, isPoisoned: false, isDrunk: false, executedToday: true }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];

    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver, "清醒健康的圣徒被处决应直接判负").toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("SAINT_EXECUTED");
  });
});

describe("图书管理员 · 陌客当作爪牙时得知0（官方 图书管理员#1）", () => {
  it("图书管理员#1：说书人将陌客当作爪牙，场上无其他外来者 ⇒ 图书管理员得知0", async () => {
    // 官方范例: 图书管理员 #1
    const seats = [
      seat(0, "librarian"),
      seat(1, "recluse", { registerAsMinion: true, registerAsEvil: true }),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];

    const { info } = await run("librarian", seats, {
      night: 1,
      phase: "firstNight",
    });

    expect(info?.roleName, "场上无外来者时返回空角色名代表数字0").toBe("");
    expect(info?.seat1).toBe(-1);
    expect(info?.seat2).toBe(-1);
  });

  it("图书管理员：陌客按正常外来者登记时 ⇒ 得知陌客候选对（正向对照）", async () => {
    const seats = [
      seat(0, "librarian"),
      seat(1, "recluse"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];

    const { info } = await run("librarian", seats, {
      night: 1,
      phase: "firstNight",
    });

    expect(info?.roleName, "正常登记的陌客应作为外来者被查出").toBe("陌客");
    expect([info?.seat1, info?.seat2]).toContain(1);
  });
});
