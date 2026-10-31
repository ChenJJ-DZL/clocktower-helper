#!/usr/bin/env node
/**
 * 规则一致性系统 · 第 3 步：语义原子层审计（L3）
 * ======================================================================
 * 用法：
 *   npx tsx scripts/conformance/semantic-audit.ts
 *
 * 做什么：
 *   1. 读官方规范 `outputs/rule_conformance/official_spec.json`（缺失时现场从
 *      `json/full/*.json` 抽取，只读真源）；
 *   2. 读项目实现清单 `buildImplInventory()`（app/data.ts + abilityRegistry）；
 *   3. 把 232 条官方能力原文抽取为「规则原子」（触发/目标/生死/胜负…），
 *      与实现元数据逐角色对账；
 *   4. 输出 `outputs/rule_conformance/semantic_findings.json` + 控制台摘要。
 *
 * 与 L1/L2 的分工：
 *   · `audit.ts`（L1/L2）判「声明是否一致」并做棘轮门禁；
 *   · 本脚本（L3）判「官方原文语义 ⇄ 实现元数据」是否自洽，finding 保守分级
 *     （P1 = 元数据硬矛盾；P2 = 口径复核；INFO = 无法静态验证的台账项）；
 *   · 本脚本不写 baseline、不阻塞 CI —— 人审后再决定接入 L2 棘轮。
 *
 * 退出码：0（语义层默认不阻塞 CI；接入棘轮由 Lead 在 audit.ts 中决定）。
 */
import fs from "node:fs";
import path from "node:path";
import { buildImplInventory } from "./lib/impl";
import { extractOfficialSpec } from "./lib/spec";
import { runSemanticAudit } from "./lib/ruleAtoms";
import type { OfficialSpecFile } from "./lib/types";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "outputs", "rule_conformance");
const SPEC_FILE = path.join(OUT_DIR, "official_spec.json");
const OUT_FILE = path.join(OUT_DIR, "semantic_findings.json");

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readSpec(): OfficialSpecFile {
  if (fs.existsSync(SPEC_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SPEC_FILE, "utf8")) as OfficialSpecFile;
    } catch (error) {
      console.warn(
        `⚠️ 官方规范文件解析失败，改为现场抽取：${(error as Error).message}`
      );
    }
  }
  const spec = extractOfficialSpec(ROOT);
  writeJson(SPEC_FILE, spec);
  console.log(`ℹ️ 官方规范不存在，已现场抽取并写入 ${path.relative(ROOT, SPEC_FILE)}`);
  return spec;
}

function main(): void {
  const spec = readSpec();
  const impl = buildImplInventory();
  const result = runSemanticAudit(spec, impl);
  writeJson(OUT_FILE, result);

  const { stats } = result;
  const { deviations } = stats;
  console.log("");
  console.log("🧠 语义原子层审计（官方能力原文 ⇄ 实现元数据，L3）");
  console.log(
    `   官方角色 ${stats.officialRoles} · 项目角色 ${stats.implRoles} · 映射官方规范 ${stats.comparedSpecs} · 实际对账 ${stats.comparedRoles}`
  );
  console.log(
    `   变体/重复实现跳过 ${stats.variantSkippedRoles} · 项目自定义未收录 ${stats.implWithoutSpec} · 官方未实现 ${stats.specWithoutImpl} · 未注册能力（触发/目标不可对账） ${stats.abilityUnregisteredRoles}`
  );
  console.log(
    `   偏差：P0=${deviations.P0} P1=${deviations.P1} P2=${deviations.P2} INFO=${deviations.INFO}（合计 ${deviations.total}）`
  );

  const atomHitList = Object.entries(stats.atomHits)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  console.log("");
  console.log("   规则原子命中（官方 232 条能力原文）：");
  const atomLine: string[] = [];
  for (const [atom, count] of atomHitList) {
    atomLine.push(`${atom}=${count}`);
  }
  for (let i = 0; i < atomLine.length; i += 6) {
    console.log(`     ${atomLine.slice(i, i + 6).join(" · ")}`);
  }

  console.log("");
  console.log("   按 atom / severity 聚合：");
  for (const row of result.byAtom) {
    const samples = row.roles.slice(0, 6).join("、");
    const more = row.roles.length > 6 ? ` 等 ${row.roles.length} 个` : "";
    console.log(
      `     [${row.severity}] ${row.atom} × ${row.count}：${samples}${more}`
    );
  }

  const actionable = result.findings.filter(
    (finding) => finding.severity === "P1" || finding.severity === "P2"
  );
  console.log("");
  console.log(`   需复核偏差（P1/P2 共 ${actionable.length} 条，Top ${Math.min(actionable.length, 20)}）：`);
  for (const finding of actionable.slice(0, 20)) {
    console.log(
      `     · [${finding.severity}] ${finding.nameCn}(${finding.roleId}) ${finding.atom}`
    );
  }
  if (actionable.length > 20) {
    console.log(`     … 其余 ${actionable.length - 20} 条见 ${path.relative(ROOT, OUT_FILE)}`);
  }

  const infoCount = deviations.INFO;
  if (infoCount > 0) {
    console.log(
      `\n   另：INFO ${infoCount} 条（设置调整不可静态验证 / 已知胜负 reasonCode 缺口），见 ${path.relative(ROOT, OUT_FILE)}`
    );
  }
  console.log("");
  console.log(`   产物：${path.relative(ROOT, OUT_FILE)}`);
  process.exit(0);
}

main();
