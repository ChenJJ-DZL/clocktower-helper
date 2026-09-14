/**
 * 死亡标记统一护栏（2026-09-14）
 *
 * 背景：项目曾同时使用 `isDead: true` 与 `isAlive: false` 表示「已死亡」，
 * 引擎说 isAlive、旧层说 isDead，靠钩子互相翻译 → 任何漏同步都会产生「既死又活」。
 * 现已统一为 **`isDead` 单一标记**（`isAlive` 全仓移除，历史存档在加载期迁移）。
 *
 * 本文件是**护栏**：
 *   1. 静态扫描：src/ 与 app/ 下不得再出现 `isAlive`（允许导出名 `isAliveSeat`）；
 *   2. 迁移：旧存档里残留的 `isAlive` 必须在加载边界被翻译且清除。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLegacyDeathMarkers } from "../persistence";

/** 递归收集 src/ 与 app/ 下的 .ts/.tsx */
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

/** 去掉行尾注释后再判断，避免把"历史说明"误判成代码 */
function codePart(line: string): string {
  const idx = line.indexOf("//");
  if (idx < 0) return line;
  // 保护 https:// 这类协议前缀
  if (line[idx - 1] === ":") return line;
  return line.slice(0, idx);
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

/**
 * 允许出现 `isAlive` 的唯一位置（白名单，需写明理由）：
 *   · `src/utils/persistence.ts` —— **迁移边界**：必须读取旧存档里的 isAlive 字段
 *     并翻译成 isDead。这是"唯一允许认识旧字段"的地方。
 */
const ALLOWED_FILES = new Set<string>([
  "src/utils/persistence.ts",
  "src/utils/__tests__/deathMarkerUnification.test.ts",
  "src/utils/seatAlive.ts",
  "src/utils/__tests__/seatAlive.test.ts",
]);

describe("死亡标记统一护栏", () => {
  it("⭐⭐ src/ app/ tests/ e2e/ 下不得再出现 isAlive（isAliveSeat 函数名与迁移边界除外）", () => {
    const root = process.cwd();
    const violations: string[] = [];
    for (const file of collectFiles(
      ["src", "app", "tests", "e2e"].map((d) => path.join(root, d))
    )) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        const code = codePart(line);
        if (!/\bisAlive\b/.test(code)) return;
        // 允许保留的导出名（其实现已基于 isDead）
        const stripped = code.replace(/\bisAliveSeat\b/g, "");
        if (/\bisAlive\b/.test(stripped)) {
          violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(
      violations,
      `仍有代码使用 isAlive（应统一为 isDead）：\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("⭐⭐ 不得再自行实现「是否存活」（唯一权威 = utils/seatAlive::isSeatAlive）", () => {
    // 二次收口（2026-09-14）：曾另有 2 套实现
    //   · bmrMechanics::isAliveSeat       —— `!seat.isDead`
    //   · expansionMechanics::isSeatAlive —— `!seat.isDead`
    // 与权威 `isSeatDead`（`isDead === true`）语义等价但各自独立。
    //
    // ── 棘轮（ratchet）护栏 ─────────────────────────────────────────────
    // 「内联 `!x.isDead`」在仓库里仍非常普遍（~700 处，多为简单的存活过滤）。
    // 语义上它与 `isSeatAlive` 等价（`isDead` 只可能是 true/false/undefined），
    // 风险低于"两套不同实现"——因此采用**双轨**：
    //   (A) **硬禁令**：不得再 `export function isXxxAlive/isXxxDead` 另起实现（零容忍）
    //   (B) **棘轮**：内联 `!x.isDead` 数量只许下降（上限 = 当前实测值）
    // 目标：随重构逐步把 (B) 也降到 0。
    const INLINE_CEILING = 323; // ⚠️ 只许调小（2026-09-14 实测 = 323）
    const root = process.cwd();
    const selfImpl: string[] = [];
    const inlineNeg: string[] = [];
    for (const file of collectFiles(
      ["src", "app"].map((d) => path.join(root, d))
    )) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        const code = codePart(line);
        // (A) 自行定义 存活/死亡 判定函数 —— 硬禁令（白名单外的 isAliveSeat 也已转发）
        if (/(export\s+)?function\s+is[A-Za-z]*(Alive|Dead)\b/.test(code)) {
          selfImpl.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
          return;
        }
        // (B) 内联取反 `!xxx.isDead`
        if (/![\w.?![\]]*\.isDead\b/.test(code)) {
          inlineNeg.push(`${rel}:${i + 1}`);
        }
      });
    }
    // (A) 零容忍
    expect(
      selfImpl,
      `存活判定不得另起实现，请用 utils/seatAlive（isSeatAlive/isSeatDead）：\n` +
        selfImpl.join("\n")
    ).toEqual([]);
    // (B) 棘轮
    expect(
      inlineNeg.length,
      `内联 \`!x.isDead\` 不得高于棘轮上限 ${INLINE_CEILING}（当前 ${inlineNeg.length}）。\n` +
        `新增处请改用 utils/seatAlive 的 isSeatAlive/isSeatDead。`
    ).toBeLessThanOrEqual(INLINE_CEILING);
  });

  it("⭐ 引擎侧不再派生 isAlive：快照里不应出现该字段", () => {
    const snapshot = {
      seats: [
        { id: 0, isDead: false },
        { id: 1, isDead: true },
      ],
    } as any;
    const migrated = migrateLegacyDeathMarkers(snapshot);
    for (const s of (migrated as any).seats) {
      expect(Object.hasOwn(s, "isAlive"), `座位${s.id} 不应带 isAlive`).toBe(
        false
      );
    }
  });

  describe("旧存档迁移（isAlive → isDead）", () => {
    it("⭐ 仅带 isAlive:false 的座位（旧引擎路径）→ 迁移为 isDead:true 并清除字段", () => {
      const legacy = {
        seats: [
          { id: 0, isAlive: false }, // 旧引擎只写这一个字段
          { id: 1, isAlive: true },
        ],
      } as any;
      const out = migrateLegacyDeathMarkers(legacy) as any;
      expect(out.seats[0].isDead, "旧 isAlive:false 必须迁成 isDead:true").toBe(
        true
      );
      expect(out.seats[1].isDead).toBe(false);
      expect(Object.hasOwn(out.seats[0], "isAlive")).toBe(false);
      expect(Object.hasOwn(out.seats[1], "isAlive")).toBe(false);
    });

    it("⭐ isAlive:false 与 isDead:false 冲突时，以「已死亡」为准（保守）", () => {
      const out = migrateLegacyDeathMarkers({
        seats: [{ id: 0, isDead: false, isAlive: false }],
      } as any) as any;
      expect(out.seats[0].isDead).toBe(true);
    });

    it("无 isAlive 的新快照原样返回（不产生额外拷贝）", () => {
      const snapshot = { seats: [{ id: 0, isDead: true }] } as any;
      expect(migrateLegacyDeathMarkers(snapshot)).toBe(snapshot);
    });

    it("空值 / 无座位 安全返回", () => {
      expect(migrateLegacyDeathMarkers(null)).toBeNull();
      expect(migrateLegacyDeathMarkers({} as any)).toEqual({});
    });

    it("幂等：迁移两次结果一致", () => {
      const legacy = { seats: [{ id: 0, isAlive: false }] } as any;
      const once = migrateLegacyDeathMarkers(legacy) as any;
      const twice = migrateLegacyDeathMarkers(once) as any;
      expect(twice.seats).toEqual(once.seats);
    });
  });
});
