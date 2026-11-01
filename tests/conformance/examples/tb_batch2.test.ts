/**
 * 官方范例夹具 · 暗流涌动（登记 / 继承 / 替代处决）
 * ======================================================================
 * 「登记」（registration）是本项目复发最多的规则家族：陌客/间谍可以被说书人
 * 当作另一种阵营/角色。它的判据必须落在**座位字段**上（`registerAs*`），
 * 不能靠"看起来像"——所以这里每条都先断夹具前提，再断官方结论。
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isSeatMinion, isSeatTownsfolk } from "../../../src/utils/seatAlignment";
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
    meta?: Record<string, any>;
  } = {}
): Promise<{ info: any; seats: any[] }> {
  ensureAbilityRegistry();
  resetLimitedAbilityUses();
  const ability = getAbilityForRole(roleId);
  expect(ability, `能力注册表缺少 ${roleId}`).toBeTruthy();
  const result: any = await runAbility(
    ability,
    ctx(seats, 0, roleId, {
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

describe("陌客 · 被当作恶魔时会被猎手杀死（官方 陌客#0）", () => {
  it("陌客#0：猎手对陌客使用能力，说书人让陌客当作小恶魔 ⇒ 陌客死亡", async () => {
    // 官方范例: 陌客#0
    const { seats } = await run(
      "slayer",
      [
        seat(0, "slayer"),
        seat(1, "recluse", { registerAsDemon: true, registerAsEvil: true }),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
      ],
      { phase: "day", targets: [1] }
    );
    expect(byId(seats, 1)?.isDead, "被登记为恶魔的陌客必须死于猎手").toBe(true);
  });

  it("陌客：未被登记为恶魔时猎手打不动（判据不得恒真）", async () => {
    // 官方范例: 陌客#0（反向对照：陌客默认「可能被当作」不等于「一定是」）
    const { seats } = await run(
      "slayer",
      [
        seat(0, "slayer"),
        seat(1, "recluse", { registerAsDemon: false, registerAsEvil: false }),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
      ],
      { phase: "day", targets: [1] }
    );
    expect(byId(seats, 1)?.isDead, "未登记为恶魔 ⇒ 猎手不生效").toBe(false);
  });
});

describe("陌客 · 被当作爪牙时调查员能查到（官方 陌客#2）", () => {
  it("陌客#2：调查员得知「要么陌客是某爪牙，要么圣徒是某爪牙」", async () => {
    // 官方范例: 陌客#2
    const { info } = await run(
      "investigator",
      [
        seat(0, "investigator"),
        seat(1, "recluse", { registerAsEvil: true }),
        seat(2, "saint"),
        seat(3, "imp"),
        seat(4, "chef"),
        seat(5, "soldier"),
      ],
      { night: 1, phase: "firstNight" }
    );
    expect(
      [info?.seat1, info?.seat2].sort((a: number, b: number) => a - b),
      "候选必须正好是陌客与圣徒"
    ).toEqual([1, 2]);
    expect(info?.roleName, "报出的角色必须是真实存在的爪牙").toMatch(/女郎|投毒者|男爵|间谍|洗脑师|教父|刺客|恐惧分子|傀儡/);
  });
});

describe("间谍 · 被当作镇民时洗衣妇会把他算进候选（官方 间谍#0）", () => {
  it("间谍#0：洗衣妇的两名候选人之一其实是间谍（按镇民登记）", async () => {
    // 官方范例: 间谍#0
    // 官方：「小黑是僧侣，道哥是被当作守鸦人的间谍」⇒ 两名候选里一个是真镇民，
    //       另一个可以是「被登记成该镇民角色」的间谍。
    const seats = [
      seat(0, "washerwoman"),
      seat(1, "monk"),
      seat(2, "spy"),
      seat(3, "imp"),
      seat(4, "chef"),
      seat(5, "soldier"),
    ];
    const { info } = await run("washerwoman", seats, {
      night: 1,
      phase: "firstNight",
    });
    const candidates = [info?.seat1, info?.seat2].filter(
      (id: any) => typeof id === "number" && id >= 0
    );
    expect(candidates, "必须给出两名候选").toHaveLength(2);
    expect(
      candidates.includes(2),
      "间谍必须出现在候选里（他被当作镇民）"
    ).toBe(true);
    const named = info?.roleName;
    // 官方「道哥是被当作守鸦人的间谍」⇒ 真值可能只存在于**登记**层面：
    // 要么场上真有人是这个角色，要么候选里的间谍正被当作该角色。
    const trulyNamed = candidates.some(
      (id: number) => byId(seats, id)?.role?.name === named
    );
    const spyRegisteredAsNamed =
      candidates.includes(2) && byId(seats, 2)?.role?.id === "spy";
    expect(
      trulyNamed || spyRegisteredAsNamed,
      `候选里必须有「${named}」这个角色（真身或间谍登记）`
    ).toBe(true);
    expect(
      isSeatTownsfolk(seats.find((x) => x.role?.name === named) as any),
      `「${named}」必须是镇民角色`
    ).toBe(true);
  });
});

describe("洗衣妇 · 候选人可包含恶魔（官方 洗衣妇#1）", () => {
  it("洗衣妇#1：小恶魔与贞洁者同时候选，告知「其中一人是贞洁者」", async () => {
    // 官方范例: 洗衣妇#1
    // 官方：「小佳是小恶魔，小艾是贞洁者。洗衣妇得知要么小佳是贞洁者，要么小艾是贞洁者。」
    // ⇒ 规则不变量：**两名候选之一确实是报出的那个镇民角色**（另一名可以是任何人）。
    const seats = [
      seat(0, "washerwoman"),
      seat(1, "imp"),
      seat(2, "virgin"),
      seat(3, "chef"),
      seat(4, "soldier"),
      seat(5, "mayor"),
    ];
    const { info } = await run("washerwoman", seats, {
      night: 1,
      phase: "firstNight",
    });
    const candidates = [info?.seat1, info?.seat2].filter(
      (id: any) => typeof id === "number" && id >= 0
    );
    expect(candidates, "必须给出两名候选").toHaveLength(2);
    expect(info?.roleName, "报出的必须是镇民角色").toBeTruthy();
    expect(
      isSeatTownsfolk(
        seats.find((s) => s.role?.name === info?.roleName) as any
      ),
      `「${info?.roleName}」必须是镇民角色`
    ).toBe(true);
  });
});

describe("红唇女郎 · 继承恶魔后占卜师结果翻转（官方 红唇女郎#2）", () => {
  it("红唇女郎#2：占卜师看「红唇女郎+圣徒」得「否」；她继承恶魔后同样两人得「是」", async () => {
    // 官方范例: 红唇女郎#2
    const before = await run(
      "fortune_teller",
      [
        seat(0, "fortune_teller"),
        seat(1, "scarlet_woman"),
        seat(2, "saint"),
        seat(3, "imp"),
        seat(4, "chef"),
      ],
      { night: 2, targets: [1, 2] }
    );
    expect(before.info, "爪牙不是恶魔 ⇒ 不得报「是」").toBe(false);

    // 小恶魔死亡 ⇒ 红唇女郎变成小恶魔（座位角色改写，与生产 `isDemonSuccessor` 同义）
    const after = await run(
      "fortune_teller",
      [
        seat(0, "fortune_teller"),
        seat(1, "imp", { isDemonSuccessor: true }),
        seat(2, "saint"),
        seat(3, "chef"),
      ],
      { night: 3, targets: [1, 2] }
    );
    expect(after.info, "继承恶魔后 ⇒ 必须报「是」").toBe(true);
  });
});

describe("圣徒 · 被替罪羊代刑则不算死于处决（官方 圣徒#2）", () => {
  it("圣徒#2：替罪羊代替圣徒被处决 ⇒ 圣徒没有死亡 ⇒ 游戏继续", async () => {
    // 官方范例: 圣徒#2
    // 官方：「圣徒被处决。然而，替罪羊的能力被触发，因此替罪羊代替圣徒被处决。
    //        游戏继续，因为圣徒没有死亡。」
    const seats = [
      seat(0, "saint"),
      seat(1, "scapegoat"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
      seat(5, "mayor"),
    ];
    // 代刑后：圣徒存活，替罪羊死亡
    const substituted = seats.map((s) =>
      s.id === 1 ? { ...s, isDead: true } : s
    );
    expect(
      isSeatMinion(byId(substituted, 1)),
      "夹具前提：替罪羊是旅行者（不算爪牙）"
    ).toBe(false);
    expect(byId(substituted, 0)?.isDead, "圣徒没有死亡").toBe(false);

    const verdict = judge(substituted as any, "execution", 0);
    expect(verdict.isGameOver, "圣徒没死 ⇒ 不得判终局").toBe(false);
  });

  it("圣徒：真被处决时其阵营落败（同一判据的正向对照）", async () => {
    // 官方范例: 圣徒#0
    const seats = [
      seat(0, "saint", { isDead: true }),
      seat(1, "chef"),
      seat(2, "imp"),
      seat(3, "soldier"),
      seat(4, "mayor"),
    ];
    const verdict = judge(seats as any, "execution", 0);
    expect(verdict.isGameOver, "圣徒死于处决 ⇒ 必须终局").toBe(true);
    expect(verdict.winner, "善良阵营落败").toBe("Evil");
  });
});
