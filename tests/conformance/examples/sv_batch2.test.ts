/**
 * 官方范例夹具 · 梦殒春宵第二批（角色交换 / 死亡触发 / 阵营保持）
 * ======================================================================
 * 每条用例前的 `// 官方范例: <角色名>#<idx>` 是台账锚点（`scripts/conformance/lib/examples.ts`
 * 扫描它统计覆盖率），必须指向**真实存在**的官方范例序号。
 *
 * 本批的关键不是"跑通管道"，而是钉住三件容易写错的事：
 *   ① **阵营不随角色改变**（麻脸巫婆把好人变成恶魔，好人仍是好人）；
 *   ② **死亡触发类能力必须先死**（心上人/理发师）；
 *   ③ **"无事发生"也是规则**（舞蛇人选中非恶魔、方古攻击已死外来者）。
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isSeatEvil, isSeatMinion } from "../../../src/utils/seatAlignment";
import { ctx, ensureAbilityRegistry, runAbility, seat } from "./_harness";

/** 跑一次能力，返回结果 + 结算后的座位表 */
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
  } = {}
): Promise<{ info: any; seats: any[]; aborted: boolean }> {
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
    })
  );
  return {
    info: result.meta?.abilityResult,
    seats: result.snapshot?.seats ?? seats,
    aborted: !!result.aborted,
  };
}

const byId = (seats: any[], id: number) => seats.find((s) => s.id === id);

describe("女裁缝 · 两名玩家是否同阵营（官方 女裁缝#0 / #1 / #2）", () => {
  it("女裁缝#0：理发师与钟表匠都是善良 ⇒ 得知「是」", async () => {
    // 官方范例: 女裁缝#0
    const { info } = await run(
      "seamstress",
      [
        seat(0, "seamstress"),
        seat(1, "barber"),
        seat(2, "clockmaker"),
        seat(3, "imp"),
        seat(4, "chef"),
      ],
      { targets: [1, 2], night: 1, phase: "firstNight" }
    );
    expect(info?.sameAlignment, "两名善良玩家必须判为同阵营").toBe(true);
  });

  it("女裁缝#1：方古与心上人 ⇒ 得知「否」", async () => {
    // 官方范例: 女裁缝#1
    const { info } = await run(
      "seamstress",
      [
        seat(0, "seamstress"),
        seat(1, "fang_gu"),
        seat(2, "sweetheart"),
        seat(3, "chef"),
        seat(4, "soldier"),
      ],
      { targets: [1, 2], night: 4 }
    );
    expect(info?.sameAlignment, "恶魔与外来者必须判为不同阵营").toBe(false);
  });

  it("女裁缝#2：麻脸巫婆造出的女巫仍是善良 ⇒ 与城镇公告员同阵营（「是」）", async () => {
    // 官方范例: 女裁缝#2
    // 官方原文：「麻脸巫婆把数学家变成了女巫，女巫仍然是善良的」
    // ⇒ 夹具用「女巫角色 + isGoodConverted」表达这一状态（角色变了，阵营没变）。
    const { info } = await run(
      "seamstress",
      [
        seat(0, "seamstress"),
        seat(1, "witch", { isGoodConverted: true }),
        seat(2, "town_crier"),
        seat(3, "imp"),
        seat(4, "chef"),
      ],
      { targets: [1, 2], night: 4 }
    );
    expect(
      info?.isTarget1Evil,
      "夹具前提：被麻脸巫婆造出的女巫必须是善良（否则本条测的是别的规则）"
    ).toBe(false);
    expect(info?.sameAlignment, "善良女巫与城镇公告员同阵营").toBe(true);
  });
});

describe("神谕者 · 死亡玩家中邪恶的数量（官方 神谕者#1）", () => {
  it("神谕者#1：七名死亡里两名邪恶 + 被流放的邪恶旅行者 + 夜里又死了爪牙 ⇒ 得知「4」", async () => {
    // 官方范例: 神谕者#1
    // 官方把「流放的邪恶旅行者」也算进死亡邪恶，且当夜恶魔又杀了一名爪牙。
    const { info } = await run(
      "oracle",
      [
        seat(0, "oracle"),
        seat(1, "imp", { isDead: true }),
        seat(2, "poisoner", { isDead: true }),
        seat(3, "scarlet_woman", { isDead: true }),
        seat(4, "spy", { isDead: true }),
        seat(5, "chef", { isDead: true }),
        seat(6, "soldier", { isDead: true }),
        seat(7, "mayor"),
      ],
      { night: 3 }
    );
    expect(info?.deadEvilCount, "四名死亡玩家属于邪恶阵营").toBe(4);
  });
});

