// @vitest-environment jsdom
/**
 * 🛡️ 僧侣结果页 · **断句与不溢出** 回归
 *
 * 用户实测（2026-09-14，附图）：
 *   「僧侣的技能结果显示 UI 有问题，断句不够合理。修改显示为 2 行，
 *     且确保在弹窗内显示。」
 *   截图症状：`僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响`
 *   **单行渲染 → 右侧被弹窗裁掉**。
 *
 * 根因：`InfoResultModal` 的单行分支用了 `whitespace-nowrap` + `text-7xl`，
 * 长句在 `AutoFitContent(minScale=0.55)` 收敛后**仍然溢出**。
 *
 * 修复：① 新增 `splitResultForDisplay` 按中文标点把长单句折成 2 行；
 *      ② 两个分支都允许折行（`whitespace-normal`/`break-words`）+ 限宽。
 *
 * 本文件钉死：
 *   ① 僧侣结果**渲染为 2 行**（DOM 里是 2 个独立 div）；
 *   ② 结果区**绝不能再出现 `whitespace-nowrap`**（防溢出回归）；
 *   ③ 结果容器带限宽类（`max-w-[86vw]`），保证在弹窗内；
 *   ④ 两行拼接后的纯文本 == 引擎原文（零字符丢失）。
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InfoResultModal } from "../InfoResultModal";

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

const MONK_PROTECTED =
  "僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响";

function renderResult(resultText: string, roleName = "15号-僧侣") {
  return render(
    <InfoResultModal
      roleName={roleName}
      resultText={resultText}
      onConfirm={() => {}}
      onModify={() => {}}
    />
  );
}

const bodyText = () => document.body.textContent || "";

describe("僧侣结果页 · 折 2 行", () => {
  it("⭐ 结果区渲染为 2 行（两个独立行 div）", () => {
    renderResult(MONK_PROTECTED);
    const t = bodyText();
    expect(t).toContain("僧侣保护了【1号】，");
    expect(t).toContain("该玩家今晚免受恶魔负面效果影响");

    // 折行后的两行应是**两个独立元素**（不是同一段文本自动换行）
    const lineDivs = Array.from(document.querySelectorAll("div")).filter(
      (d) =>
        d.children.length === 0 &&
        ["僧侣保护了【1号】，", "该玩家今晚免受恶魔负面效果影响"].includes(
          (d.textContent || "").trim()
        )
    );
    expect(lineDivs.length).toBe(2);
  });

  it("⭐ 结果区**不得**再有 whitespace-nowrap（防溢出回归）", () => {
    renderResult(MONK_PROTECTED);
    const html = document.body.innerHTML;
    // 渲染产物里不得出现 nowrap 类
    expect(html).not.toContain("whitespace-nowrap");
  });

  it("⭐⭐ 源码级护栏：InfoResultModal 的结果渲染**不得再出现** whitespace-nowrap", () => {
    // ⚠️ 上一条断言只覆盖"当前这条文本走的分支" —— 若某条结果走了别的分支
    //    （或折行器失效导致又回到单行分支），它可能漏检（已实测到假绿）。
    //    因此这里再加一道**源码扫描**：只允许注释里提到 whitespace-nowrap
    //    （作为历史说明），**不允许任何 className 使用它**。
    const src = readFileSync(
      resolve(__dirname, "../InfoResultModal.tsx"),
      "utf-8"
    );
    // 去掉注释后，检查 className 里是否仍使用 whitespace-nowrap
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "") // 块注释
      .replace(/^\s*\/\/.*$/gm, ""); // 行注释
    expect(
      withoutComments.includes("whitespace-nowrap"),
      "InfoResultModal 的 className 不得再使用 whitespace-nowrap（会导致长句溢出弹窗被裁）"
    ).toBe(false);
  });

  it("结果容器带限宽类（max-w-[86vw]），确保在弹窗内", () => {
    renderResult(MONK_PROTECTED);
    const html = document.body.innerHTML;
    expect(html).toContain("max-w-[86vw]");
  });

  it("允许折行：结果区含 break-words", () => {
    renderResult(MONK_PROTECTED);
    expect(document.body.innerHTML).toContain("break-words");
  });

  it("两行拼接（去空白）== 引擎原文，零字符丢失", () => {
    renderResult(MONK_PROTECTED);
    const norm = (x: string) => x.replace(/\s/g, "");
    // 结果页正文应包含原文全部字符
    expect(norm(bodyText())).toContain(norm(MONK_PROTECTED));
  });

  it("副标题（prefix）仍为「15号-僧侣获得信息」形态，未被折行逻辑破坏", () => {
    renderResult(MONK_PROTECTED);
    expect(bodyText()).toContain("获得信息");
  });
});

describe("僧侣醉酒/中毒结果页", () => {
  it("「试图保护…但未生效」同样折 2 行", () => {
    renderResult("僧侣试图保护【1号】，但自身醉酒/中毒未生效");
    const t = bodyText();
    expect(t).toContain("僧侣试图保护【1号】，");
    expect(t).toContain("但自身醉酒/中毒未生效");
    expect(document.body.innerHTML).not.toContain("whitespace-nowrap");
  });
});

describe("短结果不受影响（不误折）", () => {
  it("洗衣妇类短句仍单行渲染（不产生多余换行 div）", () => {
    renderResult("6号和9号其中一位是【占卜师】", "5号-洗衣妇");
    const t = bodyText();
    expect(t).toContain("6号和9号其中一位是【占卜师】");
    // 单行分支：内容应在一个叶子 div 里成句
    const leafHasFull = Array.from(document.querySelectorAll("div")).some(
      (d) =>
        d.children.length === 0 &&
        (d.textContent || "").trim() === "6号和9号其中一位是【占卜师】"
    );
    expect(leafHasFull).toBe(true);
  });
});
