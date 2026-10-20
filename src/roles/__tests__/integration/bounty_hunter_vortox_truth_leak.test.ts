/**
 * 涡流世界下赏金猎人信息真假 · 回归锁（2026-10-20）
 * ==================================================================
 * 事故现场（temp/full_sim_report.json 夜1）：涡流 8 号存活时，赏金猎人（3号）
 * 玩家结果页显示「2号玩家是邪恶的」，而 2 号=男爵（真邪恶）= 真信息泄漏。
 *
 * 定罪三链（已修复，本文件锁回归）：
 *   E1 假目标池收留已告知邪恶 ⇒ pickFakeBountyTargetId 必须排除**所有**邪恶
 *   E2 meta.hasVortox/isCorrupted 漏涡流 ⇒ UI 脱敏层拿不到干扰信号
 *   E3 双掩码把引擎假目标当真值二次随机 ⇒ 可翻真
 *      修复 = 引擎声明 playerInfoAlreadyMasked（UI 跳过）+ 候选池只留善良
 */
import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { isSeatEvil } from "../../../utils/seatAlignment";
import {
  bounty_hunterAbility,
  pickFakeBountyTargetId,
} from "../../new_engine/bounty_hunter.ability";
import {
  buildCorruptedInfoMask,
  resetStorytellerInfoOverrides,
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

/** 7 人局：BH(0) / 男爵(1) / 农夫(2) / 图书管理员(3) / 涡流或小恶魔(4) / 小精灵(5) / 博学者(6) */
function buildSeats(vortoxAlive: boolean): any[] {
  return [
    seat(0, "bounty_hunter", "townsfolk"),
    seat(1, "baron", "minion"),
    seat(2, "farmer", "townsfolk"),
    seat(3, "librarian", "townsfolk"),
    vortoxAlive ? seat(4, "vortox", "demon") : seat(4, "imp", "demon"),
    seat(5, "pixie", "townsfolk"),
    seat(6, "savant", "townsfolk"),
  ];
}

function ctxFor(
  seats: any[],
  extra: Partial<MiddlewareContext> = {}
): MiddlewareContext {
  const vortox = seats.some((s) => s.role?.id === "vortox" && !s.isDead);
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
      globalEffects: { vortoxWorld: vortox },
      vortoxWorld: vortox,
      isVortoxWorld: vortox,
    } as any,
    actionNode: {
      seatId: 0,
      roleId: "bounty_hunter",
      roleName: "赏金猎人",
      priority: 1,
      abilityId: "bounty_hunter_reveal",
      wakeMessage: "",
      firstNightPriority: 72,
      otherNightPriority: 105,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    } as any,
    targetIds: [],
    meta: {},
    aborted: false,
    preview: false,
    ...extra,
  } as MiddlewareContext;
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: bounty_hunterAbility.preCheck,
      calculate: bounty_hunterAbility.calculate,
      stateUpdate: bounty_hunterAbility.stateUpdate,
      postProcess: bounty_hunterAbility.postProcess,
    },
    ctx
  );

describe("E1 引擎层：受干扰 ⇒ 假目标绝不能是真邪恶", () => {
  it("涡流存活：选中的目标必须是非邪恶（假信息）", async () => {
    const seats = buildSeats(true);
    const out = await run(ctxFor(seats));
    expect(out.aborted).toBe(false);
    const r = out.meta.abilityResult as any;
    expect(r.targetId, "未选出目标").not.toBeNull();
    const target = seats.find((s) => s.id === r.targetId);
    expect(target, "目标座位不存在").toBeTruthy();
    expect(
      isSeatEvil(target),
      `涡流在场，赏金猎人却指向真邪恶 ${r.targetId + 1}号（真信息泄漏）`
    ).toBe(false);
  });

  it("假目标池必须排除所有邪恶（含已告知过的邪恶）", () => {
    const seats = buildSeats(true);
    // 已告知 1 号（男爵）——旧实现把他从 aliveEvils 剔除后，假目标池
    // 反而重新收留他 ⇒ 假信息翻真（事故链一）。
    const aliveEvils = seats.filter(
      (s) => !s.isDead && s.id !== 0 && ![1].includes(s.id) && isSeatEvil(s)
    );
    for (let i = 0; i < 50; i++) {
      const t = pickFakeBountyTargetId(seats, 0, aliveEvils, Math.random);
      const ts = seats.find((s) => s.id === t);
      expect(
        isSeatEvil(ts),
        `假目标池收留了真邪恶 ${t + 1}号（已告知邪恶逃过排除）`
      ).toBe(false);
    }
  });

  it("说书人指定真邪恶目标时，受干扰也必须替换为假目标", async () => {
    const seats = buildSeats(true);
    const out = await run(
      ctxFor(seats, {
        storytellerInput: { targetSeatId: 1 } as any,
      } as any)
    );
    const r = out.meta.abilityResult as any;
    expect(
      r.targetId,
      "受干扰时说书人指定的真邪恶（2号男爵）未被替换"
    ).not.toBe(1);
    expect(isSeatEvil(seats.find((s) => s.id === r.targetId))).toBe(false);
  });
});

