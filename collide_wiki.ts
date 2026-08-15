/**
 * 对撞分析：wiki 角色规则 vs 本地能力实现
 * 输出每个对撞点的 wiki 能力文本 + 本地能力配置，人工/AI 判断实现偏差
 * 运行：cd clocktower-helper && npx tsx collide_wiki.ts
 */
import { buildAbilityMap, ensureAbilityRegistry } from "./src/utils/invariantTesting";
import * as fs from "fs";
import * as path from "path";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();
const abilities = Object.values(abilityMap as any);

const wikiRoles = JSON.parse(
  fs.readFileSync(path.join(__dirname, "json", "wiki_crawl", "parsed_roles.json"), "utf-8")
) as Array<{ wikiName: string; type: string; enName: string | null; ability: string }>;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

// 重点：华灯初上/山雨欲来（type）或能力名匹配国风角色
const GF_TYPES = new Set(["华灯初上", "山雨欲来"]);

interface Collision {
  wikiName: string;
  enName: string | null;
  wikiAbility: string;
  localRoleId: string;
  localAbilityName: string;
  localTimings: string[];
  localFn: number | null;
  localOn: number | null;
  localTarget: any;
  isGF: boolean;
}

const collisions: Collision[] = [];
for (const r of wikiRoles) {
  const ability = abilities.find(
    (a: any) => norm(a.roleId) === norm(r.wikiName) || (r.enName && norm(a.roleId) === norm(r.enName))
  );
  if (!ability) continue;
  const ab = ability as any;
  collisions.push({
    wikiName: r.wikiName,
    enName: r.enName,
    wikiAbility: r.ability,
    localRoleId: ab.roleId,
    localAbilityName: ab.abilityName,
    localTimings: ab.triggerTiming ?? [],
    localFn: ab.firstNightPriority,
    localOn: ab.otherNightPriority,
    localTarget: ab.targetConfig,
    isGF: GF_TYPES.has(r.type),
  });
}

const gf = collisions.filter((c) => c.isGF);
const official = collisions.filter((c) => !c.isGF);

console.log(`对撞点总数: ${collisions.length}（国风 ${gf.length} / 官方+实验 ${official.length}）\n`);

// 输出完整报告到文件
import * as fs2 from "fs";
const report: string[] = [];
report.push(`# 本地能力实现 vs 官方 Wiki 规则 对撞报告`);
report.push(`生成时间: 2026-08-15 | 对撞点: ${collisions.length}（国风 ${gf.length} / 官方+实验 ${official.length}）\n`);
report.push(`> 判定说明：本地能力实现与 wiki 官方"角色能力"文本语义不符的，即为需要重写的对象。\n`);
for (const c of collisions) {
  const flag = c.isGF ? "【国风】" : "";
  report.push(`## ${flag}${c.wikiName} (${c.localRoleId})`);
  report.push(`- **Wiki 规则**: ${c.wikiAbility}`);
  report.push(`- **本地实现**: ${c.localAbilityName} | timing=[${c.localTimings.join(",")}] fn=${c.localFn} on=${c.localOn} target=${JSON.stringify(c.localTarget)}`);
  report.push("");
}
fs2.writeFileSync(path.join(__dirname, "json", "wiki_crawl", "对撞报告.md"), report.join("\n"), "utf-8");
console.log(`完整报告已写入 json/wiki_crawl/对撞报告.md`);

console.log("========== 国风角色对撞明细 ==========");
for (const c of gf) {
  console.log(`\n◆ ${c.wikiName} (${c.localRoleId})`);
  console.log(`  wiki规则: ${c.wikiAbility.slice(0, 90)}${c.wikiAbility.length > 90 ? "…" : ""}`);
  console.log(`  本地实现: ${c.localAbilityName} | timing=[${c.localTimings.join(",")}] fn=${c.localFn} on=${c.localOn} target=${JSON.stringify(c.localTarget)}`);
}
