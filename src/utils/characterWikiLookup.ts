import type { Role } from "../../app/data";
import rawCharacterList from "../../json/full/all_characters.json";
import poppygandaExtras from "../data/poppyganda_official_extras.json";

export interface CharacterWikiDetails {
  name: string;
  englishName: string;
  type: string; // 镇民 | 外来者 | 爪牙 | 恶魔 | 旅行者 | 传奇角色
  script?: string; // 所属剧本
  abilityType?: string; // 角色能力类型
  url?: string;
  flavorQuote?: string; // 背景故事名言
  abilityText?: string; // 角色能力
  overview?: string; // 角色简介
  operation?: string; // 运作方式
  reminderTokens?: string; // 提示标记
  ruleDetails?: string; // 规则细节
  strategyTips: string[]; // 玩法推荐 / 提示与技巧 (清洗拆分为段落要点)
  bluffTips?: string[]; // 伪装成xxx
  counterTips?: string[]; // 对抗xxx
}

// 建立名称和别名的快速索引
interface RawCharacter {
  id: string;
  名称: string;
  英文名: string;
  类型: string;
  所属剧本?: string;
  角色能力类型?: string;
  url?: string;
  content?: {
    背景故事?: string;
    角色能力?: string;
    角色简介?: string;
    运作方式?: string;
    提示标记?: string;
    规则细节?: string;
    提示与技巧?: string;
    [key: string]: string | undefined;
  };
}

const nameIndex = new Map<string, RawCharacter>();
const englishIndex = new Map<string, RawCharacter>();
const idIndex = new Map<string, RawCharacter>();

const rawList = rawCharacterList as unknown as RawCharacter[];

for (const char of rawList) {
  if (char.名称) {
    nameIndex.set(char.名称.trim(), char);
    nameIndex.set(char.名称.trim().replace(/[\s\-_]/g, ""), char);
  }
  if (char.英文名) {
    const en = char.英文名.trim().toLowerCase();
    englishIndex.set(en, char);
    englishIndex.set(en.replace(/[\s\-_]/g, ""), char);
  }
  if (char.id) {
    idIndex.set(char.id.trim(), char);
  }
}

// 罂粟花开 4 角色（罂粟种植者 / 告密者 / 提线木偶 / 军团）从 src/data/poppyganda_official_extras.json 注入；
// 因为 json/full/all_characters.json 不含这 4 角色，且 json/ 目录受 clinerules 保护。
// 注：赏金猎人 / 小精灵暂未收录。
const poppygandaExtraList = Object.values(
  poppygandaExtras as unknown as Record<string, RawCharacter>
).filter((c) => c && c.名称);

for (const char of poppygandaExtraList) {
  if (char.名称) {
    nameIndex.set(char.名称.trim(), char);
    nameIndex.set(char.名称.trim().replace(/[\s\-_]/g, ""), char);
  }
  if (char.英文名) {
    const en = char.英文名.trim().toLowerCase();
    englishIndex.set(en, char);
    englishIndex.set(en.replace(/[\s\-_]/g, ""), char);
  }
  if (char.id) {
    idIndex.set(char.id.trim(), char);
  }
}

/**
 * 将长文本拆分为条理分明的要点段落
 */
function parseToPoints(text?: string): string[] {
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const points: string[] = [];
  for (const line of lines) {
    // 移除前导破折号、星号或数字序号
    const cleaned = line.replace(/^[-*•\d+.\s]+/, "").trim();
    if (cleaned.length > 0) {
      points.push(cleaned);
    }
  }
  return points;
}

/**
 * 根据角色对象、角色中文名或角色英文名查找官方百科全量信息
 */
export function getCharacterWikiDetails(
  roleOrName: Role | string | null | undefined
): CharacterWikiDetails | null {
  if (!roleOrName) return null;

  let raw: RawCharacter | undefined;

  if (typeof roleOrName === "string") {
    const trimmed = roleOrName.trim();
    raw =
      nameIndex.get(trimmed) ||
      nameIndex.get(trimmed.replace(/[\s\-_]/g, "")) ||
      englishIndex.get(trimmed.toLowerCase()) ||
      englishIndex.get(trimmed.toLowerCase().replace(/[\s\-_]/g, "")) ||
      idIndex.get(trimmed);
  } else {
    // Role object
    if (roleOrName.name) {
      const trimmedName = roleOrName.name.trim();
      raw =
        nameIndex.get(trimmedName) ||
        nameIndex.get(trimmedName.replace(/[\s\-_]/g, ""));
    }
    if (!raw && roleOrName.id) {
      const trimmedId = roleOrName.id.trim().toLowerCase();
      raw =
        englishIndex.get(trimmedId) ||
        englishIndex.get(trimmedId.replace(/[\s\-_]/g, "")) ||
        idIndex.get(trimmedId);
    }
  }

  if (!raw) {
    // 如果未找到（如自定义角色），构造基础结构
    if (typeof roleOrName === "object" && roleOrName !== null) {
      return {
        name: roleOrName.name || "自定义角色",
        englishName: roleOrName.id || "",
        type:
          roleOrName.type === "townsfolk"
            ? "镇民"
            : roleOrName.type === "outsider"
              ? "外来者"
              : roleOrName.type === "minion"
                ? "爪牙"
                : roleOrName.type === "demon"
                  ? "恶魔"
                  : roleOrName.type === "traveler"
                    ? "旅行者"
                    : "自定义",
        abilityText: roleOrName.ability || "",
        strategyTips: roleOrName.ability ? [roleOrName.ability] : [],
      };
    }
    return null;
  }

  const content = raw.content || {};

  // 提取"伪装成xxx"动态键
  let bluffTips: string[] | undefined;
  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith("伪装成") && val) {
      bluffTips = parseToPoints(val);
      break;
    }
  }

  // 提取"对抗xxx"动态键
  let counterTips: string[] | undefined;
  for (const [key, val] of Object.entries(content)) {
    if (key.startsWith("对抗") && val) {
      counterTips = parseToPoints(val);
      break;
    }
  }

  const strategyTips = parseToPoints(content["提示与技巧"]);

  return {
    name: raw.名称,
    englishName: raw.英文名,
    type: raw.类型,
    script: raw.所属剧本,
    abilityType: raw.角色能力类型,
    url: raw.url,
    flavorQuote: content["背景故事"],
    abilityText: content["角色能力"],
    overview: content["角色简介"],
    operation: content["运作方式"],
    reminderTokens: content["提示标记"],
    ruleDetails: content["规则细节"],
    strategyTips:
      strategyTips.length > 0
        ? strategyTips
        : content["角色简介"]
          ? [content["角色简介"]]
          : [],
    bluffTips,
    counterTips,
  };
}
