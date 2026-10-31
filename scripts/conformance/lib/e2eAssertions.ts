/**
 * L6 · E2E「断言型覆盖」台账（把"有入口"升级成"有断言"）
 * ======================================================================
 * 问题：`outputs/coverage_ledger.json` 的 `seen` 是 **reach 口径** ——
 *   角色在某场整局模拟里"被发到过"，就算覆盖。但"被发到过" ≠ "行为被验证过"：
 *   一个角色可能整局只出现在座位表里，一条断言都没针对它。
 *
 * 本模块给出**第二个口径**（不替代 reach，而是并列展示）：
 *   对 `e2e/**\/*.ts` 逐文件切出 `test(...)` 代码块，
 *   统计「块内既有 `expect(`、又提到该角色（roleId 或中文名）」的块数。
 *   ⇒ `assertedBlocks > 0` 才算"这个角色在 E2E 里被断言过"。
 *
 * 为什么用启发式而不是 AST：
 *   · 不需要引入解析器依赖（仓库零新依赖是硬约束）；
 *   · 口径保守：只要块里出现角色名 + 有断言就算，**不夸大**；
 *   · 台账只用于**计量与棘轮**，不参与任何判胜/规则判定（判错了也只是指标偏保守）。
 *
 * 产物：`outputs/rule_conformance/e2e_assertions.json`
 */
import fs from "node:fs";
import path from "node:path";

export interface RoleE2eAssertion {
  roleId: string;
  nameCn: string;
  /** 提到该角色的 test 块数（无论有无断言） */
  mentionedBlocks: number;
  /** 既提到该角色、块内又有 `expect(` 的 test 块数（断言型覆盖） */
  assertedBlocks: number;
  /** 这些块里的 `expect(` 总数 */
  assertionCount: number;
  /** 样例：断言块所在文件（便于人审抽查） */
  sampleFiles: string[];
}

export interface E2eAssertionLedger {
  generatedAt: string;
  source: string;
  totals: {
    files: number;
    testBlocks: number;
    assertions: number;
  };
  rolesWithAssertions: number;
  rolesMentionedOnly: string[];
  roles: Record<string, RoleE2eAssertion>;
}

interface ParsedFile {
  file: string;
  blocks: Array<{ title: string; text: string; assertions: number }>;
}

/** 递归收集 e2e 下的 .ts（跳过 helpers 与非 spec 的支撑文件也可，保留也无害） */
function collectE2eFiles(root: string): string[] {
  const base = path.join(root, "e2e");
  if (!fs.existsSync(base)) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(base);
  return files.sort();
}

const TEST_START =
  /^\s*test(?:\.(?:only|skip|fixme|fail|slow))?\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/;

/**
 * 把一份 spec 切成 test 块：从 `test("...")` 那一行开始累计花括号，
 * 回到 0 时结束（简单但对该仓库的写法足够稳：test 块内不会有失衡的裸花括号）。
 */
function parseSpecFile(file: string, source: string): ParsedFile {
  const lines = source.split(/\r?\n/);
  const blocks: ParsedFile["blocks"] = [];
  let current: { title: string; lines: string[]; depth: number } | null = null;

  for (const line of lines) {
    if (!current) {
      const match = TEST_START.exec(line);
      if (!match) continue;
      const title = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      current = { title, lines: [line], depth: 0 };
      current.depth += countBraces(line);
      // 单行 test（`test("x", async () => { ... })` 完整写在一行）
      if (current.depth <= 0) {
        blocks.push(finishBlock(current));
        current = null;
      }
      continue;
    }
    current.lines.push(line);
    current.depth += countBraces(line);
    if (current.depth <= 0) {
      blocks.push(finishBlock(current));
      current = null;
    }
  }
  // 文件末尾仍未闭合（语法异常）⇒ 也收进来，宁可多算不可漏
  if (current) blocks.push(finishBlock(current));

  return { file, blocks };

  function finishBlock(block: { title: string; lines: string[] }) {
    const text = block.lines.join("\n");
    const assertions = (text.match(/\bexpect\s*\(/g) ?? []).length;
    return { title: block.title, text, assertions };
  }
}

function countBraces(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta++;
    else if (char === "}") delta--;
  }
  return delta;
}

/**
 * 统计每个角色的「断言型」E2E 覆盖。
 *
 * @param roles 项目角色清单（roleId + 中文名），与审计侧同一份
 * @param root  仓库根目录
 */
export function collectE2eAssertions(
  roles: Array<{ roleId: string; nameCn: string }>,
  root = process.cwd()
): E2eAssertionLedger {
  const files = collectE2eFiles(root).map((file) =>
    parseSpecFile(file, fs.readFileSync(file, "utf8"))
  );

  const totals = {
    files: files.length,
    testBlocks: files.reduce((n, file) => n + file.blocks.length, 0),
    assertions: files.reduce(
      (n, file) => n + file.blocks.reduce((m, block) => m + block.assertions, 0),
      0
    ),
  };

  const result: Record<string, RoleE2eAssertion> = {};
  for (const role of roles) {
    // 角色识别：roleId（snake_case 整词）或中文名。
    // roleId 用词边界匹配，避免 `imp` 命中 `implementation` 这类误判。
    const idPattern = new RegExp(
      `(^|[^a-z0-9_])${escapeRegExp(role.roleId)}([^a-z0-9_]|$)`,
      "i"
    );
    let mentionedBlocks = 0;
    let assertedBlocks = 0;
    let assertionCount = 0;
    const sampleFiles: string[] = [];

    for (const file of files) {
      for (const block of file.blocks) {
        const mentioned =
          idPattern.test(block.text) || block.text.includes(role.nameCn);
        if (!mentioned) continue;
        mentionedBlocks++;
        if (block.assertions > 0) {
          assertedBlocks++;
          assertionCount += block.assertions;
          if (sampleFiles.length < 3) sampleFiles.push(relative(root, file.file));
        }
      }
    }

    result[role.roleId] = {
      roleId: role.roleId,
      nameCn: role.nameCn,
      mentionedBlocks,
      assertedBlocks,
      assertionCount,
      sampleFiles,
    };
  }

  const rolesWithAssertions = Object.values(result).filter(
    (row) => row.assertedBlocks > 0
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    source: "e2e/**/*.ts · test 块 × expect() × 角色名/roleId 提及",
    totals,
    rolesWithAssertions,
    rolesMentionedOnly: Object.values(result)
      .filter((row) => row.mentionedBlocks > 0 && row.assertedBlocks === 0)
      .map((row) => row.roleId)
      .sort(),
    roles: result,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
