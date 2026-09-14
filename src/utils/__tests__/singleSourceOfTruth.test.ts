/**
 * 「单一事实来源」护栏 · 全局（2026-09-14）
 *
 * 本工程已 4 次踩中同一类病灶：**同一事实存在多个独立实现 → 必然分叉**。
 *   ① 死亡标记 `isAlive` / `isDead`                      → 已收敛（seatAlive / persistence）
 *   ② 天敌红罗刹 座位标记 / 能力内随机 Map                → 已收敛（fortune_teller.ability）
 *   ③ 永久醉酒 charadeRole 设置处 / drunk.ability 管道    → 已收敛（charadeSetup）
 *   ④ 阵营判定  gameRules / snv / bmr 三套                → 已收敛（seatAlignment）
 *   ⑤ 中毒判定  computeIsPoisoned / bmr 精简版            → 已收敛（seatDisabled）
 *
 * 本文件是静态护栏：禁止在其它文件里**重新实现**这些判定，
 * 以及在角色能力里内联「阵营 / 中毒」的裸判断。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  return out;
}

function codePart(line: string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return line;
  if (line[idx - 1] === ":") return line; // 保护 https://
  return line.slice(0, idx);
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

/** 唯一权威实现所在文件（白名单） */
const AUTHORITY_FILES = new Set([
  "src/utils/seatAlignment.ts",
  "src/utils/seatDisabled.ts",
  "src/utils/seatAlive.ts",
  "src/utils/gameRules.ts",
  "src/utils/persistence.ts",
  "src/utils/charadeSetup.ts",
  "src/utils/bmrMechanics.ts",
  "src/utils/snvMechanics.ts",
]);

function scanFor(pattern: RegExp, extraAllow: string[] = []) {
  const root = process.cwd();
  const allow = new Set([...AUTHORITY_FILES, ...extraAllow]);
  const violations: string[] = [];
  for (const file of collectFiles(
    ["src", "app", "tests", "e2e"].map((d) => path.join(root, d))
  )) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    if (allow.has(rel)) continue;
    if (rel.includes("__tests__")) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (pattern.test(codePart(line))) {
        violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
      }
    });
  }
  return violations;
}

