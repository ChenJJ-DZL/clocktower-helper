// @vitest-environment jsdom
/**
 * L5「因果链」测试 —— 贯穿 UI 操作与状态落地
 *
 * ⚠️⚠️ 这一层为解决「测试全绿、人工实测一上手就崩」的无限循环而新设。
 *
 * ── 根因（实测证据，勿凭感觉）────────────────────────────────────────
 *   · L2 矩阵 harness 的 `collectAnomalies()` 只查**文案卫生**
 *     （/undefined/、/NaN/、/\[object/、`woken && !guide`）→ 引擎算出非空字符串即通过。
 *   · L3 `*_ui_sweep.test.tsx` 断言 `text.length > 0`、不含 undefined → 只证"渲染出来了"。
 *   · `NightActionConfirmModal.test.ts`（旧）的「选人目标确认」用例**直接调用
 *     `onConfirm([1])` 再断言收到了 [1]** —— 既没渲染、也没点击、更没跑 reducer。
 *   · 全项目 `grep -rn "isPoisoned|isProtected|markedForDeath" e2e/` → **空**，
 *     即 0 个 E2E 断言任何状态字段。
 *   ⇒ 断言对象选错了：测了「有没有」，没测「生效没」。本文件补的就是这段。
 *
 * ── L5 与 L3 的区别（一句话）────────────────────────────────────────
 *   L3：渲染出来、有文字、无 undefined  ⇒ 证「看得见」
 *   L5：点下去 → 状态字段真的变了      ⇒ 证「生效了」
 *   本文件断言的是 `statusEffects` / `abilityEffective` 这类**状态**，不是文案。
 *
 * ── 判据来源（skill §0 铁律 1：判据一律取官方原文）────────────────────
 * 官方投毒者（Poisoner）：
 *   "Each night, choose a player: they are poisoned tonight and tomorrow day."
 *   · 中毒者 **能力失效**（abilityEffective = false）
 *   · 中毒者 **仍会被唤醒**（说书人装作他还有能力）—— 不是"不唤醒"
 *   · 毒持续 **"今晚 + 明天白天"** ⇒ expiresAtNight = 当前夜 + 1
 *   · 中毒者 **不知道自己中毒**
 *
 * ── 本文件的自检（防假绿，必做）────────────────────────────────────
 * 把 `poisoner.ability.ts::stateUpdateResult` 里写 `statusEffects` 的那个
 * `map` 分支注释掉 → 「状态落地」用例必须**变红**。
 * 若仍绿 ⇒ 本层是摆设，重写（见 skill §0 铁律 2「假绿自检」）。
 */

import { fireEvent } from "@testing-library/dom";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { poisonerAbility } from "../../../roles/new_engine/poisoner.ability";
import { board, runRole } from "../../../roles/__tests__/_tbHarness";
import { NightActionConfirmModal } from "../NightActionConfirmModal";

/** 5 人最小局：0洗衣妇 1图书管理员 2调查员 3投毒者 4小恶魔 */
const mkBoard = () =>
  board(["washerwoman", "librarian", "investigator", "poisoner", "imp"]);

/** 从 snapshot 读某座位的「投毒者毒」（唯一事实来源 statusEffects） */
function poisonOf(snapshot: any, seatId: number) {
  const s = snapshot.seats.find((x: any) => x.id === seatId);
  return (s?.statusEffects ?? []).filter(
    (e: any) => e.type === "poisoned" && e.source === "poisoner"
  );
}

/**
 * 真实交互：渲染弹窗 → 点座位卡 → 点确认按钮。
 *
 * ⚠️ 踩过的坑：
 *   · `seats` 是 **props**，不是 `data` 的字段（见 NightActionConfirmModal 签名）
 *   · 座位卡文案是 `{seat.id + 1}号`（0 基 id → 1 基展示）
 */
function clickSeatAndConfirm(seatIds: number[], firstNight = true) {
  const seats = mkBoard();
  // 造一个"棋盘快照版"的 seats 传给弹窗（弹窗只读 id / isDead / role）
  let confirmed: number[] | undefined;

  const { unmount } = render(
    <NightActionConfirmModal
      data={
        {
          roleName: "4号-投毒者",
          roleId: "poisoner",
          actionDescription: "选择一名玩家进行下毒",
          targetLimit: { min: 1, max: 1 },
          actorSeatId: 3,
          allowSelf: false,
          aliveOnly: true,
          initialSelectedTargets: [],
          ...(firstNight ? {} : {}),
        } as any
      }
      seats={seats}
      onConfirm={(t?: number[]) => {
        confirmed = t;
      }}
      onCancel={() => {}}
    />
  );

  for (const sid of seatIds) {
    fireEvent.click(screen.getByText(`${sid + 1}号`, { exact: true }));
  }
  fireEvent.click(screen.getByRole("button", { name: /确认/ }));
  unmount();
  return { confirmed, seats };
}

