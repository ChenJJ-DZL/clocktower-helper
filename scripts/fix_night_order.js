/**
 * 自动补充 nightOrder.json 中缺失的角色
 * 基于 rolesData.json 中的 firstNightOrder/otherNightOrder 值
 */
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..");
const rolesData = JSON.parse(
  fs.readFileSync(path.join(BASE, "src/data/rolesData.json"), "utf-8")
);
const nightOrder = JSON.parse(
  fs.readFileSync(path.join(BASE, "src/data/nightOrder.json"), "utf-8")
);

// 现有夜晚顺序中的角色 ID
const existingFirstNightIds = new Set(nightOrder.firstNight.map((n) => n.id));
const existingOtherNightIds = new Set(nightOrder.otherNights.map((n) => n.id));

let addedFirstNight = 0;
let addedOtherNight = 0;

// 找出需要添加的角色
rolesData.forEach((role) => {
  if (role.type === "traveler") return; // 旅行者不需要夜晚顺序

  // 添加首夜顺序
  if (role.firstNightOrder && !existingFirstNightIds.has(role.id)) {
    nightOrder.firstNight.push({
      id: role.id,
      chineseName: role.name,
      englishName: role.id,
      description: role.firstNightMeta?.instruction || `${role.name}的首夜能力`,
    });
    addedFirstNight++;
  }

  // 添加其他夜晚顺序
  if (role.otherNightOrder && !existingOtherNightIds.has(role.id)) {
    nightOrder.otherNights.push({
      id: role.id,
      chineseName: role.name,
      englishName: role.id,
      description: role.otherNightMeta?.instruction || `${role.name}的夜晚能力`,
    });
    addedOtherNight++;
  }
});

// 按顺序排序
nightOrder.firstNight.sort((a, b) => {
  const aRole = rolesData.find((r) => r.id === a.id);
  const bRole = rolesData.find((r) => r.id === b.id);
  return (aRole?.firstNightOrder || 0) - (bRole?.firstNightOrder || 0);
});

nightOrder.otherNights.sort((a, b) => {
  const aRole = rolesData.find((r) => r.id === a.id);
  const bRole = rolesData.find((r) => r.id === b.id);
  return (aRole?.otherNightOrder || 0) - (bRole?.otherNightOrder || 0);
});

// 写回文件
fs.writeFileSync(
  path.join(BASE, "src/data/nightOrder.json"),
  JSON.stringify(nightOrder, null, 2),
  "utf-8"
);

console.log("✅ 已补充夜晚顺序数据:");
console.log(`   首夜: +${addedFirstNight} 个角色`);
console.log(`   其他夜: +${addedOtherNight} 个角色`);
console.log(`   总计首夜: ${nightOrder.firstNight.length} 个角色`);
console.log(`   总计其他夜: ${nightOrder.otherNights.length} 个角色`);
