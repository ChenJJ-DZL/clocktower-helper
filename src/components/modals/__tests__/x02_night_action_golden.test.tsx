// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 1 批（夜间行动 10 个）
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 10 个「夜间行动」相关弹窗建立**人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 4 件事】
 *   ① 能渲染：render() 不抛错，且渲染出的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文（并 toContain 兜底）；
 *   ③ 主按钮文案逐字一致：getAllByRole("button") 里有那条主按钮（trim 后完全相等）；
 *   ④ 关闭不抛错：点关闭/取消后 onClose（或 context 的关闭回调）被调用；
 *      拿不到 onClose prop 的组件改为断言「关闭按钮存在且 disabled=false」。
 *
 * 【portal 说明】
 *   这 10 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【Context 打桩说明】
 *   `NightOrderPreviewModal` / `SpyDisguiseModal` / `BarberSwapModal` 依赖
 *   `useGameActions()`（GameActionsContext）。本用例用 `vi.mock` 对
 *   `../../../contexts/GameActionsContext` 打桩，提供**最小可用实现**
 *   （currentModal / seats / 若干 action 函数），**不修改任何组件源码**。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Seat } from "../../../../app/data";

/* ─────────────────────────── Context 打桩 ─────────────────────────── */

const gameActionsMock: any = vi.hoisted(() => ({
  currentModal: null as any,
  seats: [] as any[],
  nightOrderPreview: [] as any[],
  nightQueuePreviewTitle: "",
  toggleStatus: vi.fn(),
  confirmNightOrderPreview: vi.fn(),
  closeNightOrderPreview: vi.fn(),
  setCurrentModal: vi.fn(),
  setSpyDisguiseMode: vi.fn(),
  setSpyDisguiseProbability: vi.fn(),
  spyDisguiseMode: "off",
  spyDisguiseProbability: 0.8,
  getRegistrationCached: vi.fn(() => ({
    roleType: "townsfolk",
    registersAsDemon: false,
    registersAsMinion: false,
    alignment: "Good",
  })),
  setSeats: vi.fn(),
  addLog: vi.fn(),
  gamePhase: "night",
  insertIntoWakeQueueAfterCurrent: vi.fn(),
}));

vi.mock("../../../contexts/GameActionsContext", () => ({
  useGameActions: () => gameActionsMock,
  useOptionalGameActions: () => gameActionsMock,
  GameActionsProvider: ({ children }: any) => children,
}));

/* ─────────────────────────── 组件导入（放在 mock 之后） ─────────────────────────── */

import { NightOrderPreviewModal } from "../NightOrderPreviewModal";
import { NightActionConfirmModal } from "../NightActionConfirmModal";
import { NightDeathReportModal } from "../NightDeathReportModal";
import { HadesiaKillConfirmModal } from "../HadesiaKillConfirmModal";
import { MoonchildKillModal } from "../MoonchildKillModal";
import { SpyDisguiseModal } from "../SpyDisguiseModal";
import { SpyGrimoireModal } from "../SpyGrimoireModal";
import { BarberSwapModal } from "../BarberSwapModal";
import { StorytellerSelectModal } from "../StorytellerSelectModal";
import { StorytellerCorrectionModal } from "../StorytellerCorrectionModal";

/* ─────────────────────────── 测试环境准备 ─────────────────────────── */

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  if (!(globalThis as any).window.matchMedia) {
    (globalThis as any).window.matchMedia = () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
});

beforeEach(() => {
  gameActionsMock.currentModal = null;
  gameActionsMock.seats = [];
  gameActionsMock.nightOrderPreview = [];
  gameActionsMock.nightQueuePreviewTitle = "";
  gameActionsMock.spyDisguiseMode = "off";
  gameActionsMock.spyDisguiseProbability = 0.8;
  for (const key of [
    "toggleStatus",
    "confirmNightOrderPreview",
    "closeNightOrderPreview",
    "setCurrentModal",
    "setSpyDisguiseMode",
    "setSpyDisguiseProbability",
    "getRegistrationCached",
    "setSeats",
    "addLog",
    "insertIntoWakeQueueAfterCurrent",
  ]) {
    gameActionsMock[key].mockClear?.();
  }
});

