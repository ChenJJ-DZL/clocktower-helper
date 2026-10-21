// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 4 批（旅行者 / 系统 5 个）
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 5 个「旅行者 / 系统」弹窗建立**人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 5 件事】
 *   ① 能渲染：render() 不抛错，且 document.body 里的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文；
 *   ③ 按钮文案逐字一致：getAllByRole("button") trim 后**完全相等**（主 + 取消/关闭 + ✕）；
 *   ④ 关键整句：document.body.textContent 里 toContain 一条**完整句子**；
 *   ⑤ 回调可用：点关闭/确认/取消后 onClose / onConfirm / onFinish 被调用。
 *
 * 【组件清单】
 *   X02-34 ARTIST_RESULT        → ArtistResultModal.tsx
 *   X02-35 SAVANT_RESULT        → SavantResultModal.tsx
 *   X02-36 REVIEW               → ReviewModal.tsx
 *   X02-37 RESTART_CONFIRM      → RestartConfirmModal.tsx
 *   X02-38 IDENTITY_SHOWCASE    → IdentityShowcaseModal.tsx
 *
 * 【portal 说明】
 *   这 5 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【特殊处理】
 *   • X02-38（IDENTITY_SHOWCASE）的 title 传的是 **JSX**（不是字符串），
 *     所以 ModalWrapper 不渲染 <h2>；标题文字落在标题栏的 <span> 上，
 *     这里按**完全相等**取该 span；翻开身份后，正文里的角色名 <h2> 再逐字断言。
 *   • X02-36（REVIEW）不是 tab 弹窗，而是左右两栏（当前座位信息 / 操作记录），
 *     断言的是**初始可见**的两栏标题 + 底部导出按钮，不点进任何子视图。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GamePhase, LogEntry, Seat, WinResult } from "../../../../app/data";

/* ─────────────────────────── 组件导入 ─────────────────────────── */

import { ArtistResultModal } from "../ArtistResultModal";
import { SavantResultModal } from "../SavantResultModal";
import { ReviewModal } from "../ReviewModal";
import { RestartConfirmModal } from "../RestartConfirmModal";
import { IdentityShowcaseModal } from "../IdentityShowcaseModal";

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
  document.body.innerHTML = "";
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

/**
 * X02-38 专用：IDENTITY_SHOWCASE 的 title 是 JSX ⇒ ModalWrapper 不渲染 <h2>，
 * 标题文字落在标题栏的 <span> 上，这里按**完全相等**取该 span 的文字。
 */
function showcaseTitleText(): string {
  const spans = Array.from(document.querySelectorAll("span"));
  const hit = spans.find((s) =>
    (s.textContent || "").includes("身份展示")
  );
  return (hit?.textContent || "").trim();
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

/**
 * 造一个最小合法座位。
 * playerName 用系统占位名「玩家 N」⇒ displayPlayerName() 返回空串，
 * 座位卡片文案因此只输出「N号」，可逐字断言。
 */
function mkSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string = "townsfolk"
): Seat {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: { id: roleId, name: roleName, type },
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
  } as unknown as Seat;
}

/** 通用 3 座位：厨师 / 小恶魔 / 共情者（全部存活）。 */
function mkSeats(): Seat[] {
  return [
    mkSeat(0, "chef", "厨师", "townsfolk"),
    mkSeat(1, "imp", "小恶魔", "demon"),
    mkSeat(2, "empath", "共情者", "townsfolk"),
  ];
}

/* ═══════════════════════ X02 · 旅行者 / 系统 5 个弹窗 ═══════════════════════ */

