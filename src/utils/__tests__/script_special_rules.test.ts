/**
 * 剧本级特殊规则层 · 单测（2026-09-22 新增）
 * ==================================================================
 * 覆盖「游园惊梦」两条剧本级机制的**实现**：
 *   ① 恶魔不会在夜晚攻击（管道 consumer 的回滚行为）
 *   ② 进入第 N+1 个夜晚时（= 第 N 个白天结束）若恶魔存活 ⇒ 邪恶自动获胜
 *
 * 官方口径与用户裁定（逐字）：
 *   官方（游园惊梦）wiki 简介：「……**恶魔不会在夜晚攻击，但是会在固定的天数后自动获胜**。……」
 *   ⚠️ 该 wiki 页面**只有简介、无规则细节** ⇒ 天数与判定时点由**用户裁定（2026-09-22）**：
 *      · 天数**可配置**（剧本数据里，默认 **3**）；
 *      · 判定时点 = **第 3 个黄昏结束 / 进入第 4 个夜晚时**。
 *   ⇒ 本文件**不写死 3**：判据用注入值做边界测试，另有一条用例**钉住数据配置**。
 */
import { describe, expect, it } from "vitest";

import { checkGameEnd } from "../../../app/gameLogic";
import { scripts } from "../../../app/data";
import {
  getScriptSpecialRules,
  isDemonNightKillSuppressed,
  resolveScriptAutoEvilWin,
} from "../scriptSpecialRules";
import { createScriptRuleNightKillSuppressor } from "../middlewarePipeline";

// ────────────────────────────────────────────────────────────────
// ① 纯判据
// ────────────────────────────────────────────────────────────────
describe("scriptSpecialRules · 规则解析", () => {
  it("缺省安全：无剧本 / 无 specialRules / 字段类型不对 ⇒ 一律视为未声明", () => {
    expect(getScriptSpecialRules(null)).toEqual({
      demonCannotKill: false,
      evilAutoWinOnEnteringNight: undefined,
    });
    expect(getScriptSpecialRules({})).toEqual({
      demonCannotKill: false,
      evilAutoWinOnEnteringNight: undefined,
    });
    expect(
      getScriptSpecialRules({ specialRules: { evilAutoWinOnEnteringNight: 0 } })
        .evilAutoWinOnEnteringNight,
      "0 / 负数不是合法天数 ⇒ 视为未声明（避免 0 夜触发）"
    ).toBeUndefined();
    expect(isDemonNightKillSuppressed({ specialRules: {} })).toBe(false);
  });

  it("正常解析：demonCannotKill / evilAutoWinOnEnteringNight", () => {
    const r = getScriptSpecialRules({
      specialRules: { demonCannotKill: true, evilAutoWinOnEnteringNight: 4 },
    });
    expect(r.demonCannotKill).toBe(true);
    expect(r.evilAutoWinOnEnteringNight).toBe(4);
    expect(isDemonNightKillSuppressed({ specialRules: r })).toBe(true);
  });
});

