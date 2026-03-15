/**
 * 集中化提示词仓库
 * 统一管理所有说书人指引、角色提示、系统消息
 */

export interface PromptTemplate {
  /** 模板唯一标识 */
  id: string;
  /** 模板分类 */
  category: "system" | "role" | "ability" | "status" | "result";
  /** 模板内容，支持 {{variable}} 变量替换 */
  template: string;
  /** 模板说明 */
  description?: string;
  /** 适用场景 */
  scenes?: string[];
}

export const promptDictionary: PromptTemplate[] = [
  // 系统提示
  {
    id: "system.night.start",
    category: "system",
    template: "🌙 第{{nightCount}}夜开始，全体玩家闭眼",
    description: "夜晚开始时的系统提示",
  },
  {
    id: "system.dawn.start",
    category: "system",
    template: "☀️ 天亮了，昨晚有{{deathCount}}名玩家死亡",
    description: "天亮时的系统提示",
  },

  // 角色唤醒提示
  {
    id: "role.demon.wake",
    category: "role",
    template: "请唤醒{{demonName}}（{{seatNo}}号玩家），告知其击杀一名玩家",
    description: "恶魔唤醒提示",
    scenes: ["night"],
  },
  {
    id: "role.fortune_teller.wake",
    category: "role",
    template: "请唤醒占卜师（{{seatNo}}号玩家），请其选择两名玩家进行查验",
    description: "占卜师唤醒提示",
    scenes: ["night"],
  },
  {
    id: "role.undertaker.wake",
    category: "role",
    template:
      "请唤醒送葬者（{{seatNo}}号玩家），告知其昨天被处决的是{{executedRoleName}}（{{executedSeatNo}}号）",
    description: "送葬者唤醒提示",
    scenes: ["night"],
  },
  // 洗衣妇
  {
    id: "role.washerwoman.wake",
    category: "role",
    template:
      "请唤醒洗衣妇（{{seatNo}}号玩家），告知其{{seat1}}号和{{seat2}}号玩家中有一名是{{roleName}}",
    description: "洗衣妇唤醒提示",
    scenes: ["night_first"],
  },
  // 图书管理员
  {
    id: "role.librarian.wake",
    category: "role",
    template:
      "请唤醒图书管理员（{{seatNo}}号玩家），告知其{{seat1}}号和{{seat2}}号玩家中有一名是{{outsiderName}}",
    description: "图书管理员唤醒提示",
    scenes: ["night_first"],
  },
  // 调查员
  {
    id: "role.investigator.wake",
    category: "role",
    template:
      "请唤醒调查员（{{seatNo}}号玩家），告知其{{seat1}}号和{{seat2}}号玩家中有一名是{{minionName}}",
    description: "调查员唤醒提示",
    scenes: ["night_first"],
  },
  // 厨师
  {
    id: "role.chef.wake",
    category: "role",
    template:
      "请唤醒厨师（{{seatNo}}号玩家），告知其场上有{{evilPairCount}}对相邻的邪恶玩家",
    description: "厨师唤醒提示",
    scenes: ["night_first"],
  },
  // 共情者
  {
    id: "role.empath.wake",
    category: "role",
    template:
      "请唤醒共情者（{{seatNo}}号玩家），告知其邻座有{{evilCount}}名邪恶玩家",
    description: "共情者唤醒提示",
    scenes: ["night"],
  },
  // 僧侣
  {
    id: "role.monk.wake",
    category: "role",
    template: "请唤醒僧侣（{{seatNo}}号玩家），请其选择一名玩家进行保护",
    description: "僧侣唤醒提示",
    scenes: ["night"],
  },
  // 守鸦人
  {
    id: "role.ravenkeeper.wake",
    category: "role",
    template: "请唤醒守鸦人（{{seatNo}}号玩家），请其选择一名玩家获知身份",
    description: "守鸦人唤醒提示",
    scenes: ["night"],
  },
  // 管家
  {
    id: "role.butler.wake",
    category: "role",
    template: "请唤醒管家（{{seatNo}}号玩家），请其选择一名玩家作为今天的主人",
    description: "管家唤醒提示",
    scenes: ["night"],
  },
  // 酒鬼
  {
    id: "role.drunk.wake",
    category: "role",
    template: "请唤醒酒鬼（{{seatNo}}号玩家），告知其虚假的镇民角色信息",
    description: "酒鬼唤醒提示",
    scenes: ["night_first"],
  },
  // 毒药师
  {
    id: "role.poisoner.wake",
    category: "role",
    template: "请唤醒毒药师（{{seatNo}}号玩家），请其选择一名玩家下毒",
    description: "毒药师唤醒提示",
    scenes: ["night"],
  },
  // 处女
  {
    id: "role.virgin.wake",
    category: "role",
    template:
      "{{nominateSeatNo}}号玩家提名了处女（{{seatNo}}号玩家），若提名者是镇民则直接被处决",
    description: "处女技能触发提示",
    scenes: ["day"],
  },
  // 猎手
  {
    id: "role.slayer.wake",
    category: "role",
    template:
      '猎手（{{seatNo}}号玩家）选择对{{targetSeatNo}}号玩家使用技能，{{isDemon ? "目标是恶魔，已被击杀" : "目标不是恶魔，无事发生"}}',
    description: "猎手技能触发提示",
    scenes: ["day"],
  },
  // 士兵
  {
    id: "role.soldier.wake",
    category: "role",
    template: "士兵（{{seatNo}}号玩家）被恶魔攻击，因其免疫恶魔伤害而不会死亡",
    description: "士兵技能触发提示",
    scenes: ["night"],
  },
  // 市长
  {
    id: "role.mayor.wake",
    category: "role",
    template:
      "今日平票，市长（{{seatNo}}号玩家）决定处决{{targetSeatNo}}号玩家",
    description: "市长技能触发提示",
    scenes: ["day"],
  },
  // 隐士
  {
    id: "role.recluse.wake",
    category: "role",
    template:
      "隐士（{{seatNo}}号玩家）被信息类技能查验，可被视为邪恶/爪牙/恶魔",
    description: "隐士技能触发提示",
    scenes: ["night", "day"],
  },
  // 圣徒
  {
    id: "role.saint.wake",
    category: "role",
    template: "圣徒（{{seatNo}}号玩家）被处决，善良阵营直接落败",
    description: "圣徒技能触发提示",
    scenes: ["day"],
  },
  // 间谍
  {
    id: "role.spy.wake",
    category: "role",
    template: "请唤醒间谍（{{seatNo}}号玩家），允许其查看魔典",
    description: "间谍唤醒提示",
    scenes: ["night"],
  },
  // 红唇女郎
  {
    id: "role.scarlet_woman.wake",
    category: "role",
    template: "小恶魔已死亡，红唇女郎（{{seatNo}}号玩家）成为新的小恶魔",
    description: "红唇女郎技能触发提示",
    scenes: ["night", "day"],
  },
  // 男爵
  {
    id: "role.baron.wake",
    category: "role",
    template: "男爵在场，本局游戏增加2名外来者",
    description: "男爵技能提示",
    scenes: ["setup"],
  },
  // 小恶魔
  {
    id: "role.imp.wake",
    category: "role",
    template: "请唤醒小恶魔（{{seatNo}}号玩家），请其选择一名玩家击杀",
    description: "小恶魔唤醒提示",
    scenes: ["night"],
  },

  // 技能操作提示
  {
    id: "ability.fortune_teller.check",
    category: "ability",
    template:
      '占卜师查验的结果为：{{targetSeatNo}}号玩家{{isDemon ? "是恶魔" : "不是恶魔"}}',
    description: "占卜师验人结果提示",
  },
  {
    id: "ability.washerwoman.info",
    category: "ability",
    template:
      "洗衣妇获得信息：{{seat1}}号和{{seat2}}号玩家中有一名是{{roleName}}",
    description: "洗衣妇信息结果提示",
  },
  {
    id: "ability.librarian.info",
    category: "ability",
    template:
      "图书管理员获得信息：{{seat1}}号和{{seat2}}号玩家中有一名是{{outsiderName}}",
    description: "图书管理员信息结果提示",
  },
  {
    id: "ability.investigator.info",
    category: "ability",
    template:
      "调查员获得信息：{{seat1}}号和{{seat2}}号玩家中有一名是{{minionName}}",
    description: "调查员信息结果提示",
  },
  {
    id: "ability.chef.info",
    category: "ability",
    template: "厨师获得信息：场上有{{evilPairCount}}对相邻的邪恶玩家",
    description: "厨师信息结果提示",
  },
  {
    id: "ability.empath.info",
    category: "ability",
    template: "共情者获得信息：邻座有{{evilCount}}名邪恶玩家",
    description: "共情者信息结果提示",
  },
  {
    id: "ability.monk.protect",
    category: "ability",
    template: "僧侣选择保护{{targetSeatNo}}号玩家，该玩家今晚不会被恶魔杀死",
    description: "僧侣保护结果提示",
  },
  {
    id: "ability.ravenkeeper.info",
    category: "ability",
    template: "守鸦人查验{{targetSeatNo}}号玩家的身份是{{roleName}}",
    description: "守鸦人查验结果提示",
  },
  {
    id: "ability.butler.choose",
    category: "ability",
    template:
      "管家选择{{masterSeatNo}}号玩家作为今天的主人，投票时必须跟随主人的选择",
    description: "管家选择主人结果提示",
  },
  {
    id: "ability.poisoner.poison",
    category: "ability",
    template:
      "毒药师选择给{{targetSeatNo}}号玩家下毒，该玩家能力将失效直到下一个夜晚",
    description: "毒药师下毒结果提示",
  },
  {
    id: "ability.spy.view_grimoire",
    category: "ability",
    template: "间谍查看魔典，获得所有玩家的身份信息",
    description: "间谍查看魔典结果提示",
  },
  {
    id: "ability.imp.kill",
    category: "ability",
    template: "小恶魔选择击杀{{targetSeatNo}}号玩家，该玩家已死亡",
    description: "小恶魔击杀结果提示",
  },
  {
    id: "ability.ravenkeeper.trigger",
    category: "ability",
    template: "守鸦人今晚死亡，请其选择一名玩家获知身份",
    description: "守鸦人技能触发提示",
    scenes: ["night"],
  },

  // 状态提示
  {
    id: "status.poisoned",
    category: "status",
    template: "⚠️ {{seatNo}}号玩家（{{roleName}}）已被中毒，其能力将失效",
    description: "中毒状态提示",
  },
  {
    id: "status.drunk",
    category: "status",
    template:
      "⚠️ {{seatNo}}号玩家（{{roleName}}）已被醉酒，其信息/能力将是错误的",
    description: "醉酒状态提示",
  },
  {
    id: "status.protected",
    category: "status",
    template: "🛡️ {{seatNo}}号玩家今晚受到僧侣保护，不会被恶魔杀死",
    description: "受保护状态提示",
  },

  // 结果提示
  {
    id: "result.attack.blocked",
    category: "result",
    template: "恶魔攻击{{targetSeatNo}}号玩家失败，原因：{{reason}}",
    description: "攻击被阻挡的结果提示",
  },
  {
    id: "result.execution.success",
    category: "result",
    template: "{{seatNo}}号玩家（{{roleName}}）被公投处决",
    description: "处决成功提示",
  },
];

// 快捷查询Map
export const promptMap = new Map<string, PromptTemplate>();
promptDictionary.forEach((prompt) => {
  promptMap.set(prompt.id, prompt);
});

/**
 * 根据ID获取提示模板
 */
export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return promptMap.get(id);
}
