const fs = require("node:fs");
const path = require("node:path");

// 相克规则中提到的所有角色ID
const antagonismRoles = [
  "heretic",
  "baron",
  "leech",
  "pit_hag",
  "humeiniang",
  "actor",
  "spy",
  "godfather",
  "evil_twin",
  "widow",
  "ghost",
  "summoner",
  "frankenstein",
  "drunk",
  "djinn",
  "lamp_djinn",
  "lamp_spirit",
  "灯神",
  "pit_hag_mr",
];

console.log("🔍 检查相克规则中的角色是否存在于app/data.ts中...\n");

// 读取app/data.ts文件
const dataPath = path.join(__dirname, "..", "app", "data.ts");
const dataContent = fs.readFileSync(dataPath, "utf8");

const foundRoles = {};
let missingRoles = [...antagonismRoles];

// 查找每个角色
antagonismRoles.forEach((roleId) => {
  // 搜索模式: id: "roleId"
  const pattern = `id:\\s*["']${roleId}["']`;
  const regex = new RegExp(pattern, "g");
  const matches = dataContent.match(regex);

  if (matches && matches.length > 0) {
    // 尝试提取角色名称
    const namePattern = `id:\\s*["']${roleId}["'][^}]*name:\\s*["']([^"']+)["']`;
    const nameRegex = new RegExp(namePattern, "s");
    const nameMatch = dataContent.match(nameRegex);

    foundRoles[roleId] = {
      id: roleId,
      name: nameMatch ? nameMatch[1] : "未知名称",
    };
    missingRoles = missingRoles.filter((r) => r !== roleId);
  }
});

console.log("✅ 已找到的角色:");
Object.keys(foundRoles).forEach((roleId) => {
  console.log(`  📋 ${foundRoles[roleId].name} (${roleId})`);
});

console.log("\n❌ 未找到的角色:");
if (missingRoles.length === 0) {
  console.log("  无 - 所有角色都已找到!");
} else {
  missingRoles.forEach((roleId) => {
    console.log(`  ❌ ${roleId}`);
  });
}

console.log("\n📊 统计:");
console.log(`  总角色数: ${antagonismRoles.length}`);
console.log(`  找到: ${Object.keys(foundRoles).length}`);
console.log(`  缺失: ${missingRoles.length}`);

// 保存结果到文件
const result = {
  foundRoles,
  missingRoles,
  timestamp: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(__dirname, "..", "temp_antagonism_check.json"),
  JSON.stringify(result, null, 2)
);