describe("scriptSpecialRules · 「固定天数后自动获胜」判据（边界）", () => {
  const script = { specialRules: { evilAutoWinOnEnteringNight: 3 } };

  it("⭐ 正例：进入第 N+1 夜（N=3 ⇒ 第 4 夜）且恶魔存活 ⇒ 触发", () => {
    const r = resolveScriptAutoEvilWin({
      script,
      nightCount: 4,
      demonAlive: true,
    });
    expect(r, "第 3 个白天结束（进入第 4 夜）必须触发").toBeTruthy();
    expect(r).toContain("3");
  });

  it("负例：第 3 夜（= 只过了 2 个白天）不触发；第 5 夜也不触发（不是「每夜都判」）", () => {
    expect(
      resolveScriptAutoEvilWin({ script, nightCount: 3, demonAlive: true })
    ).toBeNull();
    expect(
      resolveScriptAutoEvilWin({ script, nightCount: 5, demonAlive: true })
    ).toBeNull();
  });

  it("负例：恶魔已死 ⇒ 不触发（让官方「恶魔死 ⇒ 善良胜」优先）", () => {
    expect(
      resolveScriptAutoEvilWin({ script, nightCount: 4, demonAlive: false })
    ).toBeNull();
  });

  it("负例：剧本未声明该规则 ⇒ 永不触发", () => {
    expect(
      resolveScriptAutoEvilWin({
        script: { specialRules: {} },
        nightCount: 4,
        demonAlive: true,
      })
    ).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────
// ② checkGameEnd 集成（纯函数）
// ────────────────────────────────────────────────────────────────
describe("checkGameEnd · 剧本级自动获胜分支", () => {
  const seats = [
    { id: 0, role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false },
    { id: 1, role: { id: "chef", name: "厨师", type: "townsfolk" }, isDead: false },
    { id: 2, role: { id: "soldier", name: "士兵", type: "townsfolk" }, isDead: false },
    { id: 3, role: { id: "poisoner", name: "投毒者", type: "minion" }, isDead: false },
    { id: 4, role: { id: "saint", name: "圣徒", type: "outsider" }, isDead: false },
  ] as any[];

  it("⭐ 规则就位 + 进入第 4 夜 ⇒ 直接判邪恶胜（含理由）", () => {
    const r = checkGameEnd(seats, "check_phase", null, {
      scriptSpecialRules: { evilAutoWinOnEnteringNight: 3 },
      nightCount: 4,
    } as any);
    expect(r.isGameOver).toBe(true);
    expect(r.winner, "官方：邪恶获胜").toBe("Evil");
    expect(r.reason).toContain("自动获胜");
  });

  it("负例：未到天数 ⇒ 不因本规则结束；缺省 nightCount ⇒ 不触发（防误伤既有剧本）", () => {
    const notYet = checkGameEnd(seats, "check_phase", null, {
      scriptSpecialRules: { evilAutoWinOnEnteringNight: 3 },
      nightCount: 2,
    } as any);
    expect(notYet.isGameOver).toBe(false);

    const noRule = checkGameEnd(seats, "check_phase", null, {} as any);
    expect(noRule.isGameOver).toBe(false);
    expect(noRule.winner ?? null).toBeNull();
  });

  it("负例：恶魔已死 + 天数已到 ⇒ 仍按官方「恶魔死 ⇒ 善良胜」", () => {
    const deadDemon = seats.map((s) =>
      s.role?.type === "demon" ? { ...s, isDead: true } : s
    );
    const r = checkGameEnd(deadDemon, "check_phase", null, {
      scriptSpecialRules: { evilAutoWinOnEnteringNight: 3 },
      nightCount: 4,
    } as any);
    expect(r.isGameOver).toBe(true);
    expect(r.winner, "善良阵营获胜（不得被自动获胜覆盖）").toBe("Good");
  });
});

// ────────────────────────────────────────────────────────────────
// ③ 管道 consumer：恶魔夜晚不攻击
// ────────────────────────────────────────────────────────────────
describe("createScriptRuleNightKillSuppressor · 恶魔夜晚不攻击", () => {
  const mkSeats = () => [
    { id: 0, role: { id: "imp", type: "demon" }, isDead: false },
    { id: 1, role: { id: "chef", type: "townsfolk" }, isDead: false },
    { id: 2, role: { id: "soldier", type: "townsfolk" }, isDead: false },
    { id: 3, role: { id: "scarecrow", type: "outsider" }, isDead: true }, // 步骤前已死
  ];

  const mkCtx = (opts: {
    actorSeatId: number;
    rules?: any;
    killIds?: number[];
    preDeadIds?: number[];
  }) => {
    const seats = mkSeats().map((s) =>
      (opts.killIds ?? []).includes(s.id)
        ? {
            ...s,
            isDead: true,
            markedForDeath: true,
            deathSource: "imp_kill",
            diedAtNight: 3,
          }
        : s
    );
    return {
      snapshot: { seats } as any,
      actionNode: { seatId: opts.actorSeatId, roleId: "imp" } as any,
      targetIds: opts.killIds ?? [],
      meta: {
        _scriptRulePreDeadIds:
          opts.preDeadIds ??
          mkSeats()
            .filter((s) => s.isDead)
            .map((s) => s.id),
      } as any,
      aborted: false,
      scriptSpecialRules: opts.rules,
    } as any;
  };

  it("⭐ 规则开 + 行动者是恶魔 ⇒ 本步骤新产生的死亡必须被回滚（且清干净死因字段）", async () => {
    const ctx = mkCtx({
      actorSeatId: 0,
      rules: { demonCannotKill: true },
      killIds: [1],
    });
    const out = await createScriptRuleNightKillSuppressor()(ctx);
    const seat1 = out.snapshot.seats.find((s: any) => s.id === 1)!;
    expect(seat1.isDead, "恶魔的攻击不得造成死亡").toBe(false);
    expect(seat1.markedForDeath).toBe(false);
    expect(seat1.deathSource, "死因字段必须一并清掉（否则 UI/后续判定会看到半截死亡）").toBeUndefined();
    expect(seat1.diedAtNight).toBeUndefined();
  });

  it("负例：规则关 ⇒ 死亡照常落地（不得误伤其它剧本）", async () => {
    const ctx = mkCtx({ actorSeatId: 0, rules: {}, killIds: [1] });
    const out = await createScriptRuleNightKillSuppressor()(ctx);
    expect(out.snapshot.seats.find((s: any) => s.id === 1)!.isDead).toBe(true);
  });

  it("负例：**爪牙**（刺客）的击杀不受本规则约束", async () => {
    const ctx = mkCtx({
      actorSeatId: 3, // 3 号是 outsider ⇒ 非恶魔
      rules: { demonCannotKill: true },
      killIds: [1],
    });
    const out = await createScriptRuleNightKillSuppressor()(ctx);
    expect(
      out.snapshot.seats.find((s: any) => s.id === 1)!.isDead,
      "只有恶魔的攻击被拦；其它角色的击杀照常"
    ).toBe(true);
  });

  it("负例：**步骤前已死**的玩家不得被「复活」（只回滚本步新增的死亡）", async () => {
    const ctx = mkCtx({
      actorSeatId: 0,
      rules: { demonCannotKill: true },
      killIds: [1],
      preDeadIds: [3],
    });
    const out = await createScriptRuleNightKillSuppressor()(ctx);
    expect(
      out.snapshot.seats.find((s: any) => s.id === 3)!.isDead,
      "旧死亡必须保持死亡"
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// ④ 数据配置钉死（防"规则声明悄悄丢了/天数被改成 0"）
// ────────────────────────────────────────────────────────────────
describe("游园惊梦 · 剧本数据里的规则声明", () => {
  it("必须声明 demonCannotKill + evilAutoWinOnEnteringNight（默认 3，用户裁定）", () => {
    const s = scripts.find((x) => x.id === "garden_of_dreams");
    expect(s, "剧本表里必须有 garden_of_dreams").toBeTruthy();
    const r = getScriptSpecialRules(s as any);
    expect(r.demonCannotKill, "官方：恶魔不会在夜晚攻击").toBe(true);
    expect(
      r.evilAutoWinOnEnteringNight,
      "用户裁定默认 3（改这个数字等于改规则 ⇒ 必须显式改数据 + 更新说明）"
    ).toBe(3);
  });

  it("其余 8 个剧本**不得**被误加该规则（避免污染既有行为）", () => {
    const others = scripts.filter((s) => s.id !== "garden_of_dreams");
    const polluted = others
      .filter((s) => {
        const r = getScriptSpecialRules(s as any);
        return r.demonCannotKill === true || r.evilAutoWinOnEnteringNight != null;
      })
      .map((s) => s.id);
    expect(polluted, "未确认的剧本不得声明剧本级机制").toEqual([]);
  });
});
