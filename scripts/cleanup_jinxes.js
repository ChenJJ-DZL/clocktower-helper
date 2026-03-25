const fs = require("fs");
const path = require("path");

// 读取jinxes.json
const jinxesPath = path.join(__dirname, "..", "src", "data", "jinxes.json");
const jinxesContent = fs.readFileSync(jinxesPath, "utf-8");
const jinxes = JSON.parse(jinxesContent);

// 角色名称映射表（补充）
const roleNameMap = {
  莽夫: "goon",
  帽匠: "hatter",
  军团: "legion",
  工程师: "engineer",
  __: "hatter", // 猜测
  ___: "legion", // 猜测
  ____: "engineer", // 猜测
};

// 清理函数
function cleanupJinx(jinx) {
  // 修复角色名称
  if (roleNameMap[jinx.character1]) {
    jinx.character1 = roleNameMap[jinx.character1];
  }
  if (roleNameMap[jinx.character2]) {
    jinx.character2 = roleNameMap[jinx.character2];
  }

  // 重新生成ID
  jinx.id = `${jinx.character1}_${jinx.character2}`;

  // 清理描述
  if (jinx.description) {
    // 移除多余的空格和换行
    jinx.description = jinx.description.replace(/\s+/g, " ").trim();
  }

  return jinx;
}

// 清理所有相克规则
const cleanedJinxes = jinxes.map(cleanupJinx);

// 过滤掉无效的规则
const validJinxes = cleanedJinxes.filter(
  (jinx) =>
    jinx.character1 &&
    jinx.character2 &&
    jinx.character1.length > 1 &&
    jinx.character2.length > 1 &&
    !jinx.character1.includes("_") && // 避免像"__"这样的角色名
    !jinx.character2.includes("_") &&
    jinx.description &&
    jinx.description.length > 5
);

// 去重（按ID）
const uniqueJinxes = [];
const seenIds = new Set();

for (const jinx of validJinxes) {
  if (!seenIds.has(jinx.id)) {
    uniqueJinxes.push(jinx);
    seenIds.add(jinx.id);
  }
}

// 按ID排序
uniqueJinxes.sort((a, b) => a.id.localeCompare(b.id));

// 保存清理后的文件
fs.writeFileSync(jinxesPath, JSON.stringify(uniqueJinxes, null, 2), "utf-8");

console.log(`原始相克规则数量：${jinxes.length}`);
console.log(`清理后相克规则数量：${uniqueJinxes.length}`);
console.log(`移除无效规则：${jinxes.length - uniqueJinxes.length}`);

// 输出一些示例
console.log("\n清理后的示例相克规则：");
for (let i = 0; i < Math.min(5, uniqueJinxes.length); i++) {
  const jinx = uniqueJinxes[i];
  console.log(`${jinx.id}: ${jinx.character1} 与 ${jinx.character2}`);
  console.log(
    `  描述: ${jinx.description.substring(0, 80)}${jinx.description.length > 80 ? "..." : ""}`
  );
  console.log("");
}
