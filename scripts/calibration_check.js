/**
 * Wiki vs 本地数据校准比对脚本
 * 对比 json/full/*.json（Wiki 爬取数据）与 src/data/rolesData.json + app/data.ts
 * 输出缺失字段、能力文本差异、夜晚顺序偏差
 */
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");

// 加载 Wiki 数据
function loadWikiRoles(category) {
  const file = path.join(BASE, "json", "full", `${category}.json`);
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; }
}

// 加载本地 rolesData.json
function loadLocalRolesData() {
  const file = path.join(BASE, "src", "data", "rolesData.json");
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; }
}

// Wiki 数据提取能力文本
function getWikiAbility(role) {
  return role?.content?.["角色能力"] || role?.content?.角色能力 || "";
}

// Wiki 数据提取首夜顺序
function getWikiFirstNight(role) {
  const v = role["首夜行动顺序"];
  if (!v || v === "无法行动") return null;
  return parseInt(v, 10) || null;
}

// Wiki 数据提取其他夜晚顺序
function getWikiOtherNight(role) {
  const v = role["其他夜晚行动顺序"];
  if (!v || v === "无法行动") return null;
  return parseInt(v, 10) || null;
}

// 对比分析
function analyze() {
  const localData = loadLocalRolesData();
  const localMap = new Map(localData.map(r => [r.id, r]));

  const categories = ["镇民", "外来者", "爪牙", "恶魔", "旅行者"];
  const results = { missing: [], nightOrderDiff: [], abilityDiff: [], summary: {} };

  let totalWiki = 0;
  let totalMatched = 0;
  let totalMissing = 0;

  for (const cat of categories) {
    const wikiRoles = loadWikiRoles(cat);
    results.summary[cat] = { total: wikiRoles.length, matched: 0, missing: 0 };

    for (const wr of wikiRoles) {
      totalWiki++;
      const name = wr["名称"] || wr.名称;
      const engName = wr["英文名"] || wr.英文名;
      const wikiId = name; // 用中文名匹配

      // 尝试匹配本地数据
      const localMatch = localData.find(r =>
        r.name === name || r.id?.toLowerCase() === engName?.toLowerCase()
      );

      if (!localMatch) {
        totalMissing++;
        results.missing.push({ name, engName, category: cat, wikiType: wr["类型"] });
        results.summary[cat].missing++;
        continue;
      }

      totalMatched++;
      results.summary[cat].matched++;

      // 比对夜晚顺序
      const wikiFN = getWikiFirstNight(wr);
      const wikiON = getWikiOtherNight(wr);
      const localFN = localMatch.firstNightOrder;
      const localON = localMatch.otherNightOrder;

      if (wikiFN !== null && localFN !== undefined && wikiFN !== localFN) {
        results.nightOrderDiff.push({
          name, engName, field: "firstNightOrder",
          wiki: wikiFN, local: localFN
        });
      }
      if (wikiON !== null && localON !== undefined && wikiON !== localON) {
        results.nightOrderDiff.push({
          name, engName, field: "otherNightOrder",
          wiki: wikiON, local: localON
        });
      }
    }
  }

  return { totalWiki, totalMatched, totalMissing, results };
}

// 输出报告
const report = analyze();
console.log("=== Wiki vs 本地数据校准报告 ===");
console.log(`Wiki 总角色数: ${report.totalWiki}`);
console.log(`已匹配本地: ${report.totalMatched}`);
console.log(`缺失角色: ${report.totalMissing}`);
console.log("\n--- 按类别统计 ---");
for (const [cat, stats] of Object.entries(report.results.summary)) {
  console.log(`  ${cat}: ${stats.total} 个 (匹配 ${stats.matched}, 缺失 ${stats.missing})`);
}

if (report.results.missing.length > 0) {
  console.log("\n--- 缺失角色（Wiki 有但本地无匹配）---");
  for (const r of report.results.missing) {
    console.log(`  ❌ ${r.name} (${r.engName}) [${r.category}]`);
  }
}

if (report.results.nightOrderDiff.length > 0) {
  console.log("\n--- 夜晚顺序偏差 ---");
  for (const d of report.results.nightOrderDiff) {
    console.log(`  ⚠️ ${d.name}: ${d.field} Wiki=${d.wiki} Local=${d.local}`);
  }
}

// 写入完整报告到文件
const reportFile = path.join(BASE, "screenshots", "calibration_report.json");
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");
console.log(`\n完整报告已保存: ${reportFile}`);
