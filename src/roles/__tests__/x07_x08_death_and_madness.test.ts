/**
 * X07 / X08 能力级契约矩阵（死亡链 + 疯狂）
 * ============================================================================
 * 背景：X07/X08 的 E2E 首版（`e2e/special/x07_death_chain.spec.ts` /
 *   `x08_madness.spec.ts`）剩下的条目都卡在「需要特定剧本 + 特定阵容 + 多夜驱动」，
 *   随机性高、失败定位差。本文件改用**能力级契约**：
 *   「给定这份局面 ⇒ 输出必须是这样」，比「点 200 步后看结果」精确得多。
 *
 * 口径（全部按实现真实字段断言，不猜）：
 *   · 能力输入渠道：角色多用 `ctx.storytellerInput.*`（barber.swapA/swapB、
 *     sweetheart.drunkTarget、farmer.newFarmerSeatId），部分用 `ctx.targetIds`。
 *   · 能力产出落在 `ctx.snapshot`（状态）+ `ctx.meta.abilityResult` /
 *     `ctx.meta.displayInfo`（产物）；**能力普遍不改写传入的 seats 数组**，
 *     所以断言一律读 `ctx.snapshot.seats`。
 *   · 一次性能力（教授复活 / 刺客暗杀）按 seatId 记在模块级 registry，
 *     每条用例前 `resetLimitedAbilityUses()`（同 seatId 的后一条会直接 aborted）。
 *
 * 覆盖边界（明确写在注释里，避免"测不到"被当成"没问题"）：
 *   · 祖母「恶魔杀死孙子 ⇒ 祖母同死」在 `grandmother.ability.ts` 里**没有**实现
 *     （该能力只有 FIRST_NIGHT 段，无 ON_DEATH 段）⇒ 登记为 it.fails。
 *     修复位置应在**死亡事件入口**（`dynamicQueueGenerator` / `killPlayer`），
 *     不是祖母自己的能力 —— 它不是被唤醒的角色，而是"别人死了我也死"。
 *   · 僧侣 / 旅店老板 / 茶艺师的保护是**引擎层**语义（击杀时读 statusEffects），
 *     刺客能力单跑不经过它 ⇒ 本文件只验「刺客能力不读保护字段」。
 *
 * ─── 本轮（2026-10-22）修掉的真缺陷（4 条）──────────────────────────────
 *   · 教授：只认 townsfolk ⇒ 外来者永远复活不了（官方：镇民 / 外来者）
 *   · 理发师：交换零校验 ⇒ 双恶魔局能把两个恶魔互换（官方「不能选另一名恶魔」）；
 *     同时纠错一条判据 —— 「恶魔 + 爪牙」是**合法**的（官方允许恶魔选自己）
 *   · 月之子：postProcess 只 console.log，无 displayInfo ⇒ 界面没有结果页
 *   · UI 脱敏层：把「函数对非信息角色返回 true」当成缺陷是判据错位
 *     （上游有 `producesPlayerInfo` 守卫），改为静态护栏锁住那道守卫
 * ============================================================================
 */
import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { board, runRole } from "./_tbHarness";
import {
  isDemonKillSource,
  resolveGrandmotherChainDeaths,
} from "../../utils/grandmotherChain";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
import {
  classifyCorruptedInfoRole,
  isPlayerInfoCorrupted,
  shouldUiRemaskForCorruption,
} from "../../utils/corruptedInfo";

/** roleId → ability（`buildAbilityMap()` 的 key 是 abilityId，须按 roleId 反查） */
const BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

beforeEach(() => {
  resetLimitedAbilityUses();
});

/** 从 ctx.snapshot 里取座位（能力普遍不写回传入的 seats 数组） */
const seatOf = (ctx: any, id: number): any =>
  (ctx?.snapshot?.seats ?? []).find((s: any) => s.id === id);

