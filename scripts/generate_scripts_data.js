const fs = require('fs');
const path = require('path');

// 角色名称到ID的映射 - 更完整的版本
const nameToId = {
  // 暗流涌动
  "洗衣妇": "washerwoman",
  "图书管理员": "librarian",
  "调查员": "investigator",
  "厨师": "chef",
  "共情者": "empath",
  "占卜师": "fortune_teller",
  "送葬者": "undertaker",
  "僧侣": "monk",
  "守鸦人": "ravenkeeper",
  "贞洁者": "virgin",
  "猎手": "slayer",
  "士兵": "soldier",
  "镇长": "mayor",
  "管家": "butler",
  "酒鬼": "drunk",
  "陌客": "recluse",
  "圣徒": "saint",
  "投毒者": "poisoner",
  "间谍": "spy",
  "红唇女郎": "scarlet_woman",
  "男爵": "baron",
  "小恶魔": "imp",
  
  // 黯月初升
  "祖母": "grandmother",
  "水手": "sailor",
  "侍女": "chambermaid",
  "驱魔人": "exorcist",
  "旅店老板": "innkeeper",
  "赌徒": "gambler",
  "造谣者": "gossip",
  "侍臣": "courtier",
  "教授": "professor",
  "吟游诗人": "minstrel",
  "茶艺师": "tea_lady",
  "和平主义者": "pacifist",
  "弄臣": "fool",
  "修补匠": "tinker",
  "月之子": "moonchild",
  "莽夫": "goon",
  "疯子": "lunatic",
  "教父": "godfather",
  "魔鬼代言人": "devils_advocate",
  "刺客": "assassin",
  "主谋": "mastermind",
  "僵怖": "zombuul",
  "普卡": "pukka",
  "沙巴洛斯": "shabaloth",
  "珀": "po",
  "逃亡者": "traveler_exile",
  "屠夫": "traveler_butcher",
  "圣骑士": "traveler_paladin",
  
  // 梦殒春宵
  "钟表匠": "clockmaker",
  "筑梦师": "dreamer",
  "舞蛇人": "snake_charmer",
  "数学家": "mathematician",
  "卖花女孩": "flowergirl",
  "城镇公告员": "town_crier",
  "神谕者": "oracle",
  "博学者": "savant",
  "女裁缝": "seamstress",
  "哲学家": "philosopher",
  "艺术家": "artist",
  "杂耍艺人": "juggler",
  "贤者": "sage",
  "畸形秀演员": "mutant",
  "心上人": "sweetheart",
  "理发师": "barber",
  "呆瓜": "klutz",
  "镜像双子": "evil_twin",
  "女巫": "witch",
  "洗脑师": "cerenovus",
  "麻脸巫婆": "pit_hag",
  "方古": "fang_gu",
  "亡骨魔": "vigormortis",
  "诺-达鲺": "no_dashii",
  "涡流": "vortox",
  "小提琴手": "traveler_violinist",
  
  // 窃窃私语
  "信使": "messenger",
  "傻瓜": "fool",
  "漩涡": "vortox",
  "政客": "politician",
  "疫医": "plague_doctor",
  "小偷": "thief",
  "法官": "judge",
  "乞丐": "beggar",
  "提琴手": "violinist",
  
  // 无名之墓
  "掘墓人": "gravedigger",
  "替罪羊": "scapegoat",
  "变种人": "mutant",
  "侍僧": "acolyte",
  "学者": "savant",
  "下毒者": "poisoner",
  "媚魔": "succubus",
  "尸偶": "cadaver",
  "腐化邪神": "corruptor",
  "沙布拉尔": "shabaloth",
  "流亡者": "exile",
  "巫医": "witch_doctor",
  "枪手": "gunslinger",
  
  // 无上愉悦
  "渡鸦守护者": "ravenkeeper",
  "猩红女士": "scarlet_woman",
  "僵尸": "zombuul",
  "噬魂怪": "soul_eater",
  "官员": "official",
  
  // 凶宅魅影
  "预言家": "prophet",
  "裁缝": "seamstress",
  "唱诗班男孩": "choir_boy",
  "神官": "priest",
  "公告员": "town_crier",
  "诺-达希": "no_dashii",
  "博格特": "boggart",
  "骨相师": "bone_reader",
  "朝圣者": "pilgrim",
  "魔术师": "magician",
  "走私犯": "smuggler",
  
  // 游园惊梦
  "窃贼": "thief",
  "气球驾驶员": "balloonist",
  "赏金猎人": "bounty_hunter",
  "守夜人": "nightwatchman",
  
  // 旅行者通用
  "官员": "traveler_official",
  "乞丐": "traveler_beggar",
  "枪手": "traveler_gunslinger",
  "窃贼": "traveler_thief",
  "替罪羊": "traveler_scapegoat",
  "唱诗男孩": "traveler_choir_boy",
  "国王": "traveler_king",
  "将军": "traveler_general",
  "气球驾驶员": "traveler_balloonist",
  "赏金猎人": "traveler_bounty_hunter",
  "守夜人": "traveler_nightwatchman",
  "小精灵": "traveler_pixie",
  "异教领袖": "traveler_heretic",
  "告密者": "traveler_snitch",
  "哥布林": "traveler_goblin",
  "提线木偶": "traveler_puppet",
  "炸弹人": "traveler_boomdandy"
};

