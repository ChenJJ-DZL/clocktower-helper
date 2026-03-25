const fs = require("fs");
const path = require("path");

// 读取相克规则文件
const jinxRulesPath = path.join(__dirname, "..", "json", "相克规则.json");
const jinxRulesContent = fs.readFileSync(jinxRulesPath, "utf-8");

// 解析相克规则
const lines = jinxRulesContent.split("\n");
const jinxes = [];

let currentJinx = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // 跳过空行和注释
  if (
    !line ||
    line.startsWith("相克规则") ||
    line.startsWith("本页面") ||
    line.startsWith("相关说明") ||
    line.startsWith("如果说书人") ||
    line.startsWith("对于所有") ||
    line.startsWith("诸如麻脸巫婆") ||
    line.startsWith("2025年") ||
    line.startsWith("此次相克规则") ||
    line.startsWith("卡扎力与唱诗男孩") ||
    line.startsWith("卡扎力与莽夫") ||
    line.startsWith("卡扎力与巡山人") ||
    line.startsWith("卡扎力与士兵") ||
    line.startsWith("提线木偶与落难少女") ||
    line.startsWith("提线木偶与罂粟种植者") ||
    line.startsWith("提线木偶与告密者") ||
    line.startsWith("提线木偶与亡魂") ||
    line.startsWith("暂时没有相克规则") ||
    line.startsWith("与华灯初上系列角色相关的相克规则")
  ) {
    continue;
  }

  // 检测相克规则行（包含"与"字）
  if (line.includes("与") && line.includes("：")) {
    // 如果有上一个相克规则，保存它
    if (currentJinx) {
      jinxes.push(currentJinx);
    }

    // 解析新的相克规则
    const [charactersPart, descriptionPart] = line.split("：");
    const [character1, character2] = charactersPart.split("与");

    currentJinx = {
      id: `${character1.trim()}_${character2.trim()}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_"),
      character1: character1
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_"),
      character2: character2
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_"),
      description: descriptionPart ? descriptionPart.trim() : "",
    };
  } else if (currentJinx && line) {
    // 如果当前有相克规则，且这一行不是空行，可能是描述的延续
    if (currentJinx.description) {
      currentJinx.description += " " + line.trim();
    } else {
      currentJinx.description = line.trim();
    }
  }
}

// 添加最后一个相克规则
if (currentJinx) {
  jinxes.push(currentJinx);
}

// 读取现有的jinxes.json
const existingJinxesPath = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "jinxes.json"
);
let existingJinxes = [];
try {
  const existingContent = fs.readFileSync(existingJinxesPath, "utf-8");
  existingJinxes = JSON.parse(existingContent);
} catch (error) {
  console.log("无法读取现有的jinxes.json文件，将创建新的");
}

// 合并相克规则，避免重复
const mergedJinxes = [...existingJinxes];
const existingIds = new Set(existingJinxes.map((j) => j.id));

for (const jinx of jinxes) {
  if (!existingIds.has(jinx.id)) {
    mergedJinxes.push(jinx);
    existingIds.add(jinx.id);
  }
}

// 保存到jinxes.json
fs.writeFileSync(
  existingJinxesPath,
  JSON.stringify(mergedJinxes, null, 2),
  "utf-8"
);

console.log(`成功提取了 ${jinxes.length} 条相克规则`);
console.log(`现有相克规则总数：${existingJinxes.length}`);
console.log(`合并后相克规则总数：${mergedJinxes.length}`);
console.log(`新增相克规则：${mergedJinxes.length - existingJinxes.length}`);

// 输出一些示例
console.log("\n示例相克规则：");
for (let i = 0; i < Math.min(5, mergedJinxes.length); i++) {
  const jinx = mergedJinxes[i];
  console.log(
    `${jinx.id}: ${jinx.character1} 与 ${jinx.character2} - ${jinx.description.substring(0, 50)}...`
  );
}