describe("X02 · 旅行者/系统弹窗 golden 基线", () => {
  /* ─────────── X02-34 ─────────── */
  it("X02-34 ARTIST_RESULT · 艺术家提问（是 / 否 / 不知道 + 仅关闭）", () => {
    const onClose = vi.fn();

    render(<ArtistResultModal onClose={onClose} />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🎨 艺术家提问"）
    expect(modalTitle()).toBe("🎨 艺术家提问");
    expect(t).toContain("🎨 艺术家提问");

    // ③ 关键整句逐字（源码：顶部说明段整句）
    expect(t).toContain(
      "艺术家发动了技能。说书人需要根据提问回答“是”、“否”或“不知道”。"
    );

    // ④ 按钮文案逐字一致（✕ 在标题栏 ⇒ 排最前；三个回答 + 仅关闭弹窗）
    expect(buttonTexts()).toEqual(["✕", "是", "否", "不知道", "仅关闭弹窗"]);

    // ⑤ 回调可用：选回答 ⇒ onClose("结果: 是 (提问: …)")；仅关闭 ⇒ onClose() 无参
    fireEvent.change(screen.getByLabelText("提问内容："), {
      target: { value: "今天天气如何" },
    });
    fireEvent.click(findButton("是"));
    expect(onClose).toHaveBeenCalledWith("结果: 是 (提问: 今天天气如何)");

    fireEvent.click(findButton("仅关闭弹窗"));
    expect(onClose).toHaveBeenCalledWith();
  });

  /* ─────────── X02-35 ─────────── */
  it("X02-35 SAVANT_RESULT · 博学者信息（记录模式 / 只读模式）", () => {
    const onClose = vi.fn();

    // —— 场景一：记录模式（isReadOnly 默认 false）——
    render(<SavantResultModal onClose={onClose} />);

    const t = assertRendered();

    // 标题逐字一致（源码三元：isReadOnly ? "📜 博学者信息（今日已记录）" : "📜 博学者信息"）
    expect(modalTitle()).toBe("📜 博学者信息");
    expect(t).toContain("📜 博学者信息");

    // 关键整句逐字
    expect(t).toContain(
      "博学者发动了技能。说书人需要提供两条信息：一条为真，一条为假。"
    );

    // 按钮文案逐字一致
    expect(buttonTexts()).toEqual(["✕", "取消", "确认并记录"]);

    // 回调可用：填 A/B ⇒ 确认并记录 ⇒ onClose(infoA, infoB)
    fireEvent.change(screen.getByLabelText("信息 A："), {
      target: { value: "1号是洗衣妇" },
    });
    fireEvent.change(screen.getByLabelText("信息 B："), {
      target: { value: "2号不是共情者" },
    });
    fireEvent.click(findButton("确认并记录"));
    expect(onClose).toHaveBeenCalledWith("1号是洗衣妇", "2号不是共情者");

    cleanup();

    // —— 场景二：只读模式（标题与按钮整套换掉）——
    const onCloseReadOnly = vi.fn();
    render(
      <SavantResultModal
        initialInfoA="真的信息"
        initialInfoB="假的信息"
        isReadOnly
        onClose={onCloseReadOnly}
      />
    );

    const t2 = assertRendered();

    expect(modalTitle()).toBe("📜 博学者信息（今日已记录）");
    expect(t2).toContain(
      "博学者今日已获得两条信息（一真一假），当前为已记录只读模式（不可修改）："
    );
    expect(buttonTexts()).toEqual(["✕", "关闭"]);

    fireEvent.click(findButton("关闭"));
    expect(onCloseReadOnly).toHaveBeenCalledWith();
  });

  /* ─────────── X02-36 ─────────── */
  it("X02-36 REVIEW · 对局复盘（当前座位信息 + 操作记录 + 导出长图）", () => {
    const onClose = vi.fn();
    const seats = mkSeats();
    const gameLogs: LogEntry[] = [
      { day: 1, phase: "day", message: "1号玩家发起了提名", seq: 1 },
    ];

    render(
      <ReviewModal
        isOpen={true}
        onClose={onClose}
        seats={seats}
        victorySnapshot={seats}
        gameLogs={gameLogs}
        gamePhase={"gameOver" as GamePhase}
        winResult={"good" as WinResult}
        winReason="教父被处决"
        isPortrait={false}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="📜 对局复盘"）
    expect(modalTitle()).toBe("📜 对局复盘");
    expect(t).toContain("📜 对局复盘");

    // ③ 初始可见的两栏标题（不是 tab 弹窗，不点进任何子视图）
    expect(t).toContain("📖 当前座位信息");
    expect(t).toContain("📋 操作记录");

    // ④ 关键整句逐字（日志格式化：裸「1号玩家」⇒「【1号-厨师】」）
    expect(t).toContain("【1号-厨师】发起了提名");
    //    胜利横幅整句 + 胜利玩家名单
    expect(t).toContain("🏆 善良阵营胜利");
    expect(t).toContain("（教父被处决）");
    expect(t).toContain("胜利玩家：1号-厨师、3号-共情者");

    // ⑤ 按钮文案逐字一致（✕ + 底部导出）
    expect(buttonTexts()).toEqual(["✕", "📸 导出复盘长图"]);

    // ⑥ 回调可用：✕ ⇒ onClose
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalled();
  });

  /* ─────────── X02-37 ─────────── */
  it("X02-37 RESTART_CONFIRM · 确认重开对局（取消 / 确认重开）", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <RestartConfirmModal
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🔄 确认重开对局"）
    expect(modalTitle()).toBe("🔄 确认重开对局");
    expect(t).toContain("🔄 确认重开对局");

    // ③ 关键整句逐字
    expect(t).toContain("确定要重开当前游戏吗？");
    expect(t).toContain("重开将清除当前对局的所有临时状态并记录至对局历史中。");

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toEqual(["✕", "取消", "确认重开"]);

    // ⑤ 回调可用：取消 ⇒ onCancel；确认重开 ⇒ onConfirm
    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(findButton("确认重开"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-38 ─────────── */
  it("X02-38 IDENTITY_SHOWCASE · 身份展示 & 逐一告知（防窥 → 翻开 → 下一位）", () => {
    const onClose = vi.fn();
    const onFinish = vi.fn();
    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "imp", "小恶魔", "demon"),
    ];

    render(
      <IdentityShowcaseModal
        isOpen={true}
        onClose={onClose}
        onFinish={onFinish}
        seats={seats}
        initialSeatId={0}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（title 是 JSX ⇒ 取标题栏 span，不是 <h2>）
    expect(showcaseTitleText()).toBe("🎴 身份展示 & 逐一告知 (全屏画册)");
    expect(t).toContain("🎴 身份展示 & 逐一告知 (全屏画册)");

    // ③ 关键整句逐字（顶部进度条提示 + 防窥遮罩说明）
    expect(t).toContain("确认知晓后，请点击下方「下一位」并将设备传递给下一位玩家");
    expect(t).toContain(
      "当前处于防窥遮罩状态 · 拿到设备的玩家请点击屏幕翻开专属身份与技能说明"
    );

    // ④ 初始（防窥）状态：按钮文案逐字一致
    //    标题行开关 → ✕ → 遮罩内大按钮 → 上一位 → 座位直达 1/2 → 下一位
    expect(buttonTexts()).toEqual([
      "👁️ 翻开身份",
      "✕",
      "👁️ 点击翻开我的身份",
      "⬅上一位",
      "1",
      "2",
      "下一位 (2号) ➡",
    ]);
    //    座位文案（当前是 1 号位）
    expect(t).toContain("【 1 号座位玩家 】");
    expect(t).toContain("轮番确认环节：第 1 / 2 位玩家 （座位 1号）");

    // ⑤ 翻开身份 ⇒ 角色名 <h2> 逐字一致 + 阵营徽章 + 座位号
    fireEvent.click(findButton("👁️ 点击翻开我的身份"));

    const t2 = bodyText();
    expect(modalTitle()).toBe("厨师");
    expect(t2).toContain("1 号");
    expect(t2).toContain("玩家身份");
    expect(t2).toContain("镇民 · 善良阵营");
    //    标题行开关文案同步翻转
    expect(buttonTexts()).toContain("🙈 遮罩防窥");

    // ⑥ 回调可用：下一位 ⇒ 轮到 2 号位；末位再点 ⇒ onFinish；✕ ⇒ onClose
    fireEvent.click(findButton("下一位 (2号) ➡"));
    expect(bodyText()).toContain("【 2 号座位玩家 】");
    expect(bodyText()).toContain("轮番确认环节：第 2 / 2 位玩家 （座位 2号）");

    fireEvent.click(findButton("🎉 完成展示，返回入夜"));
    expect(onFinish).toHaveBeenCalled();

    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalled();
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 5 个弹窗**全部**是「纯 props」组件，在 jsdom 下可直接真实渲染，
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 特殊处理（不是降级）：
 *   • X02-36（REVIEW）：两栏结构（当前座位信息 / 操作记录）+ 底部「导出复盘长图」，
 *     断言只覆盖**初始可见**部分；点导出长图会走 canvas 导出链路，不在断言范围内。
 *   • X02-38（IDENTITY_SHOWCASE）：title 是 JSX ⇒ 标题取 <span>；
 *     断言覆盖「防窥 → 翻开 → 下一位 → 完成」这条主链路。
 */