afterEach(() => cleanup());

/* ─────────────────────────── 通用工具 ─────────────────────────── */

/** 全部 10 个弹窗都走 ModalWrapper（portal → document.body）。 */
function bodyText(): string {
  return document.body.textContent || "";
}

/** 断言「能渲染」：渲染出的文本非空。 */
function assertRendered(): string {
  const t = bodyText();
  expect(t.trim().length).toBeGreaterThan(0);
  return t;
}

/** ModalWrapper 把标题渲染进 <h2>。 */
function modalTitle(): string {
  const h2 = document.querySelector("h2");
  return (h2?.textContent || "").trim();
}

/** 取所有按钮的文案（trim 后）。 */
function buttonTexts(): string[] {
  return screen.getAllByRole("button").map((b) => (b.textContent || "").trim());
}

/** 按**完全相等**的文案找按钮；找不到就抛出可诊断的错误。 */
function findButton(exactText: string): HTMLButtonElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => (b.textContent || "").trim() === exactText) as
    | HTMLButtonElement
    | undefined;
  if (!btn) {
    throw new Error(
      `未找到文案为「${exactText}」的按钮；当前按钮文案：${JSON.stringify(buttonTexts())}`
    );
  }
  return btn;
}

/** ModalWrapper 右上角的 ✕ 关闭按钮（文案就是 "✕"）。 */
function closeButton(): HTMLButtonElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => (b.textContent || "").trim() === "✕") as
    | HTMLButtonElement
    | undefined;
  if (!btn) throw new Error("未找到 ✕ 关闭按钮");
  return btn;
}

/** 造一个最小合法座位。 */
function mkSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string = "townsfolk"
): Seat {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleName, type },
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
  } as unknown as Seat;
}

/** 通用 3 座位：厨师 / 小恶魔 / 共情者。 */
function mkSeats(): Seat[] {
  return [
    mkSeat(0, "chef", "厨师", "townsfolk"),
    mkSeat(1, "imp", "小恶魔", "demon"),
    mkSeat(2, "empath", "共情者", "townsfolk"),
  ];
}

/** 间谍场景座位：间谍 / 厨师 / 共情者（SpyDisguiseModal 需要 spy + 信息角色）。 */
function mkSpySeats(): Seat[] {
  return [
    mkSeat(0, "spy", "间谍", "townsfolk"),
    mkSeat(1, "chef", "厨师", "townsfolk"),
    mkSeat(2, "empath", "共情者", "townsfolk"),
  ];
}

/* ═══════════════════════ X02 · 夜间行动 10 个弹窗 ═══════════════════════ */

