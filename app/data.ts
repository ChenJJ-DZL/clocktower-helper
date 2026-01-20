// by 拜甘教成员-大长老
// app/data.ts - 血染钟楼 角色数据与类型定义

// NEW: 数据驱动的「暗流涌动」基础元数据（夜晚顺序、Setup 标记等）
import troubleBrewingRolesData from "../src/data/rolesData.json";

export type RoleType = "townsfolk" | "outsider" | "minion" | "demon" | "traveler";

export type GamePhase = "scriptSelection" | "setup" | "check" | "firstNight" | "day" | "dusk" | "night" | "dawnReport" | "gameOver";

export type WinResult = "good" | "evil" | null;

export type NightActionType = 
  | "poison"        // 投毒
  | "kill"          // 杀人
  | "protect"       // 保护
  | "mark"          // 标记 (管家)
  | "inspect"       // 查验 (占卜师)
  | "inspect_death" // 验尸 (守鸦人)
  | "spy_info"      // 间谍信息
  | "kill_or_skip"  // 杀人或跳过 (珀)
  | "none";         // 无动作

// NIGHT META: What happens when they wake up?
export interface NightActionMeta {
  script: string;        // e.g. "Poisoner, open your eyes..."
  instruction: string;   // e.g. "Choose a player to poison."
  targetType: 'player' | 'character' | 'none';
  amount: number;        // How many targets? (0, 1, 2...)
  required: boolean;     // Must they choose?
  canSelectSelf: boolean;
  canSelectDead: boolean;
  effectType?: 'add_status' | 'kill' | 'protect' | 'info' | 'none'; // Generic effect tag
  effectValue?: string;  // e.g. 'poisoned', 'protected'
  wakesIfDead?: boolean; // NEW: For Zombuul/Bone Collector - allows dead players to wake up
}

// SETUP META: What happens before the game starts?
export interface SetupMeta {
  modifiesBag?: boolean;   // e.g. Baron adds Outsiders
  isDrunk?: boolean;       // e.g. Drunk (needs a Townsfolk mask)
  isLunatic?: boolean;     // e.g. Lunatic (needs a fake Demon mask)
  maskRole?: string;       // Optional explicit mask role id (for advanced setups)
}

// DAY META: Active abilities used during the day
export interface DayActionMeta {
  abilityName: string;    // e.g. "Slayer Shot"
  usesCount: number | 'infinity'; 
  targetType: 'player' | 'character' | 'none'; // 'character' for choosing a role (e.g. Philosopher)
  effectType: 'kill' | 'info' | 'slayer_check' | 'transform_ability'; // 'transform_ability' for Philosopher
}

// PASSIVE META: Triggers that happen automatically
export interface TriggerMeta {
  onNominated?: boolean;      // e.g. Virgin (checked during nomination)
  onNightDeath?: boolean;     // e.g. Soldier, Monk-protected (checked before applying kill)
  onDayDeath?: boolean;       // e.g. Mayor (if execution fails)
  onDeath?: boolean;          // e.g. Ravenkeeper (general death trigger)
  onExecution?: boolean;      // e.g. Saint (if executed, team loses)
}

/**
 * 角色基础数据接口
 * 重构后：只保留基础定义，所有逻辑行为从 src/roles/ 下的 RoleDefinition 读取
 */
export interface Role {
  id: string;
  name: string;
  type: RoleType; // townsfolk, outsider, minion, demon, traveler

  /**
   * UI隐藏标记：true时不在列表/分配中出现，但可留存于角色库
   */
  hidden?: boolean;

  /**
   * 规则要点摘要（供前端展示简化版说明）
   */
  ruleNotes?: string;

  /**
   * 长文档引用（如官方维基或本地文档路径）
   */
  docRef?: string;

  // 基础信息（用于显示和描述）
  ability?: string;
  image?: string;
  fullDescription?: string; // 完整的角色说明
  // 剧本标记：例如 '暗流涌动'，用于区分不同剧本下的角色集合
  script?: string;

  // 已废弃：以下字段已迁移到 src/roles/ 下的 RoleDefinition
  // 保留这些字段仅为了向后兼容，新代码不应使用
  /** @deprecated 使用 RoleDefinition.night 和 RoleDefinition.firstNight 代替 */
  firstNight?: boolean;
  /** @deprecated 使用 RoleDefinition.night 代替 */
  otherNight?: boolean;
  /** @deprecated 使用 RoleDefinition.firstNight?.order 代替 */
  firstNightOrder?: number;
  /** @deprecated 使用 RoleDefinition.night?.order 代替 */
  otherNightOrder?: number;
  /** @deprecated 使用 RoleDefinition.firstNight 代替 */
  firstNightMeta?: NightActionMeta;
  /** @deprecated 使用 RoleDefinition.night 代替 */
  otherNightMeta?: NightActionMeta;
  /** @deprecated 使用 RoleDefinition 代替 */
  firstNightReminder?: string;
  /** @deprecated 使用 RoleDefinition 代替 */
  otherNightReminder?: string;
  /** @deprecated 使用 RoleDefinition 代替 */
  nightActionType?: NightActionType;
  
  // 以下字段可能仍在使用，暂时保留
  setupMeta?: SetupMeta;
  dayMeta?: DayActionMeta;
  triggerMeta?: TriggerMeta;
}

export interface StatusEffect {
  effect: string;
  duration?: string;
  sourceId?: number | null;
  // 用于需要跨日递减的状态（例如侍臣 3 天 3 夜醉酒）
  remainingDays?: number;
}

