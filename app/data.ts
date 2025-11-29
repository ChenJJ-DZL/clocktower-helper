// app/data.ts - 血染钟楼 Trouble Brewing 角色数据与类型定义

export type RoleType = "townsfolk" | "outsider" | "minion" | "demon";

export type GamePhase = "setup" | "check" | "firstNight" | "day" | "dusk" | "night" | "dawnReport" | "gameOver";

export type WinResult = "good" | "evil" | null;

export type NightActionType = 
  | "poison"        // 投毒
  | "kill"          // 杀人
  | "protect"       // 保护
  | "mark"          // 标记 (管家)
  | "inspect"       // 查验 (占卜师)
  | "inspect_death" // 验尸 (守鸦人)
  | "spy_info"      // 间谍信息
  | "none";         // 无动作

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

export interface Seat {
  id: number;
  role: Role | null;
  charadeRole: Role | null;
  isDead: boolean;
  isDrunk: boolean;
  isPoisoned: boolean;
  isProtected: boolean;
  protectedBy: number | null; // 记录保护者的ID
  isRedHerring: boolean;
  isSentenced: boolean;
  masterId: number | null;
  hasUsedSlayerAbility: boolean;
  hasUsedVirginAbility: boolean;
  isDemonSuccessor: boolean;
  statusDetails: string[]; 
  voteCount?: number;
  isCandidate?: boolean;
}

export interface LogEntry {
  day: number;
  phase: string;
  message: string;
}

// 工具函数
export const formatTime = (date: Date) => {
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(/\//g, '-');
};

// 动态计算圆桌坐标
export function getSeatPosition(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const radius = 38;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x: x.toFixed(2), y: y.toFixed(2) };
}

