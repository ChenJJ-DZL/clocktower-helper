/**
 * 🔒 现代主题「投影策略 / 信箱区 / iOS 视口」契约（源码级防回归）
 *
 * 用户裁定（2026-10-15）：
 *   ① 「当前的投影效果太强了，不需要，除了按钮外，不允许有投影，
 *      按钮的投影也要大幅缩小，仅作微弱且范围很小的投影效果。」
 *   ② 「座位也不要添加颜色，最多用描边的形式来区分阵营，座位圆圈本身要是白色的。」
 *   ③ 手机横屏需与 WEB 端保持统一（布局 1:1、信息完整），只做桌面不可见的纯修正。
 *
 * 派生的四条铁律（本测试逐一钉死）：
 *   A. **只抹平具名 shadow 工具类**（[class~="shadow-*"] 精确 token），
 *      **绝不匹配 arbitrary 值 `shadow-[0_0_40px_...]`** —— 那是夜行行动者黄圈、
 *      提名/被提名光环、待选绿框等功能态反馈，属功能而非装饰。
 *      （历史事故：W10.14.4 只处理 shadow-2xl，其余具名投影继续生效。）
 *   B. 投影规则必须包进 `@layer utilities`：layered important 高于 unlayered important
 *      （层序反转铁律），否则压不住 Tailwind 的 `shadow-*` 与 `!shadow-[...]`。
 *   C. 座位代币：`background` 必须仍是 `var(--paper-0)`（纯白），阵营只靠 `border-color`
 *      描边区分；**不得再出现装饰性 box-shadow**（彩色外环 / 浮影）。
 *   D. 信箱区与 iOS 视口：`data-scale-layout="root"` 必须存在且被两处渲染分支覆盖；
 *      `h-screen` 必须已换成 `h-dvh`，并有 `@supports not (height: 100dvh)` 兜底。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const GLOBALS_RAW = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const SCALE_LAYOUT_RAW = readFileSync(
  join(ROOT, "src/components/layout/ScaleLayout.tsx"),
  "utf8"
);

// 剥注释：解释性注释常复述被删掉的旧值，直接全文件 not.toContain 会自欺假失败
const CSS = GLOBALS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
const CLASS_NAMES = [...SCALE_LAYOUT_RAW.matchAll(/className="([^"]*)"/g)].map(
  (m) => m[1]
);

/** 取现代主题座位代币相关的 CSS 片段（base + 4 条 glow-*） */
const seatRules = (() => {
  const start = CSS.indexOf(".theme-modern .seat-token {");
  const end = CSS.indexOf(".theme-modern .seat-token.glow-demon", start);
  return CSS.slice(start, end > start ? end + 200 : start + 1200);
})();

