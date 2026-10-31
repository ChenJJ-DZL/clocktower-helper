#!/usr/bin/env node
/**
 * 规则一致性系统 · 第 1 步：抽取官方规范
 * ----------------------------------------------------------------------
 * 用法：
 *   npx tsx scripts/conformance/extract-spec.ts
 *
 * 输出：`outputs/rule_conformance/official_spec.json`
 *   —— 从 `json/full/*.json`（受保护真源，只读）归一化得到的官方角色规范，
 *      包含：类型 / 官方夜序 / 角色能力类型标签 / 角色能力原文 / 官方范例 /
 *      运作方式 / 规则细节 / 来源文件。
 */
import fs from "node:fs";
import path from "node:path";
import { extractOfficialSpec } from "./lib/spec";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "outputs", "rule_conformance");
const OUT_FILE = path.join(OUT_DIR, "official_spec.json");

function main(): void {
  const spec = extractOfficialSpec(ROOT);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

  const topTags = Object.entries(spec.stats.capabilityTagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([tag, count]) => `${tag}:${count}`)
    .join(", ");

  console.log("📜 官方规范抽取完成");
  console.log(`   原始记录 ${spec.stats.rawRecords} → 有效 ${spec.stats.validRecords} → 唯一角色 ${spec.stats.uniqueRoles}`);
  console.log(`   丢弃无效记录 ${spec.stats.droppedRecords} · 合并重复角色 ${spec.stats.mergedDuplicateRoles}`);
  console.log(`   缺失角色能力原文 ${spec.stats.missingAbilityText} · 含官方范例角色 ${spec.stats.rolesWithExamples}（共 ${spec.stats.totalExamples} 条）`);
  console.log(`   能力类型标签 Top8：${topTags}`);
  console.log(`   输出：${path.relative(ROOT, OUT_FILE)}`);
}

main();