// ═════════════════════════════════════════════════════════════
// ⭐ 核心：从 UI 点击 → 状态真的变了
// ═════════════════════════════════════════════════════════════

describe("L5 · 投毒者：UI 点击 → 状态落地（因果链闭环）", () => {
  it("⭐ 弹窗点选 2号 并确认 → UI 传对 id，且喂进引擎后该座位真的多出 poisoned", async () => {
    const { confirmed, seats } = clickSeatAndConfirm([1]);

    // ── 断言 1：UI 把正确座位 id 传下去（旧测试唯一断言，保留为护栏）──
    expect(confirmed, "UI 应把选中的座位 id（0 基）传给 onConfirm").toEqual([1]);

    // ── before：确认前无中毒标记 ──
    expect(poisonOf({ seats }, 1).length, "前置：2号 起初不应中毒").toBe(0);

    // ── 断言 2：⭐ 把 UI 产出喂进引擎 → 状态必须落地 ──
    const res = await runRole(poisonerAbility, seats, 3, {
      night: 1,
      targets: confirmed!,
    });
    const eff = poisonOf(res.snapshot, 1);

    expect(
      eff.length,
      "⭐ 因果链断开：弹窗确认后 2号 的 statusEffects 没有 poisoner 中毒标记"
    ).toBe(1);

    // ── 断言 3：官方「今晚 + 明天白天」──
    expect(eff[0].appliedAtNight, "毒应从当前夜生效").toBe(1);
    expect(
      eff[0].expiresAtNight,
      "官方：毒持续到明天白天 → expiresAtNight = 当前夜 + 1"
    ).toBe(2);

    // ── 断言 4：毒源可追溯（供说书人回溯 / 撤销）──
    expect(eff[0].sourceSeatId, "毒源应指向投毒者座位 3").toBe(3);
  });

  it("⭐ 只毒了 2号：其余座位不得被误标记（防「全座位都下毒」的假通过）", async () => {
    const res = await runRole(poisonerAbility, mkBoard(), 3, {
      night: 1,
      targets: [1],
    });
    for (const sid of [0, 2, 3, 4]) {
      expect(poisonOf(res.snapshot, sid).length, `${sid + 1}号 不应中毒`).toBe(0);
    }
  });

  it("⭐ 重复下毒不叠加，且过期夜顺延（官方：每次选人刷新持续时间）", async () => {
    const r1 = await runRole(poisonerAbility, mkBoard(), 3, {
      night: 1,
      targets: [1],
    });
    expect(poisonOf(r1.snapshot, 1).length).toBe(1);

    const r2 = await runRole(poisonerAbility, r1.snapshot.seats, 3, {
      night: 2,
      targets: [1],
    });
    const eff = poisonOf(r2.snapshot, 1);
    expect(eff.length, "不应叠成 2 条 poisoner 毒").toBe(1);
    expect(eff[0].appliedAtNight, "生效夜应刷新为第 2 夜").toBe(2);
    expect(eff[0].expiresAtNight, "过期夜应顺延为第 3 夜").toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════
// ⭐ 中毒的「可观测后果」：不只是标记，而是能力真的失效
// ═════════════════════════════════════════════════════════════

describe("L5 · 中毒的可观测后果（说书人真正关心的）", () => {
  it("⭐ 中毒的投毒者再下毒 → 目标**不应**中毒（能力失效），但选择仍被记录", async () => {
    const seats = mkBoard();
    // 让投毒者本人中毒（能力是否生效由引擎依 statusEffects 推导）
    seats[3].statusEffects = [
      {
        type: "poisoned",
        source: "poisoner",
        sourceSeatId: 4,
        appliedAtNight: 1,
        expiresAtNight: 2,
      },
    ];
    seats[3].isPoisoned = true;

    const res = await runRole(poisonerAbility, seats, 3, {
      night: 1,
      targets: [1],
    });

    expect(
      poisonOf(res.snapshot, 1).length,
      "⭐ 中毒者能力失效：不应真的把毒下给 2号"
    ).toBe(0);
    expect(
      res.actionNode?.meta?.poisonerResult ?? res.meta?.poisonerResult,
      "选择仍应被记录（说书人需知道投毒者选过谁）"
    ).toBeTruthy();
  });
});
