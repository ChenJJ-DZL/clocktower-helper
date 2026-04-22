const fs = require("node:fs");
const path = require("node:path");

// 读取 app/data.ts 文件
const dataPath = path.join(__dirname, "..", "app", "data.ts");
const content = fs.readFileSync(dataPath, "utf8");

// 从 temp_scripts.txt 中提取所有角色ID
const tempScriptsPath = path.join(__dirname, "..", "temp_scripts.txt");
const tempContent = fs.readFileSync(tempScriptsPath, "utf8");

// 找到 roleIds 数组部分并提取其中的ID
const allRoleIds = [];
const roleIdsSectionRegex = /roleIds:\s*\[[\s\S]*?\]/g;
let match;

while (true) {
  match = roleIdsSectionRegex.exec(tempContent);
  if (match === null) break;
  const section = match[0];
  // 从 section 中提取引号中的内容
  const ids = section.match(/"[a-z0-9_]+"/g);
  if (ids) {
    ids.forEach((id) => {
      const cleanId = id.replace(/"/g, "");
      // 确保不是剧本ID（剧本ID都比较长）
      if (
        ![
          "trouble_brewing",
          "bad_moon_rising",
          "sects_and_violets",
          "whispering_secrets",
          "tomb_of_the_unknown",
          "high_pleasure",
          "haunted_manor",
          "garden_of_dreams",
        ].includes(cleanId)
      ) {
        allRoleIds.push(cleanId);
      }
    });
  }
}

// 去重
const uniqueRoleIds = [...new Set(allRoleIds)];

console.log("所有剧本中使用的角色ID:");
console.log(uniqueRoleIds);
console.log("\n总数:", uniqueRoleIds.length);

// 现在检查这些ID在 data.ts 的 roles 数组中是否存在
console.log("\n检查缺失的角色...");
const missingRoles = [];

uniqueRoleIds.forEach((roleId) => {
  const pattern = `id:\\s*"${roleId}"`;
  if (!content.includes(pattern)) {
    missingRoles.push(roleId);
  }
});

console.log("缺失的角色ID:");
console.log(missingRoles);
console.log("\n缺失数量:", missingRoles.length);

if (missingRoles.length > 0) {
  console.log("\n需要添加的角色:");
  missingRoles.forEach((id) => {
    console.log(`- ${id}`);
  });
}
