/**
 * 官方范例夹具 · 梦殒春宵第三批（信息类 / 距离 / 阵营不随角色改变）
 * ======================================================================
 * 全部断言指向**生产判据函数**，不复制规则：
 *   · `calculateClockmakerDistance` / `getNoDashiiPoisonTargets` / `checkWitchCurseOnNomination`
 *   · 能力侧统一走 `runFullAbilityPipeline`
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isSeatEvil } from "../../../src/utils/seatAlignment";
import {
  calculateClockmakerDistance,
  checkWitchCurseOnNomination,
  getNoDashiiPoisonTargets,
} from "../../../src/utils/snvMechanics";
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
): Promise<{ info: any; seats: any[] }> {
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
  return { info: result.meta?.abilityResult, seats: result.snapshot?.seats ?? seats };
}

const byId = (seats: any[], id: number) => seats.find((s) => s.id === id);

describe("城镇公告员 · 今天是否有爪牙发起提名（官方 城镇公告员#0 / #1）", () => {
  it("城镇公告员#0：白天只有镇民提名 ⇒ 得知「否」", async () => {
    // 官方范例: 城镇公告员#0
    const { info } = await run(
      "town_crier",
      [seat(0, "town_crier"), seat(1, "chef"), seat(2, "imp"), seat(3, "soldier")],
      { snapshot: { minionNominatedToday: false } }
    );
    expect(info?.minionNominated).toBe(false);
  });

  it("城镇公告员#1：四名玩家提名、其中两名是爪牙 ⇒ 得知「是」", async () => {
    // 官方范例: 城镇公告员#1
    const { info } = await run(
      "town_crier",
      [seat(0, "town_crier"), seat(1, "chef"), seat(2, "imp"), seat(3, "soldier")],
      { snapshot: { minionNominatedToday: true } }
    );
    expect(info?.minionNominated).toBe(true);
  });
});

describe("卖花女孩 · 今天是否有恶魔投票（官方 卖花女孩#0 / #1）", () => {
  it("卖花女孩#0：有提名、有人被处决，但恶魔没投票 ⇒ 得知「否」", async () => {
    // 官方范例: 卖花女孩#0
    const { info } = await run(
      "flowergirl",
      [seat(0, "flowergirl"), seat(1, "imp"), seat(2, "chef"), seat(3, "soldier")],
      { snapshot: { demonVotedToday: false } }
    );
    expect(info?.actualVoted, "恶魔当天没有投票").toBe(false);
  });

  it("卖花女孩#1：三次提名，恶魔在第二次投票 ⇒ 得知「是」", async () => {
    // 官方范例: 卖花女孩#1
    const { info } = await run(
      "flowergirl",
      [seat(0, "flowergirl"), seat(1, "imp"), seat(2, "chef"), seat(3, "soldier")],
      { snapshot: { demonVotedToday: true } }
    );
    expect(info?.actualVoted, "恶魔当天投过票").toBe(true);
  });
});

describe("洗脑师 · 要求目标明天疯狂扮演某角色（官方 洗脑师#0）", () => {
  it("洗脑师#0：使理发师疯狂扮演博学者 ⇒ 记录目标与角色名", async () => {
    // 官方范例: 洗脑师#0
    // 说书人在确认窗里同时给出「座位 + 角色」，落到 storytellerInput 的是
    // `{ roleName, chosenRoleId }`（见 useNightActionHandler 的 cerenovus 分支）。
    const { info, seats } = await run(
      "cerenovus",
      [seat(0, "cerenovus"), seat(1, "barber"), seat(2, "imp"), seat(3, "chef")],
      { targets: [1], storytellerInput: { roleName: "博学者", chosenRoleId: "savant" } }
    );
    expect(info?.targetId, "目标是理发师").toBe(1);
    expect(info?.roleName, "要扮演的角色是博学者（不是默认的「镇民」）").toBe("博学者");
    expect(byId(seats, 1)?.cerenovusMadnessRole, "疯狂要求必须落到座位字段").toBe(
      "博学者"
    );
  });
});

describe("钟表匠 · 恶魔与爪牙的最近距离（官方 钟表匠#1 / #2）", () => {
  it("钟表匠#1：镜像双子距 3、女巫距 5 ⇒ 得知「3」", async () => {
    // 官方范例: 钟表匠#1
    // 官方原序（逆时针自恶魔起）：畸形秀演员、心上人、哲学家、贤者、女巫
    // ⇒ 座位表按「顺时针 1..3 = 筑梦师/舞蛇人/镜像双子，顺时针 4..8 = 女巫/贤者/哲学家/心上人/畸形秀演员」还原。
    const seats = [
      seat(0, "no_dashii"),
      seat(1, "dreamer"),
      seat(2, "snake_charmer"),
      seat(3, "evil_twin"),
      seat(4, "witch"),
      seat(5, "sage"),
      seat(6, "philosopher"),
      seat(7, "sweetheart"),
      seat(8, "mutant"),
    ];
    expect(calculateClockmakerDistance(seats as any), "取最近的那名爪牙").toBe(3);
  });

  it("钟表匠#2：方古与两名旅行者相邻，其中邪恶旅行者不算爪牙 ⇒ 得知「2」", async () => {
    // 官方范例: 钟表匠#2
    const seats = [
      seat(0, "fang_gu"),
      seat(1, "scapegoat"), // 旅行者（善良）
      seat(2, "cerenovus"), // 爪牙，紧挨着善良旅行者 ⇒ 与恶魔相距 2
      seat(3, "chef"),
      seat(4, "soldier"),
      seat(5, "mayor"),
    ];
    expect(
      calculateClockmakerDistance(seats as any),
      "旅行者不是爪牙，不能算距离"
    ).toBe(2);
  });
});

describe("贤者 · 醉酒时的错误信息不得指向自己（官方 贤者#1）", () => {
  it("贤者#1：醉酒的贤者被告知一名死亡玩家 + 一名存活善良玩家，且不含自己", async () => {
    // 官方范例: 贤者#1
    const { info } = await run(
      "sage",
      [
        seat(0, "sage", { isDead: true }),
        seat(1, "imp", { isDead: true }),
        seat(2, "chef"),
        seat(3, "soldier"),
        seat(4, "mayor"),
      ],
      { meta: { abilityEffective: false }, snapshot: { nightVictimIds: [0] } }
    );
    expect(info?.isCorrupted, "醉酒 ⇒ 信息必须标记为不可信").toBe(true);
    const targets: number[] = info?.targetIds ?? [];
    expect(targets.length, "必须给出两名候选").toBe(2);
    expect(targets, "绝不能把贤者本人当成凶手之一").not.toContain(0);
    expect(targets, "错误信息也不能指向恶魔").not.toContain(1);
  });
});

describe("筑梦师 · 涡流世界里的信息必须为假（官方 筑梦师#3）", () => {
  it("筑梦师#3：涡流在场 ⇒ 展示的两个角色都不等于目标真实角色", async () => {
    // 官方范例: 筑梦师#3
    const { info } = await run(
      "dreamer",
      [
        seat(0, "dreamer"),
        seat(1, "vortox"),
        seat(2, "chef"),
        seat(3, "soldier"),
      ],
      { targets: [1], snapshot: { isVortoxWorld: true } }
    );
    const shown = [info?.roleA?.id, info?.roleB?.id];
    expect(info?.actualRole?.id, "目标是涡流").toBe("vortox");
    expect(shown, "涡流规则：展示的两个角色都必须是假的").not.toContain("vortox");
  });

  it("筑梦师：正常世界 ⇒ 展示的两个角色里必有一个是真实角色", async () => {
    // 官方范例: 筑梦师#1（「筑梦师得知该玩家要么是哲学家，要么是亡骨魔」⇒ 必含真实角色）
    const { info } = await run(
      "dreamer",
      [
        seat(0, "dreamer"),
        seat(1, "sage"),
        seat(2, "imp"),
        seat(3, "chef"),
      ],
      { targets: [1] }
    );
    const shown = [info?.roleA?.id, info?.roleB?.id];
    expect(shown, "正常世界必须有一个真实角色").toContain(info?.actualRole?.id);
  });
});

describe("诺-达鲺 · 被麻脸巫婆造出后同样毒邻座（官方 诺-达鲺#2）", () => {
  it("诺-达鲺#2：新造的诺-达鲺使相邻两名镇民中毒（与阵营无关）", async () => {
    // 官方范例: 诺-达鲺#2
    const seats = [
      seat(0, "chef"),
      seat(1, "no_dashii", { isGoodConverted: true }),
      seat(2, "soldier"),
      seat(3, "mayor"),
      seat(4, "imp"),
    ];
    expect(isSeatEvil(seats[1]), "夹具前提：这是善良的诺-达鲺").toBe(false);
    expect(
      getNoDashiiPoisonTargets(1, seats as any),
      "顺/逆时针各取最近镇民 ⇒ 厨师与士兵"
    ).toEqual([2, 0]);
  });
});

describe("亡骨魔 · 被杀死的爪牙保留能力（官方 亡骨魔#0）", () => {
  it("亡骨魔#0：杀死女巫后，被诅咒者提名仍然死亡", async () => {
    // 官方范例: 亡骨魔#0
    // 两步：① 亡骨魔杀死女巫（能力随之沉入「死者仍保留能力」语义）
    //       ② 次日被诅咒者提名 ⇒ 仍然死亡
    const board = [
      seat(0, "zombuul"),
      seat(1, "witch"),
      seat(2, "juggler", { statusEffects: [{ type: "cursed", source: "witch" }] }),
      seat(3, "chef"),
      seat(4, "soldier"),
      seat(5, "mayor"),
    ];
    const killed = await run("zombuul", board, { targets: [1] });
    expect(byId(killed.seats, 1)?.isDead, "女巫已死").toBe(true);

    const cursedSeat = byId(killed.seats, 2);
    expect(
      checkWitchCurseOnNomination(cursedSeat, 5, [2]),
      "女巫死亡不影响既已施加的诅咒"
    ).toEqual({ shouldDie: true });
  });
});

describe("理发师 · 死亡后由恶魔交换角色（官方 理发师#3）", () => {
  it("理发师#3：亡骨魔与死去的心上人交换 ⇒ 亡骨魔变成邪恶的心上人", async () => {
    // 官方范例: 理发师#3
    const { info, seats } = await run(
      "barber",
      [
        seat(0, "barber", { isDead: true }),
        seat(1, "zombuul"),
        seat(2, "sweetheart", { isDead: true }),
        seat(3, "chef"),
        seat(4, "soldier"),
      ],
      { storytellerInput: { swapA: 1, swapB: 2 } }
    );
    expect(info?.swapped, "理发师死亡后必须允许交换").toBe(true);
    expect(byId(seats, 1)?.role?.id, "原亡骨魔变成心上人").toBe("sweetheart");
    expect(isSeatEvil(byId(seats, 1)), "仍是邪恶阵营").toBe(true);
    expect(byId(seats, 2)?.role?.id, "原心上人变成亡骨魔").toBe("zombuul");
  });
});
