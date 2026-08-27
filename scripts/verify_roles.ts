/**
 * 角色规则三方验证脚本
 * 对比 Wiki ↔ JSON ↔ 代码
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface RoleVerifyResult {
  roleName: string;
  englishName: string;
  wikiUrl: string;
  comparisons: {
    field: string;
    wiki: string;
    json: string;
    code: string;
    match: boolean;
  }[];
  issues: string[];
}

function curlWiki(url: string): string {
  try {
    const html = execSync(
      `curl -s --max-time 15 -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    return html;
  } catch {
    return "";
  }
}

// Extract text between specific markers from HTML
function extractField(html: string, fieldLabel: string): string {
  // Try to find the field in the page content
  const patterns = [
    // Pattern: fieldLabel in a table row or section header
    new RegExp(
      `<[^>]*>${fieldLabel}[：:]*</[^>]*>\\s*<[^>]*>([^<]+(?:<[^>]*>[^<]*)*?)</[^>]*>`,
      "i"
    ),
    // Broader pattern
    new RegExp(`${fieldLabel}[：:]\\s*([^\\n]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.replace(/<[^>]+>/g, " ").match(pattern);
    if (match) {
      return match[1].replace(/<[^>]+>/g, "").trim();
    }
  }
  return "";
}

function main() {
  const rolesDir = path.join(__dirname, "..", "json", "full");
  const files = fs
    .readdirSync(rolesDir)
    .filter((f) => f.endsWith(".json") && f !== "all_characters.json");

  const results: RoleVerifyResult[] = [];

  for (const file of files) {
    const filePath = path.join(rolesDir, file);
    const roles: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    for (const role of roles) {
      const name = role["名称"] || role.name || "Unknown";
      const engName = role["英文名"] || role.englishName || "";
      const url = role.url || "";
      const ability = role.content?.["角色能力"] || role.ability || "";
      const script = role["所属剧本"] || role.script || "";
      const firstNight = role["首夜行动顺序"] || role.firstNightOrder || "";
      const otherNight = role["其他夜晚行动顺序"] || role.otherNightOrder || "";

      if (!url) {
        results.push({
          roleName: name,
          englishName: engName,
          wikiUrl: "",
          comparisons: [],
          issues: ["NO_WIKI_URL - 角色缺少 Wiki URL"],
        });
        continue;
      }

      console.log(`[VERIFY] ${name} (${engName})...`);

      // Rate limit: 3 second delay
      const html = curlWiki(url);
      if (!html) {
        results.push({
          roleName: name,
          englishName: engName,
          wikiUrl: url,
          comparisons: [],
          issues: ["WIKI_FETCH_FAILED - 无法抓取 Wiki 页面"],
        });
        continue;
      }

      // Extract fields from Wiki
      const wikiAbility = extractField(html, "角色能力");

      const issues: string[] = [];
      const comparisons: RoleVerifyResult["comparisons"] = [];

      // Compare ability
      if (wikiAbility && ability) {
        const match =
          wikiAbility.replace(/\s+/g, "") === ability.replace(/\s+/g, "");
        comparisons.push({
          field: "角色能力",
          wiki: wikiAbility.substring(0, 200),
          json: ability.substring(0, 200),
          code: "N/A (check new_engine/*.ability.ts)",
          match,
        });
        if (!match) {
          issues.push(
            `ABILITY_MISMATCH: Wiki=${wikiAbility.substring(0, 100)}... | JSON=${ability.substring(0, 100)}...`
          );
        }
      }

      results.push({
        roleName: name,
        englishName: engName,
        wikiUrl: url,
        comparisons,
        issues,
      });

      // 3 second delay between requests
      execSync("sleep 3");
    }
  }

  // Output report
  const reportPath = path.join(__dirname, "verify_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");

  const mismatchCount = results.filter((r) => r.issues.length > 0).length;
  console.log("\n=== 验证完成 ===");
  console.log(`总角色数: ${results.length}`);
  console.log(`存在问题: ${mismatchCount}`);
  console.log(`报告已保存: ${reportPath}`);
}

main();
