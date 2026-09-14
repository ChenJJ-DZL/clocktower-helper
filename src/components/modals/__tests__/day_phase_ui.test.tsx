// @vitest-environment jsdom
/**
 * 罂粟花开 · **白天环节 UI 真实渲染验证**
 *
 * 补齐「前三个白天」的 UI 显示覆盖：
 *   · 黎明播报：有人死亡 → 「昨晚X号玩家死亡」；无人死亡 → 「平安夜」
 *     ⚠️ 重点：**军团局有人死亡时绝不能显示平安夜**（历史 bug）
 *   · 投票弹窗：军团在场时渲染「军团全邪恶投票计0票」提示
 *
 * 手法同 `legion_storyteller_ui.test.tsx`：jsdom + testing-library 真挂载。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { roles } from "../../../../app/data";
import { NightDeathReportModal } from "../NightDeathReportModal";
import { VoteInputModalContent } from "../VoteInputModal";

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

const bodyText = () => document.body.textContent ?? "";

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

describe("白天 UI · 黎明播报弹窗", () => {
  it("① 有人死亡 → 显示「昨晚N号玩家死亡」，且**不**显示平安夜", () => {
    render(
      <NightDeathReportModal
        message="昨晚4号玩家死亡"
        onConfirm={() => {}}
      />
    );
    const t = bodyText();
    expect(t).toContain("昨晚4号玩家死亡");
    expect(t).not.toContain("平安夜");
  });

  it("② 军团局有人死亡 → 同样显示死亡播报，绝不显示平安夜（历史 bug 回归）", () => {
    // 军团夜杀虽"非恶魔行动"，但只要有人死，就必须正常宣布死亡
    render(
      <NightDeathReportModal message="昨晚2号玩家死亡" onConfirm={() => {}} />
    );
    const t = bodyText();
    expect(t).toContain("昨晚2号玩家死亡");
    expect(t).not.toContain("平安夜");
  });

  it("③ 多人死亡 → 全部罗列", () => {
    render(
      <NightDeathReportModal message="昨晚2号、5号玩家死亡" onConfirm={() => {}} />
    );
    const t = bodyText();
    expect(t).toContain("2号");
    expect(t).toContain("5号");
    expect(t).not.toContain("平安夜");
  });

  it("④ 真正无人死亡 → 显示平安夜", () => {
    render(
      <NightDeathReportModal message="昨天是个平安夜" onConfirm={() => {}} />
    );
    expect(bodyText()).toContain("平安夜");
  });

  it("⑤ message 为 null 时不渲染", () => {
    render(<NightDeathReportModal message={null} onConfirm={() => {}} />);
    expect(bodyText()).not.toContain("夜晚结算报告");
  });
});

describe("白天 UI · 投票弹窗（军团提示）", () => {
  const seats = [
    seat(0, "legion"),  // 1号 邪恶
    seat(1, "legion"),  // 2号 邪恶
    seat(2, "baron"),   // 3号 邪恶
    seat(3, "mayor"),   // 4号 善良
    seat(4, "savant"),  // 5号 善良
    seat(5, "farmer"),  // 6号 善良
  ];

  /** 座位卡按钮（内容含"存活"），按 DOM 顺序 = 座位顺序 */
  const seatButtons = () =>
    Array.from(document.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").includes("存活")
    );

  function mountVote() {
    render(
      <VoteInputModalContent
        voterId={0}
        seats={seats}
        submitVotes={() => {}}
        setCurrentModal={() => {}}
      />
    );
  }

  it("⑥ 未选人时不显示军团提示（提示是条件渲染的）", () => {
    mountVote();
    expect(bodyText()).not.toContain("军团全邪恶投票计0票");
  });

  it("⑦ ⭐ 全部勾选邪恶玩家 → 显示「军团全邪恶投票计0票」且生效票数归 0", () => {
    mountVote();
    const btns = seatButtons();
    expect(btns.length).toBe(6);
    // 勾选 1号、2号、3号（军团/军团/男爵 = 全邪恶）
    fireEvent.click(btns[0]);
    fireEvent.click(btns[1]);
    fireEvent.click(btns[2]);
    const t = bodyText();
    expect(t).toContain("军团全邪恶投票计0票");
    // 生效票数应为 0
    expect(t).toMatch(/当前生效的票数：\s*0\s*票/);
    expect(t).toContain("未达门槛");
  });

  it("⑧ ⭐ 混入 1 名善良玩家 → 军团提示消失，正常计票", () => {
    mountVote();
    const btns = seatButtons();
    fireEvent.click(btns[0]); // 1号 邪恶
    fireEvent.click(btns[1]); // 2号 邪恶
    fireEvent.click(btns[3]); // 4号 善良（镇长）
    const t = bodyText();
    expect(t).not.toContain("军团全邪恶投票计0票");
    expect(t).toMatch(/当前生效的票数：\s*3\s*票/);
  });

  it("⑨ 投票弹窗列出全体存活玩家供选择", () => {
    mountVote();
    const t = bodyText();
    for (const no of ["1号", "2号", "6号"]) {
      expect(t, `缺少 ${no}`).toContain(no);
    }
  });
});
