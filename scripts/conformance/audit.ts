#!/usr/bin/env node
/**
 * 规则一致性系统 · 第 2 步：全量静态审计 + 棘轮门禁
 * ======================================================================
 * 用法：
 *   npx tsx scripts/conformance/audit.ts                  # 审计 + 与基线比对
 *   npx tsx scripts/conformance/audit.ts --write-baseline # 更新棘轮基线（人审后使用）
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
import { compareWithBaseline, reportMetrics, runConformanceAudit } from "./lib/audit";
import { collectTestEvidence } from "./lib/evidence";
import { buildImplInventory } from "./lib/impl";
import { extractOfficialSpec } from "./lib/spec";
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
  baseline: ConformanceBaseline | null
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
    lines.push(
      `- 棘轮比对：新 finding ${comparison.newFindings.length} · 已修复 ${comparison.fixedFindings.length} · 覆盖指标下降 ${comparison.metricRegressions.length}`
    );
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
  lines.push(`| 首夜夜序可比 / 不一致（P1） | ${stats.firstNightComparable} / ${stats.firstNightMismatches} |`);
  lines.push(`| 其他夜夜序可比 / 不一致（P1） | ${stats.otherNightComparable} / ${stats.otherNightMismatches} |`);
  lines.push(`| 注册新引擎能力角色 | ${stats.rolesWithAbilityImpl} |`);
  lines.push(`| 有测试入口角色 | ${stats.rolesWithTestReference} |`);
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
  if (baseline && comparison) {
    lines.push("## 棘轮状态");
    lines.push("");
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

  // 4) 审计
  const report = runConformanceAudit({ spec, impl, evidence });
  writeJson(LEDGER_FILE, report);

  // 5) 基线比对 / 写入
  const existingBaseline = readBaseline();
  let comparison: ReturnType<typeof compareWithBaseline> | null = null;
  if (WRITE_BASELINE) {
    const baseline: ConformanceBaseline = {
      generatedAt: new Date().toISOString(),
      findings: report.findings
        .map(
          (finding) =>
            `${finding.check}|${finding.roleId ?? finding.roleNameCn ?? "*"}`
        )
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort(),
      metrics: reportMetrics(report),
    };
    writeJson(BASELINE_FILE, baseline);
    console.log(`✅ 已写入棘轮基线：${path.relative(ROOT, BASELINE_FILE)}（${baseline.findings.length} 条）`);
  } else if (existingBaseline) {
    comparison = compareWithBaseline(report, existingBaseline);
  }

  // 6) 人读报告
  fs.writeFileSync(
    REPORT_FILE,
    buildMarkdown(report, comparison, existingBaseline),
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
    `   findings: P0=${p0} P1=${p1} P2=${p2} INFO=${report.findings.filter((f) => f.severity === "INFO").length}`
  );
  console.log(`   静态判定严格符合官方规则：${report.verdict.strictlyConformant ? "是" : "否（存在 P0）"}`);

  let exitCode = 0;
  if (comparison) {
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
  if (STRICT && p0 > 0) {
    exitCode = 1;
    console.error(`❌ --strict：存在 ${p0} 个 P0 偏差`);
  }
  console.log(`   报告：${path.relative(ROOT, REPORT_FILE)}`);
  console.log(`   台账：${path.relative(ROOT, LEDGER_FILE)}`);
  process.exit(exitCode);
}

main();
