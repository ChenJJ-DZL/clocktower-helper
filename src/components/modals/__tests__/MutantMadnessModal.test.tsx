// @vitest-environment jsdom
/**
 * 🎭 畸形秀演员（Mutant）白天「疯狂仲裁」弹窗回归
 *
 * 用户要求（2026-09-14）：
 *   「畸形秀演员…应该是个白天技能，且白天必须发动后才能进入黄昏，且由说书人
 *     独立操作…畸形秀演员的技能确认页中的内容应该是：
 *      **是否疯狂证明自己是外来者？**
 *      选项：『是，执行处决』（红色按钮）、『否，无事发生』（绿色按钮）」
 *
 * 本文件钉死三件事：
 *   ① 提问文案必须是「是否疯狂证明自己是外来者？」；
 *   ② 两个按钮文案/颜色严格为「否，无事发生」(绿) /「是，执行处决」(红)，
 *      且**绿色在左、红色在右**（与被洗脑判定页一致的阅读顺序）；
 *   ③ 两个按钮的行为：绿 → 只标记已仲裁、白天继续；红 → 处决本人 + 跳夜。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GameActionsProvider } from "../../../contexts/GameActionsContext";
import { MutantMadnessModal } from "../MutantMadnessModal";

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

/** 造一个最小可用的 GameActions 控制器替身 */
function makeController(overrides: Record<string, any> = {}) {
  const state = {
    seats: [
      { id: 0, isDead: false, role: { id: "chef", name: "厨师" } },
      { id: 4, isDead: false, role: { id: "mutant", name: "畸形秀演员" } },
      { id: 6, isDead: false, role: { id: "imp", name: "小恶魔" } },
    ],
    addLog: vi.fn(),
    setSeats: vi.fn(),
    executePlayer: vi.fn(),
    setCurrentModal: vi.fn(),
    ...overrides,
  };
  return state as any;
}

function renderModal(controller: any, data: any = { targetId: 4 }) {
  return render(
    <GameActionsProvider controller={controller}>
      <MutantMadnessModal modal={data} />
    </GameActionsProvider>
  );
}

const text = () => document.body.textContent || "";

describe("MutantMadnessModal · 文案与按钮（用户硬要求）", () => {
  it("提问文案为「是否疯狂证明自己是外来者？」", () => {
    const c = makeController();
    renderModal(c);
    expect(text()).toContain("是否疯狂证明自己是外来者？");
  });

  it("显示被判定玩家座位号与身份", () => {
    const c = makeController();
    renderModal(c);
    expect(text()).toContain("5号"); // targetId=4 → 5号
    expect(text()).toContain("畸形秀演员");
  });

  it("两个按钮文案严格为「否，无事发生」(绿) /「是，执行处决」(红)，且绿在左红在右", () => {
    const c = makeController();
    renderModal(c);

    const pass = document.querySelector(
      '[data-testid="mutant-pass-button"]'
    ) as HTMLButtonElement;
    const exec = document.querySelector(
      '[data-testid="mutant-execute-button"]'
    ) as HTMLButtonElement;

    expect(pass).toBeTruthy();
    expect(exec).toBeTruthy();
    expect(pass.textContent?.trim()).toBe("否，无事发生");
    expect(exec.textContent?.trim()).toBe("是，执行处决");

    // 颜色语义：绿 = emerald，红 = red
    expect(pass.className).toMatch(/emerald/);
    expect(exec.className).toMatch(/red/);

    // 阅读顺序：绿在红之前
    const order = pass.compareDocumentPosition(exec);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("MutantMadnessModal · 行为", () => {
  it("「否，无事发生」：标记今日已仲裁 + 关闭弹窗，但**不处决**", () => {
    const c = makeController();
    renderModal(c);

    fireEvent.click(
      document.querySelector(
        '[data-testid="mutant-pass-button"]'
      ) as HTMLElement
    );

    expect(c.executePlayer).not.toHaveBeenCalled();
    expect(c.setSeats).toHaveBeenCalledTimes(1);
    expect(c.setCurrentModal).toHaveBeenCalledWith(null);

    // setSeats 回调应把该座位标记为「今日已仲裁」+「已用日间能力」
    const updater = c.setSeats.mock.calls[0][0];
    const next = updater([
      { id: 4, isDead: false, role: { id: "mutant" } },
      { id: 0, isDead: false, role: { id: "chef" } },
    ]);
    const mutantSeat = next.find((s: any) => s.id === 4);
    expect(mutantSeat.mutantMadnessCheckedToday).toBe(true);
    expect(mutantSeat.hasUsedDayAbility).toBe(true);
    // 其他座位不受影响
    expect(next.find((s: any) => s.id === 0).mutantMadnessCheckedToday).toBe(
      undefined
    );
  });

  it("「是，执行处决」：处决该畸形秀演员本人 + 弹出跳夜处决结果", () => {
    const c = makeController();
    renderModal(c);

    fireEvent.click(
      document.querySelector(
        '[data-testid="mutant-execute-button"]'
      ) as HTMLElement
    );

    // 必须处决"畸形秀演员本人"（targetId=4）
    expect(c.executePlayer).toHaveBeenCalledWith(4, { forceExecution: true });

    // 必须弹出 EXECUTION_RESULT 且 isInstantNight=true（跳过黄昏直接入夜）
    const modalArg = c.setCurrentModal.mock.calls.at(-1)?.[0];
    expect(modalArg?.type).toBe("EXECUTION_RESULT");
    expect(modalArg?.data?.isInstantNight).toBe(true);
    expect(String(modalArg?.data?.message)).toContain("畸形秀演员");

    // 同样要标记已仲裁
    expect(c.setSeats).toHaveBeenCalledTimes(1);
  });

  it("modal 为空时安全返回 null（不崩）", () => {
    const c = makeController();
    const { container } = render(
      <GameActionsProvider controller={c}>
        <MutantMadnessModal modal={null} />
      </GameActionsProvider>
    );
    expect(container.querySelector('[data-testid="mutant-pass-button"]')).toBe(
      null
    );
  });
});
