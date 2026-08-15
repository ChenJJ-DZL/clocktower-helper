/**
 * 解析 wiki wikitext → 结构化角色 JSON
 * 运行：cd clocktower-helper && npx tsx parse_wiki.ts
 * 产出：json/wiki_crawl/parsed_roles.json
 */
import * as fs from "fs";
import * as path from "path";

const OUT = path.join(__dirname, "json", "wiki_crawl");
const PAGES = path.join(OUT, "pages");
const index: Record<string, { name: string; type: string }> = JSON.parse(
  fs.readFileSync(path.join(OUT, "roles_index.json"), "utf-8")
);

/** 按 == 标题 == 切分 wikitext */
function parseSections(wt: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = wt.split("\n");
  let current = "头部";
  let buf: string[] = [];
  for (const line of lines) {
    const m = line.match(/^==\s*(.+?)\s*==$/);
    if (m) {
      sections[current] = buf.join("\n").trim();
      current = m[1];
      buf = [];
    } else {
      buf.push(line);
    }
  }
  sections[current] = buf.join("\n").trim();
  return sections;
}

/** 清理 wikitext 标记 */
function clean(wt: string): string {
  return wt
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/\[\[File:[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\{\{#[^}]*\}\}/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const roles: Array<Record<string, any>> = [];
let nonRole = 0;

for (const [name, meta] of Object.entries(index)) {
  const file = path.join(PAGES, name + ".wiki");
  if (!fs.existsSync(file)) continue;
  const wt = fs.readFileSync(file, "utf-8");
  const sections = parseSections(wt);

  // 非角色页过滤：无"角色能力"段落
  if (!sections["角色能力"] && !sections["角色能力（华灯初上）"]) {
    nonRole++;
    continue;
  }

  const ability = clean(sections["角色能力"] ?? sections["角色能力（华灯初上）"] ?? "");
  const intro = clean(sections["角色简介"] ?? "");
  const operate = clean(sections["运作方式"] ?? "");
  const example = clean(sections["范例"] ?? "");
  const markers = clean(sections["提示标记"] ?? "");

  // 行动顺序（可能有"首夜行动顺序"/"其他夜晚行动顺序"小节或列表）
  const fnOrder = (wt.match(/首夜行动顺序[:：]?\s*([0-9]+)/) ?? [])[1] ?? null;
  const onOrder = (wt.match(/其他夜晚行动顺序[:：]?\s*([0-9]+)/) ?? [])[1] ?? null;

  // 英文名：尝试从 wikitext 或文件名推断
  const enName = (wt.match(/英文名[:：]?\s*([A-Za-z' -]+)/) ?? [])[1] ?? null;

  roles.push({
    wikiName: name,
    type: meta.type,
    enName: enName ? enName.trim() : null,
    ability,
    intro,
    operate,
    example,
    markers,
    fnOrder: fnOrder ? Number(fnOrder) : null,
    onOrder: onOrder ? Number(onOrder) : null,
    source: "wiki",
  });
}

fs.writeFileSync(path.join(OUT, "parsed_roles.json"), JSON.stringify(roles, null, 1), "utf-8");
console.log(`解析完成: ${roles.length} 个角色 / 跳过非角色 ${nonRole}`);
console.log(`产出: ${path.join(OUT, "parsed_roles.json")}`);

// 样例输出
const sample = roles.find((r) => r.wikiName === "穷奇");
console.log("\n样例（穷奇）:");
console.log("能力:", sample?.ability?.slice(0, 100));
console.log("运作方式:", sample?.operate?.slice(0, 80));
