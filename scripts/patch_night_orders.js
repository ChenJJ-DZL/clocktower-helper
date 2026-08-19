/**
 * 用 Wiki 校准值修补 rolesData.json 的夜晚顺序
 */
const fs = require("fs");
const path = require("path");
const BASE = path.join(__dirname, "..");

// 加载 Wiki 校准数据
const wikiOrders = JSON.parse(
  fs.readFileSync(path.join(BASE, "screenshots", "wiki_night_orders.json"), "utf-8")
);
const wikiMap = new Map(wikiOrders.map(r => [r.id, r]));

// 加载 rolesData.json
const rolesFile = path.join(BASE, "src", "data", "rolesData.json");
const rolesData = JSON.parse(fs.readFileSync(rolesFile, "utf-8"));

let patched = 0;
let unchanged = 0;

for (const role of rolesData) {
  const wiki = wikiMap.get(role.id);
  if (!wiki) continue;

  let changed = false;

  if (wiki.firstNightOrder !== null && wiki.firstNightOrder !== undefined) {
    if (role.firstNightOrder !== wiki.firstNightOrder) {
      console.log(`  ${role.id}: firstNightOrder ${role.firstNightOrder} → ${wiki.firstNightOrder}`);
      role.firstNightOrder = wiki.firstNightOrder;
      changed = true;
    }
  }

  if (wiki.otherNightOrder !== null && wiki.otherNightOrder !== undefined) {
    if (role.otherNightOrder !== wiki.otherNightOrder) {
      console.log(`  ${role.id}: otherNightOrder ${role.otherNightOrder} → ${wiki.otherNightOrder}`);
      role.otherNightOrder = wiki.otherNightOrder;
      changed = true;
    }
  }

  if (changed) patched++;
  else unchanged++;
}

// 写回
fs.writeFileSync(rolesFile, JSON.stringify(rolesData, null, 2), "utf-8");
console.log(`\nPatched ${patched} roles, ${unchanged} unchanged. Total: ${rolesData.length}`);
