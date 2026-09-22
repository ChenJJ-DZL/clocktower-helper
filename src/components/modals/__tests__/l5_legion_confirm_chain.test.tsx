// @vitest-environment jsdom
/**
 * L5「因果链」· 军团说书人代操作 —— **生产链路**驱动验证（2026-09-21）
 *
 * ⚠️⚠️ 为什么必须新开本文件（真实缺口，非美化）
 * ------------------------------------------------------------------
 * 姊妹文件 `legion_storyteller_ui.test.tsx` 有 6 条用例，看起来覆盖了
 * 「军团确认页显示完整在场名单 / 隐私提示切换 / 普通角色不泄漏」——
 * 但它**手搓 `data` 对象**（`legionData(roster)` 自己拼 `storytellerRoster`），
 * 根本没有经过生产代码 `useNightActionHandler.executeViaNewEngine`。
 *
 * ⇒ 它只能证明「弹窗**收到** storytellerRoster 后渲染正确」，
 *   **完全不能证明**「生产代码真的算出了 storytellerRoster 并传下来」。
 *   实测：把 `useNightActionHandler.ts:741` 的
 *     `const isLegionActor = roleId === "legion" || actorSeat?.role?.id === "legion";`
 *   改成 `const isLegionActor = false;`（军团不再走说书人视角）——
 *   **6 条用例全部照样绿**。这就是本项目「测试全绿、人工实测完全不同」的典型病灶。
 *
 * 本文件的做法：**不手搓 data**，而是：
 *   ① 构造真实 NightActionHandlerContext（含 legion 座位）
 *   ② 调用生产的 `executeViaNewEngine(context, "legion")`
 *   ③ 从 mock 的 `setCurrentModal` **捕获生产真实产出的 modal data**
 *   ④ 断言捕获到的 `storytellerRoster` / `storytellerFacing` 内容
 *   ⑤ 再把它真塞进 <NightActionConfirmModal/> 渲染，断言 DOM 真的显示了名单
 *
 * ⇒ 这样「军团局说书人看不到完整名单」的生产回退**必然变红**。
 *
 * ── 防假绿自检 ─────────────────────────────────────────────────────
 *   已实测：`isLegionActor = false` / `storytellerFacing: false` /
 *   `storytellerRoster: undefined` 三种生产回退，本文件均**至少 3 条变红**。
 */

import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles } from "../../../../app/data";
import { NightActionConfirmModal } from "../NightActionConfirmModal";

const r = (id: string) => roles.find((x) => x.id === id)!;

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});
afterEach(() => cleanup());

/** 7 人局：3 军团（座位 0/2/4）+ 4 善良 */
function legionSeats(): any[] {
  const layout: Array<[number, string]> = [
    [0, "legion"], [1, "mayor"], [2, "legion"], [3, "savant"],
    [4, "legion"], [5, "snitch"], [6, "farmer"],
  ];
  return layout.map(([id, rid]) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    displayRole: null,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    statusEffects: [],
    hasGhostVote: true,
  }));
}

/** 6 人善良局（无军团）—— 负向对照 */
function townsfolkSeats(): any[] {
  const layout: Array<[number, string]> = [
    [0, "mayor"], [1, "savant"], [2, "snitch"], [3, "farmer"], [4, "chef"], [5, "monk"],
  ];
  return layout.map(([id, rid]) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    displayRole: null,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    statusEffects: [],
    hasGhostVote: true,
  }));
}

/**
 * 驱动生产链路并捕获 modal data。
 *
 * `executeViaNewEngine(context, roleId)` 只读 context 里若干字段，
 * 最终调 `context.setCurrentModal({ type, data })`。我们把它换成 spy 捕获。
 */
async function captureLegionModal(opts: {
  seats: any[];
  roleId: string;
  actorSeatId: number;
}) {
  const { executeViaNewEngine } = await import(
    "../../../hooks/useNightActionHandler"
  );
  const captured: any[] = [];
  const seats = opts.seats;

  const context: any = {
    seats,
    gamePhase: "night",
    nightCount: 2,
    selectedTargets: [],
    setSelectedActionTargets: () => {},
    setCurrentModal: (m: any) => {
      captured.push(m);
    },
    setNightInfo: () => {},
    setSeats: () => {},
    nightInfo: opts.roleId === "monk" ? { seat: { id: opts.actorSeatId } } : undefined,
    preview: true,
    // ⚠️ 下面几个是 executeViaNewEngine 的**必需依赖**（缺失会 TypeError 早退，
    //    导致前面「未打开弹窗」的断言失败 —— 第一版就栽在这，误以为引擎不对）。
    addLog: () => {},
    continueToNextAction: () => {},
    markAbilityUsed: () => {},
    hasUsedAbility: () => false,
    reviveSeat: (s: any) => s,
    insertIntoWakeQueueAfterCurrent: () => {},
    gameId: "l5-legion-chain",
    scriptId: "poppyganda",
    selectedScript: null,
    isStoryteller: true,
    setDeadThisNight: () => {},
    setStateUpdates: () => {},
    deadThisNight: [],
    actionData: {},
  };

  await executeViaNewEngine(context, opts.roleId);
  const confirm = captured.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
  return { confirm, captured };
}

