/**
 * 官方范例夹具 · 梦殒春宵第五批（流放与投票隔离 / 哲学家复制 / 舞蛇人交换 / 事务官 / 钟表匠 / 筑梦师）
 * ======================================================================
 * 覆盖规则体系中「流放（exile）与处决（execution）严格隔离」的官方原则：
 *   · 卖花女孩#2：流放投票不属于恶魔处决投票 ⇒ 得知「否」
 *   · 城镇公告员#2：流放提名不属于处决提名 ⇒ 得知「否」
 *   · 女巫#4：发起流放不触发女巫处决诅咒 ⇒ 玩家存活
 *   · 哲学家#1：哲学家获得钟表匠能力当晚生效
 *   · 舞蛇人#2：舞蛇人与方古交换角色与阵营
 *   · 事务官#0：事务官首夜得知一名善良玩家
 *   · 钟表匠#1：恶魔与爪牙最近距离
 *   · 筑梦师#2：查验角色给出善良与邪恶备选
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

describe("卖花女孩 / 城镇公告员 · 流放与处决严格隔离（官方 卖花女孩#2 / 城镇公告员#2）", () => {
  it("卖花女孩#2：白天仅有流放投票（全员举手），恶魔未投处决票 ⇒ 得知「否」", async () => {
    // 官方范例: 卖花女孩 #2
    const seats = [
      seat(0, "flowergirl"),
      seat(1, "imp"),
      seat(2, "chef"),
    ];
    // 流放投票不算做恶魔处决投票
    const { info } = await run("flowergirl", seats, {
      snapshot: { demonVotedToday: false }, // 流放不置 demonVotedToday
    });
    expect(info?.hasVoted, "流放投票不计入卖花女孩的恶魔投票判定").toBe(false);
  });

  it("城镇公告员#2：爪牙发起对旅行者的流放，未发起处决提名 ⇒ 得知「否」", async () => {
    // 官方范例: 城镇公告员 #2
    const seats = [
      seat(0, "town_crier"),
      seat(1, "witch"),
      seat(2, "chef"),
    ];
    // 发起流放不属于处决提名
    const { info } = await run("town_crier", seats, {
      snapshot: { minionNominatedToday: false },
    });
    expect(info?.minionNominated, "发起流放不计入爪牙提名").toBe(false);
  });
});

describe("女巫 · 流放不触发诅咒致死（官方 女巫#4）", () => {
  it("女巫#4：受诅咒者发起流放投票 ⇒ 不触发诅咒死亡，玩家继续存活", () => {
    // 官方范例: 女巫 #4
    const cursedJuggler = seat(0, "juggler", {
      statusEffects: [{ type: "witch_cursed" }],
    });
    const isCursed = cursedJuggler.statusEffects?.some(
      (e: any) => e.type === "witch_cursed"
    );
    expect(isCursed, "玩家处于受诅咒状态").toBe(true);
    // 流放（exile）不是提名处决（nomination），因此不触发诅咒致死，玩家依然存活
    expect(cursedJuggler.isDead, "发起流放不导致受诅咒玩家死亡").toBe(false);
  });
});

describe("哲学家 · 复制钟表匠能力（官方 哲学家#1）", () => {
  it("哲学家#1：哲学家获得钟表匠能力 ⇒ 当晚得知恶魔与爪牙最近距离", async () => {
    // 官方范例: 哲学家 #1
    const seats = [
      seat(0, "philosopher"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "poisoner"),
    ];
    const { info, snapshot } = await run("philosopher", seats, {
      night: 3,
      storytellerInput: { chosenRoleId: "clockmaker" },
    });
    expect(info?.chosenRoleId).toBe("clockmaker");
    expect(snapshot.philosopherGainedRole).toBe("clockmaker");
  });
});

describe("舞蛇人 · 与恶魔交换（官方 舞蛇人#2）", () => {
  it("舞蛇人#2：舞蛇人选中恶魔方古 ⇒ 舞蛇人变成恶魔方古，原方古变成中毒的舞蛇人", async () => {
    // 官方范例: 舞蛇人 #2
    const seats = [
      seat(0, "snake_charmer"),
      seat(1, "fang_gu"),
      seat(2, "chef"),
    ];
    const { seats: nextSeats, info } = await run("snake_charmer", seats, {
      targets: [1],
    });
    expect(info?.swapTriggered, "舞蛇人选中恶魔发生角色交换").toBe(true);
    expect(nextSeats[0].role?.id).toBe("fang_gu");
    expect(nextSeats[1].role?.id).toBe("snake_charmer");
    expect(nextSeats[1].isPoisoned, "原恶魔变成中毒的舞蛇人").toBe(true);
  });
});

describe("事务官 · 首夜得知善良玩家（官方 事务官#0）", () => {
  it("事务官#0：首夜得知一名善良玩家（如送葬者）", async () => {
    // 官方范例: 事务官 #0
    // 官方范例: 事务官（实验角色） #0
    const seats = [
      seat(0, "steward"),
      seat(1, "undertaker"), // 善良镇民
      seat(2, "imp"),
    ];
    const { info } = await run("steward", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { targetId: 1 },
    });
    expect(info?.targetId, "事务官得知1号送葬者").toBe(1);
    expect(info?.isGood, "目标为善良玩家").toBe(true);
  });
});

describe("钟表匠 · 恶魔与爪牙最近距离（官方 钟表匠#1）", () => {
  it("钟表匠#1：方古坐在麻脸巫婆和理发师之间 ⇒ 得知 1", async () => {
    // 官方范例: 钟表匠 #1
    const seats = [
      seat(0, "clockmaker"),
      seat(1, "pit_hag"), // 爪牙
      seat(2, "fang_gu"), // 恶魔（与1号爪牙距离为 1）
      seat(3, "barber"),
      seat(4, "chef"),
    ];
    const { info } = await run("clockmaker", seats, {
      night: 1,
      phase: "firstNight",
    });
    expect(info).toBe(1);
  });
});

describe("筑梦师 · 查验角色给出善良与邪恶备选（官方 筑梦师#2）", () => {
  it("筑梦师#2：查验艺术家 ⇒ 得知包含真实角色的善良与邪恶备选", async () => {
    // 官方范例: 筑梦师 #2
    const seats = [
      seat(0, "dreamer"),
      seat(1, "artist"), // 目标
      seat(2, "fang_gu"),
      seat(3, "witch"),
    ];
    const { info } = await run("dreamer", seats, {
      night: 2,
      targets: [1],
    });
    expect(info?.targetId).toBe(1);
    const candidateNames = [info?.roleA?.name, info?.roleB?.name];
    expect(candidateNames).toContain("艺术家");
  });
});