describe("心上人 · 死亡时使一名玩家醉酒（官方 心上人#0 / #1 / #2）", () => {
  const cases: Array<{ id: string; mark: string; roleId: string; label: string }> = [
    { id: "心上人#0", mark: "0", roleId: "mathematician", label: "数学家" },
    { id: "心上人#1", mark: "1", roleId: "mutant", label: "畸形秀演员" },
    { id: "心上人#2", mark: "2", roleId: "imp", label: "恶魔" },
  ];

  for (const item of cases) {
    it(`${item.id}：心上人死后 ${item.label}醉酒`, async () => {
      const { info, seats } = await run(
        "sweetheart",
        [
          seat(0, "sweetheart", { isDead: true }),
          seat(1, item.roleId),
          seat(2, "chef"),
          seat(3, "soldier"),
        ],
        { targets: [0], storytellerInput: { drunkTarget: 1 } }
      );
      expect(info?.causesDrunk, "心上人死亡必须造成醉酒").toBe(true);
      expect(byId(seats, 1)?.isDrunk, `${item.label}应处于醉酒`).toBe(true);
    });
  }
});

describe("杂耍艺人 · 猜对数量（官方 杂耍艺人#0 / #1）", () => {
  it("杂耍艺人#0：三人里猜对两个 ⇒ 得知「2」", async () => {
    // 官方范例: 杂耍艺人#0
    const { info } = await run(
      "juggler",
      [
        seat(0, "juggler"),
        seat(1, "town_crier"),
        seat(2, "no_dashii"),
        seat(3, "sage"),
      ],
      {
        phase: "day",
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: "城镇公告员" },
            { targetSeatId: 2, roleName: "诺-达" },
            { targetSeatId: 3, roleName: "女巫" },
          ],
        },
      }
    );
    expect(info?.realCount, "三猜中两对").toBe(2);
  });

  it("杂耍艺人#1：猜错两人、猜对一人 ⇒ 得知「1」", async () => {
    // 官方范例: 杂耍艺人#1
    const { info } = await run(
      "juggler",
      [
        seat(0, "juggler"),
        seat(1, "town_crier"),
        seat(2, "no_dashii"),
        seat(3, "sage"),
      ],
      {
        phase: "day",
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: "女巫" },
            { targetSeatId: 2, roleName: "诺-达" },
            { targetSeatId: 3, roleName: "麻脸巫婆" },
          ],
        },
      }
    );
    expect(info?.realCount, "三猜中一对").toBe(1);
  });
});

describe("哲学家 · 获得能力与「重复角色」副作用（官方 哲学家#0 / #2 前半）", () => {
  it("哲学家#0：选择筑梦师 ⇒ 获得该能力，场上无重复", async () => {
    // 官方范例: 哲学家#0
    const { info } = await run(
      "philosopher",
      [
        seat(0, "philosopher"),
        seat(1, "artist"),
        seat(2, "imp"),
        seat(3, "chef"),
      ],
      { storytellerInput: { chosenRoleId: "dreamer" } }
    );
    expect(info?.chosenRoleId, "必须记住选中的能力").toBe("dreamer");
    expect(info?.roleInPlay, "筑梦师不在场 ⇒ 无重复").toBe(false);
    expect(info?.duplicateSeatId, "无重复时不得指定陪醉座位").toBeNull();
  });

  it("哲学家#2：选择艺术家但场上已有艺术家 ⇒ 原艺术家醉酒", async () => {
    // 官方范例: 哲学家#2
    // 官方：「哲学家选择获得了艺术家的能力，但场上已经有一名艺术家。那名艺术家玩家醉酒。」
    // （后半段「哲学家死亡后艺术家恢复清醒」属跨阶段结算，见 known_deviations 说明）
    const { info, seats } = await run(
      "philosopher",
      [
        seat(0, "philosopher"),
        seat(1, "artist"),
        seat(2, "imp"),
        seat(3, "chef"),
      ],
      { storytellerInput: { chosenRoleId: "artist" } }
    );
    expect(info?.roleInPlay, "艺术家已在场").toBe(true);
    expect(info?.duplicateSeatId, "必须指向那名重复的艺术家").toBe(1);
    expect(byId(seats, 1)?.isDrunk, "原艺术家应醉酒").toBe(true);
  });
});

describe("方古 · 外来者转化（官方 方古#0 / #1）", () => {
  it("方古#0：攻击心上人 ⇒ 心上人变成新方古、老方古死亡，且心上人「没死」不触发醉酒", async () => {
    // 官方范例: 方古#0
    const { info, seats } = await run(
      "fang_gu",
      [
        seat(0, "fang_gu"),
        seat(1, "sweetheart"),
        seat(2, "chef"),
        seat(3, "soldier"),
        seat(4, "mayor"),
      ],
      { targets: [1] }
    );
    expect(info?.becomesFangGu, "外来者被击杀必须转化为方古").toBe(true);
    expect(byId(seats, 0)?.isDead, "老方古必须死亡").toBe(true);
    expect(byId(seats, 1)?.role?.id, "心上人变成方古").toBe("fang_gu");
    expect(byId(seats, 1)?.isDead, "新方古不死亡").toBe(false);
    // 官方：心上人没有死 ⇒ 不会令任何人醉酒
    expect(
      seats.filter((s) => s.isDrunk).length,
      "心上人未被判定死亡，不得触发醉酒"
    ).toBe(0);
  });

  it("方古#1：攻击已死的畸形秀演员 ⇒ 无人死亡，方古也不会死", async () => {
    // 官方范例: 方古#1
    const { info, seats } = await run(
      "fang_gu",
      [
        seat(0, "fang_gu"),
        seat(1, "mutant", { isDead: true }),
        seat(2, "chef"),
        seat(3, "soldier"),
      ],
      { targets: [1] }
    );
    expect(info?.targetWasDead, "目标已死").toBe(true);
    expect(info?.killed, "已死目标不会再死一次").toBe(false);
    expect(info?.becomesFangGu, "已死目标不转化").toBe(false);
    expect(byId(seats, 0)?.isDead, "目标本来就死了 ⇒ 方古不陪葬").toBe(false);
  });
});

