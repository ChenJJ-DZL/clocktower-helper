const fs = require("fs");
const path = require("path");

// 读取所有角色数据
const allCharactersPath = path.join(
  __dirname,
  "json",
  "full",
  "all_characters.json"
);
const newEngineDir = path.join(__dirname, "src", "roles", "new_engine");

const characters = JSON.parse(fs.readFileSync(allCharactersPath, "utf8"));

// 获取已迁移的角色列表
const migratedFiles = fs
  .readdirSync(newEngineDir)
  .filter(
    (file) => file.endsWith(".ability.ts") && file !== "abilityRegistry.ts"
  )
  .map((file) => file.replace(".ability.ts", ""));

console.log("=== 角色能力迁移状态分析 ===\n");

// 按类型分组
const types = {};
characters.forEach((char) => {
  const type = char["类型"];
  if (!types[type]) types[type] = [];
  types[type].push(char);
});

// 统计
let totalCharacters = 0;
let totalMigrated = 0;
const migrationStatus = {};

Object.keys(types)
  .sort()
  .forEach((type) => {
    const chars = types[type];
    console.log(`\n## ${type} (${chars.length}个)`);

    const typeStatus = {
      total: chars.length,
      migrated: 0,
      characters: [],
    };

    chars.forEach((char) => {
      totalCharacters++;
      const englishName = char["英文名"];
      const roleId = englishName.toLowerCase().replace(/[^a-z0-9]+/g, "_");

      const isMigrated = migratedFiles.includes(roleId);
      if (isMigrated) {
        totalMigrated++;
        typeStatus.migrated++;
      }

      typeStatus.characters.push({
        name: char["名称"],
        englishName: englishName,
        roleId: roleId,
        script: char["所属剧本"],
        migrated: isMigrated,
      });

      console.log(
        `  ${isMigrated ? "✅" : "❌"} ${char["名称"]} (${englishName}) - ${char["所属剧本"]}`
      );
    });

    migrationStatus[type] = typeStatus;
    console.log(`  迁移进度: ${typeStatus.migrated}/${typeStatus.total}`);
  });

console.log("\n\n=== 总体统计 ===");
console.log(`总角色数: ${totalCharacters}`);
console.log(`已迁移: ${totalMigrated}`);
console.log(`待迁移: ${totalCharacters - totalMigrated}`);
console.log(`迁移率: ${((totalMigrated / totalCharacters) * 100).toFixed(1)}%`);

// 生成待迁移角色列表
console.log("\n\n=== 待迁移角色列表 ===");
Object.keys(migrationStatus).forEach((type) => {
  const status = migrationStatus[type];
  const pending = status.characters.filter((c) => !c.migrated);
  if (pending.length > 0) {
    console.log(`\n## ${type} (${pending.length}个待迁移)`);
    pending.forEach((c) => {
      console.log(`  - ${c.name} (${c.englishName}) - ${c.script}`);
    });
  }
});

// 保存结果到JSON
const result = {
  totalCharacters,
  totalMigrated,
  totalPending: totalCharacters - totalMigrated,
  migrationRate: ((totalMigrated / totalCharacters) * 100).toFixed(1) + "%",
  byType: migrationStatus,
};

fs.writeFileSync(
  path.join(__dirname, "migration_status.json"),
  JSON.stringify(result, null, 2),
  "utf8"
);
console.log("\n\n详细结果已保存到 migration_status.json");
