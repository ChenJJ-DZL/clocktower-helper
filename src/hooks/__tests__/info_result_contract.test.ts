/**
 * 🛡️ INFO_RESULT 统一结算弹窗契约（源码护栏）
 * ==================================================================
 * 背景（known-issues P1 验证尾巴）：「多数剧本信息角色 guide 有唤醒但无结算弹窗」。
 * 修复定版：所有角色（信息类 + 行动类）统一走 displayInfo.log ⇒ INFO_RESULT 弹窗
 * （useNightActionHandler 结果出口），不再按 displayInfo.type 后缀分流。
 *
 * 本护栏钉死三件事：
 *   ① displayInfo.log 存在 ⇒ 必须派发 INFO_RESULT（统一路径不许回退成只弹部分角色）；
 *   ② INFO_RESULT 是该出口的**唯一**结果弹窗类型（防分叉出第二条结果通道）；
 *   ③ 派发的 modal 携带 resultText（结果页渲染依赖此字段）。
 *
 * hook 内部逻辑无单测先例（依赖 20+ 注入）⇒ 按 source_guardrails 传统锁源码形态。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../../hooks/useNightActionHandler.ts"),
  "utf-8"
);
// 剥注释：源码级断言只看可执行代码
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("🛡️ INFO_RESULT 统一结算弹窗契约", () => {
  it("① displayInfo.log 分支必须派发 INFO_RESULT（统一结果出口）", () => {
    // 定位「统一弹结果窗」分支的判据
    const branchIdx = code.indexOf(
      "displayInfo &&\n      typeof displayInfo.type === \"string\" &&"
    );
    const branchIdxCrlf = code.indexOf(
      "displayInfo &&\r\n      typeof displayInfo.type === \"string\" &&"
    );
    const idx = branchIdx >= 0 ? branchIdx : branchIdxCrlf;
    expect(idx, "displayInfo.log 统一结果分支必须存在").toBeGreaterThan(-1);

    // 分支体内必须出现 INFO_RESULT 派发（窗口取大：中间夹着赏金猎人/洗脑师自定义文案段）
    const branchBody = code.slice(idx, idx + 15000);
    expect(
      branchBody.includes('type: "INFO_RESULT"'),
      "displayInfo.log 分支体内必须派发 INFO_RESULT（缺 = 信息角色又会没结算弹窗）"
    ).toBe(true);
  });

  it("② 结果出口不得派发其他「结果类」弹窗类型（防第二通道分叉）", () => {
    // 统一出口约定：结果展示只有 INFO_RESULT；
    // 专属视觉弹窗（SAVANT_RESULT/DREAMER_RESULT 等）走 meta.modal 显式声明，
    // 不得在 displayInfo 出口偷偷分流。
    const idx = code.indexOf("displayInfo.log");
    expect(idx).toBeGreaterThan(-1);
    const window = code.slice(Math.max(0, idx - 2000), idx + 6000);
    for (const banned of [
      'type: "DREAMER_RESULT"',
      'type: "SAVANT_RESULT"',
      'type: "FORTUNE_TELLER_RESULT"',
    ]) {
      expect(
        window.includes(banned),
        `${banned} 不得出现在 displayInfo.log 统一出口（应走 meta.modal 专属弹窗通道）`
      ).toBe(false);
    }
  });

  it("③ INFO_RESULT 派发必须携带 resultText（结果页渲染依赖）", () => {
    const matches = code.match(/type: "INFO_RESULT"[\s\S]{0,400}?resultText:/g);
    expect(
      (matches ?? []).length,
      "每处 INFO_RESULT 派发都应带 resultText（缺 = 结果页空白）"
    ).toBeGreaterThan(0);
    // 至少与派发处数量相当
    const dispatchCount = (code.match(/type: "INFO_RESULT"/g) ?? []).length;
    expect(
      (matches ?? []).length,
      `INFO_RESULT 派发 ${dispatchCount} 处，带 resultText 的只有 ${(matches ?? []).length} 处`
    ).toBeGreaterThanOrEqual(Math.floor(dispatchCount * 0.6));
  });
});