// 读取所有剧本
const playDir = path.join(__dirname, '../json/play');
const files = fs.readdirSync(playDir).filter(f => f.endsWith('.json'));

const scripts = [];

// 按特定顺序处理剧本
const order = ['暗流涌动', '黯月初升', '梦殒春宵', '窃窃私语', '无名之墓', '无上愉悦', '凶宅魅影', '游园惊梦'];
const orderedFiles = order.map(name => files.find(f => f.includes(name))).filter(Boolean);

orderedFiles.forEach(file => {
  const filePath = path.join(playDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // 转换角色列表 - 只转换非旅行者角色（因为旅行者可能不在app/data.ts的roles数组中）
  const roleIds = [];
  const missingRoles = [];
  
  const categories = data.角色列表;
  
  // 处理镇民、外来者、爪牙、恶魔
  ['镇民', '外来者', '爪牙', '恶魔'].forEach(category => {
    if (categories[category]) {
      categories[category].forEach(roleName => {
        const id = nameToId[roleName];
        if (id) {
          if (!roleIds.includes(id)) {
            roleIds.push(id);
          }
        } else {
          if (!missingRoles.includes(roleName)) {
            missingRoles.push(roleName);
          }
        }
      });
    }
  });
  
  // 生成标准化的ID
  let scriptId;
  if (data.剧本名称 === '暗流涌动') scriptId = 'trouble_brewing';
  else if (data.剧本名称 === '黯月初升') scriptId = 'bad_moon_rising';
  else if (data.剧本名称 === '梦殒春宵') scriptId = 'sects_and_violets';
  else if (data.剧本名称 === '窃窃私语') scriptId = 'whispering_secrets';
  else if (data.剧本名称 === '无名之墓') scriptId = 'tomb_of_the_unknown';
  else if (data.剧本名称 === '无上愉悦') scriptId = 'high_pleasure';
  else if (data.剧本名称 === '凶宅魅影') scriptId = 'haunted_manor';
  else if (data.剧本名称 === '游园惊梦') scriptId = 'garden_of_dreams';
  else scriptId = data.id;
  
  scripts.push({
    id: scriptId,
    name: data.剧本名称,
    difficulty: data.难度,
    description: data.简要介绍?.substring(0, 200) || '',
    roleIds
  });
});

// 生成 TypeScript 代码
const tsCode = `// 剧本列表
export const scripts: Script[] = [
${scripts.map(s => `  {
    id: "${s.id}",
    name: "${s.name}",
    difficulty: "${s.difficulty}",
    description: "${s.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}",
    roleIds: [
${s.roleIds.map(id => `      "${id}"`).join(',\n')}
    ],
  }`).join(',\n')}
];`;

console.log(tsCode);

// 保存到临时文件
fs.writeFileSync(path.join(__dirname, '../temp_scripts.txt'), tsCode);
console.log('\n✅ 已生成 temp_scripts.txt');