describe("单一事实来源护栏", () => {
  it("⭐⭐ 不得再定义 `isGoodAlignment` / `isGoodSeat` / `isEvil`（阵营判定已收敛）", () => {
    const v = scanFor(
      /(export\s+(const|function)\s+(isGoodAlignment|isGoodSeat|isEvil)\b)/
    );
    expect(
      v,
      `阵营判定必须走 utils/seatAlignment（isSeatGood/isSeatEvil），不得另起实现：\n${v.join("\n")}`
    ).toEqual([]);
  });

  it("⭐⭐ 不得再定义 `isDrunkOrPoisoned` / `computeIsPoisoned`（中毒判定已收敛）", () => {
    const v = scanFor(
      /(export\s+(const|function)\s+(isDrunkOrPoisoned|computeIsPoisoned|isActorDisabledByPoisonOrDrunk)\b)/
    );
    expect(
      v,
      `中毒/失能判定必须走 utils/seatDisabled（isSeatDisabled/isSeatPoisoned），不得另起实现：\n${v.join("\n")}`
    ).toEqual([]);
  });

  it("⭐ 角色能力里不得内联 `alignment === \"evil\"` 裸判断（应走 isSeatEvil）", () => {
    // 例外：魔典条目 GrimoirePlayerEntry.alignment 是**派生缓存字段**
    // （由 buildGrimoireEntry 调用 isEvilAlignment → isSeatEvil 写入），
    // 读取它是读缓存而非重新实现 —— 见下一个用例的专项断言。
    const v = scanFor(
      /\.alignment\s*===\s*["']evil["']|\.alignment\s*===\s*["']good["']/,
      ["src/roles/new_engine/spy.ability.ts"]
    );
    expect(
      v,
      `阵营判断不得内联读 .alignment（历史字段，生产从不写入）；` +
        `请用 utils/seatAlignment 的 isSeatEvil/isSeatGood：\n${v.join("\n")}`
    ).toEqual([]);
  });

  it("⭐ 角色能力里不得内联构建 alignment 三元判断（应走 isSeatGood/isSeatEvil）", () => {
    // 覆盖**跨行**写法（lycanthrope 曾写成：
    //   const alignment = target?.alignment ?? (roleType === "townsfolk" || ... ? "good" : "evil")
    //   targetGood = alignment === "good"
    // 单行正则会漏掉它 → 这里用整文件扫描 + 多行正则。
    //
    // 豁免（不是阵营判定）：
    //   · 注释行
    //   · 胜负枚举的大小写归一：`snapshot.winner === "Good" ? "good" : "evil"`
    //     （"Good"/"Evil" 是**胜者**枚举，与阵营判定无关）
    //   · 行内含 `sst-exempt-alignment-label` 标记：表示该三元只是把**权威结果**
    //     转成 "good"/"evil" 标签，本身不含判定逻辑（须人工确认并写明理由）
    const root = process.cwd();
    const violations: string[] = [];
    for (const file of collectFiles([path.join(root, "src")])) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (AUTHORITY_FILES.has(rel) || rel.includes("__tests__")) continue;
      const src = fs.readFileSync(file, "utf8");
      const re = /\?\s*["']good["']\s*:\s*["']evil["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        const lineEnd = src.indexOf("\n", m.index);
        const wholeLine = src.slice(lineStart, lineEnd < 0 ? src.length : lineEnd);
        const code = codePart(wholeLine);
        const trimmed = code.trim();
        if (isCommentLine(wholeLine) || trimmed === "") continue;
        // 豁免：胜负枚举归一（winner === "Good"）
        if (/winner\s*===\s*["']Good["']/.test(code)) continue;
        // 豁免：显式标记「只是把权威结果转标签」
        if (wholeLine.includes("sst-exempt-alignment-label")) continue;
        const line = src.slice(0, m.index).split(/\r?\n/).length;
        violations.push(`${rel}:${line}: ${wholeLine.trim().slice(0, 100)}`);
      }
    }
    expect(
      violations,
      `阵营判定不得内联三元构建（漏 traveler/转换标记）；请用 utils/seatAlignment：\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("⭐ 间谍魔典的 alignment 字段必须由 isSeatEvil 派生（读缓存 ≠ 重新实现）", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/roles/new_engine/spy.ability.ts"),
      "utf8"
    );
    // 魔典条目构建处必须调用 isEvilAlignment
    expect(
      /buildGrimoireEntry[\s\S]*?alignment:\s*isEvilAlignment\(/.test(src),
      "buildGrimoireEntry 必须用 isEvilAlignment 派生 alignment 字段"
    ).toBe(true);
    // 而 isEvilAlignment 必须委托给 isSeatEvil（不得自行实现）
    expect(
      /function isEvilAlignment[\s\S]{0,400}?return isSeatEvil\(/.test(src),
      "isEvilAlignment 必须委托给 utils/seatAlignment 的 isSeatEvil，不得自行实现"
    ).toBe(true);
  });

  it("⭐ 角色能力里不得内联 `role.type === \"demon\" || role.type === \"minion\"` 裸判断", () => {
    const v = scanFor(
      /role\??\.type\s*===\s*["']demon["']\s*\|\|\s*\w+\??\.?(role\??\.)?type\s*===\s*["']minion["']/
    );
    expect(
      v,
      `请用 utils/seatAlignment 的 isSeatEvil / isSeatMinionOrDemon 表达阵营判断：\n${v.join("\n")}`
    ).toEqual([]);
  });

  it("⭐⭐ 不得内联「镇民/外来者」二元组（应走 isSeatTownsfolkOrOutsider / isTownsfolkOrOutsiderRole）", () => {
    // 收敛前全仓 56 处内联 `type === "townsfolk" || type === "outsider"`，
    // 只认 role.type → 漏掉扁平 roleType 与 effectiveRole.type。
    // 覆盖**单行与跨行**两种写法（用整文件 + 多行正则，避免单行漏检）。
    const root = process.cwd();
    const violations: string[] = [];
    for (const file of collectFiles([path.join(root, "src")])) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (AUTHORITY_FILES.has(rel) || rel.includes("__tests__")) continue;
      const src = fs.readFileSync(file, "utf8");
      // 跨行也命中：\s* 包含换行
      const re =
        /["']townsfolk["']\s*\|\|\s*[\w$.?]*\.?type\s*===\s*["']outsider["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        const lineEnd = src.indexOf("\n", m.index);
        const wholeLine = src.slice(lineStart, lineEnd < 0 ? src.length : lineEnd);
        if (isCommentLine(wholeLine) || codePart(wholeLine).trim() === "") continue;
        const line = src.slice(0, m.index).split(/\r?\n/).length;
        violations.push(`${rel}:${line}: ${wholeLine.trim().slice(0, 100)}`);
      }
    }
    expect(
      violations,
      `「镇民/外来者」判定必须走 utils/seatAlignment：\n` +
        `  · 座位 → isSeatTownsfolkOrOutsider(seat)\n` +
        `  · 角色定义 → isTownsfolkOrOutsiderRole(role)\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("⭐ 不得内联 `role.type === \"townsfolk\"|\"outsider\"|\"traveler\"|\"minion\"|\"demon\"` 单类型判断", () => {
    // ── 棘轮（ratchet）护栏 ─────────────────────────────────────────────
    // 收口「镇民/外来者二元组」后，全仓仍有 ~200 处**单类型**内联判定
    // （`role.type === "demon"` 之类）待逐步收口到 seatAlignment。
    // 一次性全改风险过高 → 采用**棘轮**：
    //   · 上限只允许**下降**，禁止上升（新增任意一处内联会立刻变红）
    //   · 每收口一批，把 CEILING 调小（并在提交信息里记录）
    //   · 目标：CEILING → 0，此时本用例等价于硬禁令
    //   · 修完 `CEILING` 记得同步更新上面的「当前 = N」注释
    //
    // 为什么要管：这些内联只认 `role.type`，会**漏掉扁平 `roleType` 与
    // `effectiveRole.type`**（醉鬼/提线木偶的伪装角色、被 farmer/imp/kazali
    // 改写的座位）→ 同一座位在不同代码路径下"角色类型不一致"。
    //
    // 📌 当前 = 203（2026-09-14 实测，本护栏自身扫描口径）。主要集中地（燃烧清单）：
    //   GameSetup 13 · SpyGrimoireModal 13 · StorytellerTuningContext 11 ·
    //   app/gameLogic 11 · useNightActionHandler 9 · useSetupManager 9 ·
    //   NightActionPage 8 · nightLogic 6 · GameConsole 5 · infoMessageBuilder 5
    const CEILING = 203; // ⚠️ 只许调小
    const v = scanFor(
      /(roleType|\.role\??\.type)\s*===\s*["'](townsfolk|outsider|traveler|minion|demon)["']/
    );
    expect(
      v.length,
      `角色类型内联判定数量不得高于棘轮上限 ${CEILING}（当前 ${v.length}）。\n` +
        `新增判定请改用 utils/seatAlignment 的 isSeatTownsfolk/isSeatOutsider/` +
        `isSeatTraveler/isSeatMinion/isSeatDemon；收口后请下调 CEILING。\n` +
        `样例：\n${v.slice(0, 12).join("\n")}`
    ).toBeLessThanOrEqual(CEILING);
  });
});
