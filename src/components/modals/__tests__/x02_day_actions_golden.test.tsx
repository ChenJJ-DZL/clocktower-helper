// @vitest-environment jsdom
/**
 * X02 弹窗 golden 基线 · 第 4 批（白天 / 处决 后 7 个）
 * ============================================================================
 *
 * 【目的】
 *   为 X02 涉及的 7 个「白天行动 / 处决后置」弹窗建立**人工确认过的逐字文案基线**。
 *   与 snapshot 不同：snapshot 会把当前（可能是 bug 的）文案一次性冻成"基线"，
 *   本文件里的每一句断言都是**从组件源码里抄下来的原文**，改文案 = 改基线 = 显式 diff。
 *
 * 【每条用例断言 5 件事】
 *   ① 能渲染：render() 不抛错，且渲染出的文本非空；
 *   ② 标题逐字一致：ModalWrapper 的 <h2> textContent === 源码原文；
 *   ③ 按钮文案逐字一致：getAllByRole("button") 里 trim 后完全相等（主按钮 + 取消）；
 *   ④ 关键整句：document.body.textContent 里 toContain 一条**完整句子**；
 *   ⑤ 关闭/确认回调：onCancel / onConfirm / context 里的 action 被 vi.fn() 记录到调用。
 *
 * 【portal 说明】
 *   这 7 个弹窗**全部**经由 `ModalWrapper`（createPortal → document.body）渲染，
 *   所以 `container.textContent` 天然为空串；断言统一取 `document.body.textContent`。
 *
 * 【组件清单】
 *   X02-27 DAMSEL_GUESS  → DamselGuessModal.tsx   （纯 props）
 *   X02-28 DAY_ACTION    → DayActionModal.tsx      （useGameActions）
 *   X02-29 DAY_ABILITY   → DayAbilityModal.tsx     （useGameActions）
 *   X02-30 MADNESS_CHECK → MadnessCheckModal.tsx   （useGameActions）
 *   X02-31 MUTANT_MADNESS→ MutantMadnessModal.tsx  （useGameActions）
 *   X02-32 KLUTZ_CHOICE  → KlutzChoiceModal.tsx    （纯 props）
 *   X02-33 SHAMAN_CONVERT→ ShamanConvertModal.tsx  （useGameActions）
 *
 * ⚠️ `DAY_ACTION` 与 `DAY_ABILITY` 是**两个不同的组件**：
 *   · `DayActionModal`  —— 右键菜单发起的「白天行动」（提名 / 杀手开枪 / 疯子日杀），
 *                          只给一张存活座位网格让说书人选人，标题随 `modal.type` 三变；
 *   · `DayAbilityModal` —— 说书人控制台发起的「角色日间能力」（造谣者 / 博学者 / …），
 *                          标题固定为「🌞 {角色名} 日间能力」，正文随 `modal.roleId` 变。
 *
 * 【Context 打桩】
 *   5 个走 `useGameActions()` 的弹窗用 `vi.mock` 打桩 `GameActionsContext`，
 *   提供**最小可用实现**（currentModal / seats / 若干 action），**不改任何组件源码**。
 *
 * 【座位名约定】
 *   `displayPlayerName()` 会把系统占位名「玩家 N」折叠成空串，
 *   因此座位卡片文案是确定的「N号 + 角色名」，可以逐字断言。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Seat } from "../../../../app/data";

/* ─────────────────────────── Context 打桩 ─────────────────────────── */

const gameActionsMock: any = vi.hoisted(() => ({
  currentModal: null as any,
  seats: [] as any[],
  selectedScript: null as any,
  nominationRecords: null as any,
  dayAbilityForm: {} as any,
  nightCount: 1,
  gamePhase: "day",
  // —— action ——
  setCurrentModal: vi.fn(),
  handleDayAction: vi.fn(),
  setVirginGuideInfo: vi.fn(),
  setVfxTrigger: vi.fn(),
  setDayAbilityForm: vi.fn(),
  setDayAbilityLogs: vi.fn(),
  saveHistory: vi.fn(),
  addLog: vi.fn(),
  setGossipStatementToday: vi.fn(),
  setGossipSourceSeatId: vi.fn(),
  setGossipTrueTonight: vi.fn(),
  markDailyAbilityUsed: vi.fn(),
  markAbilityUsed: vi.fn(),
  setSeats: vi.fn(),
  setCerenovusTarget: vi.fn(),
  dispatch: vi.fn(),
  executePlayer: vi.fn(),
  setShamanConvertTarget: vi.fn(),
  shamanConvertTarget: null as number | null,
  getSeatRoleId: vi.fn(() => ""),
  cleanseSeatStatuses: vi.fn((s: any) => s),
  insertIntoWakeQueueAfterCurrent: vi.fn(),
}));