// 角色数据 - 22个角色 (Trouble Brewing)
export const roles: Role[] = [
  // ========== 镇民 (Townsfolk) - 13个 ==========
  { 
    id: "washerwoman", 
    name: "洗衣妇", 
    type: "townsfolk", 
    ability: "首夜得知一名村民的具体身份。", 
    firstNight: true, 
    otherNight: false, 
    firstNightOrder: 4, 
    otherNightOrder: 0, 
    nightActionType: "none", 
    firstNightReminder: "查村民" 
  },
  { 
    id: "librarian", 
    name: "图书管理员", 
    type: "townsfolk", 
    ability: "首夜得知一名外来者的具体身份。", 
    firstNight: true, 
    otherNight: false, 
    firstNightOrder: 5, 
    otherNightOrder: 0, 
    nightActionType: "none", 
    firstNightReminder: "查外来者" 
  },
  { 
    id: "investigator", 
    name: "调查员", 
    type: "townsfolk", 
    ability: "首夜得知一名爪牙的具体身份。", 
    firstNight: true, 
    otherNight: false, 
    firstNightOrder: 6, 
    otherNightOrder: 0, 
    nightActionType: "none", 
    firstNightReminder: "查爪牙" 
  },
  { 
    id: "chef", 
    name: "厨师", 
    type: "townsfolk", 
    ability: "首夜得知有多少对邪恶玩家相邻。", 
    firstNight: true, 
    otherNight: false, 
    firstNightOrder: 7, 
    otherNightOrder: 0, 
    nightActionType: "none", 
    firstNightReminder: "查对数" 
  },
  { 
    id: "empath", 
    name: "共情者", 
    type: "townsfolk", 
    ability: "每晚得知存活邻居中邪恶玩家的数量。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 8, 
    otherNightOrder: 8, 
    nightActionType: "none", 
    firstNightReminder: "查邻居", 
    otherNightReminder: "查邻居" 
  },
  { 
    id: "fortune_teller", 
    name: "占卜师", 
    type: "townsfolk", 
    ability: "每晚选择2名玩家，得知其中是否有恶魔或红罗刹。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 9, 
    otherNightOrder: 9, 
    nightActionType: "inspect", 
    firstNightReminder: "查恶魔", 
    otherNightReminder: "查恶魔" 
  },
  { 
    id: "undertaker", 
    name: "送葬者", 
    type: "townsfolk", 
    ability: "非首夜得知今天被处决并死亡的玩家角色。", 
    firstNight: false, 
    otherNight: true, 
    firstNightOrder: 0, 
    otherNightOrder: 10, 
    nightActionType: "none", 
    otherNightReminder: "查死人" 
  },
  { 
    id: "monk", 
    name: "僧侣", 
    type: "townsfolk", 
    ability: "非首夜保护一名玩家，防止恶魔杀害。", 
    firstNight: false, 
    otherNight: true, 
    firstNightOrder: 0, 
    otherNightOrder: 2, 
    nightActionType: "protect", 
    otherNightReminder: "保护" 
  },
  { 
    id: "ravenkeeper", 
    name: "守鸦人", 
    type: "townsfolk", 
    ability: "夜晚死亡时唤醒，选择一名玩家，得知其真实角色。", 
    firstNight: false, 
    otherNight: true, 
    firstNightOrder: 0, 
    otherNightOrder: 11, 
    nightActionType: "inspect_death", 
    otherNightReminder: "若死查验" 
  },
  { 
    id: "virgin", 
    name: "贞洁者", 
    type: "townsfolk", 
    ability: "首次被镇民提名的瞬间，提名者被处决。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "slayer", 
    name: "猎手", 
    type: "townsfolk", 
    ability: "白天可指定一名玩家，若为恶魔，恶魔死。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "soldier", 
    name: "士兵", 
    type: "townsfolk", 
    ability: "被恶魔攻击时不会死亡。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "mayor", 
    name: "市长", 
    type: "townsfolk", 
    ability: "若仅剩3人且无人被处决，好人获胜。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  
  // ========== 外来者 (Outsider) - 4个 ==========
  { 
    id: "butler", 
    name: "管家", 
    type: "outsider", 
    ability: "每晚选择一名主人，必须投票给主人。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 10, 
    otherNightOrder: 12, 
    nightActionType: "mark", 
    firstNightReminder: "选主人", 
    otherNightReminder: "选主人" 
  },
  { 
    id: "drunk", 
    name: "酒鬼", 
    type: "outsider", 
    ability: "误以为自己是镇民，实际是酒鬼。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "recluse", 
    name: "陌客", 
    type: "outsider", 
    ability: "判定阵营时可能被视为邪恶/爪牙/恶魔。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "saint", 
    name: "圣徒", 
    type: "outsider", 
    ability: "若死于处决，邪恶方立即获胜。", 
    firstNight: false, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  
  // ========== 爪牙 (Minion) - 4个 ==========
  { 
    id: "poisoner", 
    name: "投毒者", 
    type: "minion", 
    ability: "每晚选一名玩家中毒，中毒者获得错误信息。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 1, 
    otherNightOrder: 1, 
    nightActionType: "poison", 
    firstNightReminder: "投毒", 
    otherNightReminder: "投毒" 
  },
  { 
    id: "spy", 
    name: "间谍", 
    type: "minion", 
    ability: "每晚查看魔典（所有真实身份）和完整行动日志。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 15, 
    otherNightOrder: 15, 
    nightActionType: "spy_info", 
    firstNightReminder: "看书", 
    otherNightReminder: "看书" 
  },
  { 
    id: "scarlet_woman", 
    name: "红唇女郎", 
    type: "minion", 
    ability: "若恶魔死时活人>=5，她变恶魔。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  { 
    id: "baron", 
    name: "男爵", 
    type: "minion", 
    ability: "Setup阶段增加2个外来者替换镇民。", 
    firstNight: true, 
    otherNight: false, 
    firstNightOrder: 0, 
    otherNightOrder: 0, 
    nightActionType: "none" 
  },
  
  // ========== 恶魔 (Demon) - 1个 ==========
  { 
    id: "imp", 
    name: "小恶魔", 
    type: "demon", 
    ability: "首夜得知爪牙，非首夜选人杀害。", 
    firstNight: true, 
    otherNight: true, 
    firstNightOrder: 2, 
    otherNightOrder: 3, 
    nightActionType: "kill", 
    firstNightReminder: "认队友", 
    otherNightReminder: "杀人" 
  }
];

export const groupedRoles = roles.reduce((acc, role) => {
  if (!acc[role.type]) acc[role.type] = [];
  acc[role.type].push(role);
  return acc;
}, {} as Record<string, Role[]>);

export const typeLabels: Record<string, string> = { 
  townsfolk: "🔵 镇民", 
  outsider: "🟣 外来者", 
  minion: "🟠 爪牙", 
  demon: "🔴 恶魔" 
};

export const typeColors: Record<string, string> = { 
  townsfolk: "border-blue-500 text-blue-400", 
  outsider: "border-purple-500 text-purple-400", 
  minion: "border-orange-500 text-orange-500", 
  demon: "border-red-600 text-red-600" 
};

export const typeBgColors: Record<string, string> = { 
  townsfolk: "bg-blue-900/50 hover:bg-blue-800", 
  outsider: "bg-purple-900/50 hover:bg-purple-800", 
  minion: "bg-orange-900/50 hover:bg-orange-800", 
  demon: "bg-red-900/50 hover:bg-red-800" 
};
