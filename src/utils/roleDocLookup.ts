import { getAllRoleDefinitions } from "../roles";

// No longer using manual JSON files as documentation is now injected into RoleDefinitions.
// For non-migrated roles, we fall back to existing data if available.

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

// Build a name -> detailedDescription mapping from all registered role definitions.
const getRoleDocFromRegistry = (roleName: string): string | undefined => {
  const allDefs = getAllRoleDefinitions();
  const def = allDefs.find(d => d.name === roleName || d.id === roleName);
  return def?.detailedDescription;
};

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

  const content = getRoleDocFromRegistry(name);
  if (!content) return null;

  const abilityText = extractSection(content, "角色能力");
  const backgroundText = extractSection(content, "背景故事");
  const examplesText = extractSection(content, "范例");
  const operationText = extractSection(content, "运作方式");
  const promptsText = extractSection(content, "提示标记");
  const rulesDetailsText = extractSection(content, "规则细节");
  const tipsText = extractSection(content, "提示与技巧");
  const storytellerTips = tipsText ? toBullets(tipsText, 3) : undefined;
  const traits = extractRoleInfoTraits(content);

  // Process examples to extract individual examples
  const examples = examplesText ? examplesText.split('\n').filter(line =>
    line.trim().startsWith('> 范例:') || line.trim().startsWith('> 示例:')
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
  };
}


