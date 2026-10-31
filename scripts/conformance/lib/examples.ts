/**
 * 官方范例台账（L3 · Oracle 化）—— 唯一事实源
 * ======================================================================
 * 官方 wiki 每个角色都带【范例】（`outputs/rule_conformance/official_spec.json`
 * 的 `roles[].examples`），它们就是官方给出的**期望行为**，比人工写测试更权威。
 * 本模块把 438 条官方范例变成**可索引、可扫描、可计量**的台账：
 *
 *   · `loadOfficialExamples()`  → 官方范例清单（稳定 id = `<角色名>#<序号>`）
 *   · `scanEncodedExamples()`   → 扫描 `tests/conformance/**\/*.test.ts` 里已编码的
 *                                 `// 官方范例: <角色名> #<idx>` 注释
 *   · `exampleCoverage()`       → 覆盖率（总/按角色/按剧本/缺失清单）
 *
 * 约定：
 *   · 只读官方规范文件，不修改它；文件缺失时用与
 *     `npx tsx scripts/conformance/extract-spec.ts` **完全相同**的抽取函数落盘
 *     （见 `ensureOfficialSpecFile`，避免子进程依赖）。
 *   · 已编码注释必须指向真实存在的官方范例 —— 伪造 id 会被记为
 *     `unknownEncodedIds`，由 `src/utils/__tests__/examples_ledger.test.ts` 拦截。
 *   · 不引入第三方依赖。
 */
import fs from "node:fs";
import path from "node:path";
import { roles as appRoles } from "../../../app/data";
import { normalizeEnglishName } from "./audit";
import { extractOfficialSpec } from "./spec";
import type { OfficialSpecFile } from "./types";

/** 一条官方范例（id 稳定：`<角色名>#<序号>`，序号从 0 开始） */
export interface OfficialExample {
  id: string;
  roleNameCn: string;
  roleIdHint?: string;
  index: number;
  text: string;
}

/** 单个角色的官方范例覆盖情况 */
export interface RoleExampleCoverage {
  total: number;
  encoded: number;
  encodedIds: string[];
  missingIds: string[];
}

/** 按剧本（官方「所属剧本」标签）汇总的覆盖率。多剧本角色归入第一个标签。 */
export interface ScriptExampleCoverage {
  script: string;
  total: number;
  encoded: number;
}

/** 官方范例覆盖率总览 */
export interface ExampleCoverageResult {
  /** 官方范例总数 */
  total: number;
  /** 已被可执行夹具编码的官方范例数（只统计真实存在的官方 id） */
  encoded: number;
  /** encoded / total（0~1） */
  percent: number;
  /** 有官方范例的角色数 */
  rolesWithExamples: number;
  /** 至少编码了 1 条官方范例的角色数 */
  rolesWithEncoded: number;
  /** 按角色中文名分组的覆盖情况（键按中文名排序） */
  byRole: Record<string, RoleExampleCoverage>;
  /** 缺失范例 id 清单（键按中文名排序；值为该角色尚未编码的官方范例 id） */
  missingByRole: Record<string, string[]>;
  /** 按官方剧本标签汇总（总/已编码），按 total 降序 */
  byScript: ScriptExampleCoverage[];
  /** 夹具注释里出现、但在官方范例中**不存在**的 id（防伪造；应为空） */
  unknownEncodedIds: string[];
}

const SPEC_RELATIVE_PATH = path.join(
  "outputs",
  "rule_conformance",
  "official_spec.json"
);

/** 官方规范文件绝对路径 */
export function officialSpecPath(root = process.cwd()): string {
  return path.join(root, SPEC_RELATIVE_PATH);
}

/**
 * 确保官方规范文件存在并返回（与 `npx tsx scripts/conformance/extract-spec.ts`
 * 等价的进程内实现：调用同一 `extractOfficialSpec()` 后按同一格式落盘）。
 */