export interface Seat {
  id: number;
  playerName?: string; // 玩家名字（可选）
  role: Role | null;          // REAL logic role (e.g. Drunk)
  /**
   * MASKED role shown to the player (e.g. Soldier when actually Drunk).
   * If undefined, UI should fall back to `role` or legacy `charadeRole`.
   */
  displayRole?: Role | null;
  /**
   * Legacy field for Drunk mask before `displayRole` was introduced.
   * Kept for backward compatibility with existing logic.
   */
  charadeRole: Role | null;
  isDead: boolean;
  hasGhostVote?: boolean; // 死者票是否可用
  isEvilConverted?: boolean; // 通过灵言师等效果被转为邪恶
  isGoodConverted?: boolean; // 特殊效果被转为善良（如舞蛇人命中恶魔）
  isDrunk: boolean;
  isPoisoned: boolean;
  isProtected: boolean;
  protectedBy: number | null; // 记录保护者的ID
  isRedHerring: boolean;
  isFortuneTellerRedHerring: boolean; // 占卜师的红罗刹：一名镇民玩家始终被占卜师视为邪恶
  isSentenced: boolean;
  masterId: number | null;
  hasUsedSlayerAbility: boolean; // Legacy field, kept for backward compatibility
  hasUsedDayAbility?: boolean; // Track usage of dayMeta abilities (e.g. Slayer shot)
  hasUsedVirginAbility: boolean;
  hasBeenNominated?: boolean; // 处女是否已被提名过（无论是否触发处决）
  isDemonSuccessor: boolean;
  hasAbilityEvenDead: boolean; // 亡骨魔杀死的爪牙：死亡但保留能力
  statusDetails: string[]; 
  statuses?: StatusEffect[];
  voteCount?: number;
  isCandidate?: boolean;
  grandchildId: number | null; // 记录哪个玩家是"祖母的孙子"（仅当该玩家是祖母时使用）
  isGrandchild: boolean; // 标记该玩家是否是"祖母的孙子"
  isFirstDeathForZombuul?: boolean; // 僵怖首次死亡标记（首次死亡后仍可发动技能，第二次被处决才真正死亡）
  isZombuulTrulyDead?: boolean; // 僵怖真正死亡标记（第二次被处决后）
  zombuulLives?: number; // 僵怖剩余可“假死”次数（默认1）
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

// ======================================================================
//  剧本数据结构
// ======================================================================
export interface Script {
  id: string;
  name: string;
  difficulty: string;
  description: string;
}

// 剧本列表
export const scripts: Script[] = [
  { 
    id: "trouble_brewing", 
    name: "暗流涌动", 
    difficulty: "初学者",
    description: "当?男爵 (Baron)?在场时，系统会自动将 2 名镇民替换为 2 名外来者。"
  },
  { id: "bad_moon_rising", name: "暗月初升", difficulty: "中等", description: "" },
  { id: "sects_and_violets", name: "梦陨春宵", difficulty: "中等", description: "" },
  { id: "midnight_revelry", name: "夜半狂欢", difficulty: "困难", description: "" },
];

// ======================================================================
//  角色数据 - 22个角色 (Trouble Brewing)
// 数据驱动元数据：见 src/data/rolesData.json
// 下方仍保留完整描述与旧字段，后续可逐步迁移。
// ======================================================================
export const roles: Role[] = [
  // ========== 镇民 (Townsfolk) - 13个 ==========
  { 
    id: "washerwoman", 
    name: "洗衣妇", 
    type: "townsfolk", 
    ability: "首夜得知一名村民的具体身份。", 
    fullDescription: "在你的首个夜晚,你会得知两名玩家和一个角色:这两名玩家之一是该角色。",
    script: "暗流涌动", // 暗流涌动角色
  },
  { 
    id: "librarian", 
    name: "图书管理员", 
    type: "townsfolk", 
    ability: "首夜得知一名外来者的具体身份。", 
    fullDescription: "在你的首个夜晚,你会得知两名玩家和一个外来者角色:这两名玩家之一是该角色(或者你会得知没有外来者在场)。",
    script: "暗流涌动", // 暗流涌动角色
  },
  { 
    id: "investigator", 
    name: "调查员", 
    type: "townsfolk", 
    ability: "首夜得知一名爪牙的具体身份。", 
    fullDescription: "在你的首个夜晚,你会得知两名玩家和一个爪牙角色:这两名玩家之一是该角色(或者你会得知没有爪牙在场)。",
    script: "暗流涌动", // 暗流涌动角色
  },
  { 
    id: "chef", 
    name: "厨师", 
    type: "townsfolk", 
    ability: "首夜得知有多少对邪恶玩家相邻。", 
    fullDescription: "在你的首个夜晚,你会得知场上相邻的邪恶玩家有多少对。",
    script: "暗流涌动", // 暗流涌动角色
  },
  { 
    id: "empath", 
    name: "共情者", 
    type: "townsfolk", 
    ability: "每晚得知存活邻居中邪恶玩家的数量。", 
    fullDescription: "每个夜晚,你会得知与你邻近的两名存活的玩家中邪恶玩家的数量。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "fortune_teller", 
    name: "占卜师", 
    type: "townsfolk", 
    ability: "每晚选择2名玩家，得知其中是否有恶魔或红罗刹。", 
    fullDescription: "每个夜晚,你要选择两名玩家:你会得知他们之中是否有恶魔,会有一名镇民玩家始终被你的能力视为邪恶。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "undertaker", 
    name: "送葬者", 
    type: "townsfolk", 
    ability: "非首夜得知今天被处决并死亡的玩家角色。", 
    fullDescription: "每个夜晚,你会得知今天白天死于处决的玩家角色。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "monk", 
    name: "僧侣", 
    type: "townsfolk", 
    ability: "非首夜保护一名玩家，防止恶魔杀害。", 
    fullDescription: "每个夜晚,你要选择除你以外一名玩家:恶魔的能力对他们无效。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "ravenkeeper", 
    name: "守鸦人", 
    type: "townsfolk", 
    ability: "夜晚死亡时唤醒，选择一名玩家，得知其真实角色。", 
    fullDescription: "如果你在夜晚死亡,你会被复活,之后你要选择一名玩家:你会得知他的角色。", 
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onNightDeath: true
    }
  },
  { 
    id: "virgin", 
    name: "贞洁者", 
    type: "townsfolk", 
    ability: "首次被镇民提名的瞬间，提名者被处决。（无夜晚行动）", 
    fullDescription: "当你首次被提名时,如果提名你的玩家是镇民,他立刻被处决。",
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onNominated: true
    }
  },
  { 
    id: "slayer", 
    name: "猎手", 
    type: "townsfolk", 
    ability: "白天可指定一名玩家，若为恶魔，恶魔死。", 
    fullDescription: "每局游戏一次,你可以在白天公开选择一名玩家:如果他是恶魔,他死亡。",
    script: "暗流涌动", // 暗流涌动角色 
    dayMeta: {
      abilityName: "射击",
      usesCount: 1,
      targetType: 'player',
      effectType: 'kill'
    }
  },
  { 
    id: "soldier", 
    name: "士兵", 
    type: "townsfolk", 
    ability: "被恶魔攻击时不会死亡。（无夜晚行动）", 
    fullDescription: "恶魔的负面能力对你无效。",
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onNightDeath: true
    }
  },
  { 
    id: "mayor", 
    name: "镇长", 
    type: "townsfolk", 
    ability: "若仅剩3人且无人被处决，好人获胜。（无夜晚行动）", 
    fullDescription: "如果只有三名玩家存活且白天没有人能被处决,你会被选为镇长. 如果你在夜晚即将死亡,可能会有一名其他玩家代替你死亡。",
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onNightDeath: true
    }
  },
  // ========== 外来者 (Outsider) - 4个 ==========
  { 
    id: "butler", 
    name: "管家", 
    type: "outsider", 
    ability: "每晚选择一名主人，必须投票给主人。", 
    fullDescription: "每个夜晚,你要选择除你以外的一名玩家:白天,只有他投票时你才能投票。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "drunk", 
    name: "酒鬼", 
    type: "outsider", 
    ability: "误以为自己是镇民，实际是酒鬼。（首夜与其他夜晚行动）", 
    fullDescription: "你不知道你是酒鬼,你以为你是一个镇民角色,但其实你不是。",
    setupMeta: {
      isDrunk: true,
    },
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "recluse", 
    name: "陌客", 
    type: "outsider", 
    ability: "判定阵营时可能被视为邪恶/爪牙/恶魔。（无夜晚行动）", 
    fullDescription: "你可能会被当作邪恶阵营、爪牙角色或恶魔角色,即使你已死亡。",
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "saint", 
    name: "圣徒", 
    type: "outsider", 
    ability: "若死于处决，邪恶方立即获胜。（无夜晚行动）", 
    fullDescription: "如果你死于处决,你的阵营立即失败。",
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onExecution: true
    }
  },
  // ========== 爪牙 (Minion) - 4个 ==========
  { 
    id: "poisoner", 
    name: "投毒者", 
    type: "minion", 
    ability: "每晚选一名玩家中毒，中毒者获得错误信息。", 
    fullDescription: "每个夜晚, 你要选择一名玩家, 他在当晚和明天白天中毒。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "spy", 
    name: "间谍", 
    type: "minion", 
    ability: "每晚查看魔典（所有真实身份）和完整行动日志。", 
    fullDescription: "每个夜晚, 你能查看剧本. 你可能会被当作其他阵营、镇民角色或外来者角色, 即使你已死亡。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  { 
    id: "scarlet_woman", 
    name: "红唇女郎", 
    type: "minion", 
    ability: "若恶魔死时活人>=5，她变恶魔。（无夜晚行动）", 
    fullDescription: "如果大于等于五名玩家存活时(说书人不计算在内)恶魔死亡, 你变成新的恶魔。",
    script: "暗流涌动", // 暗流涌动角色 
    triggerMeta: {
      onNightDeath: true
    }
  },
  { 
    id: "baron", 
    name: "男爵", 
    type: "minion", 
    ability: "Setup阶段增加2个外来者替换镇民。（仅首夜行动）", 
    fullDescription: "场上有额外的外来者在场. [+2 外来者]",
    script: "暗流涌动", // 暗流涌动角色 
    setupMeta: {
      modifiesBag: true
    }
  },
  // ========== 恶魔 (Demon) - 1个 ==========
  { 
    id: "imp", 
    name: "小恶魔", 
    type: "demon", 
    ability: "首夜得知爪牙，非首夜选人杀害。", 
    fullDescription: "每个夜晚, 你要选择一名玩家:他死亡。如果你以这种方式自杀死一名爪牙会变成小恶魔。", 
    script: "暗流涌动", // 暗流涌动角色 
  },
  // ======================================================================
  //  角色数据 - 暗月初升 (Bad Moon Rising)
  // ======================================================================
  
  // ========== 镇民 (Townsfolk) - 12个 ==========
  { 
    id: "grandmother", 
    name: "祖母", 
    type: "townsfolk", 
    ability: "首夜得知一名善良玩家和他的角色。若恶魔杀死了他，你也会死亡。", 
    fullDescription: "在你的首个夜晚,你会得知一名善良玩家和他的角色。如果恶魔杀死了他,你也会死亡。",
    script: "暗月初升" 
  },
  { 
    id: "sailor", 
    name: "水手", 
    type: "townsfolk", 
    ability: "每晚选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。你不会死亡。", 
    fullDescription: "每个夜晚,你要选择一名存活的玩家:你或他之一会醉酒直到下个黄昏。你不会死亡。",
    script: "暗月初升",
  },
  { 
    id: "chambermaid", 
    name: "侍女", 
    type: "townsfolk", 
    ability: "每晚选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。", 
    fullDescription: "每个夜晚,你要选择除你以外的两名存活的玩家:你会得知他们中有几人在当晚因其自身能力而被唤醒。",
    script: "暗月初升",
  },
  { 
    id: "exorcist", 
    name: "驱魔人", 
    type: "townsfolk", 
    ability: "每晚选择一名玩家(与上个夜晚不同)：如果你选中了恶魔，他会得知你是驱魔人，但他当晚不会因其自身能力而被唤醒。", 
    fullDescription: "每个夜晚*,你要选择一名玩家(与上个夜晚不同):如果你选中了恶魔,他会得知你是驱魔人,但他当晚不会因其自身能力而被唤醒。",
    script: "暗月初升", 
  },
  { 
    id: "innkeeper", 
    name: "旅店老板", 
    type: "townsfolk", 
    ability: "每晚选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。", 
    fullDescription: "每个夜晚*,你要选择两名玩家:他们当晚不会死亡,但其中一人会醉酒到下个黄昏。",
    script: "暗月初升", 
  },
  { 
    id: "gambler", 
    name: "赌徒", 
    type: "townsfolk", 
    ability: "每晚选择一名玩家并猜测他的角色：如果你猜错了，你会死亡。", 
    fullDescription: "每个夜晚*,你要选择一名玩家并猜测他的角色:如果你猜错了,你会死亡。",
    script: "暗月初升", 
  },
  { 
    id: "gossip", 
    name: "造谣者", 
    type: "townsfolk", 
    ability: "每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。（无夜晚行动）", 
    fullDescription: "每个白天,你可以公开发表一个声明。如果该声明正确,在当晚会有一名玩家死亡。",
    script: "暗月初升"
  },
  { 
    id: "courtier", 
    name: "侍臣", 
    type: "townsfolk", 
    ability: "每局游戏限一次，在夜晚时，你可以选择一个角色：如果该角色在场，该角色之一从当晚开始醉酒三天三夜。", 
    fullDescription: "每局游戏限一次,在夜晚时,你可以选择一个角色:如果该角色在场,该角色之一从当晚开始醉酒三天三夜。",
    script: "暗月初升",
  },
  { 
    id: "professor", 
    name: "教授", 
    type: "townsfolk", 
    ability: "每局游戏限一次，在夜晚时，你可以选择一名死亡的玩家；如果他是镇民，你会将他起死回生。", 
    fullDescription: "每局游戏限一次,在夜晚时*,你可以选择一名死亡的玩家;如果他是镇民,你会将他起死回生。",
    script: "暗月初升", 
  },
  { 
    id: "minstrel", 
    name: "吟游诗人", 
    type: "townsfolk", 
    ability: "当一名爪牙死于处决时，除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。（无夜晚行动）", 
    fullDescription: "当一名爪牙死于处决时,除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。",
    script: "暗月初升"
  },
  { 
    id: "tea_lady", 
    name: "茶艺师", 
    type: "townsfolk", 
    ability: "如果与你邻近的两名存活的玩家是善良的，他们不会死亡。", 
    fullDescription: "如果与你邻近的两名存活的玩家是善良的，他们不会死亡。",
    script: "暗月初升"
  },
  { 
    id: "pacifist", 
    name: "和平主义者", 
    type: "townsfolk", 
    ability: "被处决的善良玩家可能不会死亡。", 
    fullDescription: "被处决的善良玩家可能不会死亡。",
    script: "暗月初升"
  },
  { 
    id: "fool", 
    name: "弄臣", 
    type: "townsfolk", 
    ability: "当你首次将要死亡时，你不会死亡。", 
    fullDescription: "当你首次将要死亡时,你不会死亡。",
    script: "暗月初升"
  },
  // ========== 外来者 (Outsider) - 4个 ==========
  { 
    id: "tinker", 
    name: "修补匠", 
    type: "outsider", 
    ability: "你可能会在任何时候死亡，即使没有玩家选择你。", 
    fullDescription: "你可能会在任何时候死亡,即使没有玩家选择你。",
    script: "暗月初升"
  },
  { 
    id: "moonchild", 
    name: "月之子", 
    type: "outsider", 
    ability: "当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚他会死亡。", 
    fullDescription: "当你得知你死亡时,你要公开选择一名存活的玩家。如果他是善良的,在当晚他会死亡。",
    script: "暗月初升"
  },
  { 
    id: "goon", 
    name: "莽夫", 
    type: "outsider", 
    ability: "每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。", 
    fullDescription: "每个夜晚,首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。",
    script: "暗月初升"
  },
  { 
    id: "lunatic", 
    name: "疯子", 
    type: "outsider", 
    ability: "你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。", 
    fullDescription: "你以为你是一个恶魔,但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。",
    script: "暗月初升", 
    setupMeta: {
      isLunatic: true,
    },
  },
  // ========== 爪牙 (Minion) - 4个 ==========
  { 
    id: "godfather", 
    name: "教父", 
    type: "minion", 
    ability: "首夜得知有哪些外来者角色在场。如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。[-1或+1外来者]", 
    fullDescription: "在你的首个夜晚,你会得知有哪些外来者角色在场。如果有外来者在白天死亡,你会在当晚被唤醒并且你要选择一名玩家:他死亡。[-1或+1外来者]",
    script: "暗月初升",
  },
  { 
    id: "devils_advocate", 
    name: "魔鬼代言人", 
    type: "minion", 
    ability: "每晚选择一名存活的玩家(与上个夜晚不同)：如果明天白天他被处决，他不会死亡。", 
    fullDescription: "每个夜晚,你要选择一名存活的玩家(与上个夜晚不同);如果明天白天他被处决,他不会死亡。",
    script: "暗月初升",
  },
  { 
    id: "assassin", 
    name: "刺客", 
    type: "minion", 
    ability: "每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。", 
    fullDescription: "每局游戏限一次,在夜晚时*,你可以选择一名玩家:他死亡,即使因为任何原因让他不会死亡。",
    script: "暗月初升", 
  },
  { 
    id: "mastermind", 
    name: "主谋", 
    type: "minion", 
    ability: "如果恶魔死于处决而因此导致游戏结束时，再额外进行一个夜晚和一个白天。在那个白天如果有玩家被处决，他的阵营落败。", 
    fullDescription: "如果恶魔死于处决而因此导致游戏结束时,再额外进行一个夜晚和一个白天。在那个白天如果有玩家被处决,他的阵营落败。",
    script: "暗月初升"
  },
  // ========== 恶魔 (Demon) - 4个 ==========
  { 
    id: "zombuul", 
    name: "僵怖", 
    type: "demon", 
    ability: "每晚如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。当你首次死亡后，你仍存活，但会被当作死亡。", 
    fullDescription: "每个夜晚*,如果今天白天没有人死亡,你会被唤醒并要选择一名玩家:他死亡。当你首次死亡后,你仍存活,但会被当作死亡。",
    script: "暗月初升",
  },
  { 
    id: "pukka", 
    name: "普卡", 
    type: "demon", 
    ability: "每晚选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。", 
    fullDescription: "每个夜晚,你要选择一名玩家:他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。",
    script: "暗月初升",
  },
  { 
    id: "shabaloth", 
    name: "沙巴洛斯", 
    type: "demon", 
    ability: "每晚选择两名玩家：他们死亡。你的上个夜晚选择过的且当前死亡的玩家可能会被你反刍。", 
    fullDescription: "每个夜晚*,你要选择两名玩家:他们死亡。你的上个夜晚选择过的且当前死亡的玩家可能会被你反刍。",
    script: "暗月初升",
  },
  { 
    id: "po", 
    name: "珀",
    type: "demon", 
    ability: "每晚你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。", 
    fullDescription: "每个夜晚*,你可以选择一名玩家:他死亡。如果你上次选择时没有选择任何玩家,当晚你要选择三名玩家:他们死亡。",
    script: "暗月初升",
  },
  // ========== 暗月初升 - 实验性角色（卡牌版扩展，不在前台露出） ==========
  {
    id: "missionary",
    name: "传教士",
    type: "townsfolk",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E4%BC%A0%E6%95%99%E5%A3%AB",
  },
  {
    id: "alchemist",
    name: "炼金术士",
    type: "townsfolk",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E7%82%BC%E9%87%91%E6%9C%AF%E5%A3%AB",
  },
  {
    id: "magician",
    name: "魔术师",
    type: "townsfolk",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%AD%94%E6%9C%AF%E5%B8%88",
  },
  {
    id: "acrobat",
    name: "杂技演员",
    type: "outsider",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%9D%82%E6%8A%80%E6%BC%94%E5%91%98",
  },
  {
    id: "widow",
    name: "寡妇",
    type: "minion",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%AF%A1%E5%A6%87",
  },
  {
    id: "leech",
    name: "痢蛭",
    type: "demon",
    hidden: true,
    ability: "【实验性角色】详见官方《黯月初升》扩展说明。",
    fullDescription: "",
    script: "暗月初升",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E7%97%A2%E8%9B%AD",
  },
  // ======================================================================
  //  角色数据 - 梦陨春宵 (Sects & Violets)
  // ======================================================================
  
  // ========== 镇民 (Townsfolk) - 13个 ==========
  { 
    id: "clockmaker", 
    name: "钟表匠", 
    type: "townsfolk", 
    ability: "首夜得知恶魔与爪牙之间最近的距离。", 
    fullDescription: "在你的首个夜晚,你会得知恶魔与爪牙之间最近的距离。(邻座的玩家距离为1)",
    script: "梦陨春宵" 
  },
  { 
    id: "dreamer", 
    name: "筑梦师", 
    type: "townsfolk", 
    ability: "每晚选择一名玩家，得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。", 
    fullDescription: "每个夜晚,你要选择除你及旅行者以外的一名玩家:你会得知一个善良角色和一个邪恶角色,该玩家是其中一个角色。",
    script: "梦陨春宵", 
  },
  { 
    id: "snake_charmer", 
    name: "舞蛇人", 
    type: "townsfolk", 
    ability: "每晚选择一名玩家，如果选中了恶魔，你和他交换角色和阵营，然后他中毒。", 
    fullDescription: "每个夜晚,你要选择一名存活的玩家:如果你选中了恶魔,你和他交换角色和阵营,然后他中毒。",
    script: "梦陨春宵", 
  },
  { 
    id: "mathematician", 
    name: "数学家", 
    type: "townsfolk", 
    ability: "每晚得知有多少名玩家的能力因为其他角色的能力而未正常生效。", 
    fullDescription: "每个夜晚,你会得知有多少名玩家的能力因为其他角色的能力而未正常生效。(从上个黎明到你被唤醒时)",
    script: "梦陨春宵", 
  },
  { 
    id: "flowergirl", 
    name: "卖花女孩", 
    type: "townsfolk", 
    ability: "每晚得知在今天白天时是否有恶魔投过票。", 
    fullDescription: "每个夜晚*,你会得知在今天白天时是否有恶魔投过票。",
    script: "梦陨春宵", 
  },
  { 
    id: "town_crier", 
    name: "城镇公告员", 
    type: "townsfolk", 
    ability: "每晚得知在今天白天时是否有爪牙发起过提名。", 
    fullDescription: "每个夜晚*,你会得知在今天白天时是否有爪牙发起过提名。",
    script: "梦陨春宵", 
  },
  { 
    id: "oracle", 
    name: "神谕者", 
    type: "townsfolk", 
    ability: "每晚得知有多少名死亡的玩家是邪恶的。", 
    fullDescription: "每个夜晚*,你会得知有多少名死亡的玩家是邪恶的。",
    script: "梦陨春宵", 
  },
  { 
    id: "savant", 
    name: "博学者", 
    type: "townsfolk", 
    ability: "每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。", 
    fullDescription: "每个白天,你可以私下询问说书人以得知两条信息:一个是正确的,一个是错误的。",
    script: "梦陨春宵"
  },
  { 
    id: "seamstress", 
    name: "女裁缝", 
    type: "townsfolk", 
    ability: "每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：你会得知他们是否为同一阵营。", 
    fullDescription: "每局游戏限一次,在夜晚时,你可以选择除你以外的两名玩家:你会得知他们是否为同一阵营。",
    script: "梦陨春宵", 
  },
  { 
    id: "philosopher", 
    name: "哲学家", 
    type: "townsfolk", 
    ability: "每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。", 
    fullDescription: "每局游戏限一次,在夜晚时,你可以选择一个善良角色:你获得该角色的能力。如果这个角色在场,他醉酒。",
    script: "梦陨春宵", 
  },
  { 
    id: "artist", 
    name: "艺术家", 
    type: "townsfolk", 
    ability: "每局游戏限一次，在白天时，你可以私下询问说书人一个是非问题，你会得知该问题的答案。", 
    fullDescription: "每局游戏限一次,在白天时,你可以私下询问说书人一个是非问题,你会得知该问题的答案。",
    script: "梦陨春宵"
  },
  { 
    id: "juggler", 
    name: "杂耍艺人", 
    type: "townsfolk", 
    ability: "在你的首个白天，你可以公开猜测任意玩家的角色最多五次，在当晚，你会得知猜测正确的角色数。", 
    fullDescription: "在你的首个白天,你可以公开猜测任意玩家的角色最多五次,在当晚,你会得知猜测正确的角色数。",
    script: "梦陨春宵", 
  },
  { 
    id: "sage", 
    name: "贤者", 
    type: "townsfolk", 
    ability: "如果恶魔杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个恶魔。", 
    fullDescription: "如果恶魔杀死了你,在当晚你会被唤醒并得知两名玩家,其中一名是杀死你的那个恶魔。",
    script: "梦陨春宵", 
  },
 
  // ======================================================================
  //  镇民扩展（隐藏，不在前台露出；仅用于角色库占位，避免影响现有判定）
  //  来源：josn/blood_clocktower_所有镇民.json
  // ======================================================================
  {
    id: "half_ogre",
    name: "半兽人",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%8D%8A%E5%85%BD%E4%BA%BA",
  },
  {
    id: "banshee",
    name: "报丧女妖",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%8A%A5%E4%B8%A7%E5%A5%B3%E5%A6%96",
  },
  {
    id: "villager",
    name: "村夫",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%9D%91%E5%A4%AB",
  },
  {
    id: "princess",
    name: "公主",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%85%AC%E4%B8%BB",
  },
  {
    id: "priestess",
    name: "女祭司",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%A5%B3%E7%A5%AD%E5%8F%B8",
  },
  {
    id: "knight",
    name: "骑士",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%AA%91%E5%A3%AB",
  },
  {
    id: "steward",
    name: "事务官",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E4%BA%8B%E5%8A%A1%E5%AE%98",
  },
  {
    id: "conjurer",
    name: "戏法师",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%88%8F%E6%B3%95%E5%B8%88",
  },
  {
    id: "pilgrim",
    name: "修行者",
    type: "townsfolk",
    hidden: true,
    ability: "【扩展镇民】详见官方角色说明。",
    fullDescription: "",
    script: "扩展",
    docRef: "https://clocktower-wiki.gstonegames.com/index.php?title=%E4%BF%AE%E8%A1%8C%E8%80%85",
  },
  // ========== 外来者 (Outsider) - 4个 ==========
  { 
    id: "mutant", 
    name: "畸形秀演员", 
    type: "outsider", 
    ability: "如果你\"疯狂\"地证明自己是外来者，你可能被处决。", 
    fullDescription: "如果你\"疯狂\"地证明自己是外来者,你可能被处决。",
    script: "梦陨春宵"
  },
  { 
    id: "sweetheart", 
    name: "心上人", 
    type: "outsider", 
    ability: "当你死亡时，会有一名玩家开始醉酒。", 
    fullDescription: "当你死亡时,会有一名玩家开始醉酒。",
    script: "梦陨春宵"
  },
  { 
    id: "barber", 
    name: "理发师", 
    type: "outsider", 
    ability: "如果你死亡，在当晚恶魔可以选择两名玩家(不能选择其他恶魔)交换角色。", 
    fullDescription: "如果你死亡,在当晚恶魔可以选择两名玩家(不能选择其他恶魔)交换角色。",
    script: "梦陨春宵"
  },
  { 
    id: "klutz", 
    name: "呆瓜", 
    type: "outsider", 
    ability: "当你得知你死亡时，你要公开选择一名存活的玩家：如果他是邪恶的，你的阵营落败。", 
    fullDescription: "当你得知你死亡时,你要公开选择一名存活的玩家:如果他是邪恶的,你的阵营落败。",
    script: "梦陨春宵"
  },
  // ========== 爪牙 (Minion) - 4个 ==========
  { 
    id: "evil_twin", 
    name: "镜像双子", 
    type: "minion", 
    ability: "你与一名对立阵营的玩家互相知道对方是什么角色。如果其中善良玩家被处决，邪恶阵营获胜。如果你们都存活，善良阵营无法获胜。", 
    fullDescription: "你与一名对立阵营的玩家互相知道对方是什么角色。如果其中善良玩家被处决,邪恶阵营获胜。如果你们都存活,善良阵营无法获胜。",
    script: "梦陨春宵"
  },
  { 
    id: "witch", 
    name: "女巫", 
    type: "minion", 
    ability: "每晚选择一名玩家，如果他明天白天发起提名，他死亡。如果只有三名存活的玩家，你失去此能力。", 
    fullDescription: "每个夜晚,你要选择一名玩家;如果他明天白天发起提名,他死亡。如果只有三名存活的玩家,你失去此能力。",
    script: "梦陨春宵", 
  },
  { 
    id: "cerenovus", 
    name: "洗脑师", 
    type: "minion", 
    ability: "每晚选择一名玩家和一个善良角色，他明天白天和夜晚需要\"疯狂\"地证明自己是这个角色，不然他可能被处决。", 
    fullDescription: "每个夜晚,你要选择一名玩家和一个善良角色,他明天白天和夜晚需要\"疯狂\"地证明自己是这个角色,不然他可能被处决。",
    script: "梦陨春宵", 
  },
  { 
    id: "pit_hag", 
    name: "麻脸巫婆", 
    type: "minion", 
    ability: "每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。", 
    fullDescription: "每个夜晚*,你要选择一名玩家和一个角色,如果该角色不在场,他变成该角色。如果因此创造了一个恶魔,当晚的死亡由说书人决定。",
    script: "梦陨春宵", 
  },
  // ========== 恶魔 (Demon) - 4个 ==========
  { 
    id: "fang_gu", 
    name: "方古", 
    type: "demon", 
    ability: "每晚选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。", 
    fullDescription: "每个夜晚*,你要选择一名玩家:他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡,但每局游戏仅能成功转化一次。[+1外来者]",
    script: "梦陨春宵", 
  },
  { 
    id: "vigormortis", 
    name: "亡骨魔", 
    type: "demon", 
    ability: "每晚选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。", 
    fullDescription: "每个夜晚*,你要选择一名玩家:他死亡。被你杀死的爪牙保留他的能力,且与他邻近的两名镇民之一中毒。[-1外来者]",
    script: "梦陨春宵", 
  },
  { 
    id: "no_dashii", 
    name: "诺-达", 
    type: "demon", 
    ability: "每晚选择一名玩家：他死亡。与你邻近的两名镇民中毒。", 
    fullDescription: "每个夜晚*,你要选择一名玩家:他死亡。与你邻近的两名镇民中毒。",
    script: "梦陨春宵", 
  },
  { 
    id: "vortox", 
    name: "涡流", 
    type: "demon", 
    ability: "每晚选择一名玩家：他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。", 
    fullDescription: "每个夜晚*,你要选择一名玩家:他死亡。镇民玩家的能力都会产生错误信息,如果白天没人被处决,邪恶阵营获胜。",
    script: "梦陨春宵", 
  },
  // ======================================================================
  //  角色数据 - 夜半狂欢 (Midnight Revelry)
  // ======================================================================
  
  // ========== 镇民 (Townsfolk) - 13个 ==========
  { 
    id: "professor_mr", 
    name: "教授", 
    type: "townsfolk", 
    ability: "每局游戏一次，在夜晚时，可以选择一名死亡的玩家；如果他是镇民，你会将他起死回生。", 
    fullDescription: "每局游戏一次,在夜晚时*,你可以选择一名死亡的玩家;如果他是镇民,你会将他起死回生。",
    script: "夜半狂欢", 
  },
  { 
    id: "snake_charmer_mr", 
    name: "舞蛇人", 
    type: "townsfolk", 
    ability: "每晚选择一名存活的玩家；如果选中了恶魔，你和他交换角色和阵营，然后他中毒。", 
    fullDescription: "每个夜晚,你要选择一名存活的玩家:如果你选中了恶魔,你和他交换角色和阵营,然后他中毒。",
    script: "夜半狂欢", 
  },
  { 
    id: "savant_mr", 
    name: "博学者", 
    type: "townsfolk", 
    ability: "每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。", 
    fullDescription: "每个白天,你可以私下询问说书人以得知两条信息:一个是正确的,一个是错误的。",
    script: "夜半狂欢"
  },
  { 
    id: "noble", 
    name: "贵族", 
    type: "townsfolk", 
    ability: "首夜得知三名玩家，其中恰好有一名是邪恶的。", 
    fullDescription: "在你的首个夜晚,你会得知三名玩家。其中恰好有一名是邪恶的。",
    script: "夜半狂欢"
  },
  { 
    id: "balloonist", 
    name: "气球驾驶员", 
    type: "townsfolk", 
    ability: "每晚得知一名不同角色类型的玩家，直到你得知了场上所有角色类型。", 
    fullDescription: "每个夜晚,你会得知一名不同角色类型的玩家,直到你得知了场上所有角色类型。[+1外来者]",
    script: "夜半狂欢", 
  },
  { 
    id: "amnesiac", 
    name: "失意者", 
    type: "townsfolk", 
    ability: "你不知道你的能力是什么。每个白天你可以询问说书人一次猜测，你会得知你的猜测有多准确。", 
    fullDescription: "你不知道你的能力是什么。每个白天你可以询问说书人一次猜测,你会得知你的猜测有多准确。",
    script: "夜半狂欢"
  },
  { 
    id: "engineer", 
    name: "工程师", 
    type: "townsfolk", 
    ability: "每局游戏一次，在夜晚时，你可以选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。", 
    fullDescription: "每局游戏一次,在夜晚时*,你可以选择让恶魔变成你选择的一个恶魔角色,或让所有爪牙变成你选择的爪牙角色。",
    script: "夜半狂欢", 
  },
  { 
    id: "fisherman", 
    name: "渔夫", 
    type: "townsfolk", 
    ability: "每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。", 
    fullDescription: "每局游戏一次,在白天时,你可以询问说书人一些建议来帮助你的团队获胜。",
    script: "夜半狂欢"
  },
  { 
    id: "ranger", 
    name: "巡山人", 
    type: "townsfolk", 
    ability: "每局游戏一次，在夜晚时，可以选择一名存活的玩家；如果选中了落难少女，她会变成一个不在场的镇民角色。", 
    fullDescription: "每局游戏一次,在夜晚时*,你可以选择一名存活的玩家;如果选中了落难少女,她会变成一个不在场的镇民角色。[+落难少女]",
    script: "夜半狂欢", 
  },
  { 
    id: "farmer", 
    name: "农夫", 
    type: "townsfolk", 
    ability: "如果你在夜晚死亡，一名存活的善良玩家会变成农夫。", 
    fullDescription: "如果你在夜晚死亡,一名存活的善良玩家会变成农夫。",
    script: "夜半狂欢"
  },
  { 
    id: "poppy_grower", 
    name: "罂粟种植者", 
    type: "townsfolk", 
    ability: "爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。", 
    fullDescription: "爪牙和恶魔不知道彼此。如果你死亡,他们会在当晚得知彼此。",
    script: "夜半狂欢"
  },
  { 
    id: "atheist", 
    name: "无神论者", 
    type: "townsfolk", 
    ability: "说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。", 
    fullDescription: "说书人可以打破游戏规则。如果说书人被处决,好人阵营获胜,即使你已死亡。[场上没有邪恶角色]",
    script: "夜半狂欢"
  },
  { 
    id: "cannibal", 
    name: "食人族", 
    type: "townsfolk", 
    ability: "你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。", 
    fullDescription: "你拥有最后被处决的玩家的能力。如果该玩家是邪恶的,你会中毒直到下一个善良玩家被处决。",
    script: "夜半狂欢"
  },
  // ========== 外来者 (Outsider) - 4个 ==========
  { 
    id: "drunk_mr", 
    name: "酒鬼", 
    type: "outsider", 
    ability: "你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。", 
    fullDescription: "你不知道你是酒鬼,你以为你是一个镇民角色,但其实你不是。",
    script: "夜半狂欢",
    setupMeta: {
      isDrunk: true,
    }
  },
  { 
    id: "barber_mr", 
    name: "理发师", 
    type: "outsider", 
    ability: "如果你死亡，在当晚恶魔可以选择两名玩家（不能选择其他恶魔）交换角色。", 
    fullDescription: "如果你死亡,在当晚恶魔可以选择两名玩家(不能选择其他恶魔)交换角色。",
    script: "夜半狂欢"
  },
  { 
    id: "damsel", 
    name: "落难少女", 
    type: "outsider", 
    ability: "所有爪牙都知道落难少女在场。每局游戏一次，任何爪牙可以公开猜测你是落难少女。如果他们猜对了，你的阵营落败。", 
    fullDescription: "所有爪牙都知道落难少女在场。每局游戏一次,任何爪牙可以公开猜测你是落难少女。如果他们猜对了,你的阵营落败。",
    script: "夜半狂欢"
  },
  { 
    id: "golem", 
    name: "魔像", 
    type: "outsider", 
    ability: "每局游戏一次，你只能发起一次提名。当你发起提名时，如果你提名的玩家不是恶魔，他死亡。", 
    fullDescription: "每局游戏一次,你只能发起一次提名。当你发起提名时,如果你提名的玩家不是恶魔,他死亡。",
    script: "夜半狂欢"
  },
  // ========== 爪牙 (Minion) - 4个 ==========
  { 
    id: "poisoner_mr", 
    name: "投毒者", 
    type: "minion", 
    ability: "每晚选择一名玩家：他当晚和明天白天中毒。", 
    fullDescription: "每个夜晚,你要选择一名玩家:他当晚和明天白天中毒。",
    script: "夜半狂欢", 
  },
  { 
    id: "pit_hag_mr", 
    name: "麻脸巫婆", 
    type: "minion", 
    ability: "每晚选择一名玩家和一个角色；如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。", 
    fullDescription: "每个夜晚*,你要选择一名玩家和一个角色,如果该角色不在场,他变成该角色。如果因此创造了一个恶魔,当晚的死亡由说书人决定。",
    script: "夜半狂欢", 
  },
  { 
    id: "lunatic_mr", 
    name: "精神病患者", 
    type: "minion", 
    ability: "每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。", 
    fullDescription: "每个白天,在提名开始前,你可以公开选择一名玩家:他死亡。如果你被处决,提名你的玩家必须和你玩石头剪刀布;只有你输了才会死亡。",
    script: "夜半狂欢"
  },
  { 
    id: "shaman", 
    name: "灵言师", 
    type: "minion", 
    ability: "首夜得知一个关键词。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。", 
    fullDescription: "在你的首个夜晚,你会得知一个关键词。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。",
    script: "夜半狂欢"
  },
  // ========== 恶魔 (Demon) - 2个 ==========
  { 
    id: "vigormortis_mr", 
    name: "亡骨魔", 
    type: "demon", 
    ability: "每晚选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。", 
    fullDescription: "每个夜晚*,你要选择一名玩家:他死亡。被你杀死的爪牙保留他的能力,且与他邻近的两名镇民之一中毒。[-1外来者]",
    script: "夜半狂欢", 
  },
  { 
    id: "hadesia", 
    name: "哈迪寂亚", 
    type: "demon", 
    ability: "每晚选择三名玩家（所有玩家都会得知你选择了谁）：他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。", 
    fullDescription: "每个夜晚*,你要选择三名玩家(所有玩家都会得知你选择了谁):他们秘密决定自己的命运,如果他们全部存活,他们全部死亡。",
    script: "夜半狂欢", 
  }
];

