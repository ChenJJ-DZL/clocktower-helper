/**
 * 官方范例夹具 · 黯月初升（保护链 / 隔夜记账 / 祖母连带死亡）
 * ======================================================================
 * 本批集中在「跨夜状态」与「保护优先级」两块 —— 这两块最容易写出**恒真断言**，
 * 所以每条都配一个反向对照（保护不成立 / 不带连锁 / 数量不足）。
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isProtectedByTeaLady } from "../../../src/utils/bmrMechanics";
import {
  isDemonKillSource,
  resolveGrandmotherChainDeaths,
} from "../../../src/utils/grandmotherChain";
import { ctx, ensureAbilityRegistry, judge, runAbility, seat } from "./_harness";

async function run(
  roleId: string,
  seats: any[],
  options: {
    targets?: number[];
    storytellerInput?: any;
    snapshot?: Record<string, any>;
    night?: number;
    meta?: Record<string, any>;
    keepLimited?: boolean;
  } = {}
): Promise<{ info: any; seats: any[]; snapshot: any }> {
  ensureAbilityRegistry();
  if (!options.keepLimited) resetLimitedAbilityUses();
  const ability = getAbilityForRole(roleId);
  expect(ability, `能力注册表缺少 ${roleId}`).toBeTruthy();
  const result: any = await runAbility(
    ability,
    ctx(seats, 0, roleId, {
      night: options.night ?? 2,
      phase: "night",
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

const byId = (seats: any[], id: number) => seats.find((s) => s.id === id);

describe("茶艺师 · 两侧存活邻居都是善良才保护（官方 茶艺师#1）", () => {
  it("茶艺师#1：邻居是善良女舍监与善良法官 ⇒ 被流放但仍受保护", async () => {
    // 官方范例: 茶艺师#1
    // 官方：茶艺师邻近的存活玩家是善良的女舍监和善良的法官；女舍监被流放但依然存活。
    // ⇒ 「流放」不改变存活状态，因此保护继续成立（判据只看「存活 + 善良」）。
    const seats = [
      seat(0, "tea_lady"),
      seat(1, "steward"), // 女舍监（0 号顺时针邻居）
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "judge"), // 法官（0 号逆时针邻居）
    ];
    expect(isProtectedByTeaLady(1, seats as any), "善良邻居受保护").toBe(true);
    expect(isProtectedByTeaLady(4, seats as any), "另一侧善良邻居同样受保护").toBe(
      true
    );
  });

  it("茶艺师：一侧邻居是邪恶 ⇒ 两人都不受保护（判据不得恒真）", async () => {
    // 官方范例: 茶艺师#1（反向对照：保护的前提是**两名**邻居都善良）
    const seats = [
      seat(0, "tea_lady"),
      seat(1, "steward"),
      seat(2, "judge"),
      seat(3, "poisoner"), // 邪恶，恰是 0 号的另一侧邻居
    ];
    expect(isProtectedByTeaLady(1, seats as any), "一侧邪恶则保护不成立").toBe(
      false
    );
  });
});

describe("赌徒 · 猜对不死，但仍可能被恶魔杀（官方 赌徒#0）", () => {
  it("赌徒#0：猜对吟游诗人 ⇒ 自己不会死；随后仍被恶魔杀死", async () => {
    // 官方范例: 赌徒#0
    const board = [
      seat(0, "gambler"),
      seat(1, "minstrel"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];
    const guess = await run("gambler", board, {
      targets: [1],
      storytellerInput: { guessedRole: "minstrel" },
    });
    expect(guess.info?.isGuessCorrect, "猜的是真实角色").toBe(true);
    expect(guess.info?.shouldDie, "猜对 ⇒ 不因赌博死亡").toBe(false);
    expect(byId(guess.seats, 0)?.isDead, "赌徒仍然存活").toBe(false);

    const killed = await run("imp", guess.seats, { targets: [0] });
    expect(byId(killed.seats, 0)?.isDead, "恶魔仍可把他杀死").toBe(true);
  });
});

describe("疯子 · 以为自己是恶魔，但选择的玩家不会死（官方 疯子#0）", () => {
  it("疯子#0：以为自己是沙巴洛斯，选两名玩家 ⇒ 无人死亡", async () => {
    // 官方范例: 疯子#0
    const { info, seats } = await run(
      "lunatic",
      [
        seat(0, "lunatic"),
        seat(1, "chef"),
        seat(2, "soldier"),
        seat(3, "mayor"),
        seat(4, "sage"),
      ],
      { targets: [1, 2], storytellerInput: { lunaticBelievedRole: "shabaloth" } }
    );
    expect(info?.realKill, "疯子没有真实击杀").toBe(false);
    expect(
      seats.filter((s) => s.isDead).length,
      "两名被选中的玩家都不得死亡"
    ).toBe(0);
  });
});

describe("弄臣 · 有别的保护时不消耗免死（官方 弄臣#2）", () => {
  it("弄臣#2：茶艺师保护 → 旅店老板保护 → 才轮到自己的免死", async () => {
    // 官方范例: 弄臣#2
    // 官方：「恶魔攻击了弄臣，但他被茶艺师保护。弄臣依然存活，且保留着自己的能力。
    //        之后……被旅店老板保护。弄臣依然存活，且保留着自己的能力。
    //        之后（两者都死了）……他依旧存活但使用了自己的能力。」
    const board = [
      seat(0, "imp"),
      seat(1, "fool"),
      seat(2, "tea_lady"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];

    // ① 茶艺师保护（0 号恶魔的两侧邻居是 1 号弄臣与 4 号士兵，均善良）
    expect(isProtectedByTeaLady(1, board as any), "夹具前提：茶艺师保护生效").toBe(
      true
    );
    const step1 = await run("imp", board, { targets: [1] });
    expect(byId(step1.seats, 1)?.isDead, "受保护不死亡").toBe(false);
    expect(
      byId(step1.seats, 1)?.foolUsed,
      "被其他保护挡下时不得消耗弄臣自己的免死"
    ).toBeFalsy();

    // ② 茶艺师已死，改为旅店老板保护
    const board2 = board.map((s) =>
      s.id === 2
        ? { ...s, isDead: true }
        : s.id === 1
          ? { ...s, statusEffects: [{ type: "protected", source: "innkeeper" }] }
          : s
    );
    const step2 = await run("imp", board2, { targets: [1] });
    expect(byId(step2.seats, 1)?.isDead, "旅店老板保护下不死亡").toBe(false);
    expect(
      byId(step2.seats, 1)?.foolUsed,
      "同样不得消耗弄臣自己的免死"
    ).toBeFalsy();

    // ③ 无任何保护 ⇒ 才是弄臣自己的免死生效（能力被消耗）
    const board3 = board2.map((s) =>
      s.id === 1 ? { ...s, statusEffects: [] } : s
    );
    const step3 = await run("imp", board3, { targets: [1] });
    expect(byId(step3.seats, 1)?.isDead, "首次将死 ⇒ 不死").toBe(false);
    expect(byId(step3.seats, 1)?.foolUsed, "这一次必须消耗免死").toBe(true);
  });
});

describe("珀 · 上次没选人 ⇒ 下次要选三名（官方 珀#0）", () => {
  it("珀#0：第二夜攻击一人；第三夜不攻击；第四夜必须攻击三人", async () => {
    // 官方范例: 珀#0
    const board = [
      seat(0, "po"),
      seat(1, "chef"),
      seat(2, "tinker"),
      seat(3, "mayor"),
      seat(4, "sage"),
    ];
    const night2 = await run("po", board, { night: 2, targets: [1] });
    expect(night2.info?.killedTargetIds, "第二夜只杀一人").toHaveLength(1);

    const night3 = await run("po", night2.seats, {
      night: 3,
      targets: [],
      keepLimited: true,
    });
    expect(night3.info?.killed, "第三夜不攻击任何人").toBe(false);
    expect(night3.info?.chargedNextNight, "必须记账：下次要三杀").toBe(true);

    const night4 = await run("po", night3.seats, {
      night: 4,
      targets: [2, 3, 4],
      keepLimited: true,
    });
    expect(
      night4.info?.killedTargetIds,
      "第四夜被杀人数为三（含镇长替死改写）"
    ).toHaveLength(3);
  });
});

describe("普卡 · 中毒者次日死亡（官方 普卡#0）", () => {
  it("普卡#0：侍女中毒 → 次日死亡；换目标后旧的才死", async () => {
    // 官方范例: 普卡#0
    const board = [
      seat(0, "pukka"),
      seat(1, "chambermaid"),
      seat(2, "chef"),
      seat(3, "soldier"),
      seat(4, "mayor"),
    ];
    const night2 = await run("pukka", board, { night: 2, targets: [1] });
    expect(byId(night2.seats, 1)?.isPoisoned, "侍女当场中毒").toBe(true);
    expect(byId(night2.seats, 1)?.isDead, "当夜不死亡").toBe(false);

    const night3 = await run("pukka", night2.seats, {
      night: 3,
      targets: [2],
      keepLimited: true,
    });
    expect(
      byId(night3.seats, 1)?.isDead,
      "「上个因你能力中毒的玩家」在下一夜死亡（官方：侍女死亡）"
    ).toBe(true);
  });
});

describe("祖母 · 孙子被恶魔杀才连锁（官方 祖母#0 / #1 / #2）", () => {
  const board = (grandmotherDrunk: boolean) => [
    seat(0, "grandmother", { grandchildId: 1, isDrunk: grandmotherDrunk }),
    seat(1, "professor"),
    seat(2, "imp"),
    seat(3, "chef"),
  ];

  it("祖母#0：孙子（教授）被恶魔杀死 ⇒ 祖母一同死亡", async () => {
    // 官方范例: 祖母#0
    expect(isDemonKillSource("imp_kill"), "imp_kill 属于恶魔击杀").toBe(true);
    const seats = board(false);
    const chain = resolveGrandmotherChainDeaths(seats as any, 1, true);
    expect(chain, "孙子被恶魔杀 ⇒ 祖母连带").toEqual([0]);
  });

  it("祖母#1：孙子（赌徒）因赌博而死 ⇒ 祖母依然存活", async () => {
    // 官方范例: 祖母#1
    expect(
      isDemonKillSource("gambler_guess_fail"),
      "赌徒猜错不是恶魔击杀"
    ).toBe(false);
    const seats = [
      seat(0, "grandmother", { grandchildId: 1 }),
      seat(1, "gambler"),
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    expect(
      resolveGrandmotherChainDeaths(seats as any, 1, false),
      "非恶魔击杀不连带"
    ).toEqual([]);
  });

  it("祖母#2：祖母醉酒 ⇒ 即使孙子被恶魔杀也不死", async () => {
    // 官方范例: 祖母#2
    // 「小美被恶魔杀死，但祖母因为水手的能力而处于醉酒状态，因此祖母依然存活。」
    expect(
      resolveGrandmotherChainDeaths(board(true) as any, 1, true),
      "醉酒的祖母不陪葬"
    ).toEqual([]);
  });
});

describe("主谋 · 恶魔死后若人数已到阈值则善良胜（官方 主谋#4）", () => {
  it("主谋#4：恶魔死亡且场上只剩两名存活 ⇒ 善良阵营获胜", async () => {
    // 官方范例: 主谋#4
    const result = judge(
      [
        seat(0, "chef"),
        seat(1, "soldier"),
        seat(2, "imp", { isDead: true }),
        seat(3, "mastermind", { isDead: true }),
      ] as any,
      "check_phase"
    );
    expect(result.isGameOver, "必须判终局").toBe(true);
    expect(result.winner, "善良阵营获胜").toBe("Good");
    expect(result.reasonCode, "胜因必须可审计").toBe("DEMON_ALL_DEAD");
  });
});
