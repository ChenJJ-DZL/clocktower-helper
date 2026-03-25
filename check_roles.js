const fs = require("fs");
const path = require("path");

// 检查角色文件的函数
function checkRoleFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");

    // 检查关键元素
    const checks = {
      hasRoleDefinition: content.includes("RoleDefinition"),
      hasId: content.includes("id:"),
      hasName: content.includes("name:"),
      hasType: content.includes("type:"),
      hasDetailedDescription: content.includes("detailedDescription"),
      hasHandler: content.includes("handler:"),
      hasUndefinedHandler:
        content.includes("handler: undefined") ||
        content.includes("handler: undefined /*"),
      hasTodoComment: content.includes("TODO") || content.includes("todo:"),
    };

    const issues = [];
    if (!checks.hasRoleDefinition) issues.push("缺少RoleDefinition类型");
    if (!checks.hasId) issues.push("缺少id字段");
    if (!checks.hasName) issues.push("缺少name字段");
    if (!checks.hasType) issues.push("缺少type字段");
    if (!checks.hasDetailedDescription) issues.push("缺少detailedDescription");
    if (checks.hasUndefinedHandler) issues.push("处理程序为undefined");
    if (checks.hasTodoComment) issues.push("有TODO注释");

    return {
      file: path.basename(filePath),
      path: filePath,
      issues,
      hasIssues: issues.length > 0,
      hasUndefinedHandler: checks.hasUndefinedHandler,
      hasTodoComment: checks.hasTodoComment,
    };
  } catch (error) {
    return {
      file: path.basename(filePath),
      path: filePath,
      issues: [`读取文件失败: ${error.message}`],
      hasIssues: true,
      hasUndefinedHandler: false,
      hasTodoComment: false,
    };
  }
}

// 获取所有角色文件
function getAllRoleFiles() {
  const rolesDir = path.join(__dirname, "src", "roles");
  const roleFiles = [];

  const subdirs = ["townsfolk", "outsider", "minion", "demon"];

  subdirs.forEach((subdir) => {
    const subdirPath = path.join(rolesDir, subdir);
    if (fs.existsSync(subdirPath)) {
      const files = fs
        .readdirSync(subdirPath)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
        .map((file) => path.join(subdirPath, file));
      roleFiles.push(...files);
    }
  });

  return roleFiles;
}

// 主函数
function main() {
  console.log("开始检查角色文件...\n");

  const roleFiles = getAllRoleFiles();
  console.log(`找到 ${roleFiles.length} 个角色文件\n`);

  const results = roleFiles.map(checkRoleFile);

  // 统计
  const totalFiles = results.length;
  const filesWithIssues = results.filter((r) => r.hasIssues).length;
  const filesWithUndefinedHandler = results.filter(
    (r) => r.hasUndefinedHandler
  ).length;
  const filesWithTodo = results.filter((r) => r.hasTodoComment).length;

  console.log("=== 统计结果 ===");
  console.log(`总文件数: ${totalFiles}`);
  console.log(`有问题的文件: ${filesWithIssues}`);
  console.log(`处理程序为undefined的文件: ${filesWithUndefinedHandler}`);
  console.log(`有TODO注释的文件: ${filesWithTodo}\n`);

  // 显示有问题的文件
  const problematicFiles = results.filter((r) => r.hasIssues);
  if (problematicFiles.length > 0) {
    console.log("=== 有问题的文件 ===");
    problematicFiles.forEach((result) => {
      console.log(`\n${result.file}:`);
      result.issues.forEach((issue) => console.log(`  - ${issue}`));
    });
  }

  // 显示处理程序为undefined的文件
  const undefinedHandlerFiles = results.filter((r) => r.hasUndefinedHandler);
  if (undefinedHandlerFiles.length > 0) {
    console.log("\n=== 处理程序为undefined的文件 ===");
    undefinedHandlerFiles.forEach((result) => {
      console.log(`  - ${result.file}`);
    });
  }

  console.log("\n检查完成！");
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { checkRoleFile, getAllRoleFiles };
