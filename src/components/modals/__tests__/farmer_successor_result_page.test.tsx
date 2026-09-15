// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { InfoResultModal } from "../InfoResultModal";
import { buildFarmerSuccessorGuide } from "../../../utils/farmerSuccession";

/**
 * 🌾 农夫死亡传承结果页 —— **真实组件挂载**级回归（2026-09-14 用户实测缺陷）
 *
 * 用户原话：「这里不应该是只显示农夫获得消息，当夜晚农夫死亡，产生新农夫时，
 *          应该直接引导说书人，第一行的「农夫获得信息」应该修改为
 *          「唤醒XX号玩家，告知他/她：」。第二行的信息不变。」
 *
 * 与 `utils/__tests__/farmer_guide_directive.test.ts`（纯函数层）的区别：
 * 本文件走 **InfoResultModal 完整渲染链路**（jsdom + ModalWrapper portal），
 * 断言用户**真正看到的**两行文字 —— 防止"解析器对了但渲染时又被加工坏"。
 */

// jsdom 缺 ResizeObserver（AutoFitContent 依赖）
beforeEach(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const allText = () => document.body.textContent ?? "";

describe("农夫传承结果页 · 真实组件渲染", () => {
  it("第一行 = 「唤醒XX号玩家，告知他/她：」（XX = 新农夫 5号），第二行 = 身份变化正文", () => {
    cleanup();
    // 死掉的旧农夫坐在 1 号（roleName = "1号-农夫"），新农夫是 4 号索引 = 5号
    render(
      <InfoResultModal
        roleName="1号-农夫"
        resultText={buildFarmerSuccessorGuide(4)}
        onConfirm={vi.fn()}
        onModify={vi.fn()}
      />
    );
    const t = allText();

    // ✅ 第一行：引导说书人唤醒**新农夫**
    expect(t).toContain("唤醒5号玩家，告知他/她：");
    // ⛔ 绝不能退回旧的「农夫获得信息」
    expect(t).not.toContain("农夫获得信息");
    // ⛔ 绝不能把旧农夫（1号）当唤醒对象（误导说书人叫一个死人）
    expect(t).not.toContain("唤醒1号玩家");
    // ✅ 第二行：该告诉新农夫的话（与用户要求「第二行的信息不变」一致）
    expect(t).toContain("你的身份变为【农夫】");
    // ⛔ 不得把引导语漏进大字 —— 判据是「告知他/她：」在整页里只出现**一次**。
    //    （不能直接搜 "/她："：那本来就是正确第一行的组成部分。）
    const occurrences = t.split("告知他/她：").length - 1;
    expect(occurrences).toBe(1);
  });

  it("不同座位号同样成立（防止把 XX 写死成某个值）", () => {
    cleanup();
    render(
      <InfoResultModal
        roleName="2号-农夫"
        resultText={buildFarmerSuccessorGuide(11)}
        onConfirm={vi.fn()}
        onModify={vi.fn()}
      />
    );
    expect(allText()).toContain("唤醒12号玩家，告知他/她：");
    expect(allText()).not.toContain("农夫获得信息");
  });
});
