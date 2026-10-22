// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 2 批（夜间信息 8 个）
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 8 个「夜间信息」相关弹窗建立**人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 4 件事】
 *   ① 能渲染：render() 不抛错，且渲染出的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文（并 toContain 兜底）；
 *   ③ 主按钮文案逐字一致：getAllByRole("button") 里有那条主按钮（trim 后完全相等）；
 *   ④ 关闭可用：点关闭/确认后 onClose（或 context 的关闭回调）被调用。
 *
 * 【portal 说明】
 *   这 8 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【Context 打桩说明】
 *   `RoleSelectModal` / `GameModals` 依赖 `useGameActions()`（GameActionsContext），
 *   `GameModals` 还依赖 `useGameState()` / `useHistoryController()` / `useGameContext()`。
 *   本用例用 `vi.mock` 对这 4 个模块打桩，提供**最小可用实现**，**不修改任何组件源码**。
 *
 * 【X02-14 特殊说明】
 *   `GAMBLER_JUDGE` 在源码里**没有独立组件文件** —— 它是 `GameModals.tsx` 里
 *   `gamblerJudgeModal &&` 那一段**内联的 <ModalWrapper>**（标题「🎲 赌徒判定」，
 *   按钮「判断为真（猜对）」/「判定为假（猜错）」）。因此本用例渲染整个
 *   `<GameModals />`（context 打桩 + currentModal.type = "GAMBLER_JUDGE"）来断言它。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Role, Seat } from "../../../../app/data";

/* ─────────────────────────── Context 打桩 ─────────────────────────── */

const mocks = vi.hoisted(() => {
  /**
   * actions 桩：用 Proxy 兜底 —— 任何 GameModals 内部读到的 action 都是 vi.fn()，
   * 避免"少打一个桩就 TypeError"。显式声明的属性优先被断言。
   */
  const explicit: Record<string, any> = {
    setCurrentModal: vi.fn(),
    addLog: vi.fn(),
    setSeats: vi.fn(),
    killPlayer: vi.fn(),
    continueToNextAction: vi.fn(),
    confirmNightDeathReport: vi.fn(),
    selectedScript: null,
    seats: [],
    getSeatRoleId: () => undefined,
  };
  const actionsMock: any = new Proxy(explicit, {
    get(target, prop) {
      if (!(prop in target)) {
        target[prop as string] = vi.fn();
      }
      return target[prop as string];
    },
  });

  const gameStateMock: any = {
    currentModal: null as any,
    seats: [] as any[],
    victorySnapshot: [],
    virginGuideInfo: null,
    klutzChoiceTarget: null,
    gameLogs: [],
    gamePhase: "night",
    winResult: null,
    winReason: null,
    isPortrait: false,
    gameRecords: [],
    selectedScript: null,
    damselGuessUsedBy: [],
    damselGuessed: false,
    reminderTokens: {},
    nightCount: 1,
    isVortoxWorld: false,
    deadThisNight: [],
    hadesiaChoices: {},
    travelers: [],
  };

  return { actionsMock, gameStateMock };
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
      dispatch: vi.fn(),
      currentQueueIndexRef: { current: 0 },
    }),
  };
});

/* ─────────────────────────── 组件导入（放在 mock 之后） ─────────────────────────── */

import { InfoResultModal } from "../InfoResultModal";
import { CerenovusMadnessModal } from "../CerenovusMadnessModal";
import { JugglerJudgeModal } from "../JugglerJudgeModal";
import { LunaticRpsModal } from "../LunaticRpsModal";
import { DrunkCharadeSelectModal } from "../DrunkCharadeSelectModal";
import { RoleSelectModal } from "../RoleSelectModal";
import { GameModals } from "../../game/GameModals";

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
  mocks.actionsMock.setCurrentModal.mockClear?.();
  mocks.actionsMock.addLog.mockClear?.();
  mocks.actionsMock.setSeats.mockClear?.();
  mocks.actionsMock.killPlayer.mockClear?.();
});

afterEach(() => cleanup());

/* ─────────────────────────── 通用工具 ─────────────────────────── */

/** 全部 8 个弹窗都走 ModalWrapper（portal → document.body）。 */
function bodyText(): string {
  return document.body.textContent || "";
}

/** 断言「能渲染」：渲染出的文本非空。 */
function assertRendered(): string {
  const t = bodyText();
  expect(t.trim().length).toBeGreaterThan(0);
  return t;
}

/** ModalWrapper 把标题渲染进 <h2>（取第一个非空 h2）。 */
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

/** 造一个最小角色（只需要 id / name）。 */
function mkRole(id: string, name: string, type: string = "townsfolk"): Role {
  return { id, name, type, ability: "" } as unknown as Role;
}

/* ═══════════════════════ X02 · 夜间信息 8 个弹窗 ═══════════════════════ */