describe("舞蛇人 · 只有选中恶魔才交换（官方 舞蛇人#0 / #1）", () => {
  it("舞蛇人#0：依次选中麻脸巫婆与自己 ⇒ 两次都无事发生", async () => {
    // 官方范例: 舞蛇人#0
    const minion = await run(
      "snake_charmer",
      [seat(0, "snake_charmer"), seat(1, "pit_hag"), seat(2, "imp"), seat(3, "chef")],
      { targets: [1] }
    );
    expect(minion.info?.isDemon, "麻脸巫婆不是恶魔").toBe(false);
    expect(minion.info?.swapTriggered, "选中非恶魔不交换").toBe(false);
    expect(byId(minion.seats, 0)?.role?.id, "舞蛇人角色不变").toBe("snake_charmer");

    const self = await run(
      "snake_charmer",
      [seat(0, "snake_charmer"), seat(1, "pit_hag"), seat(2, "imp"), seat(3, "chef")],
      { targets: [0] }
    );
    expect(self.info?.swapTriggered, "选中自己（非恶魔）不交换").toBe(false);
  });

  it("舞蛇人#1：选中亡骨魔 ⇒ 舞蛇人变成邪恶亡骨魔，原亡骨魔变成中毒的善良舞蛇人", async () => {
    // 官方范例: 舞蛇人#1
    const { info, seats } = await run(
      "snake_charmer",
      [seat(0, "snake_charmer"), seat(1, "zombuul"), seat(2, "chef"), seat(3, "soldier")],
      { targets: [1] }
    );
    expect(info?.swapTriggered, "选中恶魔必须交换").toBe(true);
    expect(byId(seats, 0)?.role?.id, "原舞蛇人变成亡骨魔").toBe("zombuul");
    expect(isSeatEvil(byId(seats, 0)), "原舞蛇人变成邪恶").toBe(true);
    expect(byId(seats, 1)?.role?.id, "原亡骨魔变成舞蛇人").toBe("snake_charmer");
    expect(isSeatEvil(byId(seats, 1)), "原亡骨魔变成善良").toBe(false);
    expect(byId(seats, 1)?.isPoisoned, "原亡骨魔中毒").toBe(true);
  });
});

describe("麻脸巫婆 · 造出的角色类型正确但阵营不变（官方 麻脸巫婆#2）", () => {
  it("麻脸巫婆#2：把神谕者变成诺-达鲺 ⇒ 类型是恶魔，但仍是善良", async () => {
    // 官方范例: 麻脸巫婆#2
    // 官方原文：「麻脸巫婆将神谕者变成**善良的**诺-达鲺」
    const { info, seats } = await run(
      "pit_hag",
      [seat(0, "pit_hag"), seat(1, "oracle"), seat(2, "imp"), seat(3, "chef")],
      { targets: [1], storytellerInput: { newRoleId: "no_dashii" } }
    );
    expect(info?.transformed, "角色必须真的变").toBe(true);
    const target = byId(seats, 1);
    expect(target?.role?.id, "变成诺-达鲺").toBe("no_dashii");
    expect(target?.role?.type, "类型必须是恶魔（旧实现沿用了原类型）").toBe("demon");
    expect(target?.role?.name, "角色名必须是中文名（旧实现写成了 roleId）").not.toBe(
      "no_dashii"
    );
    expect(isSeatEvil(target), "玩家原本善良 ⇒ 变成恶魔后仍是善良").toBe(false);
  });

  it("麻脸巫婆：把镇民变成爪牙（女巫）⇒ 类型是爪牙，阵营仍善良", async () => {
    // 官方范例: 女裁缝#2（同一条规则的第二个例证：造出的女巫仍是善良）
    const { info, seats } = await run(
      "pit_hag",
      [seat(0, "pit_hag"), seat(1, "mathematician"), seat(2, "imp"), seat(3, "chef")],
      { targets: [1], storytellerInput: { newRoleId: "witch" } }
    );
    expect(info?.transformed).toBe(true);
    const target = byId(seats, 1);
    expect(target?.role?.type, "女巫是爪牙（旧实现沿用镇民）").toBe("minion");
    expect(isSeatMinion(target), "必须被识别为爪牙").toBe(true);
    expect(isSeatEvil(target), "阵营不随角色改变").toBe(false);
  });
});
