// @vitest-environment jsdom
/**
 * 🎙️ 说书人「技能修正页」+ 恶魔结果页**信息隔离** 回归
 *
 * 用户实测（2026-09-14，附图）：
 *   恶魔技能结果页显示「小恶魔试图杀死【1号】，但未能造成伤亡」——
 *   结果页是**给玩家看的**，这直接泄漏"击杀失败"。
 *   用户要求：① 结果页不显示僧侣保护相关信息；
 *            ② 在结果页**之后**增加「技能修正页」，只说书人可见。
 *
 * 本文件钉死：
 *   ① 修正页渲染标题 + 详情 + 「说书人专用 · 请勿展示给玩家」安全标注；
 *   ② 确认按钮触发 onNext（并只触发一次）；
 *   ③ `correction` 为空时组件返回 null（不渲染空壳弹窗）；
 *   ④ 结果页的中性文案（"你选择了【1号】"）不含失败/保护字样。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { StorytellerCorrectionModal } from "../StorytellerCorrectionModal";
import {
  buildDemonKillCorrection,
  getDemonPlayerFacingResultText,
} from "../../../utils/storytellerCorrection";

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

afterEach(() => cleanup());

const bodyText = () => document.body.textContent || "";

const monkCorrection = buildDemonKillCorrection({
  reason: "monk_protection",
  targetLabel: "1号",
  demonLabel: "13号",
})!;

describe("🎙️ StorytellerCorrectionModal", () => {
  it("⭐ 渲染标题与详情（含「僧侣保护」真相）", () => {
    render(
      <StorytellerCorrectionModal
        correction={monkCorrection}
        roleName="13号-小恶魔"
        onNext={() => {}}
      />
    );
    const t = bodyText();
    expect(t).toContain("僧侣保护");
    expect(t).toContain("13号恶魔选择了【1号】");
    expect(t).toContain("今晚无人");
  });

  it("⭐ 顶部有醒目的「说书人专用 · 请勿展示给玩家」安全标注", () => {
    render(
      <StorytellerCorrectionModal
        correction={monkCorrection}
        roleName="13号-小恶魔"
        onNext={() => {}}
      />
    );
    const t = bodyText();
    expect(t).toContain("说书人专用");
    expect(t).toContain("请勿展示给玩家");
  });

  it("标题含角色名与「技能修正」", () => {
    render(
      <StorytellerCorrectionModal
        correction={monkCorrection}
        roleName="13号-小恶魔"
        onNext={() => {}}
      />
    );
    expect(bodyText()).toContain("技能修正");
    expect(bodyText()).toContain("13号-小恶魔");
  });

  it("⭐ 点「知道了，继续」触发 onNext（且仅一次）", () => {
    const onNext = vi.fn();
    render(
      <StorytellerCorrectionModal
        correction={monkCorrection}
        onNext={onNext}
      />
    );
    const btn = document.querySelector(
      '[data-testid="storyteller-correction-confirm"]'
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("⭐ correction 为空 → 组件返回 null（不渲染空壳）", () => {
    const { container } = render(
      <StorytellerCorrectionModal
        correction={null as any}
        onNext={() => {}}
      />
    );
    expect(container.innerHTML).toBe("");
    expect(bodyText()).not.toContain("技能修正");
  });

  it("士兵免疫变体：渲染「士兵」真相", () => {
    const soldierCorrection = buildDemonKillCorrection({
      reason: "soldier_immunity",
      targetLabel: "4号",
      demonLabel: "13号",
    })!;
    render(
      <StorytellerCorrectionModal
        correction={soldierCorrection}
        onNext={() => {}}
      />
    );
    const t = bodyText();
    expect(t).toContain("士兵");
    expect(t).toContain("4号");
  });
});

describe("🛡️ 恶魔结果页玩家可见文案（隔离检查）", () => {
  it("⭐ 中性文案渲染在结果页时不含「未能造成伤亡/僧侣/保护/士兵」", () => {
    const playerText = getDemonPlayerFacingResultText("1号");
    expect(playerText).toBe("你选择了【1号】");
    for (const forbidden of [
      "未能造成伤亡",
      "僧侣",
      "保护",
      "士兵",
      "死亡",
      "失败",
    ]) {
      expect(playerText).not.toContain(forbidden);
    }
  });
});
