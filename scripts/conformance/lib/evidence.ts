/**
 * 测试证据扫描：给每个角色统计「测试入口」与「E2E 实跑证据」
 * ----------------------------------------------------------------------
 * ⚠️ 本层是**证据台账**，不是语义证明：`引用数 > 0` 只能说明「有测试入口」，
 * 不代表规则被验证（语义层见 docs/RULE_CONFORMANCE_SYSTEM.md）。
 * 但它能把「哪些角色连一个测试入口都没有」变成可棘轮的数字。
 *
 * 扫描范围（只读）：
 *   · `src` 下所有 __tests__ 目录与 *.test.ts(x)
 *   · `tests` 目录（wiki 场景 / UI 交互）
 *   · `e2e` 目录（Playwright 场景）
 * 证据来源：角色 id（英文 snake_case）或中文名出现在测试源码中，即计 1 个文件。
 */
import fs from "node:fs";
import path from "node:path";

export interface RoleRefTarget {
  roleId: string;
  nameCn: string;
}

export interface TestEvidence {
  /** roleId → 引用该角色的测试文件数 */
  references: Map<string, number>;
  /** roleId → E2E 台账里的 seen 最大值（来自 outputs/coverage_ledger.json） */
  e2eSeen: Map<string, number>;
  scannedFiles: number;
}

const SCAN_DIRS = ["src", "tests", "e2e"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "temp",
  "test_automation",
  "outputs",
  "json",
  "screenshots",
  "playwright-report",
  "test-results",
  "public",
  "coverage",
]);

function isTestFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return (
    normalized.includes("/__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("e2e/")
  );
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const dir of SCAN_DIRS) {
    const full = path.join(root, dir);
    if (fs.existsSync(full)) walk(full);
  }
  return out;
}

/** 读取既有 E2E 覆盖台账（角色 → 出现过的场次数） */
function loadE2eSeen(root: string): Map<string, number> {
  const result = new Map<string, number>();
  const file = path.join(root, "outputs", "coverage_ledger.json");
  if (!fs.existsSync(file)) return result;
  try {
    const ledger = JSON.parse(fs.readFileSync(file, "utf8")) as {
      scripts?: Record<
        string,
        { roles?: Array<{ id?: string; seen?: number }> }
      >;
    };
    for (const script of Object.values(ledger.scripts ?? {})) {
      for (const role of script.roles ?? []) {
        if (!role.id) continue;
        const seen = typeof role.seen === "number" ? role.seen : 0;
        result.set(role.id, Math.max(result.get(role.id) ?? 0, seen));
      }
    }
  } catch {
    // 台账损坏时静默降级为空（审计报告会显示 e2eSeen=null 的缺口）
  }
  return result;
}

/**
 * 扫描测试证据。
 *
 * @param targets 需要统计的角色（roleId + 中文名）
 * @param root    仓库根目录
 */
export function collectTestEvidence(
  targets: RoleRefTarget[],
  root = process.cwd()
): TestEvidence {
  const files = walkFiles(root).filter((file) =>
    isTestFile(path.relative(root, file))
  );
  const references = new Map<string, number>();
  for (const target of targets) references.set(target.roleId, 0);

  let scannedFiles = 0;
  for (const file of files) {
    if (!isTestFile(path.relative(root, file))) continue;
    let content: string;
    try {
      const stat = fs.statSync(file);
      // 超大文件（生成物/快照）跳过：它们不构成规则证据
      if (stat.size > 400_000) continue;
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scannedFiles++;
    for (const target of targets) {
      if (content.includes(target.roleId) || content.includes(target.nameCn)) {
        references.set(target.roleId, (references.get(target.roleId) ?? 0) + 1);
      }
    }
  }

  return { references, e2eSeen: loadE2eSeen(root), scannedFiles };
}
