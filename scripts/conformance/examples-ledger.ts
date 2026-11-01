#!/usr/bin/env node
/**
 * 规则一致性系统 · L3 官方范例台账 CLI
 * ======================================================================
 * 用法：
 *   npx tsx scripts/conformance/examples-ledger.ts
 *
 * 输入：`outputs/rule_conformance/official_spec.json`（官方范例 Oracle）
 *       + `tests/conformance/**\/*.test.ts` 里 `// 官方范例: <角色> #<idx>` 注释
 * 输出：`outputs/rule_conformance/examples_ledger.json`（覆盖率台账，生成物）
 *
 * 退出码恒为 0（台账用于观测/棘轮，不阻塞 CI）；伪造 id 会在控制台告警，
 * 由 `src/utils/__tests__/examples_ledger.test.ts` 做硬断言拦截。
 */
import fs from "node:fs";
import path from "node:path";
import {
  exampleCoverage,
  loadOfficialExamples,
  officialSpecPath,
} from "./lib/examples";
import { roles, scripts } from "../../app/data";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "outputs", "rule_conformance");
const OUT_FILE = path.join(OUT_DIR, "examples_ledger.json");

function percentText(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/** 按角色汇总成台账摘要（只保留计数，逐条 id 放在 missingByRole 便于排下一批） */
function buildLedger() {
  const examples = loadOfficialExamples(ROOT);
  const coverage = exampleCoverage(ROOT);

  const byRole: Record<string, { total: number; encoded: number }> = {};
  for (const [roleName, row] of Object.entries(coverage.byRole)) {
    byRole[roleName] = { total: row.total, encoded: row.encoded };
  }

  const encodedByRole: Record<string, string[]> = {};
  for (const [roleName, row] of Object.entries(coverage.byRole)) {
    if (row.encodedIds.length > 0) encodedByRole[roleName] = row.encodedIds;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, officialSpecPath(ROOT)).split(path.sep).join("/"),
    fixtureGlob: "tests/conformance/**/*.test.ts",
    stats: {
      officialExamples: coverage.total,
      loadedExamples: examples.length,
      encoded: coverage.encoded,
      percent: Number(coverage.percent.toFixed(4)),
      rolesWithExamples: coverage.rolesWithExamples,
      rolesWithEncoded: coverage.rolesWithEncoded,
      unknownEncodedIds: coverage.unknownEncodedIds.length,
    },
    total: coverage.total,
    encoded: coverage.encoded,
    percent: Number(coverage.percent.toFixed(4)),
    byScript: coverage.byScript,
    byProjectScript: scripts.map((s) => {
      let scriptTotal = 0;
      let scriptEncoded = 0;
      for (const roleId of s.roleIds ?? []) {
        const r = roles.find((x) => x.id === roleId);
        if (!r) continue;
        const roleCov = byRole[r.name];
        if (!roleCov) continue;
        scriptTotal += roleCov.total;
        scriptEncoded += roleCov.encoded;
      }
      return {
        script: s.name,
        scriptId: s.id,
        total: scriptTotal,
        encoded: scriptEncoded,
        percent: scriptTotal > 0 ? scriptEncoded / scriptTotal : 0,
      };
    }),
    byRole,
    encodedByRole,
    missingByRole: coverage.missingByRole,
    unknownEncodedIds: coverage.unknownEncodedIds,
  };
}

function main(): void {
  const ledger = buildLedger();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  console.log("📚 官方范例台账（L3 · Oracle 化）");
  console.log(
    `   官方范例 ${ledger.stats.officialExamples} 条 · 已编码 ${ledger.stats.encoded} 条 · 覆盖率 ${percentText(ledger.stats.percent)}`
  );
  console.log(
    `   有范例角色 ${ledger.stats.rolesWithExamples} 个 · 至少编码 1 条的角色 ${ledger.stats.rolesWithEncoded} 个`
  );

  const encodedRoles = Object.keys(ledger.encodedByRole);
  if (encodedRoles.length > 0) {
    console.log(
      `   已编码角色：${encodedRoles.join("、")}（共 ${encodedRoles.length} 个）`
    );
  }

  console.log("   按项目内置9大实机剧本：");
  for (const row of ledger.byProjectScript) {
    console.log(
      `     · ${row.script}: ${row.encoded}/${row.total}（${percentText(row.percent)}）`
    );
  }

  console.log("   按官方Wiki互斥展开：");
  for (const row of ledger.byScript) {
    const percent = row.total > 0 ? row.encoded / row.total : 0;
    console.log(
      `     · ${row.script}: ${row.encoded}/${row.total}（${percentText(percent)}）`
    );
  }

  if (ledger.unknownEncodedIds.length > 0) {
    console.warn(
      `⚠️ 发现 ${ledger.unknownEncodedIds.length} 个夹具注释指向不存在的官方范例（伪造/写错）：`
    );
    for (const id of ledger.unknownEncodedIds) console.warn(`     · ${id}`);
  }

  console.log(
    `   输出：${path.relative(ROOT, OUT_FILE).split(path.sep).join("/")}`
  );
}

main();
