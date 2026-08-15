/**
 * 回填：把 wiki 缺失角色规则写入 json/full/ 分类文件（华灯初上角色.json / 山雨欲来角色.json / 补充官方缺失）
 * 格式与 all_characters.json 一致：{id, 名称, 英文名, 类型, 所属剧本, 角色能力类型, url, content{背景故事,角色能力,角色简介,运作方式,提示标记}}
 * 运行：cd clocktower-helper && npx tsx backfill_wiki.ts
 */
import * as fs from "fs";
import * as path from "path";

const WIKI = path.join(__dirname, "json", "wiki_crawl");
const FULL = path.join(__dirname, "json", "full");

const wikiRoles = JSON.parse(fs.readFileSync(path.join(WIKI, "parsed_roles.json"), "utf-8")) as Array<{
  wikiName: string; type: string; enName: string | null;
  ability: string; intro: string; operate: string; example: string; markers: string;
}>;

const localChars = JSON.parse(
  fs.readFileSync(path.join(FULL, "all_characters.json"), "utf-8")
) as Array<{ 名称: string }>;
const localNames = new Set(localChars.map((c) => c.名称));

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

// 类型映射（wiki 分类 → all_characters 的"类型"字段）
const TYPE_MAP: Record<string, string> = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
  traveler: "旅行者",
  legendary: "传奇角色",
  奇遇: "奇遇角色",
};

// 所属剧本：按 type 归属合集
const SCRIPT_BY_TYPE: Record<string, string> = {
  华灯初上: "华灯初上",
  山雨欲来: "山雨欲来",
  townsfolk: "官方",
  outsider: "官方",
  minion: "官方",
  demon: "官方",
  traveler: "官方",
  legendary: "官方",
  奇遇: "官方",
  experimental: "实验性角色",
  演出: "绝世演出",
};

const byScript: Record<string, any[]> = {};
let added = 0;

for (const r of wikiRoles) {
  // 本地已有（中文名或英文名匹配）则跳过
  if (localNames.has(r.wikiName)) continue;
  if (r.enName && localChars.some((c) => norm(c.名称) === norm(r.wikiName))) continue;

  const script = SCRIPT_BY_TYPE[r.type] ?? r.type;
  const entry: any = {
    id: r.wikiName,
    名称: r.wikiName,
    英文名: r.enName ?? "",
    类型: TYPE_MAP[r.type] ?? r.type,
    所属剧本: script,
    角色能力类型: "",
    url: `https://clocktower-wiki.gstonegames.com/index.php?title=${encodeURIComponent(r.wikiName)}`,
    content: {
      背景故事: "",
      角色能力: r.ability,
      角色简介: r.intro,
      运作方式: r.operate,
      范例: r.example,
      提示标记: r.markers,
    },
    metadata: { source: "wiki", crawledAt: "2026-08-15" },
  };
  if (!byScript[script]) byScript[script] = [];
  byScript[script].push(entry);
  added++;
}

// 写入文件：华灯初上角色.json / 山雨欲来角色.json / 官方补充.json / 实验性角色补充.json
for (const [script, entries] of Object.entries(byScript)) {
  const fname = script.includes("华灯") ? "华灯初上角色.json"
    : script.includes("山雨") ? "山雨欲来角色.json"
    : script.includes("实验") ? "实验性角色补充.json"
    : "官方补充角色.json";
  const file = path.join(FULL, fname);
  // 合并已有文件（若存在）
  let existing: any[] = [];
  if (fs.existsSync(file)) {
    try { existing = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
  }
  const merged = [...existing];
  for (const e of entries) {
    if (!merged.some((m) => m.名称 === e.名称)) merged.push(e);
  }
  fs.writeFileSync(file, JSON.stringify(merged, null, 1), "utf-8");
  console.log(`${fname}: ${entries.length} 个新角色 → 文件共 ${merged.length} 个`);
}

console.log(`\n回填完成: 共新增 ${added} 个角色`);
console.log(`分组: ${Object.keys(byScript).join(", ")}`);
