import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🌅 黎明播报「单一写入点」棘轮
 * ----------------------------------------------------------------------------
 * 官方沙巴洛斯 / 哈迪寂亚都要求黎明播报两段：
 *   「先宣布哪些玩家死亡，再宣布哪些玩家复活（不要说明原因）」。
 *
 * 2026-10-22 修复前，这句话在 **6 处**各拼了一遍，且**全都没有复活段**：
 *   1. `useNightSnapshot::continueToNextAction`（首夜全无效分支）
 *   2. `useNightSnapshot::continueToNextAction`（夜晚正常结束）
 *   3. `useConfirmHandlers::confirmHadesia`
 *   4. `useGameController`（造谣应验分支）
 *   5. `useGameController`（夜晚结束分支）
 *   6. `GameModals`（兜底）
 * ⇒ 只要有一处忘了改，玩家就会在不同剧本里看到不同口径。本项目「双写入点必分叉」
 *    已命中 9 次，这条棘轮负责不让它变成第 10 次。
 *
 * 规则：除 `utils/dawnAnnouncement.ts`（唯一格式化入口）与测试文件外，
 * 全仓不得再出现 `昨晚${…}` 形式的手工拼装。
 */

const REPO = process.cwd();
const ROOTS = ["src", "app"];
const ALLOW_FILES = new Set([
  path.join("src", "utils", "dawnAnnouncement.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("DawnAnnouncement · 黎明播报只能有一个格式化入口", () => {
  const files = ROOTS.flatMap((r) => walk(path.join(REPO, r)));

  it("除 utils/dawnAnnouncement.ts 外，不得手工拼 `昨晚${…}` 文案", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO, file);
      if (ALLOW_FILES.has(rel)) continue;
      if (rel.includes("__tests__")) continue;
      const src = fs.readFileSync(file, "utf8");
      if (src.includes("昨晚${")) offenders.push(rel);
    }
    expect(
      offenders,
      "黎明播报必须走 utils/dawnAnnouncement::buildDawnAnnouncement" +
        "（官方要求「死亡 + 复活」两段，散落拼装必然分叉）"
    ).toEqual([]);
  });

  it("至少 4 个消费方导入统一格式化入口（防有人把它绕过去）", () => {
    const importers: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO, file);
      if (rel.includes("__tests__")) continue;
      if (ALLOW_FILES.has(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      if (/utils\/dawnAnnouncement/.test(src)) importers.push(rel);
    }
    expect(
      importers.length,
      `实际导入方：${importers.join(", ") || "（无）"}`
    ).toBeGreaterThanOrEqual(4);
  });
});
