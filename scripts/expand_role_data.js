const fs = require("node:fs");
const path = require("node:path");

// 读取现有角色数据
const rolesDataPath = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "rolesData.json"
);
const rolesData = JSON.parse(fs.readFileSync(rolesDataPath, "utf-8"));

// 读取夜晚行动顺序数据，获取所有角色
const nightOrderPath = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "nightOrder.json"
);
const nightOrder = JSON.parse(fs.readFileSync(nightOrderPath, "utf-8"));

// 读取相克规则数据，获取所有角色
const jinxesPath = path.join(__dirname, "..", "src", "data", "jinxes.json");
const jinxes = JSON.parse(fs.readFileSync(jinxesPath, "utf-8"));

// 收集所有已知角色ID
const allRoleIds = new Set();

// 从现有角色数据中添加
for (const role of rolesData) {
  allRoleIds.add(role.id);
}

// 从夜晚行动顺序中添加
for (const action of nightOrder.firstNight) {
  allRoleIds.add(action.id);
}
for (const action of nightOrder.otherNights) {
  allRoleIds.add(action.id);
}

// 从相克规则中添加
for (const jinx of jinxes) {
  allRoleIds.add(jinx.character1);
  allRoleIds.add(jinx.character2);
}

// 角色类型映射（根据角色ID推断类型）
const roleTypeMap = {
  // 镇民
  washerwoman: "townsfolk",
  librarian: "townsfolk",
  investigator: "townsfolk",
  chef: "townsfolk",
  empath: "townsfolk",
  fortune_teller: "townsfolk",
  undertaker: "townsfolk",
  monk: "townsfolk",
  ravenkeeper: "townsfolk",
  virgin: "townsfolk",
  slayer: "townsfolk",
  soldier: "townsfolk",
  mayor: "townsfolk",
  grandmother: "townsfolk",
  sailor: "townsfolk",
  chambermaid: "townsfolk",
  exorcist: "townsfolk",
  innkeeper: "townsfolk",
  gambler: "townsfolk",
  gossip: "townsfolk",
  courtier: "townsfolk",
  professor: "townsfolk",
  minstrel: "townsfolk",
  tea_lady: "townsfolk",
  pacifist: "townsfolk",
  fool: "townsfolk",
  philosopher: "townsfolk",
  clockmaker: "townsfolk",
  dreamer: "townsfolk",
  snake_charmer: "townsfolk",
  flowergirl: "townsfolk",
  town_crier: "townsfolk",
  mathematician: "townsfolk",
  oracle: "townsfolk",
  savant: "townsfolk",
  seamstress: "townsfolk",
  artist: "townsfolk",
  juggler: "townsfolk",
  sage: "townsfolk",

  // 外来者
  butler: "outsider",
  drunk: "outsider",
  recluse: "outsider",
  saint: "outsider",
  goon: "outsider",
  lunatic: "outsider",
  tinker: "outsider",
  moonchild: "outsider",
  mutant: "outsider",
  sweetheart: "outsider",
  barber: "outsider",
  klutz: "outsider",

  // 爪牙
  poisoner: "minion",
  spy: "minion",
  scarlet_woman: "minion",
  baron: "minion",
  godfather: "minion",
  devils_advocate: "minion",
  assassin: "minion",
  mastermind: "minion",
  witch: "minion",
  cerenovus: "minion",
  pit_hag: "minion",
  evil_twin: "minion",

  // 恶魔
  imp: "demon",
  zombuul: "demon",
  pukka: "demon",
  shabaloth: "demon",
  po: "demon",
  fang_gu: "demon",
  vortox: "demon",
  no_dashii: "demon",
  vigormortis: "demon",
};

// 角色名称映射
const roleNameMap = {
  washerwoman: "洗衣妇",
  librarian: "图书管理员",
  investigator: "调查员",
  chef: "厨师",
  empath: "共情者",
  fortune_teller: "占卜师",
  undertaker: "送葬者",
  monk: "僧侣",
  ravenkeeper: "守鸦人",
  virgin: "贞洁者",
  slayer: "猎手",
  soldier: "士兵",
  mayor: "镇长",
  grandmother: "祖母",
  sailor: "水手",
  chambermaid: "侍女",
  exorcist: "驱魔人",
  innkeeper: "旅店老板",
  gambler: "赌徒",
  gossip: "造谣者",
  courtier: "廷臣",
  professor: "教授",
  minstrel: "吟游诗人",
  tea_lady: "茶女",
  pacifist: "和平主义者",
  fool: "愚人",
  philosopher: "哲学家",
  clockmaker: "钟表匠",
  dreamer: "筑梦师",
  snake_charmer: "弄蛇人",
  flowergirl: "卖花女孩",
  town_crier: "城镇公告员",
  mathematician: "数学家",
  oracle: "神谕者",
  savant: "博学者",
  seamstress: "女裁缝",
  artist: "艺人",
  juggler: "杂耍艺人",
  sage: "哲人",
  butler: "管家",
  drunk: "酒鬼",
  recluse: "隐士",
  saint: "圣徒",
  goon: "暴徒",
  lunatic: "疯子",
  tinker: "修补匠",
  moonchild: "月之子",
  mutant: "变种人",
  sweetheart: "心上人",
  barber: "理发师",
  klutz: "笨蛋",
  poisoner: "投毒者",
  spy: "间谍",
  scarlet_woman: "红罗刹",
  baron: "男爵",
  godfather: "教父",
  devils_advocate: "魔鬼代言人",
  assassin: "刺客",
  mastermind: "主谋",
  witch: "女巫",
  cerenovus: "洗脑师",
  pit_hag: "麻脸巫婆",
  evil_twin: "邪恶双子",
  imp: "小恶魔",
  zombuul: "僵怖",
  pukka: "普卡",
  shabaloth: "沙巴洛斯",
  po: "珀",
  fang_gu: "方古",
  vortox: "涡流",
  no_dashii: "诺-达",
  vigormortis: "亡骨魔",
};

