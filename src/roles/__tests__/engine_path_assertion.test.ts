/**
 * 「引擎路径断言」护栏 · 日间能力（2026-09-20）
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────
 * 用户反复反馈：「代码跑通了，但人工实测完全不同」。
 * 根因之一：**日间能力存在多条互不相通的执行通路**，
 *   L1~L4 测试全停在「文案层」（断言弹窗里有字、日志里有角色名），
 *   **没有任何一条测试断言「技能逻辑真的执行了」**。
 *
 * 已查实的三条通路（`src/hooks/useDayActions.ts::handleDayAbility`）：
 *   ① 硬编码弹窗旁路  :1028  `["amnesiac","fisherman","engineer","gossip"]`
 *        → setCurrentModal({type:"DAY_ABILITY"}) → `DayAbilityModal` 里再按 roleId 硬编码
 *        → 逻辑写在组件里，**完全不经过引擎**。
 *   ② modular handler :1048  `RoleDefinition.day.handler(dayContext)`
 *        → ✅ 唯一「技能逻辑可被断言」的通路。
 *   ③ dayMeta 回退    :1146  读 `effectiveRole.dayMeta.effectType`
 *        → gossip/artist/savant 等；`transform_ability`（哲学家）在此**改身份**（见判据 C）。
 *
 * 致命缺口：`day: { name, maxUses, target }` **无 handler** 的角色
 *   → `result === undefined` → 落进 :1123「通用回退：标记已使用 + 说书人提示」
 *   → **技能永不生效，只留一条日志**（静默空转，最危险的一种假绿）。
 *
 * ── 本测试的判据（棘轮，只许下调）────────────────────────────────────
 *   判据 A：`day` 块必须有 `handler`，否则必然空转（除非命中别处旁路）。
 *   判据 B：`DAY_ABILITY` 白名单里的角色，逻辑在组件里 → 属旁路。
 *   判据 C：`transform_ability` 走 `changeRole` → 违反官方「获得能力而非变身」。
 *
 * ⚠️ 反例验证要求：改动生产代码后，本文件必须相应变红。
 *    若你「把 handler 删掉测试还是绿的」，说明判据失效，必须重写。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** 收集所有 RoleDefinition 文件（src/roles/{townsfolk,outsider,minion,demon}/*.ts） */
function collectRoleDefFiles(): string[] {
  const out: string[] = [];
  for (const bucket of ["townsfolk", "outsider", "minion", "demon"]) {
    const dir = path.join(ROOT, "src", "roles", bucket);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && /\.ts$/.test(entry.name)) {
        out.push(`src/roles/${bucket}/${entry.name}`);
      }
    }
  }
  return out;
}

/**
 * 抽取源码里 `day: { ... }` 块的文本（按大括号配平，跨行）。
 * 返回 null 表示该文件没有 day 块。
 */
