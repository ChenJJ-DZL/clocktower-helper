/**
 * 双掩码类问题回归锁（2026-10-20）
 * ==================================================================
 * 事故链（占卜师实测复现）：引擎受干扰 ⇒ 自产假值「没有恶魔」
 *   ⇒ UI 脱敏层把它当真值二次取反 ⇒ 翻回「有恶魔」= 真信息泄漏。
 *
 * 修复 = `shouldUiRemaskForCorruption`：自产假值型角色 + meta.isCorrupted
 *   ⇒ UI 层放行原文（与引擎/提示预演一致）。
 *
 * 本文件锁三条：
 *   F1 占卜师（boolean）：涡流下引擎假值必假，且 UI 层不得二次取反；
 *   F2 跨类型泛化：number/targets 自产假值型同样跳过二次随机；
 *   F3 只打标记型（渔夫）：UI 层必须替换（不得误跳过）。
 */
import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import {
  resetStorytellerInfoOverrides,
  shouldUiRemaskForCorruption,
} from "../../../utils/corruptedInfo";

function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  opts: Partial<any> = {}
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    roleId,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...opts,
  };
}

/** 占卜师(0) / 小恶魔(1) / 农夫(2) / 涡流(3) */
function buildSeats(): any[] {
  return [
    seat(0, "fortune_teller", "townsfolk"),
    seat(1, "imp", "demon"),
    seat(2, "farmer", "townsfolk"),
    seat(3, "vortox", "demon"),
  ];
}

function ctxFor(seats: any[], targetIds: number[]): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
    } as any,
    actionNode: {
      seatId: 0,
      roleId: "fortune_teller",
      roleName: "占卜师",
      priority: 1,
      abilityId: "fortune_teller_check",
      wakeMessage: "",
      firstNightPriority: 1,
      otherNightPriority: 10,
      targetIds,
      processed: false,
      success: false,
      meta: {},
    } as any,
    targetIds,
    meta: {},
    aborted: false,
    preview: false,
  } as MiddlewareContext;
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: fortuneTellerAbility.preCheck,
      calculate: fortuneTellerAbility.calculate,
      stateUpdate: fortuneTellerAbility.stateUpdate,
      postProcess: fortuneTellerAbility.postProcess,
    },
    ctx
  );

describe("F1 占卜师（boolean）：引擎假值必假 + UI 不得二次取反", () => {
  it("涡流下引擎给出与真值相反的假值，UI 层放行原文", async () => {
    resetStorytellerInfoOverrides();
    const seats = buildSeats();
    // 探查 1号(小恶魔)+2号(农夫) ⇒ 真值「有恶魔」(true)
    const out = await run(ctxFor(seats, [1, 2]));
    expect(out.aborted).toBe(false);
    const engineResult = out.meta.abilityResult as boolean;
    const truth = true; // 1号是恶魔
    expect(engineResult, "涡流下引擎未给出与真值相反的假值").toBe(!truth);
    expect(out.meta.isCorrupted, "涡流未标记受干扰").toBe(true);

    // UI 层判定：自产假值型 + meta.isCorrupted ⇒ 不再替换（否则二次取反翻真）
    const remask = shouldUiRemaskForCorruption({
      roleId: "fortune_teller",
      metaIsCorrupted: out.meta.isCorrupted === true,
      playerInfoAlreadyMasked: false,
    });
    expect(
      remask,
      "UI 层仍会对占卜师假值二次取反 ⇒ 翻回真值「有恶魔」（事故链）"
    ).toBe(false);

    // 最终玩家文案 = 引擎假值原文 ⇒ 与真值相反
    const finalText = engineResult ? "有恶魔" : "没有恶魔";
    const finalSaysDemon =
      finalText.includes("有恶魔") && !finalText.includes("没有恶魔");
    expect(finalSaysDemon, `最终文案「${finalText}」翻真（真值=有恶魔）`).toBe(
      !truth
    );
  });
});

describe("F2 跨类型泛化：自产假值型全部跳过二次随机", () => {
  it.each([
    ["chef", "number"],
    ["librarian", "targets"],
    ["empath", "number"],
    ["washerwoman", "targets"],
    ["clockmaker", "number"],
    ["dreamer", "targets"],
  ] as const)("%s（%s）引擎已置 isCorrupted ⇒ UI 放行", (roleId, _kind) => {
    expect(
      shouldUiRemaskForCorruption({
        roleId,
        metaIsCorrupted: true,
        playerInfoAlreadyMasked: false,
      }),
      `${roleId} 被二次掩码（number/targets 二次随机可翻真）`
    ).toBe(false);
  });

  it("引擎未受干扰但 UI 侧另有干扰源（骗人精/伪装）⇒ 必须替换", () => {
    expect(
      shouldUiRemaskForCorruption({
        roleId: "chef",
        metaIsCorrupted: false,
        playerInfoAlreadyMasked: false,
      })
    ).toBe(true);
  });
});

describe("F3 只打标记型：UI 层必须替换（不得误跳过）", () => {
  it.each(["fisherman", "balloonist"] as const)(
    "%s 引擎置 isCorrupted 但结果是真值 ⇒ UI 必须替换",
    (roleId) => {
      expect(
        shouldUiRemaskForCorruption({
          roleId,
          metaIsCorrupted: true,
          playerInfoAlreadyMasked: false,
        }),
        `${roleId} 只打标记型被误判为自产假值 ⇒ 真值直泄玩家页`
      ).toBe(true);
    }
  );
});
