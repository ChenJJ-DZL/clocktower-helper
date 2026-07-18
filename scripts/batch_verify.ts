/**
 * 批量角色规则验证：Wiki ↔ JSON ↔ 代码
 * 对每个角色 curl Wiki 页面，提取「角色能力」，与 JSON 和代码对比
 * 3 秒延迟避免反爬
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface RoleEntry {
  name: string;
  engName: string;
  type: string;
  url: string;
  jsonAbility: string;
  jsonScript: string;
  hasCodeFile: boolean;
}

function extractAbilityFromHtml(html: string): string {
  // Find the 角色能力 section in Wiki HTML
  const patterns = [
    /<span[^>]*id="[^"]*角色能力[^"]*"[^>]*>[\s\S]*?<p[^>]*><b>([^<]*)<\/b>/i,
    /id="[^"]*角色能力[^"]*"[\s\S]*?<p[^>]*>\s*<b>([^<]*)<\/b>/i,
    /id="[^"]*角色能力[^"]*"[\s\S]*?<b>([^<]+)<\/b>/i,
    /角色能力[\s\S]*?<b>([^<]+)<\/b>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim()) {
      return match[1].replace(/<[^>]+>/g, "").trim();
    }
  }
  return "";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").replace(/[　]/g, "");
}

function main() {
  const rolesDir = path.join(__dirname, "..", "json", "full");
  const files = fs.readdirSync(rolesDir).filter(
    (f) => f.endsWith(".json") && f !== "all_characters.json"
  );

  const results: any[] = [];
  let total = 0;
  let mismatches = 0;
  let noUrl = 0;
  let fetchFailed = 0;
  let matched = 0;

  for (const file of files) {
    const filePath = path.join(rolesDir, file);
    const roles: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    for (const role of roles) {
      total++;
      const name = role["名称"] || "";
      const engName = role["英文名"] || "";
      const url = role.url || "";
      const jsonAbility = role.content?.["角色能力"] || "";
      const jsonScript = role["所属剧本"] || "";

      if (!url) {
        noUrl++;
        console.log(`[SKIP] ${name} - 无 URL`);
        continue;
      }

      console.log(`[${total}] ${name}...`);

      try {
        const html = execSync(
          `curl -s --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`,
          { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
        );

        const wikiAbility = extractAbilityFromHtml(html);

        const match =
          wikiAbility &&
          jsonAbility &&
          normalize(wikiAbility) === normalize(jsonAbility);

        if (match) {
          matched++;
          console.log(`  ✅ 匹配 (${engName})`);
        } else if (!wikiAbility) {
          fetchFailed++;
          console.log(`  ⚠️ 无法提取 Wiki 能力 (${engName})`);
          console.log(`    Wiki URL: ${url}`);
        } else {
          mismatches++;
          console.log(`  ❌ 不匹配! (${engName})`);
          console.log(`    Wiki:  ${wikiAbility}`);
          console.log(`    JSON:  ${jsonAbility}`);
        }

        results.push({
          name,
          engName,
          url,
          jsonAbility,
          wikiAbility: wikiAbility || "(提取失败)",
          match,
          jsonScript,
        });
      } catch (e) {
        fetchFailed++;
        console.log(`  ❌ 抓取失败: ${url}`);
      }

      // 3 second delay
      execSync("sleep 3");
    }
  }

  // Report
  console.log(`\n=== 验证报告 ===`);
  console.log(`总角色数: ${total}`);
  console.log(`匹配: ${matched}`);
  console.log(`不匹配: ${mismatches}`);
  console.log(`无法提取: ${fetchFailed}`);
  console.log(`无 URL: ${noUrl}`);

  // Save mismatched ones
  const mismatched = results.filter((r) => !r.match && r.wikiAbility !== "(提取失败)");
  if (mismatched.length > 0) {
    console.log(`\n=== 不匹配角色 ===`);
    for (const m of mismatched) {
      console.log(`❌ ${m.name} (${m.engName})`);
      console.log(`   Wiki: ${m.wikiAbility}`);
      console.log(`   JSON: ${m.jsonAbility}`);
    }
  }

  const reportPath = path.join(__dirname, "verify_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n报告已保存: ${reportPath}`);
}

main();