describe("A. 投影只抹平具名工具类，不碰功能态 arbitrary 值", () => {
  it("① 必须用 [class~=\"shadow-*\"] 精确 token 匹配（7 个具名家族）", () => {
    for (const k of [
      "shadow-2xs", "shadow-xs", "shadow-sm", "shadow-md",
      "shadow-lg", "shadow-xl", "shadow-2xl",
    ]) {
      expect(CSS).toContain(`[class~="${k}"]`);
    }
  });

  it("② 禁用宽泛的 [class*=\"shadow...\"]（会误伤 shadow-[...] 功能态）", () => {
    // 允许既有的 inset 专项：`[class*="shadow-[inset"]` 子串限定 inset，抓不到 shadow-[0_0_...]
    const broad = [...CSS.matchAll(/\[class\*="shadow[^"]*"\]/g)].map((m) => m[0]);
    for (const b of broad) {
      expect(b, `禁止宽泛匹配：${b}`).toContain("inset");
    }
  });

  it("③ 座位状态高亮（shadow-[0_0_...]）在源码中必须仍然存在", () => {
    const SEAT = readFileSync(join(ROOT, "src/components/SeatNode.tsx"), "utf8");
    // 夜行行动者黄圈 / 提名 / 被提名 / 待选 / 双死等
    expect(SEAT).toMatch(/!shadow-\[0_0_50px_rgba\(253,224,71/);
    expect(SEAT).toMatch(/shadow-\[0_0_40px_rgba\(255,255,255/);
    expect(SEAT).toMatch(/shadow-\[0_0_40px_rgba\(250,204,21/);
  });
});

describe("B. 投影规则必须在 @layer utilities 内（层序反转铁律）", () => {
  it("① 抹平段与按钮例外段都在 utilities 层", () => {
    const i = CSS.indexOf('[class~="shadow-2xs"]');
    expect(i).toBeGreaterThan(-1);
    const before = CSS.lastIndexOf("@layer utilities", i);
    expect(before).toBeGreaterThan(-1);
    // 两者之间不应出现层结束
    const between = CSS.slice(before, i);
    expect((between.match(/\{/g) || []).length).toBeGreaterThan(
      (between.match(/\}/g) || []).length - 1
    );
  });

  it("② 按钮例外必须以 button.X 形态给出更高特异性（压过抹平段）", () => {
    expect(CSS).toMatch(/\.theme-modern button\[class~="shadow-2xs"\]/);
    expect(CSS).toMatch(/\.theme-modern button\.btn-arcane-primary/);
    expect(CSS).toMatch(/\.theme-modern button\.btn-arcane-info/);
  });

  it("③ 按钮投影必须「微弱且范围很小」（模糊 ≤4px 且 alpha ≤0.1）", () => {
    const m = CSS.match(
      /\.theme-modern button\.btn-arcane-primary,\s*\.theme-modern button\.btn-arcane-info\s*\{\s*box-shadow:\s*([^;]+);/
    );
    expect(m, "必须存在按钮弱投影规则").not.toBeNull();
    const val = m![1];
    const alphas = [...val.matchAll(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/g)].map((x) => +x[1]);
    const blurs = [...val.matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => +x[1]);
    expect(alphas.length, "必须是带 alpha 的 rgba 阴影").toBeGreaterThan(0);
    expect(Math.max(...alphas), "alpha 必须 ≤0.1（微弱）").toBeLessThanOrEqual(0.1);
    expect(Math.max(...blurs), "模糊半径必须 ≤4px（范围很小）").toBeLessThanOrEqual(4);
  });

  it("④ 主动作按钮原有的 `0 6px 18px rgba(21,128,61,.28)` 绿色大投影必须已删除", () => {
    expect(CSS).not.toMatch(/0 6px 18px rgba\(21, 128, 61/);
  });
});

describe("C. 座位代币：白底 + 仅描边，无装饰投影", () => {
  it("① 底座必须仍是纯白 var(--paper-0)", () => {
    expect(seatRules).toMatch(/\.theme-modern \.seat-token \{\s*background:\s*var\(--paper-0\)/);
  });

  it("② 四条 glow-* 必须仍以 border-color 区分阵营（描边唯一手段）", () => {
    for (const k of ["townsfolk", "outsider", "minion", "demon"]) {
      const re = new RegExp(
        `\\.theme-modern \\.seat-token\\.glow-${k} \\{\\s*border-color:\\s*var\\(--align-${k}\\);`
      );
      expect(CSS, `glow-${k} 必须只设 border-color`).toMatch(re);
    }
  });

  it("③ 座位代币不得再出现装饰性 box-shadow（彩环 / --sh2）", () => {
    expect(seatRules).not.toMatch(/box-shadow/);
    expect(seatRules).not.toMatch(/0 0 0 3px/);
    expect(seatRules).not.toMatch(/var\(--sh2\)/);
  });

  it("④ --sh2 / --sh3 不得再被任何 box-shadow 声明引用", () => {
    expect(CSS).not.toMatch(/box-shadow:[^;]*var\(--sh3\)/);
    expect(CSS).not.toMatch(/box-shadow:[^;]*var\(--sh2\)/);
  });

  it("⑤ 座位号牌（按钮）保留微弱投影，不是 none", () => {
    expect(CSS).toMatch(
      /\.theme-modern \.seat-node \.rounded-full\.border-2\.bg-slate-800 \{[\s\S]*?box-shadow:\s*0 1px 2px rgba\(17, 17, 17, 0\.05\)/
    );
  });
});

describe("D. 信箱区与 iOS 视口", () => {
  it("① 现代主题信箱区必须刷成 --paper，且经典主题不得有此规则", () => {
    expect(CSS).toMatch(
      /\.theme-modern div\[data-scale-layout="root"\] \{\s*background-color:\s*var\(--paper\);/
    );
    expect(CSS).not.toMatch(/\.theme-classic div\[data-scale-layout="root"\]/);
  });

  it("② ScaleLayout 两个渲染分支都必须挂 data-scale-layout=\"root\"", () => {
    // ⚠️ 必须剥注释后计数：说明性注释里也复述了该字符串，
    //    若不剥注释则「删掉一处 JSX 属性」的变异体会算成 2 处而漏检（实测踩坑 M7）。
    const code = SCALE_LAYOUT_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
    const n = (code.match(/data-scale-layout="root"/g) || []).length;
    expect(n, "两个 return 分支各需一处，且注释不计入").toBe(2);
  });

  it("③ 外层高度必须用 h-dvh，且源码里不得再有 h-screen", () => {
    expect(CLASS_NAMES.some((c) => c.includes("h-dvh"))).toBe(true);
    expect(CLASS_NAMES.some((c) => c.includes("h-screen"))).toBe(false);
  });

  it("④ 必须有 @supports not (height: 100dvh) 兜底", () => {
    expect(CSS).toContain("@supports not (height: 100dvh)");
    expect(CSS).toMatch(/\[data-scale-layout="root"\] \{\s*height:\s*100vh/);
  });

  it("⑤ 不得引入移动端专属的按钮/字号放大（用户明确否决）", () => {
    // 上一轮失败版的核心特征：blanket min-height 与 /var(--stage-scale) 反推
    expect(CSS).not.toMatch(/min-height:\s*calc\(44px/);
    expect(CSS).not.toMatch(/--stage-scale/);
    expect(SCALE_LAYOUT_RAW).not.toContain("--stage-scale");
  });
});