// 创建新角色数据
const newRoles = [];

// 首先添加现有角色
for (const role of rolesData) {
  newRoles.push(role);
}

// 为缺失的角色创建基本数据
for (const roleId of allRoleIds) {
  // 检查是否已存在
  const exists = newRoles.some((role) => role.id === roleId);
  if (exists) continue;

  // 推断角色类型
  let type = roleTypeMap[roleId] || "townsfolk"; // 默认为镇民

  // 根据角色ID推断类型
  if (
    roleId.includes("demon") ||
    roleId.includes("imp") ||
    roleId.includes("zomb") ||
    roleId.includes("pukka") ||
    roleId.includes("shabaloth") ||
    roleId.includes("po") ||
    roleId.includes("fang") ||
    roleId.includes("vortox") ||
    roleId.includes("vigormortis") ||
    roleId.includes("hadesia") ||
    roleId.includes("kazali") ||
    roleId.includes("taowu") ||
    roleId.includes("lord_of_typhon") ||
    roleId.includes("lleech") ||
    roleId.includes("lil_monsta") ||
    roleId.includes("yaggababble") ||
    roleId.includes("chaos") ||
    roleId.includes("qiongqi") ||
    roleId.includes("taotie")
  ) {
    type = "demon";
  } else if (
    roleId.includes("minion") ||
    roleId.includes("poisoner") ||
    roleId.includes("spy") ||
    roleId.includes("scarlet") ||
    roleId.includes("baron") ||
    roleId.includes("godfather") ||
    roleId.includes("devils") ||
    roleId.includes("assassin") ||
    roleId.includes("mastermind") ||
    roleId.includes("witch") ||
    roleId.includes("cerenovus") ||
    roleId.includes("pit_hag") ||
    roleId.includes("evil_twin") ||
    roleId.includes("widow") ||
    roleId.includes("wraith") ||
    roleId.includes("summoner") ||
    roleId.includes("fearmonger") ||
    roleId.includes("harpy") ||
    roleId.includes("mezepheles") ||
    roleId.includes("fox_spirit") ||
    roleId.includes("organ_grinder") ||
    roleId.includes("snitch") ||
    roleId.includes("marionette")
  ) {
    type = "minion";
  } else if (
    roleId.includes("outsider") ||
    roleId.includes("butler") ||
    roleId.includes("drunk") ||
    roleId.includes("recluse") ||
    roleId.includes("saint") ||
    roleId.includes("goon") ||
    roleId.includes("lunatic") ||
    roleId.includes("tinker") ||
    roleId.includes("moonchild") ||
    roleId.includes("mutant") ||
    roleId.includes("sweetheart") ||
    roleId.includes("barber") ||
    roleId.includes("klutz") ||
    roleId.includes("damsel") ||
    roleId.includes("heretic") ||
    roleId.includes("politician") ||
    roleId.includes("ogre") ||
    roleId.includes("zealot") ||
    roleId.includes("villager") ||
    roleId.includes("villageidiot")
  ) {
    type = "outsider";
  }

  // 获取角色名称
  const name = roleNameMap[roleId] || roleId.replace(/_/g, " ");

  // 创建基本角色数据
  const newRole = {
    id: roleId,
    name: name,
    type: type,
  };

  newRoles.push(newRole);
}

// 按角色类型和ID排序
newRoles.sort((a, b) => {
  // 首先按类型排序：镇民、外来者、爪牙、恶魔
  const typeOrder = { townsfolk: 0, outsider: 1, minion: 2, demon: 3 };
  const typeCompare = typeOrder[a.type] - typeOrder[b.type];
  if (typeCompare !== 0) return typeCompare;

  // 然后按ID排序
  return a.id.localeCompare(b.id);
});

// 保存扩展后的角色数据
fs.writeFileSync(rolesDataPath, JSON.stringify(newRoles, null, 2), "utf-8");

console.log("角色数据扩展完成");
console.log(`原始角色数量：${rolesData.length}`);
console.log(`扩展后角色数量：${newRoles.length}`);
console.log(`新增角色数量：${newRoles.length - rolesData.length}`);

// 统计各类型角色数量
const typeCounts = {
  townsfolk: 0,
  outsider: 0,
  minion: 0,
  demon: 0,
};

for (const role of newRoles) {
  typeCounts[role.type]++;
}

console.log("\n角色类型分布：");
console.log(`镇民：${typeCounts.townsfolk}`);
console.log(`外来者：${typeCounts.outsider}`);
console.log(`爪牙：${typeCounts.minion}`);
console.log(`恶魔：${typeCounts.demon}`);

// 输出一些新增角色示例
console.log("\n新增角色示例：");
const addedRoles = newRoles.filter(
  (newRole) => !rolesData.some((oldRole) => oldRole.id === newRole.id)
);

for (let i = 0; i < Math.min(10, addedRoles.length); i++) {
  const role = addedRoles[i];
  console.log(`${role.name} (${role.id}): ${role.type}`);
}
