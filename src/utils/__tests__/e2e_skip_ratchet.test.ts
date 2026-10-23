/**
 * 🛡️ E2E 条件 skip 计数棘轮（假绿护栏）
 * ==================================================================
 * 背景：e2e/ 存在 23 处条件 `test.skip(...)`（间谍「查看魔典」等不可自动驱动步骤）。
 * 这类 skip 是"跑过 ≠ 验证过"的假绿来源 —— 条件命中时用例静默跳过、报告仍是绿的。
 *
 * 本护栏不消除 skip（那些步骤确实不可自动驱动），但**冻结数量**：
 *   任何新增条件 skip 必须同步抬升本基线（并在注释里写明原因），
 *   否则测试直接报红 —— 让"假绿范围扩大"变成显式决策，而不是无声漂移。
 *
 * 判据：扫描 e2e 目录下全部 .spec.ts 源码中的 `test.skip(` / `test.fixme(` 调用。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const E2E_DIR = resolve(__dirname, "../../../e2e");

/**
 * ⚠️ 基线：2026-10-20 全量审查清点 = 23 处。只许减、不许无声增。
 *
 * 🔻 2026-10-23 二次清理：将 18 处条件 skip（15 处间谍兜底 + 1 处酒鬼随机 +
 *   1 处洗脑师入队概率采样 + 1 处连续 3 局首夜失败掩盖）全部改造为固定阵容或硬断言，
 *   全仓仅保留 **1 处** 自证式 `-g` 单跑过滤守卫：
 *    1 × `full_sim/terminal_state` 被 `-g` 过滤未跑 X05 矩阵时不做分布汇总断言
 */
const SKIP_BASELINE = 1;

function collectSpecs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...collectSpecs(p));
    } else if (name.endsWith(".spec.ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("🛡️ E2E 条件 skip 棘轮（防假绿扩大）", () => {
  it(`条件 skip 数量不得超出基线 ${SKIP_BASELINE}（新增必须显式抬升基线）`, () => {
    const specs = collectSpecs(E2E_DIR);
    let total = 0;
    const hits: string[] = [];
    for (const p of specs) {
      const src = readFileSync(p, "utf-8")
        // 剥注释：注释里提到 test.skip 不算
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const n = (src.match(/test\.(skip|fixme)\(/g) ?? []).length;
      if (n > 0) {
        hits.push(`${p.split("e2e")[1]} × ${n}`);
        total += n;
      }
    }
    expect(
      total,
      `条件 skip 已超基线（${total} > ${SKIP_BASELINE}）。\n` +
        `新增的 skip 都是假绿风险：要么让步骤可驱动，要么显式抬升 SKIP_BASELINE 并写明原因。\n` +
        `分布：\n${hits.join("\n")}`
    ).toBeLessThanOrEqual(SKIP_BASELINE);
  });

  it("基线不为零时必须保留分布记录（文件级）", () => {
    // 反向护栏：若某天 skip 被清零，提示可以退役本棘轮（防止护栏变僵尸）
    const specs = collectSpecs(E2E_DIR);
    let total = 0;
    for (const p of specs) {
      const src = readFileSync(p, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      total += (src.match(/test\.(skip|fixme)\(/g) ?? []).length;
    }
    if (total === 0) {
      throw new Error(
        "条件 skip 已清零 —— 本棘轮可退役（删除本文件），或把 SKIP_BASELINE 改为 0 收紧。"
      );
    }
    expect(total).toBeGreaterThan(0);
  });
});
