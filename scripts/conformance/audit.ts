#!/usr/bin/env node
/**
 * 规则一致性系统 · 第 2 步：全量静态审计 + 棘轮门禁
 * ======================================================================
 * 用法：
 *   npx tsx scripts/conformance/audit.ts                  # 审计 + 与基线比对
 *   npx tsx scripts/conformance/audit.ts --write-baseline # 更新棘轮基线（人审后使用）
 *   npx tsx scripts/conformance/audit.ts --migrate-baseline [--accept-new]
 *                                                        # 旧格式基线（`check|role`）迁移到
 *                                                        # `severity|check|role`（拒绝猜测）
 *   npx tsx scripts/conformance/audit.ts --strict         # 有任何 P0 即退出码 1（发版门禁）
 *
 * 产物：
 *   outputs/rule_conformance/official_spec.json  官方规范（由 extract-spec 生成/本脚本内联生成）
 *   outputs/rule_conformance/ledger.json         逐角色台账（机器可读）
 *   outputs/rule_conformance/report.md           人读报告
 *   outputs/rule_conformance/baseline.json       棘轮基线（**提交到仓库**）
 *
 * 退出码：0 = 无回归；1 = 出现新 finding / 覆盖指标下降 / （--strict 时）存在 P0。
 */
import fs from "node:fs";
import path from "node:path";
import {
  BASELINE_SCHEMA_VERSION,
  compareWithBaseline,
  findingSignatures,
  migrateBaselineSignatures,
  reportMetrics,
  runConformanceAudit,
} from "./lib/audit";
import { collectTestEvidence } from "./lib/evidence";
import { collectE2eAssertions } from "./lib/e2eAssertions";
import { exampleCoverage } from "./lib/examples";
import { runFuzz } from "./lib/fuzzRunner";
import { buildImplInventory } from "./lib/impl";
import { runSemanticAudit } from "./lib/ruleAtoms";
import { extractOfficialSpec } from "./lib/spec";
import { loadWaivers, unusedWaivers } from "./lib/waivers";
import type {
  ConformanceBaseline,
  ConformanceFinding,
  ConformanceReport,
} from "./lib/types";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "outputs", "rule_conformance");
const SPEC_FILE = path.join(OUT_DIR, "official_spec.json");
const LEDGER_FILE = path.join(OUT_DIR, "ledger.json");
const REPORT_FILE = path.join(OUT_DIR, "report.md");
const BASELINE_FILE = path.join(OUT_DIR, "baseline.json");

const ARGS = new Set(process.argv.slice(2));
const WRITE_BASELINE = ARGS.has("--write-baseline");
/**
 * 旧格式基线（`check|role`，无 severity）→ 现行格式的一次性迁移。
 * 只做机械换前缀；任何无法唯一对齐的旧签名都会让迁移失败（fail-closed）。
 */
const MIGRATE_BASELINE = ARGS.has("--migrate-baseline");
/** 允许把"当前新增的 finding"一并写入基线（人审后使用，会打印清单） */
const ACCEPT_NEW = ARGS.has("--accept-new");
const STRICT = ARGS.has("--strict");

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readBaseline(): ConformanceBaseline | null {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as ConformanceBaseline;
  } catch {
    return null;
  }
}

/** L5 变异测试基线（存在 outputs/rule_conformance/mutation_report.json 时读取） */
function readMutationBaseline(): { killed: number; total: number } | undefined {
  const file = path.join(OUT_DIR, "mutation_report.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const report = JSON.parse(fs.readFileSync(file, "utf8")) as {
      killed?: number;
      total?: number;
    };
    if (typeof report.killed !== "number" || typeof report.total !== "number") {
      return undefined;
    }
    return { killed: report.killed, total: report.total };
  } catch {
    return undefined;
  }
}

function groupFindings(findings: ConformanceFinding[]): Array<{
  check: string;
  severity: string;
  count: number;
  examples: string;
}> {
  const map = new Map<
    string,
    { check: string; severity: string; count: number; roles: string[] }
  >();
  for (const finding of findings) {
    const key = `${finding.severity}|${finding.check}`;
    const entry = map.get(key) ?? {
      check: finding.check,
      severity: finding.severity,
      count: 0,
      roles: [],
    };
    entry.count++;
    if (finding.roleNameCn || finding.roleId) {
      entry.roles.push(`${finding.roleNameCn ?? finding.roleId}`);
    }
    map.set(key, entry);
  }
  return [...map.values()]
    .sort((a, b) => {
      const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2, INFO: 3 };
      const diff = rank[a.severity] - rank[b.severity];
      return diff !== 0 ? diff : b.count - a.count;
    })
    .map((entry) => ({
      check: entry.check,
      severity: entry.severity,
      count: entry.count,
      examples: entry.roles.slice(0, 6).join("、"),
    }));
}