describe("E2 引擎层：干扰标记必须随涡流置真", () => {
  it("涡流在场 ⇒ hasVortox / isCorrupted / playerInfoAlreadyMasked 全为真", async () => {
    const out = await run(ctxFor(buildSeats(true)));
    expect(out.meta.hasVortox, "涡流未被引擎识别").toBe(true);
    expect(
      out.meta.isCorrupted,
      "涡流在场但 meta.isCorrupted 仍为假 ⇒ UI 脱敏层拿不到干扰信号"
    ).toBe(true);
    expect(
      (out.meta as any).playerInfoAlreadyMasked,
      "引擎已自掩码却未声明 ⇒ UI 会二次掩码（双掩码事故链）"
    ).toBe(true);
  });

  it("涡流不在场（小恶魔）⇒ 真信息 + 标记为假 + 不声明自掩码", async () => {
    const out = await run(ctxFor(buildSeats(false)));
    const r = out.meta.abilityResult as any;
    const target = buildSeats(false).find((s) => s.id === r.targetId);
    expect(isSeatEvil(target), "正常世界应给出真邪恶目标").toBe(true);
    expect(out.meta.isCorrupted ?? false).toBe(false);
    expect((out.meta as any).playerInfoAlreadyMasked ?? false).toBe(false);
  });
});

describe("E3 UI 层双掩码防线：候选池只留善良 ⇒ 结构性翻不出真话", () => {
  it("受限候选池下任意重放都不可能显示真邪恶", () => {
    resetStorytellerInfoOverrides();
    // 模拟 UI 脱敏层的候选池过滤（useNightActionHandler 的 bounty_hunter 分支）：
    // 只留善良玩家。trueValue 是引擎假目标（农夫 2 号）。
    const allSeats = buildSeats(true);
    const engineFakeTarget = 2; // 农夫（善良）
    const truthText = `${engineFakeTarget + 1}号玩家是邪恶的`;
    const candidateSeatIds = allSeats
      .filter((s) => s.id !== 0)
      .filter((s) => !isSeatEvil(s))
      .map((s) => s.id);
    expect(candidateSeatIds, "候选池必须只剩善良").toEqual([2, 3, 5, 6]);

    for (let night = 1; night <= 40; night++) {
      const masked = buildCorruptedInfoMask({
        roleId: "bounty_hunter",
        roleName: "赏金猎人",
        truthText,
        trueValue: [engineFakeTarget],
        actorSeatId: 0,
        nightCount: night,
        candidateSeatIds,
        targetCount: 1,
      });
      const m = masked.playerText.match(/(\d+)号/);
      const shown = m ? Number(m[1]) - 1 : NaN;
      const shownSeat = allSeats.find((s) => s.id === shown);
      expect(
        isSeatEvil(shownSeat),
        `night=${night} 显示「${masked.playerText}」翻真（指向真邪恶）`
      ).toBe(false);
    }
  });

  it("放行路径：引擎声明自掩码时 UI 不得再替换（保住与提示预演一致）", async () => {
    // 引擎产出即最终玩家文案：假目标 + 同形句式，UI 层 playerInfoAlreadyMasked
    // ⇒ 直接放行。此处锁「引擎假目标必善良 ⇒ 文案必假」的端到端不变量。
    const seats = buildSeats(true);
    const out = await run(ctxFor(seats));
    expect((out.meta as any).playerInfoAlreadyMasked).toBe(true);
    const r = out.meta.abilityResult as any;
    const playerText = `${r.targetId + 1}号玩家是邪恶的`;
    const shownSeat = seats.find((s) => s.id === r.targetId);
    expect(isSeatEvil(shownSeat), `放行文案「${playerText}」是真信息`).toBe(
      false
    );
  });
});