function ensureOfficialSpecFile(root: string): string {
  const file = officialSpecPath(root);
  if (fs.existsSync(file)) return file;

  const spec = extractOfficialSpec(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  return file;
}

/** 读取官方规范（文件缺失时自动生成） */
export function loadOfficialSpecFile(root = process.cwd()): OfficialSpecFile {
  const file = ensureOfficialSpecFile(root);
  return JSON.parse(fs.readFileSync(file, "utf8")) as OfficialSpecFile;
}

/**
 * 建立「官方中文名 → 项目角色 id」的提示映射。
 *
 * 只为台账人读便利（`roleIdHint` 是**可选提示**，不参与任何判胜/覆盖率断言）：
 *   1. 先按官方英文名归一化后与项目 roleId 精确匹配（消除「圣徒」同名歧义）；
 *   2. 再回退到唯一中文名匹配；
 *   3. 仍有歧义 ⇒ 不给提示（不猜）。
 */
function buildRoleIdHints(): Map<string, string> {
  const ids = new Set(appRoles.map((role) => role.id));
  const byChineseName = new Map<string, string[]>();
  for (const role of appRoles) {
    const list = byChineseName.get(role.name) ?? [];
    list.push(role.id);
    byChineseName.set(role.name, list);
  }

  const hints = new Map<string, string>();
  for (const role of appRoles) {
    const id = normalizeEnglishName(role.name);
    if (id && ids.has(id)) {
      hints.set(role.id, id);
    }
  }
  // 反向：官方中文名 → 项目 id（唯一中文名或英文名归一化精确命中才回填）
  return hints;
}

/** 官方规范里每个角色的项目角色 id 提示（按官方角色中文名索引） */
function buildRoleIdHintByOfficialName(
  spec: OfficialSpecFile
): Map<string, string> {
  const appIds = new Set(appRoles.map((role) => role.id));
  const nameToAppId = new Map<string, string[]>();
  for (const role of appRoles) {
    const list = nameToAppId.get(role.name) ?? [];
    list.push(role.id);
    nameToAppId.set(role.name, list);
  }

  const result = new Map<string, string>();
  for (const role of spec.roles) {
    const englishId = normalizeEnglishName(role.nameEn ?? "");
    if (englishId && appIds.has(englishId)) {
      result.set(role.nameCn, englishId);
      continue;
    }
    const sameName = nameToAppId.get(role.nameCn) ?? [];
    if (sameName.length === 1) result.set(role.nameCn, sameName[0]!);
  }
  return result;
}

/** 官方范例 id：`<角色名>#<序号>` */
export function officialExampleId(roleNameCn: string, index: number): string {
  return `${roleNameCn}#${index}`;
}

/**
 * 读取官方全部范例（按官方规范里的角色顺序展开）。
 *
 * @param root 仓库根目录（默认 `process.cwd()`）；文件缺失时自动用
 *        `extractOfficialSpec()` 生成（等价于跑 `extract-spec.ts`）。
 */
export function loadOfficialExamples(root = process.cwd()): OfficialExample[] {
  const spec = loadOfficialSpecFile(root);
  const hints = buildRoleIdHintByOfficialName(spec);

  const examples: OfficialExample[] = [];
  for (const role of spec.roles) {
    for (let index = 0; index < role.examples.length; index++) {
      const text = String(role.examples[index] ?? "").trim();
      if (!text) continue;
      const hint = hints.get(role.nameCn);
      examples.push({
        id: officialExampleId(role.nameCn, index),
        roleNameCn: role.nameCn,
        ...(hint ? { roleIdHint: hint } : {}),
        index,
        text,
      });
    }
  }
  return examples;
}

/** 递归收集 `tests/conformance` 下的 `*.test.ts` 夹具文件 */
function collectFixtureFiles(root: string): string[] {
  const base = path.join(root, "tests", "conformance");
  if (!fs.existsSync(base)) return [];

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".test.ts")) files.push(full);
    }
  };
  walk(base);
  return files.sort();
}

/** 匹配 `// 官方范例: <角色名> #<序号>`（兼容全角冒号 / 多余空白） */
const ENCODED_EXAMPLE_PATTERN =
  /\/\/[ \t]*官方范例[ \t]*[:：][ \t]*(.+?)[ \t]*#[ \t]*(\d+)/gu;