// ======================================================================
//  隐藏占位：旅行者与实验角色（默认不在前台展示/分配）
//  仅保留规则要点/引用，等待未来启用
// ======================================================================
roles.push(
  // 旅行者（暗流涌动）
  {
    id: "traveler_official",
    name: "（旅行者占位）",
    type: "traveler",
    ability: "包含官员、乞丐、枪手、窃贼、替罪羊等，请参考官方长文档。",
    fullDescription: "旅行者合集占位，参见官方文档详细规则。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "旅行者不计入角色配比，可随时加入/离开，详见官方文档。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#travelers"
  },
  // 实验性角色（暗流涌动卡牌版附带）
  {
    id: "experimental_sing_boy",
    name: "唱诗男孩",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_king",
    name: "国王",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_general",
    name: "将军",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_balloonist",
    name: "气球驾驶员",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_bounty_hunter",
    name: "赏金猎人",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_nightwatchman",
    name: "守夜人",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_pixie",
    name: "小精灵",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_heretic",
    name: "异教领袖",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_snitch",
    name: "告密者",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_goblin",
    name: "哥布林",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_puppet",
    name: "提线木偶",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_boomdandy",
    name: "炸弹人",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_leviathan",
    name: "利维坦",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  },
  {
    id: "experimental_mafia",
    name: "黑帮",
    type: "traveler",
    ability: "实验角色占位，详见官方长文档。",
    fullDescription: "实验角色占位，详见官方长文档。",
    script: "暗流涌动",
    hidden: true,
    ruleNotes: "实验性角色占位，未在当前引擎启用。",
    docRef: "blood_clocktower_data_spider-暗流涌动.json#experimental"
  }
);

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
