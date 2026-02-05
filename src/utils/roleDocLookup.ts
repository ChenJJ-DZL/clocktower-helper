type RoleDocEntry = {
  id: number;
  name: string;
  url?: string;
  content: string;
};

// NOTE: these json files are maintained manually under repo root `josn/`
// and contain long-form wiki-like role docs.
// NOTE: these json files are maintained manually under repo root `josn/`
// and contain long-form wiki-like role docs.
import bmrDocs from "../../josn/血染钟楼-黯月初升-角色文档-副本.json";
import savDocs from "../../josn/血染钟楼-梦殒春宵-角色文档.json";
import townsfolkDocs from "../../josn/blood_clocktower_所有镇民.json";
import outsiderDocs from "../../josn/blood_clocktower_所有外来者.json";
import minionDocs from "../../josn/blood_clocktower_所有爪牙.json";
import demonDocs from "../../josn/blood_clocktower_所有恶魔.json";
import travelerDocs from "../../josn/blood_clocktower_所有传奇角色.json";

type RoleDocSummary = {
  abilityText?: string;
  storytellerTips?: string[];
  traits?: string[];
  url?: string;
  rulesDetails?: string;
  examples?: string[];
  background?: string;
  operation?: string;
  prompts?: string;
};

function buildIndex(entries: RoleDocEntry[]): Map<string, RoleDocEntry> {
  const map = new Map<string, RoleDocEntry>();
  for (const e of entries) {
    if (!e?.name) continue;
    map.set(e.name.trim(), e);
  }
  return map;
}

const INDEXES: Map<string, RoleDocEntry>[] = [
  buildIndex(bmrDocs as RoleDocEntry[]),
  buildIndex(savDocs as RoleDocEntry[]),
  buildIndex(townsfolkDocs as RoleDocEntry[]),
  buildIndex(outsiderDocs as RoleDocEntry[]),
  buildIndex(minionDocs as RoleDocEntry[]),
  buildIndex(demonDocs as RoleDocEntry[]),
  buildIndex(travelerDocs as RoleDocEntry[]),
];

function extractSection(content: string, sectionTitle: string): string | undefined {
  // Match: 【角色能力】 ... (until next 【xxx】 or end)
  // Improved to handle cases where there might not be a newline before the next header
  const re = new RegExp(`【${sectionTitle}】([\\s\\S]*?)(?=(\\n?\\s*【|$))`);
  const m = content.match(re);
  if (!m) return undefined;
  return m[1].trim();
}

function toBullets(text: string, maxItems: number): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer bullet-like lines, but fall back to sentences.
  const bulletLike = lines.filter((l) => l.startsWith("- ") || l.startsWith("•"));
  const chosen = (bulletLike.length > 0 ? bulletLike : lines)
    .slice(0, maxItems)
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  return chosen;
}

function extractRoleInfoTraits(content: string): string[] | undefined {
  const roleInfo = extractSection(content, "角色信息");
  if (!roleInfo) return undefined;

  const lines = roleInfo
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const traitLine = lines.find((l) => l.startsWith("- 角色能力类型："));
  const typeLine = lines.find((l) => l.startsWith("- 角色类型："));

  const traits: string[] = [];
  if (typeLine) traits.push(typeLine.replace("- 角色类型：", "").trim());
  if (traitLine) traits.push(traitLine.replace("- 角色能力类型：", "").trim());
  return traits.length ? traits : undefined;
}

export function getRoleDocSummary(roleName: string): RoleDocSummary | null {
  const name = (roleName || "").trim();
  if (!name) return null;

  let entry: RoleDocEntry | undefined;
  for (const idx of INDEXES) {
    const hit = idx.get(name);
    if (hit) {
      entry = hit;
      break;
    }
  }
  if (!entry) return null;

  const abilityText = extractSection(entry.content, "角色能力");
  const backgroundText = extractSection(entry.content, "背景故事");
  const examplesText = extractSection(entry.content, "范例");
  const operationText = extractSection(entry.content, "运作方式");
  const promptsText = extractSection(entry.content, "提示标记");
  const rulesDetailsText = extractSection(entry.content, "规则细节");
  const tipsText = extractSection(entry.content, "提示与技巧");
  const storytellerTips = tipsText ? toBullets(tipsText, 3) : undefined;
  const traits = extractRoleInfoTraits(entry.content);

  // Process examples to extract individual examples
  const examples = examplesText ? examplesText.split('\n').filter(line =>
    line.trim().startsWith('> 范例:') || line.trim().startsWith('> 范例:')
  ).map(line => line.trim().replace(/^>\s*/, '')) : undefined;

  return {
    abilityText,
    background: backgroundText,
    examples,
    operation: operationText,
    prompts: promptsText,
    rulesDetails: rulesDetailsText,
    storytellerTips,
    traits,
    url: entry.url,
  };
}