/**
 * 扫描已编码的官方范例 id。
 *
 * 识别夹具注释：`// 官方范例: 小恶魔 #1`（角色名与 `#` 之间允许空白）。
 * 返回的 id 集合**可能包含伪造 id**（角色名/序号写错），由 `exampleCoverage`
 * 与台账测试负责对账。
 */
export function scanEncodedExamples(root = process.cwd()): Set<string> {
  const encoded = new Set<string>();
  for (const file of collectFixtureFiles(root)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(ENCODED_EXAMPLE_PATTERN)) {
      const roleNameCn = (match[1] ?? "").trim();
      const index = Number(match[2]);
      if (!roleNameCn || !Number.isInteger(index) || index < 0) continue;
      encoded.add(officialExampleId(roleNameCn, index));
    }
  }
  return encoded;
}

/**
 * 官方范例覆盖率总览。
 *
 * @param root 仓库根目录（默认 `process.cwd()`）
 */
export function exampleCoverage(
  root = process.cwd()
): ExampleCoverageResult {
  const spec = loadOfficialSpecFile(root);
  const encodedIds = scanEncodedExamples(root);

  const officialIds = new Set<string>();
  const byRole: Record<string, RoleExampleCoverage> = {};
  const missingByRole: Record<string, string[]> = {};
  const scriptTotals = new Map<string, { total: number; encoded: number }>();

  let total = 0;
  let encoded = 0;
  let rolesWithExamples = 0;
  let rolesWithEncoded = 0;

  const scriptTagsByRole = new Map<string, string[]>();
  for (const role of spec.roles) {
    scriptTagsByRole.set(role.nameCn, role.scriptTags ?? []);
  }

  for (const role of spec.roles) {
    const roleIds: string[] = [];
    for (let index = 0; index < role.examples.length; index++) {
      const text = String(role.examples[index] ?? "").trim();
      if (!text) continue;
      roleIds.push(officialExampleId(role.nameCn, index));
    }
    if (roleIds.length === 0) continue;
    rolesWithExamples++;
    total += roleIds.length;
    for (const id of roleIds) officialIds.add(id);

    const roleEncodedIds = roleIds.filter((id) => encodedIds.has(id));
    const roleMissingIds = roleIds.filter((id) => !encodedIds.has(id));
    encoded += roleEncodedIds.length;
    if (roleEncodedIds.length > 0) rolesWithEncoded++;

    byRole[role.nameCn] = {
      total: roleIds.length,
      encoded: roleEncodedIds.length,
      encodedIds: roleEncodedIds,
      missingIds: roleMissingIds,
    };
    if (roleMissingIds.length > 0) missingByRole[role.nameCn] = roleMissingIds;

    // 按剧本：多剧本角色归入官方标签列表的第一个（避免重复计数）
    const script = (scriptTagsByRole.get(role.nameCn) ?? [])[0] ?? "未标注";
    const bucket = scriptTotals.get(script) ?? { total: 0, encoded: 0 };
    bucket.total += roleIds.length;
    bucket.encoded += roleEncodedIds.length;
    scriptTotals.set(script, bucket);
  }

  const unknownEncodedIds = [...encodedIds]
    .filter((id) => !officialIds.has(id))
    .sort();

  const sortRecord = <T>(record: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of Object.keys(record).sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    )) {
      out[key] = record[key] as T;
    }
    return out;
  };

  const byScript = [...scriptTotals.entries()]
    .map(([script, value]) => ({ script, ...value }))
    .sort((a, b) => b.total - a.total || a.script.localeCompare(b.script, "zh-Hans-CN"));

  return {
    total,
    encoded,
    percent: total > 0 ? encoded / total : 0,
    rolesWithExamples,
    rolesWithEncoded,
    byRole: sortRecord(byRole),
    missingByRole: sortRecord(missingByRole),
    byScript,
    unknownEncodedIds,
  };
}
