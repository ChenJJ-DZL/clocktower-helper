/**
 * 官方规范抽取：`json/full/*.json` → 去重、归一化的官方角色规范
 * ======================================================================
 * 原始 wiki dump 的现实问题（已实测，必须归一化后才能做比对）：
 *   · 同一角色在多个剧本文件中重复出现（580 条原始记录 / 232 个唯一角色）；
 *   · 部分记录 `类型` 字段被污染成长文本（必须丢弃并统计）；
 *   · 同一角色不同记录里 `首夜行动顺序` 有的为空、有的有值（必须择优合并）；
 *   · `content` 是「章节对象」，章节集合因角色而不同（如「对抗小恶魔」）。
 *
 * 本模块**只读** `json/full/*.json`（受保护真源），不修改任何 wiki 数据。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  ImplRoleType,
  OfficialNightOrder,
  OfficialRoleSpec,
  OfficialSpecFile,
} from "./types";

const VALID_TYPES: Record<string, ImplRoleType> = {
  镇民: "townsfolk",
  外来者: "outsider",
  爪牙: "minion",
  恶魔: "demon",
  旅行者: "traveler",
  传奇角色: "fabled",
};

/** 官方 wiki 中「角色能力」「范例」等章节名 */
const SECTION = {
  ability: "角色能力",
  examples: "范例",
  ops: "运作方式",
  tokens: "提示标记",
  rulesDetail: "规则细节",
} as const;

