// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 3 批（白天 / 处决 8 个）
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 8 个「白天 / 处决」相关弹窗建立**人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 4 件事】
 *   ① 能渲染：render() 不抛错，且渲染出的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文；
 *   ③ 按钮文案逐字一致：getAllByRole("button") 里 trim 后完全相等；
 *   ④ 关键整句：document.body.textContent 里 toContain 一条**完整句子**；
 *   ⑤ 关闭可用：点关闭/确认/取消后 onClose / onConfirm / onResolve 被调用。
 *
 * 【portal 说明】
 *   这 8 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【组件清单】
 *   X02-19 VOTE_INPUT                → VoteInputModal.tsx        （导出名 VoteInputModalContent）
 *   X02-20 EXECUTION_RESULT          → ExecutionResultModal.tsx
 *   X02-21 PACIFIST_CONFIRM          → PacifistConfirmModal.tsx
 *   X02-22 SAINT_EXECUTION_CONFIRM   → SaintExecutionConfirmModal.tsx
 *   X02-23 VIZIER_EXECUTION          → VizierExecutionModal.tsx
 *   X02-24 EVIL_TWIN_EXECUTION_CONFIRM → EvilTwinExecutionConfirmModal.tsx
 *   X02-25 SHOOT_RESULT              → ShootResultModal.tsx
 *   X02-26 SLAYER_SELECT_TARGET      → SlayerSelectTargetModal.tsx
 *
 * 【无 Context 依赖】
 *   本批 8 个弹窗都是「纯 props」组件（不像批 1/2 的 RoleSelectModal / GameModals），
 *   因此**不需要** vi.mock 打桩 context —— 直接传 props 即可真实渲染。
 *
 * 【座位名约定】
 *   `displayPlayerName()` 会把系统占位名「玩家 N」折叠成空串，
 *   `formatSeatLabel()` 因此只输出「N号」。本文件统一使用占位名，
 *   让「N号 + 角色名」的卡片文案是确定的、可逐字断言的。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Seat } from "../../../../app/data";

/* ─────────────────────────── 组件导入 ─────────────────────────── */

import { VoteInputModalContent } from "../VoteInputModal";
import { ExecutionResultModal } from "../ExecutionResultModal";
import { PacifistConfirmModal } from "../PacifistConfirmModal";
import { SaintExecutionConfirmModal } from "../SaintExecutionConfirmModal";
import { VizierExecutionModal } from "../VizierExecutionModal";
import { EvilTwinExecutionConfirmModal } from "../EvilTwinExecutionConfirmModal";
import { ShootResultModal } from "../ShootResultModal";
import { SlayerSelectTargetModal } from "../SlayerSelectTargetModal";

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

