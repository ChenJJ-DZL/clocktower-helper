type RoleDocEntry = {
  id: number;
  name: string;
  url?: string;
  content: string;
};

// NOTE: these json files are maintained manually under repo root `josn/`
// and contain long-form wiki-like role docs.
import bmrDocs from "../../josn/血染钟楼-黯月初升-角色文档-副本.json";
import savDocs from "../../josn/血染钟楼-梦殒春宵-角色文档.json";

type RoleDocSummary = {
  abilityText?: string;
  storytellerTips?: string[];
  traits?: string[];
  url?: string;
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
];

function extractSection(content: string, sectionTitle: string): string | undefined {
  // Match: 【角色能力】 ... (until next 【xxx】 or end)
  const re = new RegExp(`【${sectionTitle}】([\\s\\S]*?)(?=\\n【|$)`, "m");
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
  const tipsText = extractSection(entry.content, "提示与技巧");
  const storytellerTips = tipsText ? toBullets(tipsText, 3) : undefined;
  const traits = extractRoleInfoTraits(entry.content);

  return {
    abilityText,
    storytellerTips,
    traits,
    url: entry.url,
  };
}