interface RawRecord {
  [key: string]: unknown;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function splitTags(value: string): string[] {
  return value
    .split("、")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 解析官方夜序原文：
 *   "45" → 45；"无法行动" → "cannot_act"；"" → null；其他文本 → 原文数字优先，否则 null。
 */
export function parseOfficialNightOrder(value: unknown): {
  order: OfficialNightOrder;
  raw: string | null;
} {
  const raw = asString(value).trim();
  if (raw === "") return { order: null, raw: null };
  if (raw.includes("无法行动")) return { order: "cannot_act", raw };
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return { order: asNumber, raw };
  const extracted = raw.match(/\d+/);
  return {
    order: extracted ? Number(extracted[0]) : null,
    raw,
  };
}

function pickSection(content: unknown, key: string): string {
  if (!content || typeof content !== "object") return "";
  const value = (content as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function expandNewlines(value: string): string {
  return value.replace(/\\n/g, "\n");
}

/** 把 content.范例 拆成单条官方范例（去掉「> 范例:」前缀） */
export function parseExamples(raw: string): string[] {
  const text = expandNewlines(raw ?? "").trim();
  if (!text) return [];
  // 先按「> 范例:」标记切分（标记可能出现在行首或行中），再逐条清洗换行
  const chunks = text
    .split(/(?:^|\n)\s*>?\s*范例[:：]?\s*/)
    .map((chunk) => chunk.replace(/\n+/g, " ").trim())
    .filter((chunk) => chunk.length > 0);
  if (chunks.length > 0) return chunks;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function recordScore(record: RawRecord): number {
  const content = record.content;
  const sectionCount =
    content && typeof content === "object" ? Object.keys(content).length : 0;
  const abilityLen = pickSection(content, SECTION.ability).length;
  const examplesLen = pickSection(content, SECTION.examples).length;
  const orders =
    (parseOfficialNightOrder(record["首夜行动顺序"]).order !== null ? 1 : 0) +
    (parseOfficialNightOrder(record["其他夜晚行动顺序"]).order !== null ? 1 : 0);
  return sectionCount * 10 + abilityLen + examplesLen / 2 + orders * 20;
}

function betterOrder(
  a: OfficialNightOrder,
  b: OfficialNightOrder
): OfficialNightOrder {
  // 数值（官方明确编号）优先于「无法行动」，后者优先于缺失
  const rank = (v: OfficialNightOrder) =>
    typeof v === "number" ? 2 : v === "cannot_act" ? 1 : 0;
  return rank(b) > rank(a) ? b : a;
}

/** 读取 json/full/*.json 全部原始记录（附带来源文件名） */
export function loadRawOfficialRecords(
  root = process.cwd()
): Array<RawRecord & { _sourceFile: string }> {
  const dir = path.join(root, "json", "full");
  const records: Array<RawRecord & { _sourceFile: string }> = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8")
    ) as unknown;
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      if (item && typeof item === "object") {
        records.push({ ...(item as RawRecord), _sourceFile: file });
      }
    }
  }
  return records;
}

/**
 * 抽取并归一化官方规范。
 *
 * @param root 仓库根目录（默认 cwd）
 */
export function extractOfficialSpec(root = process.cwd()): OfficialSpecFile {
  const raw = loadRawOfficialRecords(root);
  const groups = new Map<string, Array<RawRecord & { _sourceFile: string }>>();
  let validRecords = 0;
  let droppedRecords = 0;

  for (const record of raw) {
    const typeRaw = asString(record["类型"]).trim();
    if (!(typeRaw in VALID_TYPES)) {
      droppedRecords++;
      continue;
    }
    validRecords++;
    const key = asString(record["名称"]).trim() || asString(record["英文名"]).trim();
    if (!key) {
      droppedRecords++;
      validRecords--;
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  const roles: OfficialRoleSpec[] = [];
  const capabilityTagCounts: Record<string, number> = {};
  let missingAbilityText = 0;
  let rolesWithExamples = 0;
  let totalExamples = 0;
  let mergedDuplicateRoles = 0;

  for (const [nameCn, records] of groups) {
    if (records.length > 1) mergedDuplicateRoles++;
    const best = [...records].sort((a, b) => recordScore(b) - recordScore(a))[0]!;

    const bestContent = best.content;
    const scriptTags = new Set<string>();
    const capabilityTags = new Set<string>();
    const sourceFiles = new Set<string>();
    let nameEn = "";
    let abilityText = "";
    let examplesRaw = "";
    let storytellerOps = "";
    let reminderTokens = "";
    let rulesDetail = "";
    let firstNightOrder: OfficialNightOrder = null;
    let otherNightOrder: OfficialNightOrder = null;
    let firstNightOrderRaw: string | null = null;
    let otherNightOrderRaw: string | null = null;
    let wikiUrl: string | null = null;

    for (const record of records) {
      sourceFiles.add(record._sourceFile);
      nameEn = nameEn || asString(record["英文名"]).trim();
      wikiUrl = wikiUrl || asString(record["url"]).trim() || null;
      for (const tag of splitTags(asString(record["所属剧本"]))) {
        scriptTags.add(tag);
      }
      for (const tag of splitTags(asString(record["角色能力类型"]))) {
        capabilityTags.add(tag);
      }
      const first = parseOfficialNightOrder(record["首夜行动顺序"]);
      const other = parseOfficialNightOrder(record["其他夜晚行动顺序"]);
      const nextFirst = betterOrder(firstNightOrder, first.order);
      if (nextFirst !== firstNightOrder) {
        firstNightOrder = nextFirst;
        firstNightOrderRaw = first.raw;
      } else if (firstNightOrder === null && first.raw) {
        firstNightOrderRaw = firstNightOrderRaw ?? first.raw;
      }
      const nextOther = betterOrder(otherNightOrder, other.order);
      if (nextOther !== otherNightOrder) {
        otherNightOrder = nextOther;
        otherNightOrderRaw = other.raw;
      } else if (otherNightOrder === null && other.raw) {
        otherNightOrderRaw = otherNightOrderRaw ?? other.raw;
      }
      const candidateAbility = pickSection(record.content, SECTION.ability);
      if (candidateAbility.length > abilityText.length) {
        abilityText = candidateAbility;
      }
      const candidateExamples = pickSection(record.content, SECTION.examples);
      if (parseExamples(candidateExamples).length > parseExamples(examplesRaw).length) {
        examplesRaw = candidateExamples;
      }
      const candidateOps = pickSection(record.content, SECTION.ops);
      if (candidateOps.length > storytellerOps.length) storytellerOps = candidateOps;
      const candidateTokens = pickSection(record.content, SECTION.tokens);
      if (candidateTokens.length > reminderTokens.length) {
        reminderTokens = candidateTokens;
      }
      const candidateRules = pickSection(record.content, SECTION.rulesDetail);
      if (candidateRules.length > rulesDetail.length) rulesDetail = candidateRules;
    }

    const typeRaw = asString(best["类型"]).trim();
    const type = VALID_TYPES[typeRaw] ?? null;
    const examples = parseExamples(examplesRaw);
    if (!abilityText) missingAbilityText++;
    if (examples.length > 0) rolesWithExamples++;
    totalExamples += examples.length;
    for (const tag of capabilityTags) {
      capabilityTagCounts[tag] = (capabilityTagCounts[tag] ?? 0) + 1;
    }

    roles.push({
      nameCn,
      nameEn,
      type,
      typeRaw,
      firstNightOrder,
      otherNightOrder,
      firstNightOrderRaw,
      otherNightOrderRaw,
      scriptTags: [...scriptTags],
      capabilityTags: [...capabilityTags],
      abilityText: expandNewlines(abilityText),
      examples,
      storytellerOps: expandNewlines(storytellerOps),
      reminderTokens: expandNewlines(reminderTokens),
      rulesDetail: expandNewlines(rulesDetail),
      sourceFiles: [...sourceFiles].sort(),
      sourceRecordCount: records.length,
      wikiUrl,
    });
  }

  roles.sort((a, b) => a.nameCn.localeCompare(b.nameCn, "zh-Hans-CN"));

  return {
    generatedAt: new Date().toISOString(),
    source: "json/full/*.json",
    stats: {
      rawRecords: raw.length,
      validRecords,
      droppedRecords,
      uniqueRoles: roles.length,
      mergedDuplicateRoles,
      missingAbilityText,
      rolesWithExamples,
      totalExamples,
      capabilityTagCounts,
    },
    roles,
  };
}
