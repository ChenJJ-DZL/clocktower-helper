import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { godfatherAbility } from "../../new_engine/godfather.ability";

/**
 * L5 · 黯月初升 · 爪牙因果链（2026-09-21）
 * ------------------------------------------------------------------
 * 沿用 §30.8「写 L5 前的三问」：
 *   ① **靶子安全吗** —— 目标固定用 `chambermaid`（侍女，纯信息类，无免疫/免死）
 *   ② **前提齐吗** —— 各角色前提见用例内注释（先读 preCheck/calculate 得出）
 *   ③ **判据是差分吗** —— 深拷贝 before，跑完比 after，要求语义字段真的变化
 *
 * ⚠️ 本文件**不预知**各角色的具体状态字段，用通用语义字段集做差分；
 *    特征值断言只在该角色确实产出该字段时才收紧（避免因字段名猜错而假红）。
 */

const SEMANTIC_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "statusEffects",
  "isPoisoned",
  "isDrunk",
  "isProtected",
  "protectedFromExecution",
] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function changedKeys(beforeSeat: any, afterSeat: any): string[] {
  return SEMANTIC_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}

function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

describe("L5 · 黯月初升 · 爪牙因果链", () => {
  it("① 刺客(assassin)：使用一次性能力 → 目标必须真的死亡（且无视保护）", async () => {
    const seats = board([
      "assassin",
      "chambermaid",
      "gossip",
      "grandmother",
      "tinker",
    ]);
    const before = clone(seats);

    const res = await runRole(assassinAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const keys = changedKeys(before[1], seatAfter(res, 1));
    expect(
      keys.length,
      `❌ 刺客选定目标并确认后，目标状态**完全没变** —— ` +
        `说书人在 UI 上能选人、能确认，但状态里什么都没落（跑通≠能玩）。` +
        `aborted=${res?.aborted} reason=${res?.abortReason ?? "无"}`
    ).toBeGreaterThan(0);

    // 特征字段：刺客击杀必须落 isDead
    const after = seatAfter(res, 1);
    expect(
      after?.isDead,
      `❌ 刺客的目标必须死亡（实际 isDead=${after?.isDead}）`
    ).toBe(true);
    expect(
      after?.deathSource,
      `❌ 刺客击杀必须落 deathSource（实际 ${after?.deathSource}）`
    ).toBeTruthy();
  });

  it("② 魔鬼代言人(devils_advocate)：目标必须获得「今日免处决」状态", async () => {
    const seats = board([
      "devils_advocate",
      "chambermaid",
      "gossip",
      "grandmother",
      "tinker",
    ]);
    const before = clone(seats);

    const res = await runRole(devils_advocateAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const keys = changedKeys(before[1], seatAfter(res, 1));
    expect(
      keys.length,
      `❌ 魔鬼代言人选定了保护目标，但目标状态**完全没变** —— ` +
        `保护没有落库 ⇒ 白天该玩家仍会被处决（技能走空了）。` +
        `aborted=${res?.aborted} reason=${res?.abortReason ?? "无"}`
    ).toBeGreaterThan(0);
  });

  it("③ 教父(godfather)：夜间选目标 → 状态必须产生可观测变更", async () => {
    // ⚠️ 教父的能力与「外来者」相关 ⇒ 场上必须放外来者（tinker）
    const seats = board([
      "godfather",
      "chambermaid",
      "tinker",
      "gossip",
      "grandmother",
    ]);
    const before = clone(seats);

    const res = await runRole(godfatherAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      /**
       * ⚠️ 前提（`godfather.ability.ts:26`）：`snapshot.outsiderDiedToday` 必须为真
       *   —— 官方：「如果有一个外来者在**白天**死亡」，教父才可选择玩家杀人。
       *   ⚠️ 该判据在 `calculate` 里（不是 preCheck），为假时 `aborted=true`。
       *
       * 🔴 首版没传这个字段 ⇒ 用例必然走到 aborted 分支，而我的判据当时写成
       *   `aborted || keys.length > 0` ⇒ **变异检验时把 stateUpdate 清空竟然仍然绿**
       *   ⇒ 自己造了个假绿。现改为「补齐前提 + 只认状态变更」。
       */
      snapshot: { outsiderDiedToday: true },
    });

    expect(
      res?.aborted,
      `❌ 已满足前提（白天有外来者死亡），教父却仍然中止：` +
        `${res?.abortReason ?? "无原因"}`
    ).toBeFalsy();

    const keys = changedKeys(before[1], seatAfter(res, 1));
    expect(
      keys.length,
      `❌ 教父在满足前提后选定了目标，但目标状态**完全没变**（changedKeys=[]）` +
        `—— 技能在 UI 上可操作，状态却没落库（跑通≠能玩）`
    ).toBeGreaterThan(0);
  });
});
