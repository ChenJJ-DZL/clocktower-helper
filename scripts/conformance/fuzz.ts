#!/usr/bin/env node
/**
 * L4 · 整局随机仿真（fuzz）CLI
 * ======================================================================
 * 为什么需要这一层：
 *   静态审计（L1）只能看声明，官方范例（L3）只能看单点能力；
 *   "整局跑下来会不会出现非法状态"必须靠随机仿真把
 *   **座位 × 角色 × 中毒/醉酒 × 死亡/复活 × 昼夜推进** 的组合空间交给机器。
 *
 * 执行逻辑在 `lib/fuzzRunner.ts`（CI 门禁用同一份，避免两个口径）。
 *
 * 用法：
 *   npx tsx scripts/conformance/fuzz.ts                    # 默认 2 剧本池 × 6 局 × 4 夜
 *   npx tsx scripts/conformance/fuzz.ts --games 20          # 加大样本
 *   npx tsx scripts/conformance/fuzz.ts --pools bmr         # 只跑指定剧本池
 *   npx tsx scripts/conformance/fuzz.ts --verbose           # 打印逐局结果
 *
 * 产物：outputs/rule_conformance/fuzz_report.json（gitignore；指标进 audit 台账）
 * 退出码：0 = 无违例；1 = 存在违例（必须修规则或修不变式）
 */
import fs from "node:fs";
import path from "node:path";
import { runFuzz } from "./lib/fuzzRunner";

const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, "outputs", "rule_conformance", "fuzz_report.json");

function readFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const games = Number(readFlag("--games") ?? 6);
  const pools = (readFlag("--pools") ?? "bmr,sv").split(",").filter(Boolean);
  const seedBase = Number(readFlag("--seed-base") ?? 20261101);
  const playerCount = Number(readFlag("--players") ?? 9);
  const nights = Number(readFlag("--nights") ?? 4);
  const verbose = process.argv.includes("--verbose");

  const report = await runFuzz({
    games,
    pools,
    seedBase,
    playerCount,
    nights,
    verbose,
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("");
  console.log("🎲 L4 整局随机仿真（不变式 I1–I11）");
  console.log(
    `   ${report.config.pools.join(" / ")} · ${report.games} 局 × ${nights} 夜 · 动作 ${report.actions}`
  );
  console.log(
    `   不变式违例 ${report.violations}${report.violations === 0 ? " ✅" : " ❌"}`
  );
  if (report.violations > 0) {
    for (const [invariant, count] of Object.entries(report.byInvariant).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`     - ${invariant}: ${count}`);
    }
    console.error(`❌ 存在不变式违例（详见 ${path.relative(ROOT, OUT_FILE)}）`);
    process.exit(1);
  }
  console.log(`   台账：${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((error) => {
  console.error(
    `❌ fuzz 执行失败：${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