function buildMarkdown(
  report: ConformanceReport,
  comparison: ReturnType<typeof compareWithBaseline> | null,
  baseline: ConformanceBaseline | null,
  unusedWaiverCount: number
): string {
  const { stats, verdict } = report;
  const lines: string[] = [];
  lines.push("# 规则一致性审计报告（静态可判定维度）");
  lines.push("");
  lines.push(`- 生成时间：\`${report.generatedAt}\``);
  lines.push("- 官方规范：`json/full/*.json`（只读归一化）");
  lines.push("- 项目实现：`app/data.ts::roles` + `src/roles/new_engine/abilityRegistry`");
  lines.push("- 证据扫描：`src/**/__tests__`、`tests/**`、`e2e/**` 与 `outputs/coverage_ledger.json`");
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  lines.push(`- **静态维度严格符合官方规则：${verdict.strictlyConformant ? "✅ 是" : "❌ 否"}**（阻断项 P0 = ${verdict.blockerCount}）`);
  lines.push(`- ${verdict.note}`);
  if (comparison) {
    if (comparison.needsMigration) {
      lines.push(
        "- ❌ 棘轮基线格式过期（旧签名 `check|role`）：本次**未做回归判定**，请运行 `--migrate-baseline`"
      );
    } else {
      lines.push(
        `- 棘轮比对：新 finding ${comparison.newFindings.length} · 已修复 ${comparison.fixedFindings.length} · 覆盖指标下降 ${comparison.metricRegressions.length}`
      );
    }
  } else if (baseline) {
    lines.push("- 棘轮基线：已加载（本次为基线写入模式）");
  } else {
    lines.push("- ⚠️ 尚未建立棘轮基线（首次请运行 `--write-baseline`）");
  }
  lines.push("");
  lines.push("## 覆盖指标");
  lines.push("");
  lines.push("| 指标 | 数值 |");
  lines.push("| :--- | ---: |");
  lines.push(`| 官方唯一角色 | ${stats.officialRoles} |`);
  lines.push(`| 项目角色 | ${stats.implRoles} |`);
  lines.push(`| 已映射到官方规范 | ${stats.mappedRoles} |`);
  lines.push(`| 内置剧本角色查不到官方规范（P1） | ${stats.implWithoutSpec} |`);
  lines.push(`| 官方角色未实现（INFO） | ${stats.officialNotImplemented} |`);
  lines.push(`| 类型可比 / 不一致（P0） | ${stats.typeChecked} / ${stats.typeMismatches} |`);
  lines.push(`| 首夜夜序审计覆盖（硬比对 / 显式裁定） | ${stats.firstNightAudited}（${stats.firstNightComparable} / ${stats.firstNightExempt}） |`);
  lines.push(`| 首夜夜序不一致（P1） | ${stats.firstNightMismatches} |`);
  lines.push(`| 其他夜夜序审计覆盖（硬比对 / 显式裁定） | ${stats.otherNightAudited}（${stats.otherNightComparable} / ${stats.otherNightExempt}） |`);
  lines.push(`| 其他夜夜序不一致（P1） | ${stats.otherNightMismatches} |`);
  lines.push(`| 注册新引擎能力角色 | ${stats.rolesWithAbilityImpl} |`);
  lines.push(`| 有测试入口角色 | ${stats.rolesWithTestReference} |`);
  lines.push(`| 语义原子层偏差（L3 review） | ${stats.semanticFindings} |`);
  lines.push(
    `| 官方范例已编码 / 总数（L3 Oracle） | ${stats.encodedExamples} / ${stats.officialExamples} |`
  );
  lines.push(
    `| 变异测试被杀 / 总数（L5 mutation score） | ${stats.mutationKilled} / ${stats.mutationTotal} |`
  );
  lines.push(
    `| 整局随机仿真（L4）：局数 · 动作数 · 不变式违例 | ${stats.fuzzGames} · ${stats.fuzzActions} · ${stats.fuzzViolations} |`
  );
  lines.push(
    `| E2E 断言型覆盖（L6）：被断言的角色 / E2E 断言总数 | ${stats.e2eAssertionRoles} / ${stats.e2eAssertions} |`
  );
  lines.push(`| 已 waiver 差异（人审台账） | ${stats.waivedFindings} |`);
  lines.push("");
  lines.push("## 剧本维度");
  lines.push("");
  lines.push("| 剧本 | 角色数 | 已映射官方规范 | 类型一致 | 有测试入口 |");
  lines.push("| :--- | ---: | ---: | ---: | ---: |");
  for (const row of report.scriptBreakdown) {
    lines.push(
      `| ${row.script} | ${row.roles} | ${row.mapped}/${row.roles} | ${row.typeOk}/${row.mapped || row.roles} | ${row.withTestRefs}/${row.roles} |`
    );
  }
  lines.push("");
  lines.push("## 能力类型标签维度（语义层路线图的输入）");
  lines.push("");
  lines.push("| 官方能力类型 | 角色数 | 其中有测试入口 |");
  lines.push("| :--- | ---: | ---: |");
  for (const row of report.capabilityTagBreakdown.slice(0, 20)) {
    lines.push(`| ${row.tag} | ${row.roles} | ${row.withTestRefs} |`);
  }
  lines.push("");
  lines.push("## Findings（按检查项聚合）");
  lines.push("");
  lines.push("| 严重度 | 检查项 | 数量 | 样例角色 |");
  lines.push("| :--- | :--- | ---: | :--- |");
  for (const row of groupFindings(report.findings)) {
    lines.push(`| ${row.severity} | \`${row.check}\` | ${row.count} | ${row.examples} |`);
  }
  lines.push("");
  lines.push("> 评审提示：`ability.atom.*` 为 L3 语义原子层的**元数据对账**结果（官方能力文本 ⇄ 实现 triggerTiming/targetConfig/判胜注册表），");
  lines.push("> 默认按「元数据缺口」计 P2/INFO；若实现经 legacy/gameLogic 路径生效，请在 `waivers.json` 登记裁定。");
  lines.push("> 明细产物：`outputs/rule_conformance/semantic_findings.json`（语义层）· `examples_ledger.json`（官方范例编码台账）· `mutation_report.json`（L5 变异基线）。");
  const waived = report.findings.filter((finding) => finding.waived);
  if (waived.length > 0) {
    lines.push("## 人审 waiver（已登记差异，见 scripts/conformance/waivers.json）");
    lines.push("");
    lines.push("| 检查项 | 角色 | 裁定理由 |");
    lines.push("| :--- | :--- | :--- |");
    const seen = new Set<string>();
    for (const finding of waived) {
      const key = `${finding.check}|${finding.roleId ?? finding.roleNameCn ?? "*"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(
        `| \`${finding.check}\` | ${finding.roleNameCn ?? finding.roleId ?? "-"} | ${finding.waiverReason ?? "见 waivers.json"} |`
      );
    }
    lines.push("");
    if (unusedWaiverCount > 0) {
      lines.push(
        `> ⚠️ 有 ${unusedWaiverCount} 条 waiver 未命中任何 finding（可能已修复，请在 waivers.json 清理，避免台账腐坏）。`
      );
      lines.push("");
    }
  } else if (unusedWaiverCount > 0) {
    lines.push("## 人审 waiver");
    lines.push("");
    lines.push(
      `> ⚠️ 有 ${unusedWaiverCount} 条 waiver 未命中任何 finding（可能已修复/失效，请清理 scripts/conformance/waivers.json）。`
    );
    lines.push("");
  }
  if (baseline && comparison) {
    lines.push("## 棘轮状态");
    lines.push("");
    if (comparison.needsMigration) {
      lines.push(
        "- ❌ **基线格式过期（schemaVersion < 2）**：旧签名 `check|role` 不含 severity，",
        "  无法发现「豁免被移除导致严重度回升」。请先人审后运行",
        "  `npx tsx scripts/conformance/audit.ts --migrate-baseline`（新增项需 `--accept-new`）。"
      );
      lines.push("");
      return lines.join("\n");
    }
    if (comparison.newFindings.length > 0) {
      lines.push(`- ❌ **新增回归 ${comparison.newFindings.length} 项**（必须修复或人审后更新基线）：`);
      for (const signature of comparison.newFindings.slice(0, 30)) {
        lines.push(`  - \`${signature}\``);
      }
    } else {
      lines.push("- ✅ 无新增 finding（基线内已知债务仍在，见上表）");
    }
    if (comparison.metricRegressions.length > 0) {
      lines.push("- ❌ 覆盖指标下降：");
      for (const item of comparison.metricRegressions) {
        lines.push(`  - ${item.metric}: ${item.baseline} → ${item.current}`);
      }
    }
    if (comparison.fixedFindings.length > 0) {
      lines.push(`- 🎉 本次修复 ${comparison.fixedFindings.length} 项（建议更新基线）：`);
      for (const signature of comparison.fixedFindings.slice(0, 10)) {
        lines.push(`  - \`${signature}\``);
      }
    }
    lines.push("");
  }
  lines.push("## 复现");
  lines.push("");
  lines.push("```bash");
  lines.push("npx tsx scripts/conformance/extract-spec.ts   # 1) 官方规范抽取");
  lines.push("npx tsx scripts/conformance/audit.ts           # 2) 全量静态审计 + 棘轮门禁");
  lines.push("npx vitest run src/utils/__tests__/rule_conformance.test.ts  # 3) CI 内的棘轮断言");
  lines.push("```");
  lines.push("");
  lines.push("> 本报告只覆盖**可静态判定**的维度（类型/夜序/实现存在性/测试入口）。");
  lines.push("> 技能语义、夜间交互与判胜规则属于动态层，见 `docs/RULE_CONFORMANCE_SYSTEM.md`。");
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  mainAsync().catch((error) => {
    console.error(
      `❌ 审计失败：${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}

async function mainAsync(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) 官方规范（同时落盘，保证报告可离线复核）
  const spec = extractOfficialSpec(ROOT);
  writeJson(SPEC_FILE, spec);

  // 2) 项目实现清单
  const impl = buildImplInventory();

  // 3) 测试证据
  const evidence = collectTestEvidence(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );

  // 4) L4 整局随机仿真（确定性 seed；与 fuzz.ts / CI 门禁同一份执行逻辑）
  const fuzz = await runFuzz();
  writeJson(path.join(OUT_DIR, "fuzz_report.json"), fuzz);

  // 4b) L6 E2E 断言型覆盖（reach → assert）
  const e2e = collectE2eAssertions(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );
  writeJson(path.join(OUT_DIR, "e2e_assertions.json"), e2e);
  const e2eAssertions = {
    rolesWithAssertions: e2e.rolesWithAssertions,
    assertions: e2e.totals.assertions,
  };

  // 5) 审计（含人审 waiver 台账 + L3 官方范例覆盖 / 语义原子层 + L4 fuzz + L5 变异基线）
  const waivers = loadWaivers(ROOT);
  const examples = exampleCoverage(ROOT);
  const mutation = readMutationBaseline();
  const semantic = runSemanticAudit(spec, impl);
  const report = runConformanceAudit({
    spec,
    impl,
    evidence,
    waivers,
    examples: { total: examples.total, encoded: examples.encoded },
    mutation,
    fuzz: {
      games: fuzz.games,
      actions: fuzz.actions,
      violations: fuzz.violations,
    },
    e2eAssertions,
    semanticFindings: semantic.findings.map((finding) => ({
      atom: finding.atom,
      severity: finding.severity,
      expected: finding.expected,
      actual: finding.actual,
      detail: finding.detail,
      roleId: finding.roleId,
      nameCn: finding.nameCn,
    })),
  });
  writeJson(LEDGER_FILE, report);
  const unused = unusedWaivers(report.findings, waivers);

  // 5) 基线比对 / 写入 / 旧格式迁移
  const existingBaseline = readBaseline();
  let comparison: ReturnType<typeof compareWithBaseline> | null = null;
  if (MIGRATE_BASELINE) {
    if (!existingBaseline) {
      console.error("❌ --migrate-baseline：没有可迁移的基线文件");
      process.exit(1);
    }
    const migration = migrateBaselineSignatures(
      report,
      existingBaseline.findings
    );
    console.log("");
    console.log("🧬 基线签名迁移（旧 `check|role` → `severity|check|role`）");
    console.log(`   可机械迁移 ${migration.migrated.length} 条`);
    console.log(`   已真实修复 ${migration.fixedFindings.length} 条（从基线移除）`);
    console.log(`   当前新增 ${migration.newFindings.length} 条`);
    for (const item of migration.newFindings) {
      console.log(`     + ${item}`);
    }
    if (migration.ambiguous.length > 0) {
      console.error(
        `❌ ${migration.ambiguous.length} 条旧签名无法唯一对齐（禁止自动迁移，请人工确认）：`
      );
      for (const item of migration.ambiguous) {
        console.error(`   - ${item.signature} → ${item.candidates.join(" / ")}`);
      }
      process.exit(1);
    }
    if (migration.malformed.length > 0) {
      console.error(`❌ ${migration.malformed.length} 条旧签名格式非法：`);
      for (const item of migration.malformed) console.error(`   - ${item}`);
      process.exit(1);
    }
    if (migration.newFindings.length > 0 && !ACCEPT_NEW) {
      console.error(
        "❌ 迁移会把上面这些**新增 finding** 一并写进基线。确认已人审后加 --accept-new 重跑。"
      );
      process.exit(1);
    }
    const baseline: ConformanceBaseline = {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      findings: migration.findings,
      metrics: reportMetrics(report),
    };
    writeJson(BASELINE_FILE, baseline);
    console.log(
      `✅ 已迁移并写入棘轮基线：${path.relative(ROOT, BASELINE_FILE)}（${baseline.findings.length} 条）`
    );
  } else if (WRITE_BASELINE) {
    const baseline: ConformanceBaseline = {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      findings: findingSignatures(report),
      metrics: reportMetrics(report),
    };
    writeJson(BASELINE_FILE, baseline);
    console.log(
      `✅ 已写入棘轮基线：${path.relative(ROOT, BASELINE_FILE)}（${baseline.findings.length} 条）`
    );
  } else if (existingBaseline) {
    comparison = compareWithBaseline(report, existingBaseline);
  }

  // 6) 人读报告
  fs.writeFileSync(
    REPORT_FILE,
    buildMarkdown(report, comparison, existingBaseline, unused.length),
    "utf8"
  );

  // 7) 控制台摘要
  const p0 = report.findings.filter((f) => f.severity === "P0").length;
  const p1 = report.findings.filter((f) => f.severity === "P1").length;
  const p2 = report.findings.filter((f) => f.severity === "P2").length;
  console.log("");
  console.log("🔎 规则一致性审计（静态可判定维度）");
  console.log(
    `   官方角色 ${report.stats.officialRoles} · 项目角色 ${report.stats.implRoles} · 已映射 ${report.stats.mappedRoles}`
  );
  console.log(
    `   类型 ${report.stats.typeChecked} 可比（不一致 ${report.stats.typeMismatches}）· 夜序 ${report.stats.firstNightComparable + report.stats.otherNightComparable} 可比（不一致 ${report.stats.firstNightMismatches + report.stats.otherNightMismatches}）`
  );
  console.log(
    `   findings: P0=${p0} P1=${p1} P2=${p2} INFO=${report.findings.filter((f) => f.severity === "INFO").length} · waived=${report.stats.waivedFindings}`
  );
  console.log(
    `   L3：语义偏差 ${report.stats.semanticFindings} · 官方范例编码 ${report.stats.encodedExamples}/${report.stats.officialExamples}`
  );
  if (report.stats.mutationTotal > 0) {
    console.log(
      `   L5：mutation score ${report.stats.mutationKilled}/${report.stats.mutationTotal}`
    );
  }
  console.log(
    `   L4：整局 fuzz ${report.stats.fuzzGames} 局 / ${report.stats.fuzzActions} 动作 / 违例 ${report.stats.fuzzViolations}`
  );
  console.log(
    `   L6：E2E 断言型覆盖 ${report.stats.e2eAssertionRoles} 个角色 / ${report.stats.e2eAssertions} 条断言`
  );
  if (unused.length > 0) {
    console.warn(
      `⚠️ ${unused.length} 条 waiver 未命中任何 finding（可能已修复/失效，请清理 waivers.json）`
    );
  }
  console.log(`   静态判定严格符合官方规则：${report.verdict.strictlyConformant ? "是" : "否（存在 P0）"}`);

  let exitCode = 0;
  if (comparison) {
    if (comparison.needsMigration) {
      exitCode = 1;
      console.error(
        "❌ 棘轮基线为旧格式（缺 severity 前缀），已失败关闭：请运行 --migrate-baseline 人审迁移"
      );
    } else {
      console.log(
        `   棘轮：新增 ${comparison.newFindings.length} · 修复 ${comparison.fixedFindings.length} · 覆盖指标下降 ${comparison.metricRegressions.length}`
      );
      if (comparison.newFindings.length > 0) {
        exitCode = 1;
        console.error("❌ 出现新增规则一致性回归（详见 report.md「棘轮状态」）");
      }
      if (comparison.metricRegressions.length > 0) {
        exitCode = 1;
        console.error("❌ 覆盖指标下降（详见 report.md「棘轮状态」）");
      }
    }
  }
  if (STRICT && p0 > 0) {
    exitCode = 1;
    console.error(`❌ --strict：存在 ${p0} 个 P0 偏差`);
  }
  console.log(`   报告：${path.relative(ROOT, REPORT_FILE)}`);
  console.log(`   台账：${path.relative(ROOT, LEDGER_FILE)}`);
  process.exit(exitCode);
}

main();