/** 按**前缀**找按钮（用于座位卡片这类长文案）。 */
function findButtonStartingWith(prefix: string): HTMLButtonElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => (b.textContent || "").trim().startsWith(prefix)) as
    | HTMLButtonElement
    | undefined;
  if (!btn) {
    throw new Error(
      `未找到文案以「${prefix}」开头的按钮；当前按钮文案：${JSON.stringify(buttonTexts())}`
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
 * formatSeatLabel() 只输出「N号」，卡片文案因此是确定的。
 */
function mkSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string = "townsfolk",
  isDead = false
): Seat {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: { id: roleId, name: roleName, type },
    charadeRole: null,
    isDead,
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

/* ═══════════════════════ X02 · 白天 / 处决 8 个弹窗 ═══════════════════════ */

describe("X02 · 白天/处决弹窗 golden 基线", () => {
  /* ─────────── X02-19 ─────────── */
  it("X02-19 VOTE_INPUT · 举手表决计票（勾选投票者 → 提交票数）", () => {
    const submitVotes = vi.fn();
    const setCurrentModal = vi.fn();
    const onCancelVote = vi.fn();

    render(
      <VoteInputModalContent
        voterId={1}
        seats={mkSeats()}
        submitVotes={submitVotes}
        setCurrentModal={setCurrentModal}
        onCancelVote={onCancelVote}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🗳️ 举手表决计票"）
    expect(modalTitle()).toBe("🗳️ 举手表决计票");
    expect(t).toContain("🗳️ 举手表决计票");

    // ③ 关键整句逐字（源码模板：顶部说明段）
    expect(t).toContain(
      "请勾选本轮举手表决的玩家（存活玩家可自由举手，死亡玩家消耗 1 张幽灵票）"
    );
    //    被提名者（formatSeatLabel(1, "玩家2") ⇒ "2号"）
    expect(t).toContain("当前被提名者：2号");
    //    门槛（3 名存活核心 ⇒ ceil(3/2) = 2）
    expect(t).toContain("（上台门槛：2 票）");
    expect(t).toContain("✓ 未达门槛 (不上台)");

    // ④ 按钮文案逐字一致
    //    座位卡片："{N}号" + 角色名 + "🟢存活"
    expect(buttonTexts()).toContain("1号厨师🟢存活");
    expect(buttonTexts()).toContain("2号小恶魔🟢存活");
    expect(buttonTexts()).toContain("3号共情者🟢存活");
    //    提交按钮初始为 0 票
    expect(buttonTexts()).toContain("确认（0 票）");
    expect(buttonTexts()).toContain("取消");

    // ⑤ 勾选两名投票者 ⇒ 票数变 2（= 门槛）⇒ 提交按钮与门槛提示随之变化
    fireEvent.click(findButtonStartingWith("1号厨师"));
    expect(buttonTexts()).toContain("确认（1 票）");
    expect(bodyText()).toContain("✓ 未达门槛 (不上台)");

    fireEvent.click(findButtonStartingWith("2号小恶魔"));
    expect(buttonTexts()).toContain("确认（2 票）");
    expect(bodyText()).toContain("⚠️ 达到门槛 (上处决台)");

    // ⑥ 关闭可用：取消 ⇒ onCancelVote(被提名者座位)
    fireEvent.click(findButton("取消"));
    expect(onCancelVote).toHaveBeenCalledWith(1);
    expect(setCurrentModal).toHaveBeenCalledWith(null);
  });

  /* ─────────── X02-20 ─────────── */
  it("X02-20 EXECUTION_RESULT · 处决结果判定（原样显示 message）", () => {
    const onConfirm = vi.fn();

    // —— 场景一：有人被处决（message 自带【】⇒ 原样显示，不再包一层）——
    render(
      <ExecutionResultModal
        isOpen={true}
        message="【3号被处决】"
        onConfirm={onConfirm}
      />
    );

    let t = assertRendered();

    // ① 标题逐字一致（源码字面量 title="⚖️ 处决结果判定"）
    expect(modalTitle()).toBe("⚖️ 处决结果判定");
    expect(t).toContain("⚖️ 处决结果判定");

    // ② 关键整句逐字：「今日处决最终判定结果」+「【3号被处决】」连成一句
    expect(t).toContain("今日处决最终判定结果【3号被处决】");

    // ③ 按钮文案逐字一致
    expect(buttonTexts()).toContain("确认");

    // ④ 关闭可用（ModalWrapper 的 onClose === onConfirm）
    fireEvent.click(findButton("确认"));
    expect(onConfirm).toHaveBeenCalled();

    cleanup();

    // —— 场景二：无人被处决（message 不带【】⇒ 组件自动包成【…】）——
    render(
      <ExecutionResultModal
        isOpen={true}
        message="无人被处决"
        onConfirm={onConfirm}
      />
    );

    t = assertRendered();

    expect(modalTitle()).toBe("⚖️ 处决结果判定");
    expect(t).toContain("今日处决最终判定结果【无人被处决】");

    expect(buttonTexts()).toContain("确认");
  });

  /* ─────────── X02-21 ─────────── */
  it("X02-21 PACIFIST_CONFIRM · 和平主义者裁定（免死 / 正常处决）", () => {
    const onResolve = vi.fn();

    render(
      <PacifistConfirmModal isOpen={true} targetId={2} onResolve={onResolve} />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🕊️ 和平主义者裁定"）
    expect(modalTitle()).toBe("🕊️ 和平主义者裁定");
    expect(t).toContain("🕊️ 和平主义者裁定");

    // ③ 关键整句逐字（源码模板：`【{targetId + 1}号】 善良玩家被处决：是否触发【和平主义者】使其免于死亡？`）
    //    官方原文（officialRoleDocs.json · 和平主义者·角色能力）：「被处决的善良玩家可能不会死亡。」
    expect(t).toContain("【3号】");
    expect(t).toContain("善良玩家被处决：是否触发【和平主义者】使其免于死亡？");
    expect(t).toContain("规则：和平主义者让“被处决的善良玩家可能不会死亡”，由说书人裁定。");

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toContain("正常处决");
    expect(buttonTexts()).toContain("本次处决免死");

    // ⑤ 关闭可用：免死 ⇒ onResolve(true)
    fireEvent.click(findButton("本次处决免死"));
    expect(onResolve).toHaveBeenCalledWith(true);

    //    正常处决 ⇒ onResolve(false)
    fireEvent.click(findButton("正常处决"));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  /* ─────────── X02-22 ─────────── */
  it("X02-22 SAINT_EXECUTION_CONFIRM · 圣徒处决警告", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <SaintExecutionConfirmModal
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="⚠️ 圣徒处决警告"）
    expect(modalTitle()).toBe("⚠️ 圣徒处决警告");
    expect(t).toContain("⚠️ 圣徒处决警告");

    // ③ 关键整句逐字
    expect(t).toContain("你即将处决的是【圣徒 (Saint)】！");
    expect(t).toContain("一旦执行，【圣徒】的阵营立即落败（善良阵营失败、邪恶阵营获胜）！");
    expect(t).toContain("若你确认要执行，请点击下方【确认处决圣徒并结束游戏】。");

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确认处决圣徒并结束游戏");

    // ⑤ 关闭可用：✕ ⇒ onCancel；确认处决 ⇒ onConfirm
    fireEvent.click(closeButton());
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(findButton("确认处决圣徒并结束游戏"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-23 ─────────── */
  it("X02-23 VIZIER_EXECUTION · 维齐尔强制处决（使用能力 / 不使用）", () => {
    const onResolve = vi.fn();

    render(
      <VizierExecutionModal
        isOpen={true}
        targetId={2}
        vizierId={1}
        onResolve={onResolve}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="👑 维齐尔强制处决"）
    expect(modalTitle()).toBe("👑 维齐尔强制处决");
    expect(t).toContain("👑 维齐尔强制处决");

    // ③ 关键整句逐字（源码模板：`{targetId + 1}号 被提名，{vizierId + 1}号 维齐尔是否使用能力立即处决？`）
    expect(t).toContain("3号 被提名，2号 维齐尔是否使用能力立即处决？");
    expect(t).toContain(
      "规则：维齐尔可以在一次提名的投票统计后，如果至少有一名善良玩家参与投票，选择让被提名者立即被处决。"
    );

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toContain("强制处决");
    expect(buttonTexts()).toContain("不使用能力");

    // ⑤ 关闭可用：强制处决 ⇒ onResolve(true)；不使用能力 ⇒ onResolve(false)
    fireEvent.click(findButton("强制处决"));
    expect(onResolve).toHaveBeenCalledWith(true);

    fireEvent.click(findButton("不使用能力"));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  /* ─────────── X02-24 ─────────── */
  it("X02-24 EVIL_TWIN_EXECUTION_CONFIRM · 镜像双子处决警告", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <EvilTwinExecutionConfirmModal
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="⚠️ 镜像双子处决警告"）
    expect(modalTitle()).toBe("⚠️ 镜像双子处决警告");
    expect(t).toContain("⚠️ 镜像双子处决警告");

    // ③ 关键整句逐字
    expect(t).toContain("你即将处决的是【对立善良双子】！");
    expect(t).toContain("镜像双子在场！一旦处决善良双子，邪恶阵营立即获胜！");
    expect(t).toContain(
      "若你确认要执行此项处决，请点击下方【确认处决善良双子并结束游戏】。"
    );

    // ④ 按钮文案逐字一致
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确认处决善良双子并结束游戏");

    // ⑤ 关闭可用
    fireEvent.click(closeButton());
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(findButton("确认处决善良双子并结束游戏"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-25 ─────────── */
  it("X02-25 SHOOT_RESULT · 猎手射击结果（未命中 / 命中恶魔）", () => {
    const onConfirm = vi.fn();

    // —— 场景一：未命中（isDemonDead = false）——
    render(
      <ShootResultModal
        isOpen={true}
        message="【未命中小恶魔】"
        isDemonDead={false}
        targetId={2}
        phaseText="白天阶段"
        onConfirm={onConfirm}
      />
    );

    let t = assertRendered();

    // ① 标题逐字一致（源码三元：isDemonDead ? "💥 恶魔死亡 - 善良阵营获胜！" : "💥 猎手射击结果"）
    expect(modalTitle()).toBe("💥 猎手射击结果");
    expect(t).toContain("💥 猎手射击结果");

    // ② 关键整句逐字
    //    默认行动描述模板：`猎手 在 ${phaseText} 向【${targetId + 1}号】玩家开枪：`
    expect(t).toContain("猎手 在 白天阶段 向【3号】玩家开枪：");
    //    结果文案（组件会剥掉外层【】再重新包上，渲染结果仍是【未命中小恶魔】）
    expect(t).toContain("【未命中小恶魔】");

    // ③ 按钮文案逐字一致
    expect(buttonTexts()).toContain("确认并返回");

    // ④ 关闭可用
    fireEvent.click(findButton("确认并返回"));
    expect(onConfirm).toHaveBeenCalled();

    cleanup();

    // —— 场景二：命中恶魔（isDemonDead = true ⇒ 标题与文案都换一套）——
    render(
      <ShootResultModal
        isOpen={true}
        message="命中恶魔"
        isDemonDead={true}
        targetId={1}
        phaseText="白天阶段"
        onConfirm={onConfirm}
      />
    );

    t = assertRendered();

    expect(modalTitle()).toBe("💥 恶魔死亡 - 善良阵营获胜！");
    expect(t).toContain("💥 恶魔死亡 - 善良阵营获胜！");
    expect(t).toContain("猎手 在 白天阶段 向【2号】玩家开枪：");
    expect(t).toContain("【命中恶魔】");
    //    胜利横幅整句
    expect(t).toContain("🎉 恶魔已被猎手成功击杀！系统已判定善良阵营获得最终胜利！");

    expect(buttonTexts()).toContain("确认并返回");

    cleanup();

    // —— 场景三：detail 覆盖默认行动描述（整句由 detail 提供）——
    render(
      <ShootResultModal
        isOpen={true}
        message="未命中小恶魔"
        isDemonDead={false}
        targetId={2}
        phaseText="白天阶段"
        detail="猎手向【3号】玩家开枪，但没有射中小恶魔。"
        onConfirm={onConfirm}
      />
    );

    t = assertRendered();

    expect(modalTitle()).toBe("💥 猎手射击结果");
    expect(t).toContain("猎手向【3号】玩家开枪，但没有射中小恶魔。");
    expect(t).toContain("【未命中小恶魔】");
  });

  /* ─────────── X02-26 ─────────── */
  it("X02-26 SLAYER_SELECT_TARGET · 猎手射击 - 选择目标", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "imp", "小恶魔", "demon"),
      mkSeat(2, "slayer", "猎手", "townsfolk"),
      mkSeat(3, "washerwoman", "洗衣妇", "townsfolk"),
    ];

    render(
      <SlayerSelectTargetModal
        isOpen={true}
        shooterId={2}
        seats={seats}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="💥 猎手射击 - 选择目标"）
    expect(modalTitle()).toBe("💥 猎手射击 - 选择目标");
    expect(t).toContain("💥 猎手射击 - 选择目标");

    // ③ 关键整句逐字
    //    射击发起者：`${formatSeatLabel(shooter.id, shooter.playerName)} - 【${role.name}】`
    expect(t).toContain("3号 - 【猎手】");
    expect(t).toContain(
      "规则说明：整局游戏限一次。公开选择一名玩家开枪。如果目标是恶魔，该恶魔立即死亡，善良阵营获胜！"
    );

    // ④ 座位卡片文案逐字一致（座位号 + 阵营徽章 + 角色名；**不含射击者自己**）
    expect(buttonTexts()).toContain("1镇民厨师");
    expect(buttonTexts()).toContain("2恶魔小恶魔");
    expect(buttonTexts()).toContain("4镇民洗衣妇");
    expect(buttonTexts()).not.toContain("3镇民猎手");

    // ⑤ 按钮文案逐字一致（射击按钮是两个 span 拼接 ⇒ "💥确认射击"）
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("💥确认射击");

    // ⑥ 关闭可用：选中一张卡片 ⇒ 锁定提示条出现 ⇒ 确认射击回传目标座位
    fireEvent.click(findButton("2恶魔小恶魔"));
    expect(bodyText()).toContain("已锁定目标：");
    expect(bodyText()).toContain("【2号 - 小恶魔】");
    expect(bodyText()).toContain("点击下方“确认射击”完成结算");

    fireEvent.click(findButton("💥确认射击"));
    expect(onConfirm).toHaveBeenCalledWith(1);

    //    取消 ⇒ onCancel
    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 8 个弹窗**全部**是「纯 props」组件，在 jsdom 下可直接真实渲染，
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 特殊处理（不是降级）：
 *   • X02-19（VOTE_INPUT）：`VoteInputModal.tsx` 导出的组件名是
 *     `VoteInputModalContent`（无 `isOpen` prop，靠 `voterId === null` 兜底）；
 *     断言覆盖「勾选投票者 ⇒ 提交按钮票数变化 ⇒ 提交/取消回调」全过程。
 *   • X02-25（SHOOT_RESULT）：按「未命中 / 命中恶魔 / detail 覆盖行动描述」
 *     三种 `data` 各断言一次（文案各不相同）。
 *   • X02-26（SLAYER_SELECT_TARGET）：座位卡片文案由
 *     `displayPlayerName()` 折叠占位名后确定 ⇒ 固定为「N + 阵营 + 角色名」。
 */