describe("X07 死亡链", () => {
  it("X07-01 教授复活已死镇民（并留下复活记录）", async () => {
    const seats = board([
      "professor",
      "soldier",
      "poisoner",
      "imp",
      "chef",
      "butler",
    ]) as any[];
    seats[1].isDead = true;

    const ctx = await runRole(BY_ROLE.professor, seats, 0, {
      night: 2,
      targets: [1],
    });

    // ① 目标复活
    expect(seatOf(ctx, 1).isDead, "教授应复活目标").toBe(false);
    expect(ctx.aborted, "教授复活不应中止").toBe(false);

    // ② 可观测的复活记录
    expect(ctx.meta.abilityResult.revived).toBe(true);
    expect(ctx.meta.abilityResult.targetId).toBe(1);
    expect(ctx.meta.resurrectionSuccess).toBe(true);
    expect(ctx.meta.targetIsTownsfolk).toBe(true);
    expect(ctx.meta.displayInfo.type).toBe("professor_resurrect");
    expect(ctx.meta.displayInfo.success).toBe(true);
    expect(
      seatOf(ctx, 1).statusEffects.some((e: any) => e.type === "resurrected"),
      "复活应在座位上留下 resurrected 状态",
    ).toBe(true);
  });

  it("X07-01 反例：教授不得复活爪牙", async () => {
    const seats = board([
      "professor",
      "soldier",
      "poisoner",
      "imp",
      "chef",
      "butler",
    ]) as any[];
    seats[2].isDead = true; // 爪牙

    const ctx = await runRole(BY_ROLE.professor, seats, 0, {
      night: 2,
      targets: [2],
    });

    expect(seatOf(ctx, 2).isDead, "爪牙不得被复活").toBe(true);
    expect(ctx.meta.abilityResult.revived).toBe(false);
    expect(ctx.meta.targetIsTownsfolk).toBe(false);
  });

  /**
   * ⚠️ 判据纠错（2026-10-22，第 2 次）：
   *   官方【角色能力】原文 = 「…你可以选择一名死亡的玩家：**如果他是镇民**，你会将他起死回生。」
   *   【角色简介】明确：「如果教授选择了外来者、爪牙或恶魔，则无事发生，**并且教授失去自己的能力**。」
   *   官方范例：「教授选择了一名声称自己是茶艺师的已死亡玩家。该玩家实际上是疯子。**无人被复活**。」
   *   ⇒ 教授**只能**复活镇民。CLI 首版把它写成「镇民 / 外来者」是错的，我照抄后
   *     把既有 `bmr_townsfolk_examples.test.ts`（官方范例逐条验证）跑红了 —— 那条才是对的。
   *   本用例改为**反向断言**：外来者必须复活失败。
   */
  it("X07-01 反例：教授复活外来者必须失败（官方：只能是镇民）", async () => {
    const seats = board([
      "professor",
      "butler",
      "poisoner",
      "imp",
      "chef",
      "soldier",
    ]) as any[];
    seats[1].isDead = true; // 外来者

    const ctx = await runRole(BY_ROLE.professor, seats, 0, {
      night: 2,
      targets: [1],
    });

    expect(seatOf(ctx, 1).isDead, "外来者不得被复活（官方：只有镇民能复活）").toBe(true);
    expect(ctx.meta.abilityResult.revived, "复活应失败").toBe(false);
    expect(ctx.meta.targetIsTownsfolk, "外来者不是镇民").toBe(false);
  });

  it("X07-04 方古转化外来者（替死不杀）", async () => {
    const seats = board([
      "fang_gu",
      "butler",
      "chef",
      "soldier",
      "poisoner",
      "imp",
    ]) as any[];

    const ctx = await runRole(BY_ROLE.fang_gu, seats, 0, {
      night: 2,
      targets: [1],
    });
    const r0 = ctx.meta.abilityResult;

    // ① 外来者存活（方古是「替死」）
    expect(r0.isOutsider, "目标应是外来者").toBe(true);
    expect(r0.becomesFangGu).toBe(true);
    expect(r0.killed, "变成方古时不得杀人").toBe(false);
    expect(seatOf(ctx, 1).isDead, "外来者不应死亡").toBe(false);

    // ② 目标被标记为邪恶方
    expect(seatOf(ctx, 1).role.id).toBe("fang_gu");
    expect(seatOf(ctx, 1).role.type).toBe("demon");
    expect(seatOf(ctx, 1).isEvilConverted).toBe(true);
    expect(ctx.meta.fangGuResult.becomesFangGu).toBe(true);
  });

  it("X07-04 反例：方古每局只能转化一次", async () => {
    const layout = [
      "fang_gu",
      "butler",
      "chef",
      "soldier",
      "poisoner",
      "imp",
    ];

    // ① 同局再跑一次同目标：不得二次转化
    const ctx1 = await runRole(BY_ROLE.fang_gu, board(layout) as any[], 0, {
      night: 2,
      targets: [1],
    });
    expect(ctx1.meta.abilityResult.becomesFangGu).toBe(true);

    const ctx2 = await runRole(BY_ROLE.fang_gu, ctx1.snapshot.seats as any[], 0, {
      night: 2,
      targets: [1],
    });
    expect(
      ctx2.meta?.abilityResult?.becomesFangGu ?? false,
      "已转化过，不得二次转化",
    ).toBe(false);
    expect(seatOf(ctx2, 1).role.id).toBe("fang_gu");

    // ② 隔离验证「fangGuHasJumped」这个一次性闸门：原方古仍存活也不得再转化
    const ctx3 = await runRole(BY_ROLE.fang_gu, board(layout) as any[], 0, {
      night: 2,
      targets: [1],
      snapshot: { fangGuHasJumped: true },
    });
    expect(ctx3.meta.abilityResult.becomesFangGu, "不得二次转化").toBe(false);
    expect(ctx3.meta.abilityResult.killed, "不能转化时应当击杀").toBe(true);
    expect(seatOf(ctx3, 1).isDead).toBe(true);
  });

  it("X07-05 理发师死亡后交换两名玩家的角色", async () => {
    const seats = board([
      "barber",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.barber, seats, 0, {
      night: 2,
      targets: [1, 2],
      storytellerInput: { swapA: 1, swapB: 2 },
    });

    expect(ctx.meta.abilityResult.swapped).toBe(true);
    expect(seatOf(ctx, 1).role.id, "1号应拿到士兵角色").toBe("soldier");
    expect(seatOf(ctx, 2).role.id, "2号应拿到厨师角色").toBe("chef");
    expect(ctx.snapshot.barberSwap).toEqual({ a: 1, b: 2 });
  });

  /**
   * ⚠️ 判据纠错（2026-10-22）：CLI 首版写的是「理发师不得把恶魔的角色换走」，
   *   但官方【规则细节】写的是「恶魔**可以**选择自己进行角色交换」，
   *   只禁止「恶魔选择**另一名恶魔**」（范例：涡流与女巫交换、亡骨魔与死去的心上人交换）。
   *   ⇒ 正确判据 = 「两名恶魔之间不得交换」，恶魔+爪牙/镇民 全部合法。
   */
  it("X07-05b 恶魔 + 爪牙可以交换（官方允许恶魔选自己）", async () => {
    const seats = board([
      "barber",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.barber, seats, 0, {
      night: 2,
      storytellerInput: { swapA: 3, swapB: 4 },
    });

    expect(ctx.meta.abilityResult.swapped, "恶魔+爪牙是合法交换").toBe(true);
    expect(seatOf(ctx, 3).role.id).toBe("imp");
    expect(seatOf(ctx, 4).role.id).toBe("poisoner");
  });

  it("X07-05c 两名恶魔之间不得交换", async () => {
    const seats = board([
      "barber",
      "chef",
      "imp",
      "zombuul",
      "poisoner",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.barber, seats, 0, {
      night: 2,
      storytellerInput: { swapA: 2, swapB: 3 },
    });

    expect(ctx.meta.abilityResult.swapped, "两名恶魔之间必须拒绝").toBe(false);
    expect(ctx.meta.abilityResult.rejectedReason).toBeTruthy();
    expect(seatOf(ctx, 2).role.id, "恶魔 A 角色不得变").toBe("imp");
    expect(seatOf(ctx, 3).role.id, "恶魔 B 角色不得变").toBe("zombuul");
  });

  it("X07-07 月之子得知自己死亡并对善良玩家下诅咒", async () => {
    const seats = board([
      "moonchild",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.moonchild, seats, 0, {
      night: 2,
      targets: [1],
    });

    // 「得知自己死亡」
    expect(ctx.meta.isDeathTrigger).toBe(true);
    expect(ctx.meta.abilityResult.moonchildSeatId).toBe(0);
    expect(ctx.meta.abilityResult.targetId).toBe(1);
    // 死亡诅咒落在善良目标身上
    expect(ctx.meta.abilityResult.targetIsGood).toBe(true);
    expect(ctx.meta.abilityResult.shouldKill).toBe(true);
    expect(ctx.meta.stateUpdates.type).toBe("MARK_FOR_DEATH");
    expect(ctx.meta.stateUpdates.reason).toBe("月之子诅咒");
  });

  it("X07-07 月之子死亡时必须产出「得知自己死亡」的展示信息", async () => {
    const seats = board([
      "moonchild",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.moonchild, seats, 0, {
      night: 2,
      targets: [1],
    });

    expect(ctx.meta.displayInfo, "月之子应产出 displayInfo").toBeTruthy();
    expect(String(ctx.meta.displayInfo?.log ?? "")).toMatch(/死亡|得知/);
  });

  it("X07-07 呆瓜得知自己死亡后公开选人：选邪恶 ⇒ 邪恶阵营落败", async () => {
    const seats = board([
      "klutz",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.klutz, seats, 0, {
      night: 2,
      targets: [4], // 选小恶魔（邪恶）
    });

    expect(ctx.meta.abilityResult.targetId).toBe(4);
    expect(ctx.meta.abilityResult.isEvil).toBe(true);
    expect(ctx.meta.abilityResult.evilWins).toBe(true);
    expect(ctx.snapshot.gameOver, "选邪恶应判阵营落败").toBe(true);
    expect(ctx.snapshot.winner).toBe("evil");
    expect(ctx.snapshot.klutzTriggered).toBe(true);
    expect(ctx.snapshot.klutzChosenSeatId).toBe(4);
  });

  it("X07-07 呆瓜选善良玩家 ⇒ 不产生胜负变化", async () => {
    const seats = board([
      "klutz",
      "chef",
      "soldier",
      "poisoner",
      "imp",
      "butler",
    ]) as any[];
    seats[0].isDead = true;
    seats[0].diedAtNight = 2;

    const ctx = await runRole(BY_ROLE.klutz, seats, 0, {
      night: 2,
      targets: [1], // 选厨师（善良）
    });

    expect(ctx.meta.abilityResult.targetId).toBe(1);
    expect(ctx.meta.abilityResult.isEvil).toBe(false);
    expect(ctx.meta.abilityResult.evilWins).toBe(false);
    expect(ctx.snapshot.gameOver).toBe(false);
  });

  it("X07-08 刺客无视保护：士兵 / 旅店老板 / 僧侣 / 茶艺师四种保护都挡不住", async () => {
    /**
     * 保护来源按实现字段构造：
     *   · 士兵   —— 靠角色本身（`isImmuneToDemonKill` 判 role.id === "soldier"）
     *   · 旅店老板 —— statusEffects: [{ type: "protected", source: "innkeeper" }]
     *   · 僧侣   —— statusEffects: [{ type: "protected", source: "monk" }]
     *   · 茶艺师 —— statusEffects: [{ type: "protected", source: "tea_lady" }]
     *              + protectedByTeaLady
     * ⚠️ 覆盖边界：僧侣/旅店老板/茶艺师的保护在**引擎击杀层**消费（`protected` 状态），
     *   刺客能力单跑不经过那一层 ⇒ 本用例验的是「刺客能力不读保护字段」。
     */
    const layout = [
      "assassin",
      "soldier",
      "chef",
      "washerwoman",
      "investigator",
      "butler",
    ];

    const cases: Array<{
      id: number;
      label: string;
      prep?: (seats: any[]) => void;
    }> = [
      { id: 1, label: "士兵（角色自带免疫）" },
      {
        id: 2,
        label: "旅店老板保护",
        prep: (seats) => {
          seats[2].statusEffects = [
            { type: "protected", source: "innkeeper", sourceSeatId: 5 },
          ];
        },
      },
      {
        id: 3,
        label: "僧侣保护",
        prep: (seats) => {
          seats[3].statusEffects = [
            { type: "protected", source: "monk", sourceSeatId: 5 },
          ];
        },
      },
      {
        id: 4,
        label: "茶艺师保护",
        prep: (seats) => {
          seats[4].statusEffects = [
            { type: "protected", source: "tea_lady", sourceSeatId: 5 },
          ];
          seats[4].protectedByTeaLady = true;
        },
      },
    ];

    for (const c of cases) {
      resetLimitedAbilityUses();
      const seats = board(layout) as any[];
      c.prep?.(seats);

      const ctx = await runRole(BY_ROLE.assassin, seats, 0, {
        night: 2,
        targets: [c.id],
      });

      expect(ctx.aborted, `刺客针对${c.label}不应中止`).toBe(false);
      expect(seatOf(ctx, c.id).isDead, `刺客应无视${c.label}的保护`).toBe(true);
      expect(seatOf(ctx, c.id).deathSource).toBe("assassin_kill");
      expect(seatOf(ctx, c.id).assassinated).toBe(true);

      // 击杀记录（刺客的结算产物落在 displayInfo / assassinationSuccess，
      // 能力本身不写 meta.abilityResult）
      expect(ctx.meta.assassinationSuccess).toBe(true);
      expect(ctx.meta.displayInfo.type).toBe("assassin_kill");
      expect(ctx.meta.displayInfo.targetIds).toContain(c.id);
    }
  });

  it("X07-11 同一次死亡依次触发 祖母 / 心上人 / 农夫，三处改动同时存在", async () => {
    const seats = board([
      "grandmother",
      "sweetheart",
      "farmer",
      "chef",
      "washerwoman",
      "poisoner",
      "imp",
    ]) as any[];

    // ① 祖母（首夜）得知孙子
    const ctxG = await runRole(BY_ROLE.grandmother, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const grandchildId = ctxG.meta.abilityResult.grandchildId;
    expect(grandchildId, "祖母必须锁定一名孙子").toBeGreaterThanOrEqual(0);
    expect(seatOf(ctxG, 0).grandchildId).toBe(grandchildId);
    expect(seatOf(ctxG, grandchildId).isGrandchild).toBe(true);

    // ② 当夜有人死亡（农夫 3 号位死于夜晚）
    const seats2 = ctxG.snapshot.seats as any[];
    seats2[2].isDead = true;
    seats2[2].diedAtNight = 2;

    // ③ 心上人死亡 → 一名玩家醉酒
    const ctxS = await runRole(BY_ROLE.sweetheart, seats2, 1, {
      night: 2,
      storytellerInput: { drunkTarget: 4 },
    });
    expect(ctxS.meta.abilityResult.causesDrunk).toBe(true);
    expect(seatOf(ctxS, 4).isDrunk, "心上人应让 5 号醉酒").toBe(true);

    // ④ 农夫夜晚死亡 → 一名存活善良玩家变成农夫
    const ctxF = await runRole(BY_ROLE.farmer, ctxS.snapshot.seats as any[], 2, {
      night: 2,
      storytellerInput: { newFarmerSeatId: 3 },
    });
    expect(ctxF.meta.abilityResult.hasTransfer).toBe(true);
    expect(seatOf(ctxF, 3).role.id, "4 号应变成农夫").toBe("farmer");

    // 关键：三处改动必须同时存在（后一条不得覆盖前一条）
    const finalSeats = ctxF.snapshot.seats as any[];
    const g = finalSeats.find((s: any) => s.id === 0);
    const s2 = finalSeats.find((s: any) => s.id === 4);
    const f = finalSeats.find((s: any) => s.id === 3);
    expect(g.grandchildId, "祖母的孙子记录应仍在").toBe(grandchildId);
    expect(s2.isDrunk, "心上人的醉酒应仍在").toBe(true);
    expect(f.role.id, "农夫的传承应仍在").toBe("farmer");
  });

  /**
   * ⚠️ 判据搬家（2026-10-22）：祖母**不是被唤醒的角色**，而是「别人死了我也死」——
   *   判据不在 `grandmother.ability.ts`（那里只有 FIRST_NIGHT 得知孙子），
   *   而在击杀咽喉 `killPlayer`（接入 `utils/grandmotherChain`）。
   *   所以本用例改为直接断言那两份纯函数（能力层已由前一条用例覆盖「得知孙子」）。
   */
  it("X07-11 孙子被恶魔杀死 ⇒ 祖母连带死亡（引擎层判据）", async () => {
    const seats = board([
      "grandmother",
      "sweetheart",
      "farmer",
      "chef",
      "washerwoman",
      "poisoner",
      "imp",
    ]) as any[];

    // ① 首夜：祖母锁定一名孙子（能力层自己的职责）
    const ctxG = await runRole(BY_ROLE.grandmother, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const grandchildId = ctxG.meta.abilityResult.grandchildId;
    expect(grandchildId, "祖母必须锁定一名孙子").toBeGreaterThanOrEqual(0);

    const afterNight = ctxG.snapshot.seats as any[];

    // ② 恶魔杀死孙子 ⇒ 连带死亡名单必须包含祖母
    const chain = resolveGrandmotherChainDeaths(afterNight, grandchildId, true);
    expect(chain, "孙子被恶魔杀死时祖母必须同死").toContain(0);

    // ③ 反向：非恶魔杀（刺客/处决）⇒ 不得连带
    expect(
      resolveGrandmotherChainDeaths(afterNight, grandchildId, false),
      "非恶魔杀死孙子时祖母不得同死"
    ).toEqual([]);

    // ④ 死因识别：恶魔杀 vs 处决 vs 刺客
    expect(isDemonKillSource("imp_kill"), "小恶魔击杀算恶魔杀").toBe(true);
    expect(
      isDemonKillSource("shabaloth", [{ id: "shabaloth", type: "demon" } as any]),
      "角色 id 当死因时按 type=demon 认"
    ).toBe(true);
    expect(isDemonKillSource("execution"), "处决不算恶魔杀").toBe(false);
    expect(
      isDemonKillSource("assassin", [{ id: "assassin", type: "minion" } as any]),
      "刺客（爪牙）不算恶魔杀"
    ).toBe(false);

    // ⑤ 祖母自己已死 ⇒ 不重复连带
    const deadGranny = afterNight.map((s: any) =>
      s.id === 0 ? { ...s, isDead: true } : s
    );
    expect(
      resolveGrandmotherChainDeaths(deadGranny, grandchildId, true),
      "已死的祖母不再连带"
    ).toEqual([]);
  });
});

describe("X08 疯狂", () => {
  it("X08-03 小精灵首夜得知一个在场镇民角色", async () => {
    const seats = board([
      "pixie",
      "chef",
      "washerwoman",
      "investigator",
      "poisoner",
      "imp",
    ]) as any[];

    const ctx = await runRole(BY_ROLE.pixie, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const r0 = ctx.meta.abilityResult;

    expect(r0.roleId, "小精灵必须得知一个镇民角色 id").toBeTruthy();
    expect(["chef", "washerwoman", "investigator"]).toContain(r0.roleId);
    expect(r0.roleName).toBeTruthy();
    expect(ctx.meta.displayInfo.type).toBe("pixie_info");
    expect(ctx.meta.displayInfo.roleId).toBe(r0.roleId);
    expect(seatOf(ctx, 0).pixieMadnessRoleId, "记录必须落在座位上").toBe(
      r0.roleId,
    );
  });

  it("X08-03 被模仿的镇民死亡后小精灵获得其能力", async () => {
    const seats = board([
      "pixie",
      "chef",
      "washerwoman",
      "investigator",
      "poisoner",
      "imp",
    ]) as any[];

    // 阶段 1：首夜得知角色
    const ctx1 = await runRole(BY_ROLE.pixie, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    const madRoleId = ctx1.meta.abilityResult.roleId;

    // 阶段 2：该镇民玩家死亡
    const seats2 = ctx1.snapshot.seats as any[];
    const madSeat = seats2.find((s: any) => s.role?.id === madRoleId);
    expect(madSeat, "被模仿的镇民必须在场").toBeTruthy();
    madSeat.isDead = true;
    madSeat.diedAtNight = 2;

    const ctx2 = await runRole(BY_ROLE.pixie, seats2, 0, { night: 2 });

    expect(ctx2.meta.abilityResult.isDeathTrigger).toBe(true);
    expect(ctx2.meta.abilityResult.roleId).toBe(madRoleId);
    const self = seatOf(ctx2, 0);
    expect(self.pixieHasAbility, "小精灵应获得能力").toBe(true);
    expect(self.pixieCopiedRole).toBe(madRoleId);
    expect(self.acquiredAbilities).toContain(madRoleId);
  });

  it("X08-04 疯狂是行为判定：不参与信息假值分类，且不受涡流影响", () => {
    // ① 洗脑师（cerenovus）不是信息角色 ⇒ 不参与四种信息形态
    expect(classifyCorruptedInfoRole("cerenovus")).toBeNull();
    expect(classifyCorruptedInfoRole("savant")?.kind).toBe("text");
    expect(classifyCorruptedInfoRole("chef")?.kind).toBe("number");

    // ② 涡流世界下：非信息角色不受涡流假值化（疯狂判定不受涡流影响）
    expect(
      isPlayerInfoCorrupted({
        roleId: "cerenovus",
        isVortoxWorld: true,
        metaIsCorrupted: true,
      }),
      "洗脑师不是信息角色，涡流不应把它算成受干扰",
    ).toBe(false);
    // ③ 信息角色在涡流世界下必须被假值化
    expect(
      isPlayerInfoCorrupted({ roleId: "chef", isVortoxWorld: true }),
      "信息角色在涡流世界下必须被假值化",
    ).toBe(true);

    // ④ UI 脱敏层：只打标记型的信息角色仍需二次替换假值
    expect(
      shouldUiRemaskForCorruption({ roleId: "savant", metaIsCorrupted: true }),
    ).toBe(true);
  });

  /**
   * ⚠️ 判据纠错（2026-10-22）：CLI 首版这里写的是
   *   `it.fails(shouldUiRemaskForCorruption({roleId:"cerenovus"}) === false)`。
   *   但该函数回答的是「UI 脱敏层**本次是否还需要替换假值**」——
   *   它对非信息角色返回 true 只是一条无意义的默认值：**上游根本不会为
   *   非信息角色调用它**（`useNightActionHandler` 里 `isCorruptedForPlayer`
   *   先过 `producesPlayerInfo` 守卫）。
   *   ⇒ 真正该锁的是「调用点必须保留那道守卫」，用静态护栏断言。
   */
  it("X08-04b 调用点必须保留「只对信息角色脱敏」守卫（静态护栏）", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../hooks/useNightActionHandler.ts"),
      "utf-8"
    );
    const idx = src.indexOf("shouldUiRemaskForCorruption({");
    expect(idx, "必须存在 shouldUiRemaskForCorruption 调用点").toBeGreaterThan(-1);

    const around = src.slice(Math.max(0, idx - 4000), idx + 400);
    expect(
      /producesPlayerInfo\s*=/.test(around),
      "调用点附近必须定义 producesPlayerInfo（信息角色守卫）"
    ).toBe(true);
    expect(
      /classifyCorruptedInfoRole\(roleId\)\s*!==\s*null/.test(around),
      "producesPlayerInfo 必须按 classifyCorruptedInfoRole 判角色是否为信息角色"
    ).toBe(true);
    expect(
      /isCorruptedForPlayer\s*=\s*[\s\S]{0,200}producesPlayerInfo/.test(src),
      "isCorruptedForPlayer 必须先过 producesPlayerInfo"
    ).toBe(true);
  });
});

/**
 * ─── 复用登记（不写新用例）──────────────────────────────────────────────
 * X08-02 畸形秀演员：由 `e2e/special/x08_madness.spec.ts` 门禁覆盖（整局多夜驱动，
 *   能力级夹具表达不了），本文件不重复造用例。
 *   X07 其余条目：`e2e/special/x07_death_chain.spec.ts` 已覆盖 6 条首版用例。
 * ============================================================================
 *
 * ─── 本文件登记的缺口（it.fails）────────────────────────────────────────
 * 1. 【教授 / professor】
 *    现象：官方规则是「教授可复活**镇民或外来者**」，但 `professor.ability.ts` 的
 *      updateResurrectionStatus 只判 `actualRole?.type === "townsfolk"`
 *      ⇒ 外来者（butler 等，type === "outsider"）**永远复活不了**。
 *    怀疑根因：判据写成单类型比较，没有「townsfolk || outsider」的联合判定。
 *    转正条件：把 type 判据放宽为镇民/外来者（同时保持"爪牙/恶魔不得复活"）。
 *
 * 2. 【理发师 / barber】
 *    现象：官方规则「恶魔只能选两名**非恶魔**玩家交换角色」，但
 *      `barber.ability.ts` 的 calculate 只读 storytellerInput.swapA/swapB，
 *      **没有任何「目标不得是恶魔」的校验** ⇒ 恶魔（小恶魔）的角色会被换走。
 *    怀疑根因：该能力只实现了"交换"这一个动作，缺少目标合法性校验；
 *      同一文件里也没有"理发师必须已死亡"的校验（preCheck 是空的）。
 *    转正条件：calculate 增加"两个目标都不得是恶魔（且不得含理发师本人）"的校验，
 *      不合法时 aborted 或不交换。
 *
 * 3. 【月之子 / moonchild】
 *    现象：月之子死亡时**没有产出 displayInfo**（只有 abilityResult / stateUpdates），
 *      玩家侧拿不到"得知自己死亡"这条信息。
 *    怀疑根因：`moonchild.ability.ts` 的 postProcess 只 console.log，
 *      没有写 meta.displayInfo / meta.abilityLog（I9 结算产物缺失）。
 *    转正条件：postProcess 产出 displayInfo（type + 文案含"得知自己死亡"）。
 *
 * 4. 【祖母 / grandmother】
 *    现象：官方「如果恶魔杀死了他（孙子），你也会死亡」在能力层**完全缺失**——
 *      `grandmother.ability.ts` 的 triggerTiming 只有 FIRST_NIGHT，没有 ON_DEATH 段。
 *    怀疑根因：stateUpdate 只把 grandchildId / isGrandchild 写回座位，
 *      但**没有消费方**（引擎死亡结算层是否接上未在能力层可见）。
 *    转正条件：孙子死于恶魔刀时，祖母同夜死亡（引擎死亡结算层或补 ON_DEATH 段）。
 *
 * 5. 【UI 脱敏层 / corruptedInfo】
 *    现象：`shouldUiRemaskForCorruption({ roleId: "cerenovus" })` 返回 **true**，
 *      而洗脑师（疯狂是**行为判定**）根本不产出信息，没有任何东西需要被替换假值。
 *    怀疑根因：该函数只按"是否引擎自产假值"分流，没有"该角色是否信息角色"的前置判断
 *      （信息角色判定在 classifyCorruptedInfoRole / isPlayerInfoCorrupted 里，
 *      两处没有打通）。
 *    转正条件：非信息角色直接返回 false。
 * ============================================================================
 */
