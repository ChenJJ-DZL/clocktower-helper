const fs = require("fs");
const path = require("path");

// 读取app/data.ts文件
const dataPath = path.join(__dirname, "..", "app", "data.ts");
const dataContent = fs.readFileSync(dataPath, "utf8");

// 提取所有角色
const rolePattern = /id:\s*["']([^"']+)["'][^}]*name:\s*["']([^"']+)["']/g;
const allRoles = [];
let match;

while ((match = rolePattern.exec(dataContent)) !== null) {
  allRoles.push({
    id: match[1],
    name: match[2],
  });
}

console.log("📋 app/data.ts中的所有角色:\n");
allRoles.forEach((role, index) => {
  console.log(
    `${String(index + 1).padStart(3, " ")}. ${role.name} (${role.id})`
  );
});

console.log(`\n📊 总计: ${allRoles.length} 个角色`);

// 搜索可能相关的角色
console.log("\n🔍 搜索可能相关的角色:");
const searchTerms = [
  "演员",
  "鬼魂",
  "灯神",
  "狐媚",
  "神",
  "鬼",
  "Djinn",
  "Ghost",
  "Actor",
];
searchTerms.forEach((term) => {
  const matches = allRoles.filter(
    (r) => r.name.includes(term) || r.id.includes(term.toLowerCase())
  );
  if (matches.length > 0) {
    console.log(`\n  包含 "${term}":`);
    matches.forEach((r) => {
      console.log(`    - ${r.name} (${r.id})`);
    });
  }
});
