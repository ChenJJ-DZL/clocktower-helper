/**
 * 圆桌中央面板「不压座位环」结构护栏（2026-10-19）
 * ==================================================================
 * 背景：iPhone 横屏下，中央面板（.compass-ring）与座位环发生视觉重叠。
 *   实测（temp/measure_ui.mjs，15 人局 · 罂粟花开）：
 *     · base     面板 594×284 → 四角对内沿归一化 1.018（贴边）
 *     · traveler 展开旅行者行后 530×344 → 0.986，且与 2/13 号座位实交 346px²
 *     · fabled   三按钮换行后 556×331 → 1.005，实交 487px²
 *   修法：面板纵向压缩 + 旅行者行改单行胶囊 + 按钮行限宽换行 + 三按钮文案瘦身。
 *   修后 3 场景 × 双主题 × 双视口 12 组全部 inner < 1.0 且 overlap 为空。
 *
 * ⚠️ 几何本身只能真浏览器量（见 temp/measure_ui.mjs）。本护栏钉住
 *    「让几何不再回退」的四条结构约束，任何一条被改动都可能重新压到座位：
 *      ① 面板容器 px-4 py-4（纵向预算）
 *      ② 按钮行 flex-wrap + max-w-[520px]（三按钮时换行而非撑宽）
 *      ③ 旅行者槽位单行胶囊（min-w-[92px] + py-0.5，禁 flex-col / text-2xl）
 *      ④ 说书人按钮不再挂「77号位(传奇)」长注记（约 72px，逼出换行）
 *
 * 🔴 源码级断言必须先剥注释（元教训 6）：本文件的说明文字会复述被禁的字面量，
 *    直接对整块源码 toContain / not.toContain 会自欺。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../../..");
const RAW = readFileSync(
  resolve(ROOT, "src/components/game/board/TableCenterHUD.tsx"),
  "utf-8"
);

/** 剥掉 JSX 块注释与行注释，避免说明文字污染断言 */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SRC = stripComments(RAW);

describe("中央面板不压座位环 · 结构护栏", () => {
  it("① 面板容器保持 px-4 py-4 纵向预算", () => {
    const m = SRC.match(/className=\{`compass-ring[^`]*`\}/);
    expect(m, "找不到 compass-ring 容器").toBeTruthy();
    expect(m![0]).toContain("px-4 py-4");
  });

  it("② 说书人/旅行者按钮行限宽 + 允许换行（三按钮场景不撑宽面板）", () => {
    expect(SRC).toContain("flex-wrap max-w-[540px]");
    // 限宽必须落在该行的 className 上，而不是别处
    const idx = SRC.indexOf("flex-wrap max-w-[540px]");
    const around = SRC.slice(Math.max(0, idx - 120), idx + 40);
    expect(around).toMatch(/flex items-center justify-center gap-2/);
  });

  it("③ 旅行者槽位是单行紧凑胶囊（禁两行 flex-col / text-2xl）", () => {
    const start = SRC.indexOf("showTravelerRow && (");
    const end = SRC.indexOf("流放投票进行中", start);
    expect(start, "找不到旅行者座位行").toBeGreaterThan(-1);
    expect(end, "找不到旅行者行结束锚点").toBeGreaterThan(start);
    const block = SRC.slice(start, end);
    expect(block).toContain("min-w-[92px]");
    expect(block).toContain("py-0.5");
    expect(block).not.toContain("flex-col");
    expect(block).not.toContain("text-2xl");
  });

  it("④ 说书人按钮不再挂虚拟座位号长注记（避免逼出换行）", () => {
    const start = SRC.indexOf("说书人 · 传奇");
    expect(start).toBeGreaterThan(-1);
    const zone = SRC.slice(start, start + 400);
    // 该按钮内不得再渲染 FABLED_SEAT_LABEL（虚拟座位号仍保留在操作日志与 title 中）
    expect(zone).not.toContain("FABLED_SEAT_LABEL");
  });
});
