// @vitest-environment jsdom
/**
 * 罂粟花开 · **角色专属弹窗的 UI 真实渲染验证**
 *
 * 背景：此前 UI 渲染验证只覆盖 4 个**通用**弹窗
 * （InfoResultModal / NightActionConfirmModal / NightDeathReportModal / VoteInputModal），
 * **角色专属弹窗 0 个被验证**。本文件补上罂粟花开 4 个专属 UI 面：
 *
 *   · 占卜师 FortuneTellerResultModal（是/否 两态）
 *   · 博学者 SavantResultModal（两条信息 + 只读态）
 *   · 镜像双子 EvilTwinExecutionConfirmModal（处决警告，含关闭态）
 *   · 洗脑师 CerenovusConfirmLayout（确认文案 getCerenovusConfirmLabel + 内容区渲染）
 *
 * 手法同既有 UI 测试：jsdom + testing-library 真挂载。
 * ⚠️ 用 ModalWrapper 的组件走 createPortal → 内容在 `document.body`；
 *    裸内容组件（CerenovusConfirmContent）在 container 内 → 两处都读。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles } from "../../../../app/data";
import { FortuneTellerResultModal } from "../FortuneTellerResultModal";
import { SavantResultModal } from "../SavantResultModal";
import { EvilTwinExecutionConfirmModal } from "../EvilTwinExecutionConfirmModal";
import {
  CerenovusConfirmContent,
  getCerenovusConfirmLabel,
} from "../CerenovusConfirmLayout";

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

/** portal 内容在 body，裸内容在 container —— 两处一起读 */
const allText = () => document.body.textContent ?? "";

describe("① 占卜师结果页（FortuneTellerResultModal）", () => {
  /**
   * ⚠️ 重要发现（2026-09-13 实测）：本组件当前**零引用 = 死代码**。
   * 占卜师线上实际走**通用** `InfoResultModal`
   * （见 `GameModals.tsx` 的 `FORTUNE_TELLER_RESULT` 分支：
   *  `resultText = result ? "有" : "没有"`）。
   * 本组用例用于**固化该组件的既有行为**，防止有人误以为它在生效。
   *
   * ⚠️ 另一个坑：本组件的 `targetLabels` 期望**裸座位号字符串**（如 `["3","5"]`），
   * 组件内部自己拼「号」（`{targetLabels.join("、")}号`）。
   * 传 `["3号","5号"]` 会渲染成「3号、5号号」（我第一次就踩了）。
   */
  it("有恶魔 → 渲染【是】", () => {
    render(
      <FortuneTellerResultModal
        result={true}
        targetLabels={["3", "5"]}
        onConfirm={() => {}}
        onModify={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("占卜师");
    expect(t).toContain("是");
    // 座位号不得出现重复的「号」字
    expect(t).toContain("3、5号");
    expect(t).not.toContain("号号");
  });

  it("无恶魔 → 渲染【否】", () => {
    render(
      <FortuneTellerResultModal
        result={false}
        targetLabels={["3", "5"]}
        onConfirm={() => {}}
        onModify={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("否");
    expect(t).not.toContain("号号");
  });

  it("两个目标座位号都显示", () => {
    render(
      <FortuneTellerResultModal
        result={true}
        targetLabels={["3", "5"]}
        onConfirm={() => {}}
        onModify={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("3");
    expect(t).toContain("5");
  });
});

describe("② 博学者信息页（SavantResultModal）", () => {
  it("渲染两条信息（一对一错由说书人录入）", () => {
    render(
      <SavantResultModal
        initialInfoA="镇长的邻座都是善良"
        initialInfoB="恶魔尚未投票"
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("博学者");
    expect(t).toContain("镇长的邻座都是善良");
    expect(t).toContain("恶魔尚未投票");
  });

  it("只读态标题不同（今日已记录）", () => {
    render(
      <SavantResultModal
        initialInfoA="A"
        initialInfoB="B"
        isReadOnly
        onClose={() => {}}
      />
    );
    expect(allText()).toContain("今日已记录");
  });
});

describe("③ 镜像双子处决警告（EvilTwinExecutionConfirmModal）", () => {
  it("isOpen=false 时不渲染", () => {
    render(
      <EvilTwinExecutionConfirmModal
        isOpen={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).not.toContain("镜像双子");
  });

  it("isOpen=true 时渲染处决警告与取消/确认", () => {
    render(
      <EvilTwinExecutionConfirmModal
        isOpen
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("镜像双子");
    expect(t).toMatch(/处决|警告/);
    expect(t).toContain("取消");
  });
});

describe("④ 洗脑师确认页（CerenovusConfirmLayout）", () => {
  it("getCerenovusConfirmLabel：未选齐时提示先选择", () => {
    expect(getCerenovusConfirmLabel([], null)).toContain("请先选择");
    expect(getCerenovusConfirmLabel([2], null)).toContain("请先选择");
    expect(getCerenovusConfirmLabel([], "镇长")).toContain("请先选择");
  });

  it("getCerenovusConfirmLabel：选齐后给出「N号 ➔ 疯狂扮演【角色】」", () => {
    const label = getCerenovusConfirmLabel([2], "镇长");
    expect(label).toContain("3号");
    expect(label).toContain("镇长");
    expect(label).toContain("疯狂扮演");
  });

  it("内容区渲染存活座位与可选角色胶囊", () => {
    const seats = [
      { id: 0, playerName: "P1", role: r("cerenovus"), isDead: false, isAlive: true, statusEffects: [] },
      { id: 1, playerName: "P2", role: r("mayor"), isDead: false, isAlive: true, statusEffects: [] },
      { id: 2, playerName: "P3", role: r("savant"), isDead: false, isAlive: true, statusEffects: [] },
    ] as any[];
    const scriptRoles = [r("mayor"), r("savant"), r("baron"), r("legion")];

    const { container } = render(
      <CerenovusConfirmContent
        seats={seats}
        scriptRoles={scriptRoles}
        selectedTargets={[2]}
        selectedRoleId="mayor"
        actorSeatId={0}
        onToggleTarget={() => {}}
        onSelectRole={() => {}}
      />
    );
    const t = container.textContent ?? "";
    // 座位网格
    expect(t).toContain("1号");
    expect(t).toContain("2号");
    expect(t).toContain("3号");
    // 角色胶囊
    expect(t).toContain("镇长");
    expect(t).toContain("博学者");
  });

  it("内容区把行动者（洗脑师本人）标记为不可选", () => {
    const seats = [
      { id: 0, playerName: "P1", role: r("cerenovus"), isDead: false, isAlive: true, statusEffects: [] },
      { id: 1, playerName: "P2", role: r("mayor"), isDead: false, isAlive: true, statusEffects: [] },
    ] as any[];
    const { container } = render(
      <CerenovusConfirmContent
        seats={seats}
        scriptRoles={[r("mayor")]}
        selectedTargets={[]}
        selectedRoleId={null}
        actorSeatId={0}
        onToggleTarget={() => {}}
        onSelectRole={() => {}}
      />
    );
    // 行动者按钮应为 disabled（不可选自己）
    const disabled = Array.from(
      container.querySelectorAll("button[disabled]")
    );
    expect(disabled.length, "行动者本人应不可选").toBeGreaterThan(0);
  });
});
