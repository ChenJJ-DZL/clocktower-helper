import { describe, expect, it } from "vitest";
import { board, runRole, seat } from "../_tbHarness";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { vigormortisAbility } from "../../new_engine/vigormortis.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { pit_hagAbility } from "../../new_engine/pit_hag.ability";
import { witchAbility } from "../../new_engine/witch.ability";
import { evil_twinAbility } from "../../new_engine/evil_twin.ability";
import { barberAbility } from "../../new_engine/barber.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import {
  canJudgeMutantExecution,
  hasPendingMutantMadnessCheck,
} from "../../../utils/mutantGate";

/**
 * L5 · 梦殒春宵 / 游园惊梦 · 恶魔与爪牙因果链（2026-09-21）
 * ------------------------------------------------------------------
 * ⚠️ 为什么必须补这一层：
 *   这两个剧本的 8 个角色此前**只有 L1~L3 覆盖**（数据 / 引擎 / 文案渲染），
 *   没有 L5（断言状态真的落库）。「文案对了」≠「状态变了」—— 这正是
 *   「测试全绿但人一玩就崩」的根源。
 *
 * 🔒 写 L5 前的三问（沿用 §30.8）：
 *   ① **靶子安全吗** —— 本文件所有击杀靶子固定用
 *      `chambermaid`（侍女）/ `gossip`（造谣者）/ `grandmother`（祖母）/
 *      `tinker`（修补匠）—— 纯信息类，`isImmuneToDemonKill` 对它们全返回 false。
 *      **绝不**用 `sailor` / `fool` / `tea_lady` / `pacifist` / `innkeeper` /
 *      `goon` / `moonchild`（有免疫或免死 ⇒ 会造出假红）。
 *   ② **前提齐吗** —— 各角色读的 `ctx.storytellerInput.*` 与 `snapshot.*`
 *      见每个用例内注释；harness 默认 snapshot **不含**这些字段，
 *      凡用 `!== null` / truthy 判断的**必须显式传**（否则走 aborted 分支 ⇒ 假绿）。
 *   ③ **判据是差分吗** —— 先深拷贝 `before`，跑完比 `after`，要求
 *      「至少一个语义字段（座位级或快照级）发生变化」+ 该角色特征值。
 *      只看终态（`isDead === true`）分不清「本能力杀的」和「开局就死的」。
 *
 * ⚠️ 本文件**不预知**各角色具体状态字段，用通用语义字段集做差分；
 *    特征值断言只在**官方原文/实现**明确产出该字段时才收紧。
 */

/** 座位级语义字段：任一变化即代表能力真的落到座位上 */
const SEAT_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "killedBy",
  "statusEffects",
  "isPoisoned",
  "isDrunk",
  "isCursed",
  "isProtected",
  "isGoodTwin",
  "isEvilConverted",
  "keepsAbilityDead",
  "role",
] as const;

/** 快照级语义字段：座位之外，能力写入快照的记账字段 */
const SNAPSHOT_KEYS = [
  "lastKill",
  "fangGuJump",
  "fangGuHasJumped",
  "vigormortisPoisonedTownsfolkId",
  "noDashiiPoisoned",
  "witchCurse",
  "evilTwinPair",
  "roleChanges",
  "barberSwap",
  "isDemonCreatedByPitHag",
  "deathDecidedByStoryteller",
  "mutantRevealed",
] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 座位在 before/after 间变化的语义字段 */
function seatChanges(beforeSeat: any, afterSeat: any): string[] {
  return SEAT_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}

/** 快照在 before/after 间变化的记账字段（beforeExtra 无该键 ⇒ 视为 undefined） */
function snapshotChanges(
  beforeExtra: Record<string, any>,
  afterSnap: any
): string[] {
  return SNAPSHOT_KEYS.filter(
    (k) => JSON.stringify(beforeExtra?.[k]) !== JSON.stringify(afterSnap?.[k])
  );
}

function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

/** 统一的失败文案：座位级 + 快照级都空 ⇒ 技能走空了 */
function assertSomethingChanged(
  seatDiffs: Record<number, string[]>,
  snapDiffs: string[],
  hint: string,
  res?: any
) {
  const total =
    Object.values(seatDiffs).reduce((n, ks) => n + ks.length, 0) +
    snapDiffs.length;
  expect(
    total,
    `❌ ${hint}\n` +
      `   座位级变化=${JSON.stringify(seatDiffs)}；快照级变化=${JSON.stringify(snapDiffs)}` +
      `\n   aborted=${res?.aborted} reason=${res?.abortReason ?? "无"}` +
      `\n   ⇒ 说书人在 UI 上能选人、能确认，但状态里什么都没落（跑通≠能玩）`
  ).toBeGreaterThan(0);
}

