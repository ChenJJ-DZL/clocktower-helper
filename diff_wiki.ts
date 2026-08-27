/**
 * 三方对比：wiki 角色 vs 本地 all_characters.json vs 能力注册表
 * 运行：cd clocktower-helper && npx tsx diff_wiki.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  buildAbilityMap,
  ensureAbilityRegistry,
} from "./src/utils/invariantTesting";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();
const registryIds = new Set(
  Object.values(abilityMap as any).map((a: any) => a.roleId)
);

const wikiRoles = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "json", "wiki_crawl", "parsed_roles.json"),
    "utf-8"
  )
) as Array<{
  wikiName: string;
  type: string;
  enName: string | null;
  ability: string;
}>;

const localChars = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "json", "full", "all_characters.json"),
    "utf-8"
  )
) as Array<{ 名称: string; 英文名: string }>;
const localNames = new Set(localChars.map((c) => c.名称));
const localEn = new Set(localChars.map((c) => c.英文名?.toLowerCase()));

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

// 1. wiki 有但本地 all_characters 无的角色
const wikiOnly: string[] = [];
for (const r of wikiRoles) {
  const inLocal =
    localNames.has(r.wikiName) ||
    (r.enName && localEn.has(r.enName.toLowerCase())) ||
    localEn.has(norm(r.wikiName));
  if (!inLocal) wikiOnly.push(r.wikiName);
}

// 2. wiki 有规则且本地有能力注册的角色（对撞点：能力实现 vs wiki 规则）
const registryMatches: string[] = [];
for (const r of wikiRoles) {
  const match = [...registryIds].find(
    (id) =>
      norm(id) === norm(r.wikiName) || (r.enName && norm(id) === norm(r.enName))
  );
  if (match) registryMatches.push(`${r.wikiName} → ${match}`);
}

console.log("========== wiki vs 本地 差异报告 ==========");
console.log(`wiki 角色: ${wikiRoles.length}`);
console.log(`本地 all_characters: ${localChars.length}`);
console.log(`能力注册表: ${registryIds.size}`);

console.log(`\n── wiki 有但本地 all_characters 无: ${wikiOnly.length} 个 ──`);
for (const n of wikiOnly) console.log(`  ${n}`);

console.log(
  `\n── wiki 有规则且本地有对应能力实现: ${registryMatches.length} 个 ──`
);
for (const m of registryMatches) console.log(`  ${m}`);