function extractDayBlock(src: string): string | null {
  const start = src.search(/^\s{2}day:\s*\{/m);
  if (start < 0) return null;
  const braceStart = src.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return src.slice(braceStart);
}

/** 从文件里取 roleId（第一处 `id: "xxx"`） */
function extractRoleId(src: string): string | null {
  const m = src.match(/^\s{2}id:\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

const ROLE_FILE_LIST = collectRoleDefFiles();

type DayRoleInfo = {
  rel: string;
  roleId: string;
  hasDayBlock: boolean;
  hasHandler: boolean;
};

const DAY_ROLES: DayRoleInfo[] = ROLE_FILE_LIST.map((rel) => {
  const src = read(rel);
  const day = extractDayBlock(src);
  return {
    rel,
    roleId: extractRoleId(src) ?? path.basename(rel, ".ts"),
    hasDayBlock: day !== null,
    hasHandler: day !== null && /\bhandler\s*:/.test(day),
  };
}).filter((r) => r.hasDayBlock);

// ─────────────────────────────────────────────────────────────────────
// 基线（棘轮）：以下角色当前**已知**走旁路 / 空转。
// ⚠️ 只许下调（修好一个删一个），不许上调。
// ⚠️ 新增角色若命中判据，测试会立刻报红 —— 这正是它的价值。
// ─────────────────────────────────────────────────────────────────────

/** 判据 A 基线：有 day 块但无 handler（静默空转）。 */
const NO_HANDLER_BASELINE = new Set<string>([
  // 元数据壳：name/maxUses/target 齐全，但没有 handler → 落进通用回退
  "src/roles/townsfolk/gossip.ts",
  "src/roles/townsfolk/savant.ts",
  "src/roles/townsfolk/juggler.ts",
  "src/roles/townsfolk/artist.ts",
  "src/roles/townsfolk/fisherman.ts",
  // ✅ 2026-09-22 按官方移除 `philosopher.ts`：官方「在夜晚时」⇒ 已删 `day:` 块、
  //   触发时机改 `EVERY_NIGHT`（选角色改在**夜间**行动确认窗完成）⇒ 不再是日间角色，
  //   按棘轮（只许下调）必须从本基线移除。
  "src/roles/outsider/tinker.ts",
  "src/roles/minion/cerenovus.ts",
  "src/roles/outsider/mutant.ts",
  // ✅ 2026-09-22 已按官方移除 `src/roles/townsfolk/gambler.ts`：
  //   官方【赌徒】是「每个夜晚*」的**纯夜间**能力，原先那个
  //   `day: { name: "赌徒猜测", maxUses: 1 }` 块已删除 ⇒ 它不再是日间角色
  //   ⇒ 按棘轮（只许下调）**必须**从本基线移除。
  "src/roles/townsfolk/minstrel.ts",
]);

/** 判据 B 基线：`DAY_ABILITY` 白名单（逻辑在 DayAbilityModal 硬编码）。 */
const DAY_ABILITY_BYPASS_BASELINE = new Set<string>([
  "amnesiac",
  "fisherman",
  "engineer",
  "gossip",
]);

describe("引擎路径断言 · 日间能力（P0）", () => {
  it("① 每个角色最多只能有一条日间执行通路（handler / 弹窗白名单 / dayMeta）", () => {
    const dayActionSrc = read("src/hooks/useDayActions.ts");

    // 解析 DAY_ABILITY 白名单
    const wl = dayActionSrc.match(
      /\[([^\]]*)\]\.includes\(\s*effectiveRole\.id\s*\)/
    );
    expect(wl, "未能解析 DAY_ABILITY 白名单（源码结构变了？）").toBeTruthy();
    const whitelist = new Set(
      (wl![1].match(/"([^"]+)"/g) ?? []).map((s) => s.replace(/"/g, ""))
    );

    // 解析 roleId → 是否含 handler
    const handlerRoles = new Set(
      DAY_ROLES.filter((r) => r.hasHandler).map((r) => r.roleId)
    );

    const conflicts: string[] = [];
    for (const roleId of whitelist) {
      if (handlerRoles.has(roleId)) {
        conflicts.push(
          `${roleId}：既在 DAY_ABILITY 白名单，又有 day.handler → 通路冲突`
        );
      }
    }

    expect(
      conflicts,
      `发现通路冲突（同一角色两条日间执行通路，必然分叉）：\n${conflicts.join("\n")}`
    ).toEqual([]);
  });

  it("② 有 day 块的角色必须标记为「已实现 handler」或显式列入空转基线（棘轮，只许下调）", () => {
    const offenders = DAY_ROLES.filter(
      (r) =>
        !r.hasHandler && // 无 handler
        !NO_HANDLER_BASELINE.has(r.rel) // 且不在已知基线里
    ).map((r) => `${r.rel}（roleId=${r.roleId}）`);

    expect(
      offenders,
      `以下角色有 day 块但无 handler，技能会静默空转（只标记已使用 + 记日志）：\n` +
        offenders.join("\n") +
        `\n\n→ 修法二选一：1) 补 day.handler(dayContext)；2) 迁到新引擎。` +
        `\n→ 若确属「暂不实现」，请显式加入 NO_HANDLER_BASELINE（并写明原因）。`
    ).toEqual([]);
  });

  it("③ 空转基线只许收缩：修好一个就必须从基线删除", () => {
    const dayByRel = new Map(DAY_ROLES.map((r) => [r.rel, r]));
    const stale: string[] = [];

    for (const rel of NO_HANDLER_BASELINE) {
      const info = dayByRel.get(rel);
      if (!info) {
        stale.push(`${rel}：已不是日间角色（文件改名/删除？）→ 从基线移除`);
        continue;
      }
      if (info.hasHandler) {
        stale.push(`${rel}：已补上 handler ✅ → 从基线移除（棘轮下调）`);
      }
    }

    expect(
      stale,
      `基线里有过期条目，必须清理（棘轮只许下调）：\n${stale.join("\n")}`
    ).toEqual([]);
  });

  it("④ 判据 C：transform_ability 不得静默改身份（哲学家）", () => {
    const src = read("src/hooks/useDayActions.ts");
    const idx = src.indexOf('meta.effectType === "transform_ability"');
    expect(idx, "未找到 transform_ability 分支").toBeGreaterThan(-1);

    // 取该分支起 600 字符窗口
    const window = src.slice(idx, idx + 900);
    const offenders: string[] = [];

    if (/changeRole\s*\(/.test(window)) {
      offenders.push(
        "transform_ability 分支调用了 changeRole() → 直接改写 seat.role（变身），" +
          "违反官方「哲学家获得能力、身份不变」语义"
      );
    }

    expect(
      offenders,
      `${offenders.join("\n")}\n` +
        `→ 应改为：写入 philosopherGainedRole / 能力注册，而非改写 role。`
    ).toEqual([]);
  });

  it("⑤ 反例验证：判据确实能变红（自检不为空跑）", () => {
    // 构造一个「有 day 块但无 handler 且不在基线」的假样本，
    // 确认判据逻辑本身会把它判定为违规（防止测试是空跑）。
    const fake: DayRoleInfo = {
      rel: "src/roles/townsfolk/__FAKE__.ts",
      roleId: "__fake__",
      hasDayBlock: true,
      hasHandler: false,
    };
    const isOffender =
      fake.hasDayBlock && !fake.hasHandler && !NO_HANDLER_BASELINE.has(fake.rel);
    expect(
      isOffender,
      "判据失效：假样本未被识别为违规，测试是空跑（假绿）"
    ).toBe(true);
  });
});
