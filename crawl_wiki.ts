/**
 * 钟楼百科爬虫：抓取清单页 → 汇总角色链接 → 批量抓取角色 wikitext
 * 运行：cd clocktower-helper && npx tsx crawl_wiki.ts
 *
 * 产出：
 * - json/wiki_crawl/roles_index.json   全部角色链接清单
 * - json/wiki_crawl/pages/<名称>.wiki 每个角色页原始 wikitext
 * 断点续爬：已存在的 .wiki 文件跳过
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://clocktower-wiki.gstonegames.com/index.php?title=";
const OUT = path.join(__dirname, "json", "wiki_crawl");
const PAGES = path.join(OUT, "pages");

// 清单页（分类页 + 合集页）
const LIST_PAGES = [
  { name: "镇民", type: "townsfolk" },
  { name: "外来者", type: "outsider" },
  { name: "爪牙", type: "minion" },
  { name: "恶魔", type: "demon" },
  { name: "旅行者", type: "traveler" },
  { name: "传奇角色", type: "legendary" },
  { name: "奇遇角色", type: "奇遇" },
  { name: "实验性角色", type: "experimental" },
  { name: "绝世演出", type: "演出" },
  { name: "华灯初上", type: "华灯初上" },
  { name: "山雨欲来", type: "山雨欲来" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function curlText(url: string): string {
  try {
    return execFileSync("curl", ["-s", "-L", "-A", UA, url], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
  } catch (e) {
    throw new Error(`curl 失败: ${url} — ${(e as Error).message}`);
  }
}

function extractWikiLinks(html: string): string[] {
  // MediaWiki 链接格式: href="/index.php?title=XXX"
  const titles = new Set<string>();
  const re = /href="[^"]*[?&]title=([^"&]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = decodeURIComponent(m[1]);
    if (t && t !== "首页" && !t.includes(":") && !t.includes("#")) {
      titles.add(t);
    }
  }
  return [...titles];
}

async function main() {
  fs.mkdirSync(PAGES, { recursive: true });

  // ── 1. 抓清单页，汇总角色链接 ──
  const index: Record<string, { name: string; type: string }> = {};
  for (const lp of LIST_PAGES) {
    try {
      const html = curlText(BASE + encodeURIComponent(lp.name));
      const links = extractWikiLinks(html);
      // 过滤掉清单页/合集页自身与明显非角色页
      const roleCandidates = links.filter(
        (t) => !LIST_PAGES.some((l) => l.name === t)
      );
      for (const t of roleCandidates) {
        if (!index[t]) index[t] = { name: t, type: lp.type };
      }
      console.log(`[清单] ${lp.name}: 提取 ${roleCandidates.length} 个链接`);
    } catch (e) {
      console.error(`[清单失败] ${lp.name}: ${(e as Error).message}`);
    }
  }

  fs.writeFileSync(
    path.join(OUT, "roles_index.json"),
    JSON.stringify(index, null, 1),
    "utf-8"
  );
  console.log(
    `\n角色清单共 ${Object.keys(index).length} 个，已存 roles_index.json`
  );

  // ── 2. 批量抓取角色 wikitext（并发 5）──
  const names = Object.keys(index);
  let ok = 0,
    skip = 0,
    fail = 0;
  const queue = [...names];
  async function worker() {
    while (queue.length > 0) {
      const name = queue.shift()!;
      const file = path.join(PAGES, name + ".wiki");
      if (fs.existsSync(file)) {
        skip++;
        continue;
      }
      try {
        const wt = curlText(BASE + encodeURIComponent(name) + "&action=raw");
        if (wt.startsWith("<!DOCTYPE") || wt.trim().length === 0) {
          fail++;
          console.log(`  ✗ ${name}: 空页/重定向`);
          continue;
        }
        fs.writeFileSync(file, wt, "utf-8");
        ok++;
      } catch (e) {
        fail++;
        console.error(`  ✗ ${name}: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  console.log(`\n抓取完成: 新增 ${ok} / 跳过 ${skip} / 失败 ${fail}`);
  console.log(`存档目录: ${PAGES}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