describe("X02 · 夜间信息弹窗 golden 基线", () => {
  /* ─────────── X02-11 ─────────── */
  it("X02-11 INFO_RESULT · 通用信息结果页", () => {
    const onConfirm = vi.fn();
    const onModify = vi.fn();

    render(
      <InfoResultModal
        roleName="5号-洗衣妇"
        resultText="6号和9号其中一位是【占卜师】"
        onConfirm={onConfirm}
        onModify={onModify}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板：`${roleName} - 结果`）
    expect(modalTitle()).toBe("5号-洗衣妇 - 结果");
    expect(t).toContain("5号-洗衣妇 - 结果");
    //    正文两行也逐字：prefix（描述说明）+ result（核心结果）
    expect(t).toContain("5号-洗衣妇获得信息");
    expect(t).toContain("6号和9号其中一位是【占卜师】");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("修改选择");
    expect(buttonTexts()).toContain("确认结果");

    // ④ 关闭可用（ModalWrapper 的 onClose 是内联空函数 ⇒ 走「确认结果」触发 onConfirm）
    fireEvent.click(findButton("确认结果"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-12 ─────────── */
  it("X02-12 FORTUNE_TELLER_RESULT · 占卜师「有 / 没有」二值结果页", () => {
    const onConfirm = vi.fn();

    // —— 场景一：占卜师得知「有」——
    render(
      <InfoResultModal
        roleName="5号-占卜师"
        resultText="有"
        onConfirm={onConfirm}
        onModify={vi.fn()}
      />
    );

    let t = assertRendered();

    // ① 能渲染 ② 标题逐字（源码模板：`${roleName} - 结果`，roleName 由 actorSeatNo 拼出）
    expect(modalTitle()).toBe("5号-占卜师 - 结果");
    expect(t).toContain("5号-占卜师 - 结果");
    expect(t).toContain("5号-占卜师获得信息");
    //    「有」被解析器包成【有】
    expect(t).toContain("【有】");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("修改选择");
    expect(buttonTexts()).toContain("确认结果");

    cleanup();

    // —— 场景二：占卜师得知「没有」——
    render(
      <InfoResultModal
        roleName="5号-占卜师"
        resultText="没有"
        onConfirm={onConfirm}
        onModify={vi.fn()}
      />
    );

    t = assertRendered();

    expect(modalTitle()).toBe("5号-占卜师 - 结果");
    expect(t).toContain("5号-占卜师 - 结果");
    expect(t).toContain("5号-占卜师获得信息");
    expect(t).toContain("【没有】");

    expect(buttonTexts()).toContain("确认结果");

    // ④ 关闭可用
    fireEvent.click(findButton("确认结果"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-13 ─────────── */
  it("X02-13 CERENOVUS_NOTICE · 洗脑告知：玩家侧「你需要疯狂证明自己是【X】」", () => {
    const onConfirm = vi.fn();

    render(
      <CerenovusMadnessModal
        data={{
          targetId: 2,
          roleName: "艺术家",
          actorSeatId: 10,
          actorRoleName: "洗脑师",
        }}
        onConfirm={onConfirm}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（玩家视角 = 中性「🧠 技能告知」，不含任何座位号/角色名）
    expect(modalTitle()).toBe("🧠 技能告知");
    expect(t).toContain("🧠 技能告知");
    //    玩家侧主文案 + 副标题（逐字）
    expect(t).toContain("你需要疯狂证明自己是【艺术家】");
    expect(t).toContain("若未照做，明天白天你可能会被处决");
    //    玩家视角不得出现行动者信息（说书人块不进 DOM）
    expect(t).not.toContain("11号-洗脑师");
    expect(t).not.toContain("这是洗脑效果，不要让他知道是谁洗的");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("确认并继续");

    // ④ 关闭可用（ModalWrapper 的 onClose === onConfirm）
    fireEvent.click(findButton("确认并继续"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-14 ─────────── */
  it("X02-14 GAMBLER_JUDGE · 赌徒判定（GameModals 内联 ModalWrapper）", () => {
    mocks.gameStateMock.currentModal = {
      type: "GAMBLER_JUDGE",
      data: { seatId: 0 },
    };

    render(<GameModals />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🎲 赌徒判定"）
    expect(allTitles()).toContain("🎲 赌徒判定");
    expect(t).toContain("🎲 赌徒判定");
    //    正文逐字（源码模板：`${seatId + 1}号【赌徒】使用了「赌徒猜测」。`）
    expect(t).toContain("1号【赌徒】使用了「赌徒猜测」。");
    expect(t).toContain("说书人判定该玩家对目标角色的猜测是否正确？");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("判断为真（猜对）");
    expect(buttonTexts()).toContain("判定为假（猜错）");

    // ④ 关闭可用（内联 ModalWrapper 的 onClose = actions.setCurrentModal(null)）
    fireEvent.click(closeButton());
    expect(mocks.actionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });

  /* ─────────── X02-15 ─────────── */
  it("X02-15 JUGGLER_JUDGE · 杂耍艺人猜测判定", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <JugglerJudgeModal
        seatId={0}
        seats={mkSeats()}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("🤹 杂耍艺人猜测判定");
    expect(t).toContain("🤹 杂耍艺人猜测判定");

    // ③ 主按钮文案逐字一致
    //    源码模板：`确认记录 (${selectedCount}次)`，初始 selectedCount = 0
    expect(buttonTexts()).toContain("确认记录 (0次)");
    expect(buttonTexts()).toContain("取消");

    // ③b 这张表含全场真实角色 ⇒ 必须显式标「说书人专用」
    expect(t).toContain("🎙️ 说书人专用 · 请勿展示给玩家");
    expect(t).toContain("全场座位与实际角色（用于对照核实）");

    // ④ 关闭可用
    fireEvent.click(findButton("取消"));
    expect(onClose).toHaveBeenCalled();
  });

  /* ─────────── X02-16 ─────────── */
  it("X02-16 LUNATIC_RPS · 精神病患者被处决：石头剪刀布裁决", () => {
    const onResolve = vi.fn();

    render(
      <LunaticRpsModal
        isOpen={true}
        nominatorId={1}
        targetId={2}
        onResolve={onResolve}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致
    expect(modalTitle()).toBe("✊✋✌️ 精神病患者被处决：石头剪刀布裁决");
    expect(t).toContain("✊✋✌️ 精神病患者被处决：石头剪刀布裁决");
    expect(t).toContain("提名者：2号 VS 3号(精神病患者)");

    // ③ 主按钮文案逐字一致
    //    官方（officialRoleDocs.json · 精神病患者 · 运作方式）：
    //    「如果精神病患者在猜拳中平局或获胜，他会仍然存活。」
    //    ⇒ 赢/平**不处决提名者**（旧文案写的「提名者死亡」是自创规则）
    expect(buttonTexts()).toContain("精神病患者输（被处决）");
    expect(buttonTexts()).toContain("精神病患者赢/平（他存活）");
    expect(t).toContain("若精神病患者赢或平：他不会死亡，处决取消");

    // ④ 关闭可用（onClose 是内联空函数且禁止点击遮罩关闭 ⇒ 断言 ✕ 存在且可用）
    const close = closeButton();
    expect(close).toBeTruthy();
    expect(close.disabled).toBe(false);
    //    另：主操作按钮真的能触发 onResolve
    fireEvent.click(findButton("精神病患者输（被处决）"));
    expect(onResolve).toHaveBeenCalledWith(true);
  });

  /* ─────────── X02-17 ─────────── */
  it("X02-17 DRUNK_CHARADE_SELECT · 为酒鬼设定伪装身份", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DrunkCharadeSelectModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        drunkSeat={
          {
            id: 2,
            playerName: "P3",
            role: { id: "drunk", name: "酒鬼", type: "outsider" },
            charadeRole: null,
            isDead: false,
          } as unknown as Seat
        }
        availableTownsfolkRoles={[mkRole("chef", "厨师"), mkRole("empath", "共情者")]}
        selectedScriptId={null}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板：`为 ${drunkSeat.id + 1}号【${currentDrunkRoleName}】设定伪装身份`）
    expect(modalTitle()).toBe("为 3号【酒鬼】设定伪装身份");
    expect(t).toContain("为 3号【酒鬼】设定伪装身份");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("确认选择");
    //    角色按钮文案 = 角色名 + 角色 id（两个 span 拼接）
    expect(buttonTexts()).toContain("厨师chef");
    expect(buttonTexts()).toContain("共情者empath");

    // ④ 关闭可用（ModalWrapper 的 onClose === onClose prop）
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalled();
  });

  /* ─────────── X02-18 ─────────── */
  it("X02-18 ROLE_SELECT · 角色选择（哲学家）", () => {
    const onConfirm = vi.fn();

    render(
      <RoleSelectModal
        modal={{ type: "philosopher", onConfirm }}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码：modal.type === "philosopher" ⇒ "🎭 哲学家 - 选择善良角色"）
    expect(modalTitle()).toBe("🎭 哲学家 - 选择善良角色");
    expect(t).toContain("🎭 哲学家 - 选择善良角色");

    // ③ 主按钮文案逐字一致
    expect(buttonTexts()).toContain("取消");

    // ④ 关闭可用（ModalWrapper 的 onClose = props.setCurrentModal(null)）
    fireEvent.click(findButton("取消"));
    expect(mocks.actionsMock.setCurrentModal).toHaveBeenCalledWith(null);
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 8 个弹窗**全部**可在"最小 props + Context 打桩"下真实渲染，
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 特殊处理（不是降级）：
 *   • X02-12（FORTUNE_TELLER_RESULT）复用 `InfoResultModal`，
 *     按占卜师场景断言「有 / 没有」两条二值结果；
 *   • X02-13（CERENOVUS_NOTICE）只断言**初始渲染**的玩家侧文案，
 *     不模拟「长按 1.5 秒解锁说书人视图」；
 *   • X02-14（GAMBLER_JUDGE）在源码里没有独立组件文件，
 *     它是 `GameModals.tsx` 内联的 <ModalWrapper> ⇒ 本用例渲染整个 <GameModals />。
 */
