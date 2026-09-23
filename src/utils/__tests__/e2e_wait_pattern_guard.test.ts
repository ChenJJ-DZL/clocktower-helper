/**
 * E2E 等待模式护栏（2026-09-22 新增，**棘轮：只许变小**）
 * ==================================================================
 * 背景：2026-09-22 全量 E2E 禁重试出现 3 条红，逐条复跑判定为**抖动**，
 *   报错 `TimeoutError: locator.click: Timeout 15000ms exceeded`，
 *   真根因是两类「点击后盲等/不等」写法：
 *     ① `btn.click(); await sleep(N);` 后**立刻**查条件 ⇒ React 慢一档就拿到旧 DOM；
 *     ② `locator.click()` 之后 `waitForTimeout(N)` ⇒ 同上，且**失败点会漂到下游**
 *        （超时发生在别处，根因被藏起来，排查成本极高）。
 *   ⇒ 正确写法见 `e2e/helpers/e2e_inpage.ts`（`waitFor` / `clickAndSettle` / `clickUntil`）
 *     与 `scriptFlow.enterScriptConfig`（点完**验证效果**、不生效就重试）。
 *
 * 本护栏把当前存量**登记为基线**，并保证：
 *   · 新增 `click → 盲等` 模式 ⇒ 变红（不许再加）；
 *   · 存量被修掉 ⇒ 也变红（提示把基线**下调** —— 棘轮只许变小，防"悄悄放松"）。
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/** 当前基线（2026-09-22 实测统计）。**只允许下调**。 */
const BASELINE = {
  /** `.click();` 后紧跟 `await sleep(` —— 最难排查的一类 */
  blindSleepAfterClick: 14,
  /** `.click(...)` 后紧跟 `await page.waitForTimeout(` */
  waitForTimeoutAfterClick: 13,
};

const PATTERNS: Array<{ key: keyof typeof BASELINE; re: RegExp; hint: string }> = [
  {
    key: "blindSleepAfterClick",
    re: /\.click\(\);\s*\n\s*await sleep\(/g,
    hint: "改成：点完用 waitFor 等**预期条件**成立，或用 clickAndSettle 等页面签名变化（e2e/helpers/e2e_inpage.ts）",
  },
  {
    key: "waitForTimeoutAfterClick",
    re: /\.click\([^)]*\);\s*\n\s*await page\.waitForTimeout\(/g,
    hint: "同上；若确实是幂等点击，也请用 clickAndSettle 并写清理由",
  },
];

function collectE2eFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectE2eFiles(p, out);
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("E2E 等待模式护栏（棘轮：只许变小）", () => {
  const e2eDir = path.resolve(process.cwd(), "e2e");
  const files = fs.existsSync(e2eDir) ? collectE2eFiles(e2eDir) : [];

  it("e2e 目录必须可读（否则本护栏是空转）", () => {
    expect(files.length, "❌ 没扫到任何 e2e 文件 —— 护栏形同虚设").toBeGreaterThan(10);
  });

  for (const { key, re, hint } of PATTERNS) {
    it(`${key} 不得超过基线 ${BASELINE[key]}（棘轮只许下调）`, () => {
      const hits: Array<{ file: string; count: number }> = [];
      let total = 0;
      for (const f of files) {
        const src = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
        const n = (src.match(re) ?? []).length;
        if (n > 0) {
          hits.push({ file: path.relative(process.cwd(), f), count: n });
          total += n;
        }
      }

      const detail = hits
        .sort((a, b) => b.count - a.count)
        .map((h) => `    ${h.count} × ${h.file}`)
        .join("\n");

      expect(
        total,
        `❌ 「${key}」共 ${total} 处，**超过**基线 ${BASELINE[key]}（新增了"点击后盲等"写法）。\n` +
          `${hint}\n` +
          `  当前分布：\n${detail}`
      ).toBeLessThanOrEqual(BASELINE[key]);

      expect(
        total,
        `⚠️ 「${key}」已降到 ${total} 处（基线 ${BASELINE[key]}）—— ` +
          `**请把本文件里的基线同步下调**（棘轮只许变小，防止悄悄放松）`
      ).toBe(BASELINE[key]);
    });
  }
});
