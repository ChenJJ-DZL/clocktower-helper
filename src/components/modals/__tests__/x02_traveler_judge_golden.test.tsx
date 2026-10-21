// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 6 批（旅行者裁定 3 + 提醒标记 + 终局）5 个
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 5 个「旅行者裁定 / 提醒标记 / 终局」弹窗建立
 *   **人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 5 件事】
 *   ① 能渲染：render() 不抛错，且 document.body 里的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文（完全相等）；
 *   ③ 按钮文案逐字一致：getAllByRole("button") trim 后**完全相等**；
 *   ④ 关键整句：document.body.textContent 里 toContain 一条**完整句子**；
 *   ⑤ 回调可用：点关闭/确认/取消后 onSelect / onCancel / setCurrentModal / dispatch 被调用。
 *
 * 【组件清单】
 *   X02-39 TRAVELER_SCAPEGOAT_CHOICE → GameModals.tsx 内联 <ConfirmChoiceModal>
 *   X02-40 TRAVELER_GUNSLINGER_CHOICE → GameModals.tsx 内联 <ConfirmChoiceModal>
 *   X02-41 TRAVELER_JUDGE_CHOICE      → GameModals.tsx 内联 <ConfirmChoiceModal>
 *   X02-42 REMINDER_TOKENS            → GameModals.tsx 内联 <ModalWrapper>（+ ReminderTokenPanel）
 *   X02-43 GAME_OVER                  → src/components/game/GameOverOverlay.tsx
 *
 * 【渲染方式】
 *   • X02-39/40/41：源码里这三处都用**通用件** `ConfirmChoiceModal`
 *     （src/components/modals/ConfirmChoiceModal.tsx，props 齐全、无 context 依赖），
 *     所以这里**直接 render 该组件**，把 GameModals.tsx 里拼好的 title / message /
 *     options / 回调原样喂进去 —— 不 render 整个 GameModals。
 *   • X02-42：`REMINDER_TOKENS` 在源码里是 GameModals.tsx 里**内联的 <ModalWrapper>**
 *     （源码第 559 行 `currentModal?.type === "REMINDER_TOKENS" && (...)`），
 *     没有独立组件文件 ⇒ 渲染整个 <GameModals /> + context 打桩
 *     （与第 2 批 X02-14 GAMBLER_JUDGE 同一套路）。
 *   • X02-43：`GameOverOverlay` 是独立组件，依赖 `useGameState()` / `useGameActions()`
 *     两个 hook ⇒ context 打桩后直接 render。
 *
 * 【portal 说明】
 *   这 5 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【Context 打桩说明】
 *   `GameModals` 依赖 `useGameActions()` / `useGameState()` / `useHistoryController()`
 *   / `useGameContext()`；`GameOverOverlay` 依赖前两个。
 *   本文件用 `vi.mock` 对这 4 个模块打桩，提供**最小可用实现**，**不修改任何组件源码**。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/* ─────────────────────────── Context 打桩 ─────────────────────────── */

const mocks = vi.hoisted(() => {
  /**
   * actions 桩：用 Proxy 兜底 —— 任何读到的 action 都是 vi.fn()，
   * 避免"少打一个桩就 TypeError"。显式声明的属性优先被断言。
   */
  const explicit: Record<string, any> = {
    setCurrentModal: vi.fn(),
    addLog: vi.fn(),
    // GameModals 把 actions.seats 传给 SpyDisguiseModal 等子组件 ⇒ 必须是真数组
    seats: [],
    selectedScript: null,
  };
  const actionsMock: any = new Proxy(explicit, {
    get(target, prop) {
      if (typeof prop !== "string") return Reflect.get(target, prop);
      if (!(prop in target)) {
        target[prop] = vi.fn();
      }
      return target[prop];
    },
  });

  const gameStateMock: any = {
    currentModal: null as any,
    seats: [] as any[],
    victorySnapshot: [],
    gameLogs: [],
    gamePhase: "night",
    winResult: null,
    winReason: null,
    isPortrait: false,
    gameRecords: [],
    selectedScript: null,
    reminderTokens: {} as any,
    nightCount: 1,
    isVortoxWorld: false,
    deadThisNight: [],
    hadesiaChoices: {},
    travelers: [],
  };

  const dispatchMock = vi.fn();

  return { actionsMock, gameStateMock, dispatchMock };
});

