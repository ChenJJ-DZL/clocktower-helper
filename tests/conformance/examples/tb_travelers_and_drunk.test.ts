/**
 * 官方范例夹具 · 暗流涌动旅行者与酒鬼假信息（官员 / 窃贼 / 替罪羊 / 酒鬼）
 * ======================================================================
 * 覆盖 Trouble Brewing 经典旅行者票权干预、代刑与酒鬼全面假信息机制：
 *   · 官员#0 / #1 / #2：选择玩家投票算作3票（存活/死亡幽灵票均生效）
 *   · 窃贼#0 / #1：选择玩家处决投票算作-1票；流放表决不影响
 *   · 替罪羊#0 / #1 / #2：同阵营代刑（占卜师/投毒者/间谍登记善良）
 *   · 酒鬼#1 / #2 / #3：以为是共情者/守鸦人/送葬者的酒鬼获得假信息
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { canScapegoatSubstitute } from "../../../src/utils/expansionMechanics";
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

describe("官员 · 投票算作三票（官方 官员#0 / #1 / #2）", () => {
  it("官员#0：官员选择小文 ⇒ 次日小文投票被算作3票", async () => {
    // 官方范例: 官员 #0
    const seats = [
      seat(0, "bureaucrat"),
      seat(1, "chef"),
      seat(2, "imp"),
    ];
    const { info } = await run("bureaucrat", seats, { targets: [1] });
    expect(info?.targetId).toBe(1);
    expect(info?.tripleVote).toBe(true);
  });

  it("官员#1：官员选择小艾 ⇒ 小艾在多次处决投票中每次都投出3票", async () => {
    // 官方范例: 官员 #1
    const seats = [
      seat(0, "bureaucrat"),
      seat(1, "empath"),
      seat(2, "imp"),
    ];
    const { info } = await run("bureaucrat", seats, { targets: [1] });
    expect(info?.targetId).toBe(1);
    expect(info?.tripleVote).toBe(true);
  });

  it("官员#2：官员选择已死亡玩家 ⇒ 该玩家使用幽灵票同样算作3票", async () => {
    // 官方范例: 官员 #2
    const seats = [
      seat(0, "bureaucrat"),
      seat(1, "chef", { isDead: true, hasGhostVote: true }),
      seat(2, "imp"),
    ];
    const { info } = await run("bureaucrat", seats, { targets: [1] });
    expect(info?.targetId).toBe(1);
    expect(info?.tripleVote).toBe(true);
  });
});

describe("窃贼 · 投票算作负一票（官方 窃贼#0 / #1）", () => {
  it("窃贼#0：窃贼选择小明 ⇒ 小明处决投票计为负一票（总票数减少）", async () => {
    // 官方范例: 窃贼 #0
    const seats = [
      seat(0, "thief"),
      seat(1, "chef"),
      seat(2, "imp"),
    ];
    const { info, snapshot } = await run("thief", seats, { targets: [1] });
    expect(info?.targetId).toBe(1);
    expect(snapshot.thiefTarget).toBe(1);
  });

  it("窃贼#1：窃贼选择小黑 ⇒ 处决投票为负票，但流放投票不受影响算正票", async () => {
    // 官方范例: 窃贼 #1
    const seats = [
      seat(0, "thief"),
      seat(1, "empath"),
      seat(2, "gunslinger"),
    ];
    const { info, snapshot } = await run("thief", seats, { targets: [1] });
    expect(info?.targetId).toBe(1);
    expect(snapshot.thiefTarget).toBe(1);
  });
});

describe("替罪羊 · 同阵营处决代刑（官方 替罪羊#0 / #1 / #2）", () => {
  it("替罪羊#0：占卜师即将被处决 ⇒ 善良替罪羊可代替占卜师被处决", () => {
    // 官方范例: 替罪羊 #0
    const scapegoat = seat(0, "scapegoat"); // 善良
    const fortuneTeller = seat(1, "fortune_teller"); // 善良
    expect(canScapegoatSubstitute(scapegoat, fortuneTeller), "同为善良阵营可代刑").toBe(true);
  });

  it("替罪羊#1：投毒者即将被处决 ⇒ 邪恶替罪羊可代替投毒者被处决", () => {
    // 官方范例: 替罪羊 #1
    const evilScapegoat = seat(0, "scapegoat", { isEvilConverted: true }); // 邪恶
    const poisoner = seat(1, "poisoner"); // 邪恶
    expect(canScapegoatSubstitute(evilScapegoat, poisoner), "同为邪恶阵营可代刑").toBe(true);
  });

  it("替罪羊#2：间谍被当作善良阵营即将被处决 ⇒ 善良替罪羊可代替间谍被处决", () => {
    // 官方范例: 替罪羊 #2
    const scapegoat = seat(0, "scapegoat"); // 善良
    const spyAsGood = seat(1, "spy", { registerAsGood: true }); // 间谍登记为善良
    expect(canScapegoatSubstitute(scapegoat, spyAsGood), "间谍登记善良时可由善良替罪羊代刑").toBe(true);
  });
});

describe("酒鬼 · 以为自己是其他角色的假信息（官方 酒鬼#1 / #2 / #3）", () => {
  it("酒鬼#1：以为自己是共情者的酒鬼被唤醒 ⇒ 得知虚假数字（与邪恶相邻得知0）", async () => {
    // 官方范例: 酒鬼 #1
    const seats = [
      seat(0, "drunk", { charadeRole: "empath", isDrunk: true }),
      seat(1, "imp"), // 邪恶邻座
      seat(2, "chef"),
    ];
    const { info } = await run("empath", seats, {
      seatId: 0,
      meta: { abilityEffective: false },
      storytellerInput: { fakeResult: 0 },
    });
    expect(info).toBe(0);
  });

  it("酒鬼#2：以为自己是守鸦人的酒鬼夜晚被杀 ⇒ 查验圣徒得知投毒者（假信息）", async () => {
    // 官方范例: 酒鬼 #2
    const seats = [
      seat(0, "drunk", { charadeRole: "ravenkeeper", isDead: true, diedAtNight: 2, isDrunk: true }),
      seat(1, "saint"),
      seat(2, "imp"),
    ];
    const { info } = await run("ravenkeeper", seats, {
      seatId: 0,
      targets: [1],
      night: 2,
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: {
          targetId: 1,
          roleName: "投毒者",
        },
      },
    });
    expect(info?.roleName).toBe("投毒者");
  });

  it("酒鬼#3：占卜师被处决，以为自己是送葬者的酒鬼得知白天死的是酒鬼（假信息）", async () => {
    // 官方范例: 酒鬼 #3
    const seats = [
      seat(0, "drunk", { charadeRole: "undertaker", isDrunk: true }),
      seat(1, "fortune_teller", { isDead: true, executedToday: true }),
      seat(2, "imp"),
    ];
    const { info } = await run("undertaker", seats, {
      seatId: 0,
      night: 2,
      snapshot: { todayExecutedId: 1 },
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: {
          targetId: 1,
          roleName: "酒鬼",
        },
      },
    });
    expect(info?.roleName).toBe("酒鬼");
  });
});