const SAFE_BOARD = ["chambermaid", "gossip", "grandmother", "tinker"];

describe("L5 · 梦殒春宵 · 四恶魔因果链（方古 / 亡骨魔 / 诺-达鲺）", () => {
  it("① 方古(fang_gu)：击杀镇民 → 目标必须真的死亡并落 deathSource", async () => {
    const seats = board(["fang_gu", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(fang_guAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1], // chambermaid：无免疫
    });

    const seatDiffs = {
      1: seatChanges(before[1], seatAfter(res, 1)),
    };
    assertSomethingChanged(seatDiffs, snapshotChanges({}, res?.snapshot), "方古选了目标并确认后，目标状态完全没变", res);

    const after = seatAfter(res, 1);
    expect(
      after?.isDead,
      `❌ 方古击杀的目标必须死亡（实际 isDead=${after?.isDead}）`
    ).toBe(true);
    expect(
      after?.deathSource,
      `❌ 方古击杀的 2号 deathSource 必须是 fang_gu_kill（实际 ${after?.deathSource}）`
    ).toBe("fang_gu_kill");
  });

  it("② 方古(fang_gu)：击杀外来者 → 外来者变方古且原方古代替死亡（官方「每局仅一次」）", async () => {
    // ⚠️ 前提：目标是**外来者**（barber=理发师，outsider），且场上没有 fangGuHasJumped 标记
    const seats = board(["fang_gu", "barber", "gossip", "grandmother", "tinker"]);
    const before = clone(seats);

    const res = await runRole(fang_guAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const seatDiffs = {
      0: seatChanges(before[0], seatAfter(res, 0)),
      1: seatChanges(before[1], seatAfter(res, 1)),
    };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "方古攻击了外来者，但外来者与原方古的状态都没有任何变化（官方：外来者变邪恶方古 + 原方古死亡）",
      res
    );

    // 特征值（官方原文：「被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡」）
    const jumped = seatAfter(res, 1);
    expect(
      jumped?.role?.id,
      `❌ 被方古攻击的外来者必须变成方古（实际 role.id=${jumped?.role?.id}）`
    ).toBe("fang_gu");
    expect(
      jumped?.isDead,
      `❌ 外来者变成方古时**不应死亡**（官方：改为不死）`
    ).toBe(false);

    const oldDemon = seatAfter(res, 0);
    expect(
      oldDemon?.isDead,
      `❌ 跳变时原方古必须代替死亡（实际 isDead=${oldDemon?.isDead}）—— 否则场上出现两个方古`
    ).toBe(true);
    expect(
      oldDemon?.deathSource,
      `❌ 原方古的死因应为 fang_gu_jump（实际 ${oldDemon?.deathSource}）`
    ).toBe("fang_gu_jump");
  });

  it("③ 亡骨魔(vigormortis)：击杀镇民 → 目标死亡并落 vigormortis_kill", async () => {
    const seats = board(["vigormortis", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(vigormortisAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const seatDiffs = { 1: seatChanges(before[1], seatAfter(res, 1)) };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "亡骨魔选了目标并确认后，目标状态完全没变",
      res
    );

    const after = seatAfter(res, 1);
    expect(after?.isDead, `❌ 亡骨魔的目标必须死亡（实际 ${after?.isDead}）`).toBe(
      true
    );
    expect(
      after?.deathSource,
      `❌ 亡骨魔击杀必须落 deathSource=vigormortis_kill（实际 ${after?.deathSource}）`
    ).toBe("vigormortis_kill");
  });

  it("④ 亡骨魔(vigormortis)：击杀爪牙 → 爪牙死亡但保留能力 + 邻近镇民中毒", async () => {
    // ⚠️ 前提（`vigormortis.ability.ts:35`）：`poisonedTownsfolkId` 读自
    //   `ctx.storytellerInput`（**不是 snapshot**），默认 null ⇒ 必须显式传，
    //   否则中毒分支永不触发（会造出「测不到目标分支」的假绿）。
    const seats = board(["vigormortis", "witch", "chambermaid", "gossip", "grandmother"]);
    const before = clone(seats);

    const res = await runRole(vigormortisAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1], // witch：爪牙（type=minion）
      storytellerInput: { poisonedTownsfolkId: 2 }, // chambermaid：邻近镇民
    });

    const seatDiffs = {
      1: seatChanges(before[1], seatAfter(res, 1)),
      2: seatChanges(before[2], seatAfter(res, 2)),
    };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "亡骨魔击杀了爪牙，但爪牙/邻近镇民都没变化",
      res
    );

    const minion = seatAfter(res, 1);
    expect(minion?.isDead, `❌ 被击杀的爪牙必须死亡`).toBe(true);
    expect(
      minion?.keepsAbilityDead,
      `❌ 官方：「被你杀死的爪牙保留他的能力」⇒ 必须落 keepsAbilityDead=true（实际 ${minion?.keepsAbilityDead}）`
    ).toBe(true);

    const poisoned = seatAfter(res, 2);
    expect(
      poisoned?.isPoisoned,
      `❌ 邻近镇民必须中毒（实际 isPoisoned=${poisoned?.isPoisoned}）`
    ).toBe(true);
    expect(
      (poisoned?.statusEffects ?? []).some(
        (e: any) => e.type === "poisoned" && e.source === "vigormortis"
      ),
      `❌ 中毒必须落 statusEffects{type:poisoned,source:vigormortis}`
    ).toBe(true);
  });

  it("⑤ 诺-达鲺(no_dashii)：击杀目标 + 邻近两名镇民中毒（官方「与你邻近的两名镇民中毒」）", async () => {
    // 布局：0=no_dashii，顺时针最近镇民=1(chambermaid)，
    //       逆时针跳过 4(tinker=外来者) → 3(grandmother)
    const seats = board(["no_dashii", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(no_dashiiAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [2], // gossip：击杀目标与两个中毒位错开，便于观察
    });

    const seatDiffs = {
      1: seatChanges(before[1], seatAfter(res, 1)),
      2: seatChanges(before[2], seatAfter(res, 2)),
      3: seatChanges(before[3], seatAfter(res, 3)),
    };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "诺-达鲺选了目标并确认后，目标与邻近镇民都没有任何变化",
      res
    );

    const killed = seatAfter(res, 2);
    expect(killed?.isDead, `❌ 诺-达鲺的目标必须死亡`).toBe(true);
    expect(
      killed?.deathSource,
      `❌ 诺-达鲺击杀必须落 deathSource=no_dashii_kill（实际 ${killed?.deathSource}）`
    ).toBe("no_dashii_kill");

    for (const id of [1, 3]) {
      const s = seatAfter(res, id);
      expect(
        s?.isPoisoned,
        `❌ 邻近镇民 ${id + 1}号 必须中毒（实际 isPoisoned=${s?.isPoisoned}）`
      ).toBe(true);
    }
    expect(
      res?.snapshot?.noDashiiPoisoned,
      `❌ 中毒名单必须记账到 snapshot.noDashiiPoisoned（实际 ${JSON.stringify(res?.snapshot?.noDashiiPoisoned)}）`
    ).toEqual([1, 3]);
  });
});

