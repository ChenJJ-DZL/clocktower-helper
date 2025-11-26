// app/data.ts

// 1. 角色阵营
export type RoleType = "townsfolk" | "outsider" | "minion" | "demon";

// 2. 夜晚动作类型 (核心字典，page.tsx 里的红线通常是因为缺了这里的定义)
export type NightActionType = 
  | "poison"        // 投毒 (投毒者)
  | "kill"          // 杀人 (恶魔)
  | "protect"       // 保护 (僧侣)
  | "mark"          // 标记 (管家)
  | "inspect"       // 查验 (占卜师)
  | "inspect_death" // 死后查验 (守鸦人 - 关键！缺了这个会报错)
  | "none";         // 无动作

// 3. 角色接口
export interface Role {
  id: string;
  name: string;
  type: RoleType;
  ability: string;
  firstNight: boolean;
  otherNight: boolean;
  firstNightOrder: number;
  otherNightOrder: number;
  firstNightReminder?: string;
  otherNightReminder?: string;
  nightActionType?: NightActionType; 
}

// 4. 完整角色数据 (灾祸滋生)
export const roles: Role[] = [
  // --- 爪牙 ---
  {
    id: "poisoner",
    name: "投毒者",
    type: "minion",
    ability: "每个夜晚，选择一名玩家中毒。",
    firstNight: true, otherNight: true,
    firstNightOrder: 1, otherNightOrder: 1,
    nightActionType: "poison"
  },
  {
    id: "spy",
    name: "间谍",
    type: "minion",
    ability: "每晚查看魔法书。",
    firstNight: true, otherNight: true,
    firstNightOrder: 15, otherNightOrder: 15,
    nightActionType: "none"
  },
  {
    id: "scarlet_woman",
    name: "猩红女巫",
    type: "minion",
    ability: "恶魔死后变身。",
    firstNight: true, otherNight: true,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "baron",
    name: "男爵",
    type: "minion",
    ability: "增加外来者。",
    firstNight: true, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },

  // --- 恶魔 ---
  {
    id: "imp",
    name: "小恶魔",
    type: "demon",
    ability: "每晚杀一人。",
    firstNight: true, otherNight: true,
    firstNightOrder: 2, otherNightOrder: 3,
    nightActionType: "kill"
  },

  // --- 村民 ---
  {
    id: "washerwoman",
    name: "洗衣妇",
    type: "townsfolk",
    ability: "得知一名村民身份。",
    firstNight: true, otherNight: false,
    firstNightOrder: 4, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "librarian",
    name: "图书管理员",
    type: "townsfolk",
    ability: "得知一名外来者身份。",
    firstNight: true, otherNight: false,
    firstNightOrder: 5, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "investigator",
    name: "调查员",
    type: "townsfolk",
    ability: "得知一名爪牙身份。",
    firstNight: true, otherNight: false,
    firstNightOrder: 6, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "chef",
    name: "厨师",
    type: "townsfolk",
    ability: "得知邪恶相邻对数。",
    firstNight: true, otherNight: false,
    firstNightOrder: 7, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "empath",
    name: "共情者",
    type: "townsfolk",
    ability: "得知邪恶邻居数量。",
    firstNight: true, otherNight: true,
    firstNightOrder: 8, otherNightOrder: 8,
    nightActionType: "none"
  },
  {
    id: "fortune_teller",
    name: "占卜师",
    type: "townsfolk",
    ability: "查验是否有恶魔。",
    firstNight: true, otherNight: true,
    firstNightOrder: 9, otherNightOrder: 9,
    nightActionType: "inspect"
  },
  {
    id: "undertaker",
    name: "掘墓人",
    type: "townsfolk",
    ability: "得知白天被处决者的角色。",
    firstNight: false, otherNight: true,
    firstNightOrder: 0, otherNightOrder: 10,
    nightActionType: "none"
  },
  {
    id: "monk",
    name: "僧侣",
    type: "townsfolk",
    ability: "保护一名玩家。",
    firstNight: false, otherNight: true,
    firstNightOrder: 0, otherNightOrder: 2,
    nightActionType: "protect"
  },
  {
    id: "ravenkeeper",
    name: "守鸦人",
    type: "townsfolk",
    ability: "若夜晚死亡，得知一角色。",
    firstNight: false, otherNight: true,
    firstNightOrder: 0, otherNightOrder: 11,
    nightActionType: "inspect_death" // 关键动作
  },
  {
    id: "virgin",
    name: "圣女",
    type: "townsfolk",
    ability: "被提名则处决提名者。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "slayer",
    name: "杀手",
    type: "townsfolk",
    ability: "击杀恶魔。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "soldier",
    name: "士兵",
    type: "townsfolk",
    ability: "免死。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "mayor",
    name: "市长",
    type: "townsfolk",
    ability: "苟活获胜。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },

  // --- 外来者 ---
  {
    id: "butler",
    name: "管家",
    type: "outsider",
    ability: "选择主人。",
    firstNight: true, otherNight: true,
    firstNightOrder: 10, otherNightOrder: 12,
    nightActionType: "mark"
  },
  {
    id: "drunk",
    name: "酒鬼",
    type: "outsider",
    ability: "以为自己是村民。",
    firstNight: true, otherNight: true,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "recluse",
    name: "隐士",
    type: "outsider",
    ability: "可能被判为邪恶。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  },
  {
    id: "saint",
    name: "圣徒",
    type: "outsider",
    ability: "被处决则输。",
    firstNight: false, otherNight: false,
    firstNightOrder: 0, otherNightOrder: 0,
    nightActionType: "none"
  }
];