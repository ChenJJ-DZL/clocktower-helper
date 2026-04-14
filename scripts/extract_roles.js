const fs = require("node:fs");
const path = require("node:path");

const data = fs.readFileSync("app/data.ts", "utf8");

// 提取所有角色定义（简化）
const roleRegex = /\{\s*id:\s*"([^"]+)"[^}]*script:\s*"([^"]+)"/g;
const scriptToRoleIds = {};

let match;
while (true) {
  match = roleRegex.exec(data);
  if (match === null) break;
  const id = match[1];
  const script = match[2];
  if (!scriptToRoleIds[script]) scriptToRoleIds[script] = [];
  if (!scriptToRoleIds[script].includes(id)) {
    scriptToRoleIds[script].push(id);
  }
}

console.log("剧本统计:");
Object.keys(scriptToRoleIds).forEach((script) => {
  console.log(`${script}: ${scriptToRoleIds[script].length} 角色`);
});

// 映射剧本名称到剧本ID
const scriptMapping = {
  暗流涌动: "trouble_brewing",
  黯月初升: "bad_moon_rising",
  梦陨春宵: "sects_and_violets",
  夜半狂欢: "midnight_revelry",
  扩展: "expansion",
  实验性角色: "experimental",
  实验性: "experimental2",
  梦殒春宵: "sects_and_violets_alt",
};

// 为每个官方剧本生成roleIds
const officialScripts = [
  { id: "trouble_brewing", name: "暗流涌动" },
  { id: "bad_moon_rising", name: "黯月初升" },
  { id: "sects_and_violets", name: "梦陨春宵" },
  { id: "midnight_revelry", name: "夜半狂欢" },
];

console.log("\n官方剧本角色ID列表:");
officialScripts.forEach((script) => {
  const roleIds = scriptToRoleIds[script.name] || [];
  console.log(`${script.name} (${script.id}):`);
  console.log(`  roleIds: ${JSON.stringify(roleIds)}`);
});

// 输出修改后的scripts数组
console.log("\n修改后的scripts数组:");
console.log("export const scripts: Script[] = [");
officialScripts.forEach((script, index) => {
  const roleIds = scriptToRoleIds[script.name] || [];
  console.log("  {");
  console.log(`    id: "${script.id}",`);
  console.log(`    name: "${script.name}",`);
  console.log(
    `    difficulty: "${script.id === "trouble_brewing" ? "初学者" : script.id === "midnight_revelry" ? "困难" : "中等"}",`
  );
  console.log(
    `    description: ${script.id === "trouble_brewing" ? '"当?男爵 (Baron)?在场时，系统会自动将 2 名镇民替换为 2 名外来者。"' : '""'},`
  );
  console.log(`    roleIds: ${JSON.stringify(roleIds)}`);
  console.log(`  }${index < officialScripts.length - 1 ? "," : ""}`);
});
console.log("];");