vi.mock("../../../contexts/GameActionsContext", () => ({
  useGameActions: () => gameActionsMock,
  useOptionalGameActions: () => gameActionsMock,
  GameActionsProvider: ({ children }: any) => children,
}));

/* ─────────────────────────── 组件导入（放在 mock 之后） ─────────────────────────── */

import { DamselGuessModal } from "../DamselGuessModal";
import { DayActionModal } from "../DayActionModal";
import { DayAbilityModal } from "../DayAbilityModal";
import { MadnessCheckModal } from "../MadnessCheckModal";
import { MutantMadnessModal } from "../MutantMadnessModal";
import { KlutzChoiceModal } from "../KlutzChoiceModal";
import { ShamanConvertModal } from "../ShamanConvertModal";

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
  gameActionsMock.selectedScript = null;
  gameActionsMock.nominationRecords = null;
  gameActionsMock.dayAbilityForm = {};
  gameActionsMock.shamanConvertTarget = null;
  for (const key of Object.keys(gameActionsMock)) {
    const v = gameActionsMock[key];
    if (v && typeof v.mockClear === "function") v.mockClear();
  }
  document.body.innerHTML = "";
});

afterEach(() => cleanup());

/* ─────────────────────────── 通用工具 ─────────────────────────── */

/** 全部 7 个弹窗都走 ModalWrapper（portal → document.body）。 */
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

/**
 * 造一个最小合法座位。
 * playerName 用系统占位名「玩家 N」⇒ displayPlayerName() 返回空串，
 * 座位卡片因此只输出「N号 + 角色名」，文案确定可逐字断言。
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

/* ═══════════════════════ X02 · 白天/处决 后 7 个弹窗 ═══════════════════════ */

