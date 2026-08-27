/**
 * 语义差距扫描脚本
 * 对比 Wiki 数据与本地 rolesData.json，识别缺失角色和夜晚顺序偏差
 */
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");

// 加载数据
const rolesData = JSON.parse(
  fs.readFileSync(path.join(BASE, "src/data/rolesData.json"), "utf-8")
);
const officialDocs = JSON.parse(
  fs.readFileSync(path.join(BASE, "src/data/officialRoleDocs.json"), "utf-8")
);
const nightOrder = JSON.parse(
  fs.readFileSync(path.join(BASE, "src/data/nightOrder.json"), "utf-8")
);

const rolesDataMap = new Map(rolesData.map((r) => [r.id, r]));

console.log("=== 语义差距分析报告 ===\n");

// 1. 角色覆盖率
const wikiRoleNames = Object.keys(officialDocs).filter((k) => k !== "传奇角色");
console.log("📊 角色覆盖率:");
console.log(`  Wiki 角色数: ${wikiRoleNames.length}`);
console.log(`  rolesData.json 角色数: ${rolesData.length}`);
console.log(`  nightOrder 首夜角色数: ${nightOrder.firstNight.length}`);
console.log(`  nightOrder 其他夜角色数: ${nightOrder.otherNights.length}`);

// 2. 找出 rolesData.json 中缺少夜晚顺序的角色
const rolesWithoutNightOrder = rolesData.filter((r) => {
  const inFirstNight = nightOrder.firstNight.some((n) => n.id === r.id);
  const inOtherNight = nightOrder.otherNights.some((n) => n.id === r.id);
  return !inFirstNight && !inOtherNight && r.type !== "traveler";
});

console.log(`\n⚠️ 缺少夜晚顺序的角色 (${rolesWithoutNightOrder.length}):`);
rolesWithoutNightOrder.forEach((r) => console.log(`  - ${r.id} (${r.name})`));

// 3. 找出 rolesData.json 中缺少 firstNightMeta/otherNightMeta 的角色
const rolesWithoutNightMeta = rolesData.filter(
  (r) =>
    !r.firstNightMeta &&
    !r.otherNightMeta &&
    !r.dayMeta &&
    r.type !== "traveler"
);

console.log(`\n⚠️ 缺少夜晚/白天元数据的角色 (${rolesWithoutNightMeta.length}):`);
rolesWithoutNightMeta
  .slice(0, 20)
  .forEach((r) => console.log(`  - ${r.id} (${r.name})`));

// 4. 找出能力类型缺失的角色
const rolesWithoutEffectType = rolesData.filter((r) => {
  if (r.firstNightMeta && !r.firstNightMeta.effectType) return true;
  if (r.otherNightMeta && !r.otherNightMeta.effectType) return true;
  if (r.dayMeta && !r.dayMeta.effectType) return true;
  return false;
});

console.log(`\n⚠️ 缺少 effectType 的角色 (${rolesWithoutEffectType.length}):`);
rolesWithoutEffectType
  .slice(0, 10)
  .forEach((r) => console.log(`  - ${r.id} (${r.name})`));

// 5. 生成待修复清单
console.log("\n=== 待修复清单 ===");
console.log("1. 为缺少夜晚顺序的角色补充 firstNightOrder/otherNightOrder");
console.log("2. 为缺少夜晚元数据的角色补充 firstNightMeta/otherNightMeta");
console.log("3. 为所有元数据添加 effectType 字段");
