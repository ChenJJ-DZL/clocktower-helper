const fs = require("node:fs");
const path = require("node:path");

// 读取规则文件
const ruleFirstNight = JSON.parse(
  fs.readFileSync("./json/rule/夜晚行动顺序一览（首夜）.json", "utf8")
);
const ruleOtherNights = JSON.parse(
  fs.readFileSync("./json/rule/夜晚行动顺序一览（其他夜晚）.json", "utf8")
);

// 读取项目文件
const projectNightOrder = JSON.parse(
  fs.readFileSync("./src/data/nightOrder.json", "utf8")
);

// 从规则文件中提取ID（中文名称映射）
function extractIdsFromRule(ruleArray) {
  return ruleArray.map((item) => {
    const desc = item.描述;
    // 尝试提取ID：通常第一个中文名是角色名
    const chineseMatch = desc.match(/[\u4e00-\u9fff]+/);
    if (chineseMatch) {
      return chineseMatch[0];
    }
    return item.序号;
  });
}

// 从项目中提取ID
const projectFirstIds = projectNightOrder.firstNight.map((item) => item.id);
const projectOtherIds = projectNightOrder.otherNights.map((item) => item.id);

// 规则中的ID（简单使用序号）
const ruleFirstIds = ruleFirstNight.行动顺序.map(
  (item) => item.序号.split(".")[1]?.trim() || item.序号
);
const ruleOtherIds = ruleOtherNights.行动顺序.map(
  (item) => item.序号.split(".")[1]?.trim() || item.序号
);

console.log("=== 首夜行动顺序比较 ===");
console.log(`规则文件数量: ${ruleFirstIds.length}`);
console.log(`项目实现数量: ${projectFirstIds.length}`);
console.log("规则文件中的行动:");
ruleFirstNight.行动顺序.forEach((item, _idx) => {
  console.log(`  ${item.序号}: ${item.描述.substring(0, 50)}...`);
});

console.log("\n项目中缺失的行动（在规则中但不在项目中）:");
ruleFirstNight.行动顺序.forEach((item) => {
  const chineseName = item.描述.match(/[\u4e00-\u9fff]+/)?.[0];
  if (chineseName) {
    // 检查项目中是否有类似的中文名
    const found = projectNightOrder.firstNight.find(
      (p) =>
        p.chineseName.includes(chineseName) ||
        p.description.includes(chineseName)
    );
    if (!found) {
      console.log(
        `  ${item.序号}: ${chineseName} - ${item.描述.substring(0, 60)}...`
      );
    }
  }
});

console.log("\n=== 其他夜晚行动顺序比较 ===");
console.log(`规则文件数量: ${ruleOtherIds.length}`);
console.log(`项目实现数量: ${projectOtherIds.length}`);
console.log("规则文件中的行动（前10个）:");
ruleOtherNights.行动顺序.slice(0, 10).forEach((item, _idx) => {
  console.log(`  ${item.序号}: ${item.描述.substring(0, 50)}...`);
});

console.log("\n项目中缺失的行动（在规则中但不在项目中）:");
let missingCount = 0;
ruleOtherNights.行动顺序.forEach((item) => {
  const chineseName = item.描述.match(/[\u4e00-\u9fff]+/)?.[0];
  if (chineseName) {
    // 检查项目中是否有类似的中文名
    const found = projectNightOrder.otherNights.find(
      (p) =>
        p.chineseName.includes(chineseName) ||
        p.description.includes(chineseName)
    );
    if (!found) {
      console.log(
        `  ${item.序号}: ${chineseName} - ${item.描述.substring(0, 60)}...`
      );
      missingCount++;
    }
  }
});
console.log(`总计缺失: ${missingCount} 个行动`);

// 检查顺序差异
console.log("\n=== 顺序差异检查 ===");
console.log("首夜前10个行动顺序比较:");
for (
  let i = 0;
  i <
  Math.min(
    10,
    ruleFirstNight.行动顺序.length,
    projectNightOrder.firstNight.length
  );
  i++
) {
  const ruleItem = ruleFirstNight.行动顺序[i];
  const projectItem = projectNightOrder.firstNight[i];
  const ruleDesc = ruleItem.描述.substring(0, 30);
  const projectDesc = projectItem.description.substring(0, 30);
  if (!projectDesc.includes(ruleDesc.substring(0, 10))) {
    console.log(`  位置 ${i + 1}: 规则="${ruleDesc}" vs 项目="${projectDesc}"`);
  }
}
