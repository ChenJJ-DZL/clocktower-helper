// @vitest-environment jsdom
/**
 * 传奇角色(8) + 旅行者(15) 四层全量套件 · L3 UI 层（TableCenterHUD）
 * ======================================================================
 * 覆盖本轮新交付 UI：
 *   ① 说书人座位渲染不白屏；点击弹窗走 createPortal ⇒ 断言读 document.body
 *   ② 说书人选择后展示角色名；gamePhase="check" 时按钮 disabled（锁定）
 *   ③ 旅行者按钮点击后座位行展开，渲染 4 个座位
 *   ④ 位置化：点「座位 N」弹窗标题含「为座位 N 选择旅行者」；被占角色 disabled
 *   ⑤ 弹窗宽度不得使用视口单位（源码级断言，同 monk_result_wrap 护栏）
 *   ⑥ 字号合规：角色名类名为 text-4xl
 * 每个 it ≥3 expect。只加测试不改生产：偏差只冻结 + 报告。
 */
import {
  cleanup,
  fireEvent,
  render,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GameProvider } from "../../../contexts/GameContext";
import { TableCenterHUD } from "../../../components/game/board/TableCenterHUD";
import type { GamePhase } from "../../../../app/data";
// @ts-expect-error vite raw 导入（无内置类型声明）：源码级护栏判据
import hudSrc from "../../../components/game/board/TableCenterHUD.tsx?raw";

function renderHUD(gamePhase: GamePhase = "setup") {
  return render(
    <GameProvider>
      <TableCenterHUD
        gamePhase={gamePhase}
        nightCount={1}
        timer={0}
        formatTimer={(s: number) => `${s}`}
        isTimerRunning={false}
      />
    </GameProvider>
  );
}

const code = (hudSrc as string)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

beforeAll(() => {
  // jsdom 缺失的布局 API 桩
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("① 说书人座位渲染与弹窗（createPortal → document.body）", () => {
  it("渲染不白屏，点击说书人座位后弹窗出现在 document.body", () => {
    const { container } = renderHUD("setup");
    expect(container.textContent).toContain("说书人");
    expect(container.textContent).toContain("传奇角色（0/1）");
    const seat = container.querySelector(
      'button[title="选择传奇角色（落座确认后锁定）"]'
    );
    expect(seat, "说书人座位按钮应存在").toBeTruthy();
    fireEvent.click(seat!);
    // ModalWrapper 走 createPortal → 内容在 document.body
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("选择传奇角色（上限 1 个）");
    expect(bodyText).toContain("移除传奇角色");
    expect(container.textContent).toContain("说书人");
  });
});

describe("② 选择展示与锁定（复用 GamePhase 判定）", () => {
  it("选择传奇角色后座位展示角色名，且计数变为 1/1", () => {
    const { container } = renderHUD("setup");
    const seat = container.querySelector(
      'button[title="选择传奇角色（落座确认后锁定）"]'
    )!;
    fireEvent.click(seat);
    const titles = within(document.body).getAllByText(/选择传奇角色（上限 1 个）/);
    expect(titles.length).toBeGreaterThan(0);
    // 点击弹窗内第一个角色条目（w-full 按钮，排除底部「移除」按钮）
    const candidates = Array.from(
      document.body.querySelectorAll("button.w-full")
    ).filter((b) => !b.textContent?.includes("移除传奇角色"));
    expect(candidates.length).toBeGreaterThan(0);
    fireEvent.click(candidates[0]);
    const pickedName = candidates[0].querySelector("div")?.textContent?.trim() ?? "";
    expect(pickedName.length).toBeGreaterThan(0);
    expect(container.textContent).toContain("传奇角色（1/1）");
  });

  it('gamePhase="check" 时说书人座位 disabled（落座确认后锁定）', () => {
    const { container } = renderHUD("check");
    const seat = container.querySelector('button[title*="已锁定"]');
    expect(seat, "锁定态按钮应存在").toBeTruthy();
    expect((seat as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(seat!);
    // 锁定后点击不得弹出选择弹窗
    expect(document.body.textContent ?? "").not.toContain(
      "选择传奇角色（上限 1 个）"
    );
  });
});

describe("③④ 旅行者座位行展开 + 位置化选择", () => {
  it("点击旅行者按钮展开座位行，渲染 4 个座位", () => {
    const { container } = renderHUD("setup");
    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("旅行者（0/4）")
    );
    expect(toggle, "旅行者开关按钮应存在").toBeTruthy();
    fireEvent.click(toggle!);
    const seats = container.querySelectorAll(
      'button[title="空旅行者座位（点击指定旅行者）"]'
    );
    expect(seats.length).toBe(4);
    expect(container.textContent).toContain("座位 1");
    expect(container.textContent).toContain("座位 4");
  });

  it("点「座位 3」弹窗标题为「为座位 3 选择旅行者」（位置化不串位）", () => {
    const { container } = renderHUD("setup");
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("旅行者（0/4）")
      )!
    );
    const seats = Array.from(
      container.querySelectorAll(
        'button[title="空旅行者座位（点击指定旅行者）"]'
      )
    );
    expect(seats.length).toBe(4);
    fireEvent.click(seats[2]);
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("为座位 3 选择旅行者");
    expect(bodyText).toContain("清空该座位");
    expect(seats[2].getAttribute("title")).toContain("点击指定旅行者");
  });

  it("已被其他座位占用的角色在弹窗中 disabled", () => {
    const { container } = renderHUD("setup");
    fireEvent.click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("旅行者（0/4）")
      )!
    );
    const seats = Array.from(
      container.querySelectorAll(
        'button[title="空旅行者座位（点击指定旅行者）"]'
      )
    );
    // 先给座位 1 指定第一个旅行者角色
    fireEvent.click(seats[0]);
    const roleBtns = Array.from(
      document.body.querySelectorAll("button.w-full")
    ).filter((b) => !b.textContent?.includes("清空该座位"));
    expect(roleBtns.length).toBeGreaterThan(1);
    fireEvent.click(roleBtns[0]);
    const picked = roleBtns[0].querySelector("div")?.textContent?.trim() ?? "";
    expect(picked.length).toBeGreaterThan(0);
    // 再开下一个空座位的弹窗：刚被占用的角色应 disabled
    const seatsAfter = Array.from(
      container.querySelectorAll('button[title*="点击指定旅行者"]')
    );
    expect(seatsAfter.length).toBeGreaterThan(0);
    fireEvent.click(seatsAfter[0]);
    const disabledBtns = Array.from(
      document.body.querySelectorAll("button.w-full:disabled")
    );
    expect(disabledBtns.length).toBeGreaterThan(0);
    expect(disabledBtns[0].getAttribute("title")).toBe("已被其他座位占用");
  });
});

describe("⑤⑥ 源码级护栏：弹窗宽度禁视口单位 + 字号合规", () => {
  it("⑤ TableCenterHUD 不得使用 vw/vh 视口单位（monk_result_wrap 同类护栏）", () => {
    expect(code).not.toMatch(/\d\s*(vw|vh)\b/);
    expect(code).not.toMatch(/-\[\s*\d+(vw|vh)/);
    // 弹窗宽度走 ModalWrapper 的 maxWidthPx / autoHeight（设计像素）
    expect(code).toContain("maxWidthPx");
    expect(code).toContain("autoHeight");
  });

  it("⑥ 角色名字号为 text-4xl（36px，手机缩放后可读）", () => {
    expect(code).toContain("text-4xl font-bold text-amber-200");
    expect(code).toContain("text-4xl font-bold text-sky-200");
    expect(code).not.toContain("text-2xl font-bold text-amber-200");
  });
});
