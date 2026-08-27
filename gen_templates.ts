/**
 * 批量生成 role.<id>.wake 唤醒模板（只读分析 + 输出 TS 片段）
 * 数据源：json/full/*.json 全部角色文件（含华灯初上/山雨欲来/实验型补充）的 content.角色能力 字段
 * 运行：cd clocktower-helper && npx tsx gen_templates.ts > /tmp/templates.ts
 */

import * as fs from "fs";
import * as path from "path";
import { getPromptTemplate } from "./src/data/promptDictionary";
import {
  buildAbilityMap,
  ensureAbilityRegistry,
} from "./src/utils/invariantTesting";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();

// 扫描 json/full 全部角色文件（含新回填的华灯初上/山雨欲来/补充角色）
const allChars: Array<{
  id: string;
  名称: string;
  英文名: string;
  类型: string;
  所属剧本: string;
  content?: { 角色能力?: string };
}> = [];
for (const f of fs.readdirSync(path.join(__dirname, "json", "full"))) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(
    fs.readFileSync(path.join(__dirname, "json", "full", f), "utf-8")
  );
  for (const c of Array.isArray(d) ? d : []) allChars.push(c);
}

// 英文名小写(去下划线/空格/撇号) → 角色数据
const byEnglish = new Map<
  string,
  { 名称: string; 能力: string; 剧本: string }
>();
for (const c of allChars) {
  if (!c.英文名) continue;
  const key = c.英文名.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
  if (!byEnglish.has(key)) {
    byEnglish.set(key, {
      名称: c.名称,
      能力: c.content?.["角色能力"] ?? "",
      剧本: c.所属剧本 ?? "",
    });
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

const abilities = Object.values(abilityMap as any);
const lines: string[] = [];
const seenIds = new Set<string>();
let matched = 0;
let fallback = 0;
const already = 0;

function pushTemplate(
  tplId: string,
  roleName: string,
  desc: string,
  source: string
) {
  if (seenIds.has(tplId)) return;
  seenIds.add(tplId);
  if (desc) {
    matched++;
    lines.push(`  {
    id: "${tplId}",
    category: "role",
    template: "唤醒{{seatNo}}号【${roleName}】：${desc}",
    description: "${roleName}唤醒提示（自动生成，源:${source}）",
    scenes: ["night"],
  },`);
  } else {
    fallback++;
    lines.push(`  {
    id: "${tplId}",
    category: "role",
    template: "唤醒{{seatNo}}号【${roleName}】，${roleName}请行动。",
    description: "${roleName}唤醒提示（自动生成，无官方能力描述）",
    scenes: ["night"],
  },`);
  }
}

for (const a of abilities as any[]) {
  const promptId = a.wakePromptId;
  const doc = byEnglish.get(normalize(a.roleId));
  const abilityDesc = doc?.能力 ?? "";
  const roleName = doc?.名称 ?? a.abilityName ?? a.roleId;
  const firstLine = abilityDesc.split(/[。！？\n]/)[0]?.trim() ?? "";
  const desc = firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;

  // 1. 规范 id：role.<roleId>.wake
  pushTemplate(
    `role.${a.roleId}.wake`,
    roleName,
    desc,
    doc?.剧本 ?? "官方文档"
  );

  // 2. 实际 wakePromptId（若非规范 id 且非 default/空）
  if (
    promptId &&
    promptId !== `role.${a.roleId}.wake` &&
    promptId !== "default_wake"
  ) {
    pushTemplate(promptId, roleName, desc, doc?.剧本 ?? "官方文档");
  }
}

console.log(
  `// 自动生成：${lines.length} 条（官方文档 ${matched} / 兜底 ${fallback}，跳过已有 ${already}）`
);
console.log("export const generatedRoleWakeTemplates = [");
console.log(lines.join("\n"));
console.log("];");