describe("X02 · 白天行动弹窗 golden 基线（批 4）", () => {
  /* ─────────── X02-27 ─────────── */
  it("X02-27 DAMSEL_GUESS · 爪牙猜测落难少女（选爪牙 + 选目标）", () => {
    const onMinionChange = vi.fn();
    const onTargetChange = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    // 0=厨师 / 1=小恶魔 / 2=投毒者(爪牙) / 3=落难少女 / 4=洗牌客(爪牙)
    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "imp", "小恶魔", "demon"),
      mkSeat(2, "poisoner", "投毒者", "minion"),
      mkSeat(3, "damsel", "落难少女", "outsider"),
      mkSeat(4, "baron", "男爵", "minion"),
    ];

    render(
      <DamselGuessModal
        isOpen={true}
        minionId={null}
        targetId={null}
        seats={seats}
        damselGuessUsedBy={[4]}
        onMinionChange={onMinionChange}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="👧 爪牙猜测落难少女"）
    expect(modalTitle()).toBe("👧 爪牙猜测落难少女");
    expect(t).toContain("👧 爪牙猜测落难少女");

    // ③ 关键整句逐字（源码模板的规则说明第二句）
    expect(t).toContain("若猜中落难少女，邪恶阵营立即获胜。");
    expect(t).toContain("规则：每名存活爪牙每局仅可猜测 1");

    // ④ 「猜角色」选择区存在：两个 select（发起爪牙 / 被猜玩家）+ 两个 label
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    expect(t).toContain("发起猜测的爪牙：");
    expect(t).toContain("被猜测的玩家（怀疑是少女）：");
    expect(t).toContain("选择爪牙");
    expect(t).toContain("选择被猜测的玩家");

    //    爪牙下拉：只列存活且本局未猜过的爪牙（4号男爵已被排除）
    expect(t).toContain("[3号] 投毒者");
    expect(t).not.toContain("[5号] 男爵");

    // ⑤ 按钮文案逐字一致（主 + 取消）；未选全时「确定」为 disabled
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确定");
    expect((findButton("确定") as HTMLButtonElement).disabled).toBe(true);

    // ⑥ 关闭/确认回调：取消 ⇒ onCancel
    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();

    cleanup();

    // ⑦ 选完爪牙 + 目标后「确定」可用 ⇒ onConfirm 被调用
    render(
      <DamselGuessModal
        isOpen={true}
        minionId={2}
        targetId={3}
        seats={seats}
        damselGuessUsedBy={[4]}
        onMinionChange={onMinionChange}
        onTargetChange={onTargetChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect((findButton("确定") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(findButton("确定"));
    expect(onConfirm).toHaveBeenCalled();

    // ⑧ 下拉变更回调：选中 2 号投毒者 ⇒ onMinionChange(2)
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "2" },
    });
    expect(onMinionChange).toHaveBeenCalledWith(2);
  });

  /* ─────────── X02-28 ─────────── */
  it("X02-28 DAY_ACTION · 白天行动选人（发起提名 / 杀手开枪 / 疯子日杀）", () => {
    // 0=厨师 / 1=小恶魔 / 2=共情者 / 3=洗衣妇（已死 ⇒ 不出现在网格里）
    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "imp", "小恶魔", "demon"),
      mkSeat(2, "empath", "共情者", "townsfolk"),
      mkSeat(3, "washerwoman", "洗衣妇", "townsfolk", true),
    ];
    gameActionsMock.seats = seats;
    gameActionsMock.nominationRecords = null;
    gameActionsMock.selectedScript = null;

    // —— 场景一：发起提名（右键菜单发起）——
    render(<DayActionModal modal={{ type: "nominate", sourceId: 0 }} />);

    let t = assertRendered();

    // ① 标题逐字一致（源码三元兜底分支："🗣️ 发起提名"）
    expect(modalTitle()).toBe("🗣️ 发起提名");
    expect(t).toContain("🗣️ 发起提名");

    // ② 座位卡片文案逐字（"N号" + 角色名）；死者不出现在网格里
    expect(buttonTexts()).toContain("1号厨师");
    expect(buttonTexts()).toContain("2号小恶魔");
    expect(buttonTexts()).toContain("3号共情者");
    expect(buttonTexts()).not.toContain("4号洗衣妇");

    // ③ 按钮文案逐字一致（底部只有「取消」）
    expect(buttonTexts()).toContain("取消");

    // ④ 选中一名玩家 ⇒ handleDayAction(座位 id) 被调用
    fireEvent.click(findButton("2号小恶魔"));
    expect(gameActionsMock.handleDayAction).toHaveBeenCalledWith(1);

    // ⑤ 取消 ⇒ setCurrentModal(null)
    fireEvent.click(findButton("取消"));
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);

    cleanup();

    // —— 场景二：杀手开枪（title 变体）——
    render(<DayActionModal modal={{ type: "slayer", sourceId: 0 }} />);
    expect(modalTitle()).toBe("💥 杀手开枪");
    expect(bodyText()).toContain("💥 杀手开枪");

    cleanup();

    // —— 场景三：精神病患者日杀（title 变体）——
    render(<DayActionModal modal={{ type: "lunaticKill", sourceId: 0 }} />);
    expect(modalTitle()).toBe("🔪 精神病患者日杀");
    expect(bodyText()).toContain("🔪 精神病患者日杀");
  });

  /* ─────────── X02-29 ─────────── */
  it("X02-29 DAY_ABILITY · 说书人面板发起的角色日间能力（造谣者）", () => {
    // 0=厨师 / 1=造谣者
    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "gossip", "造谣者", "townsfolk"),
    ];
    gameActionsMock.seats = seats;
    gameActionsMock.dayAbilityForm = { info1: "我是小恶魔", info2: "true" };

    render(<DayAbilityModal modal={{ roleId: "gossip", seatId: 1 }} />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码模板 `🌞 ${roleName} 日间能力`）
    expect(modalTitle()).toBe("🌞 造谣者 日间能力");
    expect(t).toContain("🌞 造谣者 日间能力");

    // ③ 关键整句逐字
    expect(t).toContain("记录造谣内容，并由说书人裁定真假（工具不自动判定）。");
    expect(t).toContain("裁定结果：");

    // ④ 裁定下拉的三档文案
    expect(t).toContain("未裁定（稍后再定）");
    expect(t).toContain("为真（今晚额外死亡 1 人）");
    expect(t).toContain("为假（无事发生）");

    // ⑤ 按钮文案逐字一致（主 + 取消）
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确认");

    // ⑥ 确认 ⇒ 记日志 + 关闭弹窗
    fireEvent.click(findButton("确认"));
    expect(gameActionsMock.addLog).toHaveBeenCalledWith(
      "2号(造谣者) 造谣：我是小恶魔（说书人裁定：为真，今晚额外死亡）"
    );
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);

    cleanup();

    // ⑦ 取消 ⇒ setCurrentModal(null) + 清空表单
    gameActionsMock.setCurrentModal.mockClear();
    render(<DayAbilityModal modal={{ roleId: "gossip", seatId: 1 }} />);
    fireEvent.click(findButton("取消"));
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
    expect(gameActionsMock.setDayAbilityForm).toHaveBeenCalledWith({});
  });

  /* ─────────── X02-30 ─────────── */
  it("X02-30 MADNESS_CHECK · 洗脑师疯狂裁定（是 / 否）", () => {
    gameActionsMock.seats = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "imp", "小恶魔", "demon"),
      mkSeat(2, "empath", "共情者", "townsfolk"),
    ];

    render(
      <MadnessCheckModal modal={{ targetId: 2, roleName: "洗脑师" }} />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🧠 疯狂洗脑判定"）
    expect(modalTitle()).toBe("🧠 疯狂洗脑判定");
    expect(t).toContain("🧠 疯狂洗脑判定");

    // ③ 关键整句逐字（两个分支各自的说明句）
    expect(t).toContain("玩家是否真正“疯狂证明自己”：");
    expect(t).toContain("要求扮演角色：");
    expect(t).toContain("【3号】");
    expect(t).toContain(
      "选择“是”：玩家疯狂表现合格，无事发生，白天继续。"
    );
    expect(t).toContain(
      "选择“否”：玩家未能疯狂扮演，立即被处决并跳过黄昏，直接进入下一个夜晚！"
    );

    // ④ 按钮文案逐字一致（是 / 否 两个裁定 + 取消）
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("是 (通过 / 无事发生)");
    expect(buttonTexts()).toContain("否 (处决并跳入下一夜)");

    // ⑤ 选「是」⇒ 无事发生：记日志 + 关闭弹窗（不处决）
    fireEvent.click(findButton("是 (通过 / 无事发生)"));
    expect(gameActionsMock.addLog).toHaveBeenCalledWith(
      "说书人判定 3号 成功疯狂证明自己是【洗脑师】，无事发生。"
    );
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
    expect(gameActionsMock.executePlayer).not.toHaveBeenCalled();

    cleanup();

    // ⑥ 选「否」⇒ 立即处决 + 跳入下一夜
    render(
      <MadnessCheckModal modal={{ targetId: 2, roleName: "洗脑师" }} />
    );
    fireEvent.click(findButton("否 (处决并跳入下一夜)"));
    expect(gameActionsMock.executePlayer).toHaveBeenCalledWith(2, {
      forceExecution: true,
    });
    const modalArg = gameActionsMock.setCurrentModal.mock.calls.at(-1)?.[0];
    expect(modalArg?.type).toBe("EXECUTION_RESULT");
    expect(modalArg?.data?.isInstantNight).toBe(true);
    expect(String(modalArg?.data?.message)).toContain("未能疯狂证明");
  });

  /* ─────────── X02-31 ─────────── */
  it("X02-31 MUTANT_MADNESS · 畸形秀演员白天疯狂仲裁（公开承认外来者身份）", () => {
    gameActionsMock.seats = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "mutant", "畸形秀演员", "outsider"),
      mkSeat(2, "imp", "小恶魔", "demon"),
    ];

    render(<MutantMadnessModal modal={{ targetId: 1 }} />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🎭 畸形秀演员疯狂仲裁"）
    expect(modalTitle()).toBe("🎭 畸形秀演员疯狂仲裁");
    expect(t).toContain("🎭 畸形秀演员疯狂仲裁");

    // ③ 关键整句逐字：「是否疯狂证明自己是外来者」+ 两个分支说明
    expect(t).toContain("玩家是否疯狂证明自己是外来者？");
    expect(t).toContain("该玩家身份：");
    expect(t).toContain("【2号】");
    expect(t).toContain("他没有暴露外来者身份，无事发生，白天继续。");
    expect(t).toContain("立即被处决并跳过黄昏");

    // ④ 按钮文案逐字一致（否 / 是 + 取消）
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("否，无事发生");
    expect(buttonTexts()).toContain("是，执行处决");

    // ⑤ 选「否，无事发生」⇒ 只标记今日已仲裁 + 关闭，**不处决**
    fireEvent.click(findButton("否，无事发生"));
    expect(gameActionsMock.executePlayer).not.toHaveBeenCalled();
    expect(gameActionsMock.setSeats).toHaveBeenCalledTimes(1);
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);

    //    setSeats 的 updater 必须把该座位标记为「今日已仲裁」
    const updater = gameActionsMock.setSeats.mock.calls[0][0];
    const next = updater([
      { id: 0, isDead: false, role: { id: "chef" } },
      { id: 1, isDead: false, role: { id: "mutant" } },
    ]);
    expect(next.find((s: any) => s.id === 1).mutantMadnessCheckedToday).toBe(
      true
    );
    expect(next.find((s: any) => s.id === 0).mutantMadnessCheckedToday).toBe(
      undefined
    );

    cleanup();

    // ⑥ 选「是，执行处决」⇒ 处决本人 + 跳入下一夜
    render(<MutantMadnessModal modal={{ targetId: 1 }} />);
    fireEvent.click(findButton("是，执行处决"));
    expect(gameActionsMock.executePlayer).toHaveBeenCalledWith(1, {
      forceExecution: true,
    });
    const modalArg = gameActionsMock.setCurrentModal.mock.calls.at(-1)?.[0];
    expect(modalArg?.type).toBe("EXECUTION_RESULT");
    expect(modalArg?.data?.isInstantNight).toBe(true);
    expect(String(modalArg?.data?.message)).toContain("疯狂证明了自己是外来者");
  });

  /* ─────────── X02-32 ─────────── */
  it("X02-32 KLUTZ_CHOICE · 呆瓜死亡后选人（可选座位卡片 + 确认选择）", () => {
    const onSelectTarget = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    // 0=呆瓜（已死，且是 sourceId） / 1=厨师 / 2=小恶魔
    const seats: Seat[] = [
      mkSeat(0, "klutz", "呆瓜", "outsider", true),
      mkSeat(1, "chef", "厨师", "townsfolk"),
      mkSeat(2, "imp", "小恶魔", "demon"),
    ];

    render(
      <KlutzChoiceModal
        isOpen={true}
        sourceId={0}
        seats={seats}
        selectedTarget={null}
        onSelectTarget={onSelectTarget}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🤪 呆瓜死亡判定"）
    expect(modalTitle()).toBe("🤪 呆瓜死亡判定");
    expect(t).toContain("🤪 呆瓜死亡判定");

    // ③ 关键整句逐字
    expect(t).toContain("请选择一名存活玩家：若其为邪恶，善良阵营立即失败。");

    // ④ 可选座位卡片文案逐字（"N号" + 角色名）；死者/自己不在候选里
    expect(buttonTexts()).toContain("2号厨师");
    expect(buttonTexts()).toContain("3号小恶魔");
    expect(buttonTexts()).not.toContain("1号呆瓜");

    // ⑤ 按钮文案逐字一致（主 + 取消）；未选人时「确认选择」为 disabled
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确认选择");
    expect((findButton("确认选择") as HTMLButtonElement).disabled).toBe(true);

    // ⑥ 点座位卡片 ⇒ onSelectTarget(座位 id)
    fireEvent.click(findButton("3号小恶魔"));
    expect(onSelectTarget).toHaveBeenCalledWith(2);

    // ⑦ 取消 ⇒ onCancel
    fireEvent.click(findButton("取消"));
    expect(onCancel).toHaveBeenCalled();

    cleanup();

    // ⑧ 已选人 ⇒ 「确认选择」可用 ⇒ onConfirm 被调用
    render(
      <KlutzChoiceModal
        isOpen={true}
        sourceId={0}
        seats={seats}
        selectedTarget={2}
        onSelectTarget={onSelectTarget}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect((findButton("确认选择") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(findButton("确认选择"));
    expect(onConfirm).toHaveBeenCalled();
  });

  /* ─────────── X02-33 ─────────── */
  it("X02-33 SHAMAN_CONVERT · 灵言师关键词被说出（转为邪恶 + 确认转变）", () => {
    // 0=厨师 / 1=灵言师 / 2=小恶魔
    const seats: Seat[] = [
      mkSeat(0, "chef", "厨师", "townsfolk"),
      mkSeat(1, "shaman", "灵言师", "minion"),
      mkSeat(2, "imp", "小恶魔", "demon"),
    ];
    gameActionsMock.seats = seats;
    gameActionsMock.currentModal = { type: "SHAMAN_CONVERT", data: null };
    gameActionsMock.shamanConvertTarget = 0;

    render(<ShamanConvertModal />);

    // ① 能渲染
    const t = assertRendered();

    // ② 标题逐字一致（源码字面量 title="🪬 灵言师：关键词被说出"）
    expect(modalTitle()).toBe("🪬 灵言师：关键词被说出");
    expect(t).toContain("🪬 灵言师：关键词被说出");

    // ③ 关键整句逐字（「当晚起被视为邪恶」）
    expect(t).toContain(
      "请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。"
    );

    // ④ 玩家下拉列出存活玩家（"N号" + 角色名）
    expect(t).toContain("[1号] 厨师");
    expect(t).toContain("[3号] 小恶魔");

    // ⑤ 按钮文案逐字一致（主 + 取消）
    expect(buttonTexts()).toContain("取消");
    expect(buttonTexts()).toContain("确认转变");

    // ⑥ 取消 ⇒ 关闭弹窗 + 清空目标
    fireEvent.click(findButton("取消"));
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
    expect(gameActionsMock.setShamanConvertTarget).toHaveBeenCalledWith(null);

    cleanup();

    // ⑦ 确认转变 ⇒ 写 isEvilConverted（阵营判据的唯一权威字段）+ 记日志 + 关闭
    render(<ShamanConvertModal />);
    fireEvent.click(findButton("确认转变"));

    expect(gameActionsMock.setSeats).toHaveBeenCalledTimes(1);
    const updater = gameActionsMock.setSeats.mock.calls[0][0];
    const next = updater([
      { id: 0, isDead: false, role: { id: "chef", type: "townsfolk" } },
      { id: 2, isDead: false, role: { id: "imp", type: "demon" } },
    ]);
    expect(next.find((s: any) => s.id === 0).isEvilConverted).toBe(true);
    expect(next.find((s: any) => s.id === 2).isEvilConverted).toBe(undefined);

    expect(gameActionsMock.addLog).toHaveBeenCalledWith(
      "灵言师触发：1号 —— 善良玩家公开说出关键词，当晚起被视为邪恶"
    );
    expect(gameActionsMock.setCurrentModal).toHaveBeenCalledWith(null);
    expect(gameActionsMock.setShamanConvertTarget).toHaveBeenCalledWith(null);
  });
});

/* ═══════════════════════ 降级说明 ═══════════════════════
 *
 * 本批 7 个弹窗**全部**在 jsdom 下真实渲染（5 个走 context 打桩 + 2 个纯 props），
 * 因此**没有**任何一条降级为「静态护栏」。
 *
 * 特殊处理（不是降级）：
 *   • X02-28（DAY_ACTION）：标题随 `modal.type` 三变（提名 / 杀手开枪 / 疯子日杀），
 *     三种分支各断言一次；正文只有座位网格、没有说明句 ⇒ 关键句位置用
 *     「标题整句 + 座位卡片文案」占位。
 *   • X02-31（MUTANT_MADNESS）：与已有 `MutantMadnessModal.test.tsx` 互补 ——
 *     本文件锁**逐字文案 + 按钮顺序**，已有文件锁**行为链路**。
 */
