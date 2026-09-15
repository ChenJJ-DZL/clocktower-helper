// @vitest-environment jsdom
/**
 * 🗣️ 提名上限 UI 真挂载回归 —— 「每个黄昏每名玩家最多提名 1 次 / 被提名 1 次」。
 *
 * 用户实测缺陷（2026-09-14）：
 *   「当前实测可以发起 2 次提名，和被提名 2 次，这不符合游戏规则」
 *
 * 根因（两层，都在**生命周期**而非判定条件上）：
 *   ① `GameStage` 的「VOTE_INPUT 弹窗关闭」effect **无条件**调用
 *      `cancelNomination(lastNominator, pendingVoteFor)` —— 投票**已完成**也会
 *      把提名者/被提名者从 nominationRecords 里删掉 → 双方资格被恢复。
 *   ② `executeNomination` 里 `setNominationMap({ [id]: sourceId })` 是整体覆盖。
 *
 * 本文件锁住 **UI 层的表现**：已提名/已被提名者在提名选择面板里必须是 disabled。
 * 判定逻辑本身由 `src/utils/__tests__/nomination_eligibility.test.ts` 覆盖。
 *
 * 手法：jsdom + @testing-library 真挂载（与 day_phase_ui.test.tsx 一致）。
 */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// GameActionsContext 提供 props；这里用 mock 注入可控状态
const mockActions: any = {};
vi.mock("../../../contexts/GameActionsContext", () => ({
  useGameActions: () => mockActions,
}));

import { roles } from "../../../../app/data";
import { DayActionModal } from "../DayActionModal";

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

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

function setup(overrides: Partial<any> = {}) {
  Object.assign(mockActions, {
    seats: [
      seat(0, "washerwoman"),
      seat(1, "librarian"),
      seat(2, "investigator"),
      seat(3, "chef"),
      seat(4, "imp"),
    ],
    selectedScript: null,
    nominationRecords: { nominators: new Set<number>(), nominees: new Set<number>() },
    setCurrentModal: vi.fn(),
    handleDayAction: vi.fn(),
    setVirginGuideInfo: vi.fn(),
    setVfxTrigger: vi.fn(),
    ...overrides,
  });
}

/** 取提名面板里每个座位按钮的 disabled 状态 */
function seatButtonState(): { label: string; disabled: boolean }[] {
  const btns = Array.from(
    document.querySelectorAll("button")
  ) as HTMLButtonElement[];
  return btns
    .map((b) => {
      const txt = (b.textContent ?? "").trim();
      return { label: txt, disabled: b.disabled };
    })
    .filter((x) => /^\d+号/.test(x.label));
}

describe("🗣️ 提名上限 · 提名选择面板（DayActionModal）", () => {
  it("① 尚无记录：所有存活座位都可被提名", () => {
    setup();
    render(<DayActionModal modal={{ type: "nominate", sourceId: 0 }} />);
    const states = seatButtonState();
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((s) => !s.disabled)).toBe(true);
  });

  it("② 提名者本黄昏已提名过 → 面板里**所有**座位都被禁用（不能发起第 2 次提名）", () => {
    setup({
      nominationRecords: {
        nominators: new Set([0]),
        nominees: new Set([3]),
      },
    });
    render(<DayActionModal modal={{ type: "nominate", sourceId: 0 }} />);
    const states = seatButtonState();
    expect(states.length).toBeGreaterThan(0);
    // ⛔ 修复前：这里为 false（按钮仍可点 → 能发起第 2 次提名）
    expect(states.every((s) => s.disabled)).toBe(true);
  });

  it("③ 某座位本黄昏已被提名过 → 该座位禁用，其余仍可点", () => {
    setup({
      nominationRecords: {
        nominators: new Set([0]),
        nominees: new Set([3]),
      },
    });
    // 换一个**尚未提名过**的提名者 1 号，去看 3 号（已被提名）是否被禁用
    render(<DayActionModal modal={{ type: "nominate", sourceId: 1 }} />);
    const states = seatButtonState();
    const seat4 = states.find((s) => s.label.startsWith("4号"));
    expect(seat4).toBeTruthy();
    // ⛔ 修复前：这里为 false（4号能再次被提名）
    expect(seat4!.disabled).toBe(true);

    // 未涉及过的座位仍可选
    const seat5 = states.find((s) => s.label.startsWith("5号"));
    expect(seat5!.disabled).toBe(false);
  });

  it("④ 兼容 Array 形态的历史快照（撤销/读档后的记录）", () => {
    setup({
      nominationRecords: { nominators: [0], nominees: [3] },
    });
    render(<DayActionModal modal={{ type: "nominate", sourceId: 0 }} />);
    const states = seatButtonState();
    expect(states.every((s) => s.disabled)).toBe(true);
  });
});

/**
 * 📌 座位角标的 DOM 契约 —— 2026-09-14 E2E 踩坑后补的护栏。
 *
 * 事故经过：`e2e/trouble_brewing/nomination_limit.spec.ts` 用
 * `document.body.textContent.includes("已提名")` 断言角标存在 →
 * 真实浏览器里**必然 false**（DOM 可见文本只有两个短字「已提」/「被提」，
 * 完整语义挂在 `title` 属性上），于是产品明明是好的，E2E 却报红。
 *
 * 这里把 SeatNode 的角标文案 + title **双向钉死**：
 * 任何一方被改动，单测立刻红，不会等到 E2E 才暴露。
 */
describe("📌 座位角标文案契约（SeatNode）", () => {
  it("提名者角标文本为「已提」、title 为「本黄昏已发起过提名」", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    expect(src).toContain('title="本黄昏已发起过提名"');
    // 角标可见文本：紧跟 title 的 > 里的短文案
    expect(src).toMatch(/title="本黄昏已发起过提名"\s*>\s*已提\s*</);
  });

  it("被提名角标文本为「被提」、title 为「本黄昏已被提名过」", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    expect(src).toContain('title="本黄昏已被提名过"');
    expect(src).toMatch(/title="本黄昏已被提名过"\s*>\s*被提\s*</);
  });

  it("SeatNode 的角标数据源直读 nominationRecords（Set / Array 双兼容）", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    // 与 utils/nominationEligibility 的资格判定同源，避免角标与资格脱节
    expect(src).toContain("nominationRecords?.nominators");
    expect(src).toContain("nominationRecords?.nominees");
    expect(src).toContain("instanceof Set");
    expect(src).toContain(".includes(s.id)");
  });
});