vi.mock("../../../contexts/GameActionsContext", () => ({
  useGameActions: () => mocks.actionsMock,
  useOptionalGameActions: () => mocks.actionsMock,
  GameActionsProvider: ({ children }: any) => children,
}));

vi.mock("../../../hooks/useGameState", () => ({
  useGameState: () => mocks.gameStateMock,
}));

vi.mock("../../../hooks/useHistoryController", () => ({
  useHistoryController: () => ({
    saveHistory: vi.fn(),
    handleStepBack: vi.fn(),
    handleGlobalUndo: vi.fn(),
    handleRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

vi.mock("../../../contexts/GameContext", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useGameContext: () => ({
      state: {},
      dispatch: mocks.dispatchMock,
      currentQueueIndexRef: { current: 0 },
    }),
  };
});

/* ─────────────────────────── 组件导入（放在 mock 之后） ─────────────────────────── */

import { ConfirmChoiceModal } from "../ConfirmChoiceModal";
import { GameModals } from "../../game/GameModals";
import { GameOverOverlay } from "../../game/GameOverOverlay";

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
  mocks.gameStateMock.currentModal = null;
  mocks.gameStateMock.seats = [];
  mocks.gameStateMock.reminderTokens = {};
  mocks.gameStateMock.gamePhase = "night";
  mocks.gameStateMock.winResult = null;
  mocks.gameStateMock.winReason = null;
  mocks.actionsMock.setCurrentModal.mockClear?.();
  mocks.actionsMock.addLog.mockClear?.();
  mocks.dispatchMock.mockClear();
});

afterEach(() => cleanup());

/* ─────────────────────────── 通用工具 ─────────────────────────── */

/** 全部 5 个弹窗都走 ModalWrapper（portal → document.body）。 */
function bodyText(): string {
  return document.body.textContent || "";
}

/** 断言「能渲染」：渲染出的文本非空。 */
function assertRendered(): string {
  const t = bodyText();
  expect(t.trim().length).toBeGreaterThan(0);
  return t;
}

/** ModalWrapper 把**字符串**标题渲染进 <h2>（取第一个非空 h2）。 */
function modalTitle(): string {
  const h2s = Array.from(document.querySelectorAll("h2"));
  const hit = h2s.find((h) => (h.textContent || "").trim().length > 0);
  return (hit?.textContent || "").trim();
}

/** 全部 <h2> 的文案（用于"多个弹窗同时在场"的场景）。 */
function allTitles(): string[] {
  return Array.from(document.querySelectorAll("h2")).map((h) =>
    (h.textContent || "").trim()
  );
}

/** 取所有按钮的文案（trim 后），保持 DOM 顺序。 */
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

/* ═══════════════════════ X02 · 旅行者裁定 / 提醒标记 / 终局 5 个弹窗 ═══════════════════════ */

describe("X02 · 旅行者裁定/提醒标记/终局弹窗 golden 基线", () => {
  /* ─────────── X02-39 ─────────── */
  it("X02-39 TRAVELER_SCAPEGOAT_CHOICE · 替罪羊代刑裁决", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    // 源码 GameModals.tsx：`${currentModal.data.targetId + 1}号即将被处决。…`
    render(
      <ConfirmChoiceModal
        isOpen={true}
        title="🐑 替罪羊代刑"
        message="1号即将被处决。旅行者「替罪羊」与他同阵营且存活，是否由替罪羊代为受刑？"
        options={[
          { label: "🐑 替罪羊代刑", value: "substitute" },
          { label: "⚖️ 正常处决", value: "pass" },
        ]}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🐑 替罪羊代刑"）
    expect(modalTitle()).toBe("🐑 替罪羊代刑");
    expect(t).toContain("🐑 替罪羊代刑");

    // ③ 关键整句逐字（源码模板整句）
    expect(t).toContain(
      "1号即将被处决。旅行者「替罪羊」与他同阵营且存活，是否由替罪羊代为受刑？"
    );

    // ④ 按钮文案逐字一致（✕ 在标题栏 ⇒ 排最前；两个选项 + 取消）
    expect(buttonTexts()).toEqual([
      "✕",
      "🐑 替罪羊代刑",
      "⚖️ 正常处决",
      "取消",
    ]);

    // ⑤ 回调可用：选「替罪羊代刑」⇒ onSelect("substitute")；「取消」⇒ onCancel
    fireEvent.click(findButton("🐑 替罪羊代刑"));
    expect(onSelect).toHaveBeenCalledWith("substitute");

    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-40 ─────────── */
  it("X02-40 TRAVELER_GUNSLINGER_CHOICE · 枪手射击裁决", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    // 源码 GameModals.tsx：options 由 currentModal.data.eligibleVoterIds 映射成 `${id + 1}号`
    render(
      <ConfirmChoiceModal
        isOpen={true}
        title="🔫 枪手射击"
        message="首次投票已被统计。枪手可以选择一名刚投过票的玩家射击（该玩家立即死亡）："
        options={[
          { label: "1号", value: "0" },
          { label: "3号", value: "2" },
        ]}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🔫 枪手射击"）
    expect(modalTitle()).toBe("🔫 枪手射击");
    expect(t).toContain("🔫 枪手射击");

    // ③ 关键整句逐字（源码 message 字面量整句）
    expect(t).toContain(
      "首次投票已被统计。枪手可以选择一名刚投过票的玩家射击（该玩家立即死亡）："
    );

    // ④ 按钮文案逐字一致（✕ + 两个候选目标 + 取消）
    expect(buttonTexts()).toEqual(["✕", "1号", "3号", "取消"]);

    // ⑤ 回调可用：选「3号」⇒ onSelect("2")；✕ ⇒ onCancel
    fireEvent.click(findButton("3号"));
    expect(onSelect).toHaveBeenCalledWith("2");

    fireEvent.click(closeButton());
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-41 ─────────── */
  it("X02-41 TRAVELER_JUDGE_CHOICE · 法官裁决（改写提名结局）", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    // 源码 GameModals.tsx：`${nominatorId + 1}号提名了${nomineeId + 1}号。…`
    render(
      <ConfirmChoiceModal
        isOpen={true}
        title="⚖️ 法官裁决"
        message="2号提名了3号。旅行者「法官」可（每局限一次）改写本次提名：直接执行处决，或让本次投票无效。"
        options={[
          { label: "⚖️ 直接执行处决", value: "execute" },
          { label: "🚫 让投票无效", value: "void" },
        ]}
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="⚖️ 法官裁决"）
    expect(modalTitle()).toBe("⚖️ 法官裁决");
    expect(t).toContain("⚖️ 法官裁决");

    // ③ 关键整句逐字（源码模板整句）
    expect(t).toContain(
      "2号提名了3号。旅行者「法官」可（每局限一次）改写本次提名：直接执行处决，或让本次投票无效。"
    );

    // ④ 按钮文案逐字一致（✕ + 两个裁决选项 + 取消）
    expect(buttonTexts()).toEqual([
      "✕",
      "⚖️ 直接执行处决",
      "🚫 让投票无效",
      "取消",
    ]);

    // ⑤ 回调可用：选「🚫 让投票无效」⇒ onSelect("void")；取消 ⇒ onCancel
    fireEvent.click(findButton("🚫 让投票无效"));
    expect(onSelect).toHaveBeenCalledWith("void");

    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();
  });

  /* ─────────── X02-42 ─────────── */
  it("X02-42 REMINDER_TOKENS · 提醒标记面板（GameModals 内联 ModalWrapper）", () => {
    mocks.gameStateMock.currentModal = {
      type: "REMINDER_TOKENS",
      data: { seatId: 0 },
    };
    // 座位 0 已有一个「受保护」标记 ⇒ 面板进入"有标记"分支
    mocks.gameStateMock.reminderTokens = {
      0: [
        {
          id: "rt_seed",
          icon: "🛡️",
          label: "受保护",
          color: "green",
          createdAt: 1,
        },
      ],
    };

    render(<GameModals />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板：`🏷️ 提醒标记 — ${playerName || `${seatId + 1}号`}`）
    //    seats 为空 ⇒ 落到 `${seatId + 1}号`
    expect(allTitles()).toContain("🏷️ 提醒标记 — 1号");
    expect(t).toContain("🏷️ 提醒标记 — 1号");

    // ③ 关键整句逐字（面板已有标记 ⇒ 「当前标记（点击移除）：」）
    expect(t).toContain("当前标记（点击移除）：");
    expect(t).toContain("添加标记：");

    // ④ 按钮文案逐字一致
    //    标题栏 ✕ → 已放置的标记 chip（icon+label+✕）→ 10 个预设 → 「自定义」
    expect(buttonTexts()).toEqual([
      "✕",
      "🛡️受保护✕",
      "🛡️受保护",
      "☠️中毒",
      "🍺醉酒",
      "💀死亡标记",
      "🎭假身份",
      "👁️是恶魔",
      "🐺是爪牙",
      "✅已用能力",
      "❌能力失效",
      "🔒不能投票",
      "📝自定义",
    ]);

    // ⑤ 回调可用：
    //    点预设「🍺醉酒」⇒ onAdd ⇒ dispatch(gameActions.updateState(...))
    fireEvent.click(findButton("🍺醉酒"));
    expect(mocks.dispatchMock).toHaveBeenCalled();

    //    点已放置的标记 chip ⇒ onRemove ⇒ 再次 dispatch
    mocks.dispatchMock.mockClear();
    fireEvent.click(findButton("🛡️受保护✕"));
    expect(mocks.dispatchMock).toHaveBeenCalled();

    //    ✕ ⇒ actions.setCurrentModal(null)
    fireEvent.click(closeButton());
    expect(mocks.actionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });

  /* ─────────── X02-43 ─────────── */
  it("X02-43 GAME_OVER · 终局结算（善良 / 邪恶两种胜方）", () => {
    /* ── 场景一：善良阵营胜利 ── */
    mocks.gameStateMock.gamePhase = "gameOver";
    mocks.gameStateMock.winResult = "good";
    mocks.gameStateMock.winReason = "教父被处决，善良阵营取得最终胜利";

    render(<GameOverOverlay />);

    let t = assertRendered();

    // ② 标题逐字一致（源码三元：isGood ? "🏆 游戏结束 · 善良阵营获胜！" : …）
    expect(modalTitle()).toBe("🏆 游戏结束 · 善良阵营获胜！");
    expect(t).toContain("🏆 游戏结束 · 善良阵营获胜！");

    // ③ 关键整句逐字：主徽章文案 + 「胜利依据」卡片 + 胜利依据原文
    expect(t).toContain("善良阵营取得最终胜利！");
    expect(t).toContain("胜利依据");
    expect(t).toContain("教父被处决，善良阵营取得最终胜利");

    // ④ 按钮文案逐字一致（✕ + 底部四个按钮）
    expect(buttonTexts()).toEqual([
      "✕",
      "返回查看棋盘",
      "📸导出长图",
      "📊本局复盘",
      "🔄再来一局",
    ]);

    // ⑤ 回调可用：「再来一局」⇒ actions.handleNewGame()
    fireEvent.click(findButton("🔄再来一局"));
    expect(mocks.actionsMock.handleNewGame).toHaveBeenCalled();

    cleanup();

    /* ── 场景二：邪恶阵营胜利 ── */
    mocks.gameStateMock.gamePhase = "gameOver";
    mocks.gameStateMock.winResult = "evil";
    mocks.gameStateMock.winReason = "邪恶阵营达成胜利条件：仅剩恶魔存活";
    mocks.gameStateMock.currentModal = { type: "GAME_OVER", data: null };

    render(<GameOverOverlay />);

    t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("👿 游戏结束 · 邪恶阵营获胜！");
    expect(t).toContain("👿 游戏结束 · 邪恶阵营获胜！");

    // ③ 关键整句逐字
    expect(t).toContain("邪恶阵营取得最终胜利！");
    expect(t).toContain("胜利依据");
    expect(t).toContain("邪恶阵营达成胜利条件：仅剩恶魔存活");

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toEqual([
      "✕",
      "返回查看棋盘",
      "📸导出长图",
      "📊本局复盘",
      "🔄再来一局",
    ]);

    // ⑤ 回调可用：「返回查看棋盘」⇒ handleClose ⇒ actions.setCurrentModal(null)
    fireEvent.click(findButton("返回查看棋盘"));
    expect(mocks.actionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 5 个弹窗**全部**可在"最小 props + Context 打桩"下真实渲染，
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 特殊处理（不是降级）：
 *   • X02-39/40/41：源码共用通用件 `ConfirmChoiceModal`，本用例直接 render 该组件
 *     并喂入 GameModals.tsx 里拼好的 title / message / options；
 *   • X02-42：`REMINDER_TOKENS` 是 GameModals.tsx 里内联的 <ModalWrapper>，
 *     没有独立组件文件 ⇒ 渲染整个 <GameModals />（与第 2 批 X02-14 同一套路）；
 *   • X02-43：`GameOverOverlay` 依赖 useGameState / useGameActions，
 *     两种胜方（good / evil）各断言一次标题、主徽章、胜利依据与按钮。
 */