describe("L5 · 梦殒春宵 · 爪牙与外来者因果链（麻脸巫婆 / 女巫 / 邪恶双子 / 理发师 / 变种人）", () => {
  it("⑥ 麻脸巫婆(pit_hag)：目标变角色 → 座位 role 必须真的改写并记账", async () => {
    // ⚠️ 前提（`pit_hag.ability.ts:27`）：`newRoleId` 读自 `ctx.storytellerInput`，
    //   默认 null ⇒ 必须显式传；且所选角色**不能已在场**（否则官方判定「无事发生」）。
    const seats = board(["pit_hag", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(pit_hagAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { newRoleId: "soldier" }, // soldier 不在场
    });

    const seatDiffs = { 1: seatChanges(before[1], seatAfter(res, 1)) };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "麻脸巫婆指定了角色变换，但目标座位 role 完全没变",
      res
    );

    expect(
      seatAfter(res, 1)?.role?.id,
      `❌ 目标必须变成所选的 soldier（实际 ${seatAfter(res, 1)?.role?.id}）`
    ).toBe("soldier");
    expect(
      res?.snapshot?.roleChanges,
      `❌ 角色变换必须记账到 snapshot.roleChanges`
    ).toContainEqual({ seatId: 1, newRole: "soldier" });
  });

  it("⑦ 麻脸巫婆(pit_hag)：造出恶魔 → 必须置 isDemonCreatedByPitHag / deathDecidedByStoryteller", async () => {
    const seats = board(["pit_hag", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(pit_hagAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { newRoleId: "vortox" }, // 官方：创造恶魔 ⇒ 当晚死亡由说书人决定
    });

    assertSomethingChanged(
      { 1: seatChanges(before[1], seatAfter(res, 1)) },
      snapshotChanges({}, res?.snapshot),
      "麻脸巫婆创造了不在场的恶魔，但目标状态与快照都没变",
      res
    );

    expect(
      seatAfter(res, 1)?.role?.type,
      `❌ 被创造出来的恶魔 type 必须为 demon（实际 ${seatAfter(res, 1)?.role?.type}）`
    ).toBe("demon");
    expect(
      res?.snapshot?.isDemonCreatedByPitHag,
      `❌ 创造恶魔必须置 isDemonCreatedByPitHag=true（实际 ${res?.snapshot?.isDemonCreatedByPitHag}）`
    ).toBe(true);
    expect(
      res?.snapshot?.deathDecidedByStoryteller,
      `❌ 创造恶魔必须置 deathDecidedByStoryteller=true（官方：当晚死亡由说书人决定）`
    ).toBe(true);
  });

  it("⑧ 麻脸巫婆(pit_hag)：所选角色已在场 → 官方「无事发生」（对照组：不得改动）", async () => {
    const seats = board(["pit_hag", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(pit_hagAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { newRoleId: "gossip" }, // gossip 已在 3 号位
    });

    const seatDiffs = { 1: seatChanges(before[1], seatAfter(res, 1)) };
    const snapDiffs = snapshotChanges({}, res?.snapshot);
    expect(
      seatDiffs[1].length + snapDiffs.length,
      `❌ 官方：「她无法创造重复角色，如果那个角色已在场，则无事发生」——` +
        `但座位/快照发生了变化（seat=${JSON.stringify(seatDiffs[1])} snap=${JSON.stringify(snapDiffs)}）`
    ).toBe(0);
    expect(
      seatAfter(res, 1)?.role?.id,
      `❌ 目标角色不得被改写（实际 ${seatAfter(res, 1)?.role?.id}）`
    ).toBe("chambermaid");
  });

  it("⑨ 女巫(witch)：诅咒目标 → 落 cursed 状态 + witchCurse 记账", async () => {
    const seats = board(["witch", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(witchAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const seatDiffs = { 1: seatChanges(before[1], seatAfter(res, 1)) };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "女巫选定了诅咒目标，但目标状态完全没变（白天提名不会死亡 ⇒ 技能走空）",
      res
    );

    const cursed = seatAfter(res, 1);
    expect(cursed?.isCursed, `❌ 被诅咒者必须落 isCursed=true`).toBe(true);
    expect(
      (cursed?.statusEffects ?? []).some(
        (e: any) => e.type === "cursed" && e.source === "witch"
      ),
      `❌ 诅咒必须落 statusEffects{type:cursed,source:witch}`
    ).toBe(true);
    expect(
      res?.snapshot?.witchCurse?.[1],
      `❌ 诅咒必须记账到 snapshot.witchCurse[1]`
    ).toBe(true);
  });

  it("⑩ 女巫(witch)：仅剩 3 名存活 → 官方「你失去此能力」（对照组：必须中止）", async () => {
    // ⚠️ 前提（`witch.ability.ts:22-28`）：aliveCount <= 3 ⇒ aborted。
    //   这条必须用 `seat()` 手工造死亡座位，`board()` 不支持覆盖字段。
    const seats = [
      seat(0, "witch"),
      seat(1, "chambermaid"),
      seat(2, "gossip"),
      seat(3, "grandmother", { isDead: true }),
      seat(4, "tinker", { isDead: true }),
    ];
    const before = clone(seats);

    const res = await runRole(witchAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    expect(
      res?.aborted,
      `❌ 官方：「如果只有三名存活的玩家，你失去此能力」——管道必须中止（实际 aborted=${res?.aborted}）`
    ).toBe(true);
    expect(
      seatChanges(before[1], seatAfter(res, 1)),
      `❌ 已失去能力者不得再落诅咒状态`
    ).toEqual([]);
  });

  it("⑪ 邪恶双子(evil_twin)：首夜互知 → 必须落 evilTwinPair + 对立双子 isGoodTwin", async () => {
    const seats = board(["evil_twin", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(evil_twinAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      targets: [], // targetConfig: {min:0,max:0}
    });

    const seatDiffs = {
      1: seatChanges(before[1], seatAfter(res, 1)),
    };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "邪恶双子首夜互知，但 evilTwinPair 与对立双子标记都没有落库（白天判胜将失据）",
      res
    );

    const pair = res?.snapshot?.evilTwinPair;
    expect(
      pair?.evilSeatId,
      `❌ evilTwinPair.evilSeatId 应为行动者 0（实际 ${pair?.evilSeatId}）`
    ).toBe(0);
    expect(
      typeof pair?.goodSeatId,
      `❌ 必须为邪恶双子配一名对立双子（实际 goodSeatId=${pair?.goodSeatId}）`
    ).toBe("number");
    expect(
      seatAfter(res, pair.goodSeatId)?.isGoodTwin,
      `❌ 对立双子座位必须落 isGoodTwin=true`
    ).toBe(true);
    expect(
      res?.meta?.evilTwinResult?.twinRevealed,
      `❌ 首夜必须产出互知结果 twinRevealed=true`
    ).toBe(true);
  });

  it("⑫ 邪恶双子(evil_twin)：说书人指定 twinId → 必须尊重指定（不得自行配对）", async () => {
    const seats = board(["evil_twin", ...SAFE_BOARD]);

    const res = await runRole(evil_twinAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      targets: [],
      storytellerInput: { twinId: 3 }, // 说书人手动指定祖母（3号位）为对立双子
    });

    expect(
      res?.snapshot?.evilTwinPair?.goodSeatId,
      `❌ 说书人指定 twinId=3 时必须落 goodSeatId=3（实际 ${res?.snapshot?.evilTwinPair?.goodSeatId}）`
    ).toBe(3);
    expect(
      seatAfter(res, 3)?.isGoodTwin,
      `❌ 被指定的 4号位必须落 isGoodTwin=true`
    ).toBe(true);
    expect(
      seatAfter(res, 1)?.isGoodTwin,
      `❌ 未被指定的座位不得被标记为对立双子`
    ).toBe(false);
  });

  it("⑬ 理发师(barber)：死亡当晚交换两名玩家角色 → role 必须真的互换并记账", async () => {
    // ⚠️ 前提（`barber.ability.ts:25-26`）：swapA/swapB 读自 `ctx.storytellerInput`，
    //   默认 null ⇒ `swapped=false` ⇒ stateUpdate 直接 return（必须显式传）。
    const seats = board(["barber", ...SAFE_BOARD]);
    seats[0].isDead = true; // 官方：「如果你死亡，在当晚……交换角色」
    const before = clone(seats);

    const res = await runRole(barberAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { swapA: 1, swapB: 2 },
    });

    const seatDiffs = {
      1: seatChanges(before[1], seatAfter(res, 1)),
      2: seatChanges(before[2], seatAfter(res, 2)),
    };
    assertSomethingChanged(
      seatDiffs,
      snapshotChanges({}, res?.snapshot),
      "理发师死亡并指定了交换，但两名玩家的 role 完全没有互换",
      res
    );

    expect(
      seatAfter(res, 1)?.role?.id,
      `❌ 2号位 应拿到 3号位 的角色 gossip（实际 ${seatAfter(res, 1)?.role?.id}）`
    ).toBe("gossip");
    expect(
      seatAfter(res, 2)?.role?.id,
      `❌ 3号位 应拿到 2号位 的角色 chambermaid（实际 ${seatAfter(res, 2)?.role?.id}）`
    ).toBe("chambermaid");
    expect(
      res?.snapshot?.barberSwap,
      `❌ 交换必须记账到 snapshot.barberSwap`
    ).toEqual({ a: 1, b: 2 });
  });

  it("⑭ 理发师(barber)：说书人未指定交换 → 官方「恶魔可以选择不进行角色交换」（对照组）", async () => {
    const seats = board(["barber", ...SAFE_BOARD]);
    seats[0].isDead = true;
    const before = clone(seats);

    const res = await runRole(barberAbility, seats, 0, {
      night: 2,
      phase: "night",
    });

    const diffs = [
      ...seatChanges(before[1], seatAfter(res, 1)),
      ...seatChanges(before[2], seatAfter(res, 2)),
      ...snapshotChanges({}, res?.snapshot),
    ];
    expect(
      diffs.length,
      `❌ 未指定交换时不得改动任何座位/快照（实际变化 ${JSON.stringify(diffs)}）`
    ).toBe(0);
  });

  it("⑮ 变种人(mutant)：管道层 —— 标记暴露后必须落 snapshot.mutantRevealed", async () => {
    // ⚠️ 前提（`mutant.ability.ts:41-43`）：truthy 判据读自
    //   `ctx.meta.mutantRevealed` 或 `ctx.storytellerInput.mutantRevealed`，默认 undefined。
    const seats = board(["mutant", ...SAFE_BOARD]);
    const before = clone(seats);

    const res = await runRole(mutantAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { mutantRevealed: true },
    });

    assertSomethingChanged(
      {},
      snapshotChanges({}, res?.snapshot),
      "变种人已暴露（可被处决）却没有落 snapshot.mutantRevealed",
      res
    );
    expect(
      res?.snapshot?.mutantRevealed,
      `❌ 暴露状态必须落 snapshot.mutantRevealed=true`
    ).toBe(true);
    expect(
      res?.meta?.mutantResult?.canBeExecuted,
      `❌ 暴露后可被处决 canBeExecuted=true`
    ).toBe(true);
    expect(
      seatChanges(before[1], seatAfter(res, 1)),
      `❌ 变种人能力不得误改其它座位`
    ).toEqual([]);
  });

  it("⑯ 变种人(mutant)：未暴露 → 官方「身份隐藏」（对照组：不得落任何状态）", async () => {
    const seats = board(["mutant", ...SAFE_BOARD]);

    const res = await runRole(mutantAbility, seats, 0, {
      night: 2,
      phase: "night",
    });

    expect(
      snapshotChanges({}, res?.snapshot).length,
      `❌ 未暴露时不得落 mutantRevealed（实际 ${JSON.stringify(snapshotChanges({}, res?.snapshot))}）`
    ).toBe(0);
  });

  it("⑰ 变种人(mutant)：真实生效路径 —— 日间门禁（存活且未裁定 ⇒ 必须拦住进黄昏）", () => {
    // ⚠️ 为什么单独测这一条：`mutant.ability.ts` 是 PASSIVE 且优先级为 null
    //   ⇒ **永不入夜序队列**，管道在线上根本不会被执行（文件头已注明）。
    //   变种人真正生效的路径是 `utils/mutantGate.ts` 的日间门禁三件套。
    //   ⇒ 只测管道是假绿，必须把**真实路径**也钉住。
    const aliveMutant = seat(0, "mutant");
    const deadMutant = seat(1, "mutant", { isDead: true });
    const checkedMutant = seat(2, "mutant", { mutantMadnessCheckedToday: true });
    const townsfolk = seat(3, "chambermaid");

    expect(
      hasPendingMutantMadnessCheck([townsfolk]),
      `❌ 场上无存活变种人时不得产生门禁（否则上一局残留状态会把新局卡死在白天）`
    ).toBe(false);
    expect(
      hasPendingMutantMadnessCheck([aliveMutant, townsfolk]),
      `❌ 存在存活且今日未裁定的变种人 ⇒ 白天必须先走疯狂仲裁才能进黄昏`
    ).toBe(true);
    expect(
      hasPendingMutantMadnessCheck([deadMutant, townsfolk]),
      `❌ 已死亡的变种人不得产生门禁`
    ).toBe(false);
    expect(
      hasPendingMutantMadnessCheck([checkedMutant, townsfolk]),
      `❌ 今日已裁定过 ⇒ 不得再次拦门`
    ).toBe(false);

    expect(
      canJudgeMutantExecution(aliveMutant),
      `❌ 存活变种人可由说书人裁定处决`
    ).toBe(true);
    expect(
      canJudgeMutantExecution(deadMutant),
      `❌ 已死亡者不可被处决`
    ).toBe(false);
    expect(
      canJudgeMutantExecution(townsfolk),
      `❌ 非变种人不得走该裁定入口`
    ).toBe(false);
  });
});