describe("X02 · 夜间行动弹窗 golden 基线", () => {
  /* ─────────── X02-01 ─────────── */
  it("X02-01 NIGHT_ORDER_PREVIEW · 今晚要唤醒的顺序列表", () => {
    gameActionsMock.seats = mkSeats();
    gameActionsMock.nightOrderPreview = [
      { seatNo: 1, roleName: "厨师", order: 1 },
      { seatNo: 2, roleName: "小恶魔", order: 2 },
    ];

    render(
      <NightOrderPreviewModal
        nightOrderModal={{
          title: "🌙 今晚要唤醒的顺序列表",
          preview: gameActionsMock.nightOrderPreview,
        }}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("🌙 今晚要唤醒的顺序列表");
    expect(t).toContain("🌙 今晚要唤醒的顺序列表");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("确认无误，入夜");
    expect(buttonTexts()).toContain("返回调整");

    // ④ 关闭不抛错（该组件无 onClose prop，关闭走 context 的 closeNightOrderPreview）
    fireEvent.click(findButton("返回调整"));
    expect(gameActionsMock.closeNightOrderPreview).toHaveBeenCalled();
  });

  /* ─────────── X02-02 ─────────── */
  it("X02-02 NIGHT_ACTION_CONFIRM · 行动确认", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <NightActionConfirmModal
        data={{
          roleName: "1号-小恶魔",
          roleId: "imp",
          actionDescription: "选择一名玩家击杀",
          onConfirm,
          onCancel,
        }}
        seats={mkSeats()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板：`🌙 ${roleName} - 行动确认`）
    expect(modalTitle()).toBe("🌙 1号-小恶魔 - 行动确认");
    expect(t).toContain("🌙 1号-小恶魔 - 行动确认");

    // ③ 主按钮文案逐字一致（无需选目标时的主按钮字面量就是「确认执行」）
    expect(buttonTexts()).toContain("确认执行");
    expect(buttonTexts()).toContain("撤销本次行动");

    // ④ 关闭不抛错
    fireEvent.click(findButton("撤销本次行动"));
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-03 ─────────── */
  it("X02-03 NIGHT_DEATH_REPORT · 夜晚结算报告", () => {
    const onConfirm = vi.fn();

    render(
      <NightDeathReportModal message="3号死亡" onConfirm={onConfirm} />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("🌙 夜晚结算报告");
    expect(t).toContain("🌙 夜晚结算报告");
    expect(t).toContain("3号死亡");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("确认并进入白天");

    // ④ 关闭不抛错（ModalWrapper 的 onClose === onConfirm）
    fireEvent.click(findButton("确认并进入白天"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-04 ─────────── */
  it("X02-04 HADESIA_KILL_CONFIRM · 哈迪寂亚：决定命运", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onSetChoice = vi.fn();

    render(
      <HadesiaKillConfirmModal
        isOpen={true}
        targetIds={[0, 1, 2]}
        seats={mkSeats()}
        choices={{}}
        onSetChoice={onSetChoice}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("⚔️ 哈迪寂亚：决定命运");
    expect(t).toContain("⚔️ 哈迪寂亚：决定命运");

    // ③ 逐个结算：第 1 位，主按钮是「下一位」（此时不得出现「确定」）
    expect(t).toContain("第 1 / 3 位");
    expect(buttonTexts()).toContain("下一位");
    expect(buttonTexts()).not.toContain("确定");
    expect(buttonTexts()).toContain("取消");

    // ④ 第一位：先点「生」→ onSetChoice 收到当前座位 id
    fireEvent.click(findButton("生"));
    expect(onSetChoice).toHaveBeenCalledTimes(1);
    expect(onSetChoice.mock.calls[0][0]).toBe(0);
    expect(onSetChoice.mock.calls[0][1]).toBe("live");

    // ⑤ 点「下一位」→ 第 2 位；上一位的座位号必须从页面消失（官方要求前一位的选择对后一位保密）
    fireEvent.click(findButton("下一位"));
    const t2 = bodyText();
    expect(t2).toContain("第 2 / 3 位");
    expect(t2).not.toContain("[1号]");
    const card2 = document.querySelector('[data-testid="hadesia-current-target"]');
    expect(card2?.textContent).toContain("[2号]");
    expect(card2?.textContent).not.toContain("[1号]");

    // ⑥ 页面不得泄露角色名
    expect(t).not.toMatch(/号(厨师|小恶魔|士兵|共情者|呆瓜)/);
    expect(t2).not.toMatch(/号(厨师|小恶魔|士兵|共情者|呆瓜)/);

    // ⑦ 再点一次「下一位」→ 第 3 位（最后一位），主按钮变「确定」
    fireEvent.click(findButton("下一位"));
    const t3 = bodyText();
    expect(t3).toContain("第 3 / 3 位");
    expect(t3).not.toContain("[2号]");
    expect(buttonTexts()).toContain("确定");
    expect(buttonTexts()).not.toContain("下一位");
    fireEvent.click(findButton("确定"));
    expect(onConfirm).toHaveBeenCalled();

    // ⑧ 关闭不抛错
    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-05 ─────────── */
  it("X02-05 MOONCHILD_KILL · 月之子已死：选择一名存活玩家", () => {
    const onConfirm = vi.fn();

    render(
      <MoonchildKillModal
        isOpen={true}
        sourceId={1}
        seats={mkSeats()}
        onConfirm={onConfirm}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("🌙 月之子已死：选择一名存活玩家");
    expect(t).toContain("🌙 月之子已死：选择一名存活玩家");
    //    官方原文（officialRoleDocs.json · 月之子·角色能力）：
    //    「当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚他会死亡。」
    expect(t).toContain("请公开选择一名存活的玩家：如果他是善良的，他将在当晚死亡。");

    // ③ 主按钮文案逐字一致
    //    该弹窗无 footer，主操作是「选一个座位」按钮：
    //    按钮文案 = 座位号 span + **玩家名** span（1号 = 自己，已被排除）
    //    🔒 不显示角色名：月之子是「公开选择」，角色信息不能白给
    expect(buttonTexts()).toContain("1号P1");
    expect(buttonTexts()).toContain("3号P3");
    expect(buttonTexts()).not.toContain("2号小恶魔");
    expect(buttonTexts().join("|"), "座位卡片不得泄露角色名").not.toMatch(
      /号(厨师|小恶魔|士兵|共情者|呆瓜)/
    );

    // ④ 关闭不抛错
    //    该组件的 onClose 是内联空函数（不允许点击遮罩关闭），拿不到 onClose prop
    //    ⇒ 按约定断言「关闭按钮存在且 disabled=false」
    const close = closeButton();
    expect(close).toBeTruthy();
    expect(close.disabled).toBe(false);
  });

  /* ─────────── X02-06 ─────────── */
  it("X02-06 SPY_DISGUISE · 伪装身份识别", () => {
    gameActionsMock.currentModal = { type: "SPY_DISGUISE", data: {} };
    gameActionsMock.seats = mkSpySeats();

    render(<SpyDisguiseModal />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("🎭 伪装身份识别");
    expect(t).toContain("🎭 伪装身份识别");

    // ③ 主按钮文案逐字一致
    //    该弹窗无 footer，主操作是「干扰模式」三态按钮组，其中「开启」是启用伪装的主动作
    expect(buttonTexts()).toContain("开启");
    expect(buttonTexts()).toContain("默认");
    expect(buttonTexts()).toContain("关闭");
    fireEvent.click(findButton("开启"));
    expect(gameActionsMock.setSpyDisguiseMode).toHaveBeenCalledWith("on");

    // ④ 关闭不抛错（该组件无 onClose prop，关闭走 context 的 setCurrentModal(null)）
    fireEvent.click(closeButton());
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });

  /* ─────────── X02-07 ─────────── */
  it("X02-07 SPY_RECORDS · 间谍椭圆魔典 (全知全景)", () => {
    const onClose = vi.fn();

    render(
      <SpyGrimoireModal
        isOpen={true}
        onClose={onClose}
        seats={mkSeats()}
        gameLogs={[
          { day: 1, phase: "night", message: "1号(占卜师) 查验 2号玩家" } as any,
        ]}
        nightCount={1}
        reminderTokens={{}}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("📖 间谍椭圆魔典 (全知全景)");
    expect(t).toContain("📖 间谍椭圆魔典 (全知全景)");

    // ②b 倒计时只是「建议用时」，不制造「按自己意愿的时长」的压力
    //     官方【运作方式】：「让他按自己意愿的时长查看魔典」
    expect(t).toContain("建议用时（不会自动关闭）");

    // ②c 行动记录默认隐藏（官方只授权间谍看魔典，不含他人夜间行动/所得情报）
    expect(t).toContain("行动记录默认隐藏");
    expect(t, "默认不得展示他人行动日志").not.toContain("查验 2号玩家");
    expect(t, "默认不得展示他人行动日志").not.toContain("查验");

    // ②d 说书人显式展开闸门 → 隐藏提示消失，日志才可见
    fireEvent.click(screen.getByText(/展开行动记录/));
    expect(bodyText()).not.toContain("行动记录默认隐藏");
    expect(bodyText()).toContain("查验");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("✓ 我已查看完毕 (下一步)");

    // ④ 关闭不抛错
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalled();
  });

  /* ─────────── X02-08 ─────────── */
  it("X02-08 BARBER_SWAP · 理发师：交换两名玩家角色", () => {
    gameActionsMock.currentModal = {
      type: "BARBER_SWAP",
      data: { firstId: 0, secondId: 2, demonId: 1 },
    };
    gameActionsMock.seats = mkSeats();
    gameActionsMock.gamePhase = "night";

    render(<BarberSwapModal />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("💈 理发师：交换两名玩家角色");
    expect(t).toContain("💈 理发师：交换两名玩家角色");

    // ③ 主按钮文案逐字一致（已选好 A/B 时按钮可用）
    expect(buttonTexts()).toContain("确认交换");
    expect(buttonTexts()).toContain("取消");
    expect(findButton("确认交换").disabled).toBe(false);

    // ④ 关闭不抛错（该组件无 onClose prop，关闭走 context 的 setCurrentModal(null)）
    fireEvent.click(findButton("取消"));
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });

  /* ─────────── X02-09 ─────────── */
  it("X02-09 STORYTELLER_SELECT · 说书人选择目标", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <StorytellerSelectModal
        sourceId={1}
        roleId="imp"
        roleName="小恶魔"
        description="选择一名玩家击杀"
        targetCount={1}
        seats={mkSeats()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（未传 title 时取源码默认字面量）
    expect(modalTitle()).toBe("🎭 说书人选择目标");
    expect(t).toContain("🎭 说书人选择目标");

    // ③ 主按钮文案逐字一致（源码模板：`确认选择 (${selectedTargets.length}/${targetCount})`）
    expect(buttonTexts()).toContain("确认选择 (0/1)");
    expect(buttonTexts()).toContain("取消");

    // ④ 关闭不抛错
    fireEvent.click(closeButton());
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-10 ─────────── */
  it("X02-10 STORYTELLER_CORRECTION · 技能修正（说书人）", () => {
    const onNext = vi.fn();

    render(
      <StorytellerCorrectionModal
        correction={{
          title: "因僧侣保护，1号今晚未受伤害",
          detail: "13号恶魔选择了【1号】，但该玩家当晚受到僧侣保护。",
          sourceRoleId: "imp",
          reason: "monk_protection",
        }}
        roleName="13号-小恶魔"
        onNext={onNext}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板：`${roleName} - 技能修正（说书人）`，注意是全角括号）
    expect(modalTitle()).toBe("13号-小恶魔 - 技能修正（说书人）");
    expect(t).toContain("13号-小恶魔 - 技能修正（说书人）");
    expect(t).toContain("🎙️ 说书人专用 · 本页含玩家不可见信息，请勿展示给玩家");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("🎙️ 知道了，继续");

    // ④ 关闭不抛错（ModalWrapper 的 onClose === onNext）
    fireEvent.click(findButton("🎙️ 知道了，继续"));
    expect(onNext).toHaveBeenCalled();
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 10 个弹窗**全部**可在"最小 props + Context 打桩"下真实渲染，
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 唯一的特殊处理（不是降级）：
 *   • X02-01 / X02-06 / X02-08 依赖 `useGameActions()`，
 *     通过 `vi.mock("../../../contexts/GameActionsContext")` 打桩提供最小实现，
 *     未修改任何组件源码。
 *   • X02-05（MoonchildKillModal）的 onClose 是内联空函数（源码明确禁止点击遮罩关闭），
 *     拿不到 onClose prop ⇒ 按任务约定改为断言「关闭按钮存在且 disabled=false」。
 */