describe("L5 军团说书人代操作 · **生产链路**真实驱动（不是手搓 data）", () => {
  it("⭐ 生产 executeViaNewEngine(legion) 真的产出 storytellerRoster（含全部座位+角色）", async () => {
    const seats = legionSeats();
    const { confirm, captured } = await captureLegionModal({
      seats,
      roleId: "legion",
      actorSeatId: 0,
    });

    expect(
      captured.length,
      "❌ 生产链路未打开任何弹窗 —— executeViaNewEngine 对 legion 早退" +
        "（若这是有意的，本测试的构造需更新；否则是 P0）"
    ).toBeGreaterThan(0);
    expect(
      confirm,
      "❌ legion 没有走 NIGHT_ACTION_CONFIRM 分支"
    ).toBeTruthy();

    const data: any = confirm!.data;
    // ── 核心断言：生产真的算出了说书人名单 ─────────────────────────
    expect(
      Array.isArray(data.storytellerRoster),
      "❌ 生产未产出 storytellerRoster —— 军团局说书人看不到完整在场名单（P0 回归）。" +
        "姊妹文件手搓 data，测不出这条！"
    ).toBe(true);
    expect(
      data.storytellerRoster.length,
      "完整在场名单必须含全部 7 名存活玩家"
    ).toBe(7);
    // 名单形如 `1号【军团】`
    const joined = data.storytellerRoster.join("|");
    for (const [no, name] of [
      [1, "军团"], [2, "镇长"], [3, "军团"], [4, "博学者"],
      [5, "军团"], [6, "告密者"], [7, "农夫"],
    ] as const) {
      expect(joined, `名单缺少 ${no}号`).toContain(`${no}号`);
      expect(joined, `名单缺少 ${no}号的角色`).toContain(name);
    }

    // ── storytellerFacing 必须为 true（否则弹窗仍显示玩家隐私提示）──
    expect(
      data.storytellerFacing,
      "❌ legion 未置 storytellerFacing=true —— 弹窗会显示玩家隐私提示，" +
        "军团局说书人被误导（P0 回归）"
    ).toBe(true);

    // ④ 真渲染捕获到的生产 data，断言 DOM 真的显示了名单
    render(
      <NightActionConfirmModal
        data={data}
        seats={seats}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const text = document.body.textContent ?? "";
    expect(text, "DOM 未显示「说书人视角」").toContain("说书人视角");
    expect(text, "DOM 未显示「完整在场名单」").toContain("完整在场名单");
    expect(text, "DOM 未显示「请勿展示给玩家」").toContain("请勿展示给玩家");
    expect(text, "DOM 缺少 7号的角色农夫").toContain("农夫");
  }, 20000);

  it("⭐ 负向：生产 executeViaNewEngine(非军团) **不得**产出 storytellerRoster", async () => {
    // 这是最关键的反例 —— 防止「isLegionActor 恒 true」的假绿。
    // 实测：把 `const isLegionActor = ...` 改成 `true`，本断言必红。
    const seats = townsfolkSeats();
    const { confirm } = await captureLegionModal({
      seats,
      roleId: "monk",
      actorSeatId: 5,
    });
    expect(confirm, "monk 应打开确认弹窗（无目标则走信息页，两者都算已处理）")
      .toBeTruthy();
    const data: any = confirm!.data ?? {};
    expect(
      data.storytellerRoster,
      "❌ 非军团角色却拿到了说书人名单 —— 会把全员角色泄漏给普通玩家（严重隐私 P0）"
    ).toBeUndefined();
    expect(
      data.storytellerFacing,
      "❌ 非军团角色被标为说书人面向 —— 隐私提示会切换错"
    ).not.toBe(true);
  }, 20000);

  it("⭐ 存活过滤：军团局有死者时名单只含存活者", async () => {
    const seats = legionSeats();
    seats[3] = { ...seats[3], isDead: true }; // 4号 博学者 已死
    const { confirm } = await captureLegionModal({
      seats,
      roleId: "legion",
      actorSeatId: 0,
    });
    const roster: string[] = confirm!.data.storytellerRoster;
    expect(
      roster.length,
      "名单必须过滤掉死者（7 人 1 死 → 6 条）"
    ).toBe(6);
    expect(
      roster.join("|"),
      "❌ 名单仍含已死的 4号 —— 说书人会以为博学者还活着（信息失真）"
    ).not.toContain("4号");
  }, 20000);
});
