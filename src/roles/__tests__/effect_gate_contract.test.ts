/**
 * 「醉酒/中毒失效」门控契约护栏（2026-09-21 建，覆盖**全仓**效果类角色）
 * ============================================================
 * 官方核心规则：**醉酒或中毒的玩家失去其能力**（说书人只装作他仍有能力、走过场执行）。
 * ⇒ 凡 `effectSemantics !== "info"` 的能力（kill / poison / drunk / protect / revive / swap），
 *   **必须**有有效性判定，否则「醉酒的恶魔照样杀人」。
 *
 * 🔒 合规判据（二者之一）：
 *   ① **本地判定**：`stateUpdate` 或 `calculate` 体内含 `isDrunkOrPoisoned` / `isSeatDisabled`
 *   ② **读 `abilityEffective`**：体内含 `abilityEffective`
 *      ⚠️ **不要**再判「`preCheck` 是否含 `commonPreCheckAlive`」——
 *        `abilityPriorityCalculation`（`middlewarePipeline.ts:65`，注入每个能力 calculate 最前）
 *        会**无条件**写 `meta.abilityEffective`；只要角色**读它**，门控就有效。
 *        （🔴 本判据初版漏了这点，把 13 个角色误报为「假门控」——**与批次 38 的同一错误**。）
 *
 * ⚠️ 实现**刻意不用正则**（本仓库位于中文目录，Windows 下反斜杠易被转义破坏）——
 *   剥注释用字符串方法实现。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DIR = "src/roles/new_engine";

/**
 * 豁免表：无门控但已确认可接受，或**待核验**。
 * 🔒 一旦某角色修好门控，**必须**从此表删除（否则护栏形同虚设）。
 */
const EFFECT_GATE_EXEMPT: Record<string, string> = {
  // ✅ 2026-09-21 已核实并移出：`assassin` / `professor`
  //   —— 二者用**命名函数引用**（`stateUpdate: [updateAssassinationStatus]`），
  //      初版扫描器只扫 `const stateUpdate = …` 之后 ⇒ **完全扫不到函数体** ⇒ 误报「零门控」。
  //      实际两者都有 `const isAbilityEffective = meta.abilityEffective ?? true;`（真门控）。

  half_ogre: "⏳ 待核验（国风角色，不在内置剧本）",
  qiongqi: "⏳ 待核验（国风角色）",
  taotie: "⏳ 待核验（国风角色）",
  taowu: "⏳ 待核验（国风角色）",
  zhen: "⏳ 待核验（国风角色）",
};

/** 剥块注释与行注释（纯字符串方法，无反斜杠） */
function strip(src: string): string {
  let out = src;
  for (;;) {
    const a = out.indexOf("/*");
    if (a < 0) break;
    const b = out.indexOf("*/", a + 2);
    if (b < 0) break;
    out = out.slice(0, a) + " " + out.slice(b + 2);
  }
  return out
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join("\n");
}

interface Scan {
  roleId: string;
  semantics: string;
  local: boolean;
  readsEffective: boolean;
}

/** 抽取 `effectSemantics: "<x>"` 的取值（字符串方法） */
function readSemantics(src: string): string {
  const i = src.indexOf("effectSemantics:");
  if (i < 0) return "";
  const parts = src.slice(i, i + 60).split('"');
  return parts.length >= 2 ? parts[1].trim() : "";
}

function scanAll(): Scan[] {
  const out: Scan[] = [];
  for (const fn of readdirSync(DIR)) {
    if (!fn.endsWith(".ability.ts")) continue;
    const rid = fn.replace(".ability.ts", "");
    const src = strip(readFileSync(join(DIR, fn), "utf8"));
    const sem = readSemantics(src);
    if (!sem || sem === "info") continue;
    /**
     * ⚠️⚠️ 2026-09-21 修正【扫描范围盲点】：**不要**只扫 `const stateUpdate = …` 之后的一段。
     *   很多能力用的是**命名函数引用**，例如：
     *     `stateUpdate: [updateAssassinationStatus]`（`assassin` / `professor`）
     *   ⇒ 函数体定义在**别处**，只扫 `const stateUpdate` 会**完全扫不到** ⇒ 误报为「零门控」。
     *   （本轮实测：`assassin` / `professor` 就是这样被误报的，实际两者都有
     *     `const isAbilityEffective = meta.abilityEffective ?? true;`。）
     *   ⇒ 改为扫**整个文件**（注释已在 `strip()` 中剥离，不会把说明文字当成实现）。
     */
    const body = src;
    out.push({
      roleId: rid,
      semantics: sem,
      local: body.includes("isDrunkOrPoisoned") || body.includes("isSeatDisabled"),
      readsEffective: body.includes("abilityEffective"),
    });
  }
  return out;
}

describe("契约 · 效果类角色（effectSemantics 非 info）必须有醉酒/中毒门控", () => {
  it("① 全仓效果类角色必须门控（本地判定 或 读 abilityEffective），豁免需登记", () => {
    const all = scanAll();
    expect(all.length, "❌ 未扫到效果类角色 —— 扫描逻辑或路径有问题").toBeGreaterThan(10);
    const missing = all
      .filter((s) => !s.local && !s.readsEffective)
      .filter((s) => !EFFECT_GATE_EXEMPT[s.roleId])
      .map((s) => s.roleId + "(" + s.semantics + ")");
    expect(
      missing,
      "❌ 以下效果类角色无任何醉酒/中毒门控（醉酒的它们照样生效）—— 修复或登记豁免："
    ).toEqual([]);
  });

  it("② 豁免表不得腐烂：已合规或已消失的角色必须从表中删除", () => {
    const all = scanAll();
    const stale = Object.keys(EFFECT_GATE_EXEMPT).filter((rid) => {
      const s = all.find((x) => x.roleId === rid);
      return !s || s.local || s.readsEffective;
    });
    expect(
      stale,
      "ℹ️ 以下豁免条目已不再需要（角色已合规或已不存在）⇒ 请从 EFFECT_GATE_EXEMPT 删除："
    ).toEqual([]);
  });

  it("③ ⚠️ 正向对照：扫描器必须能识别已合规角色（证明 ① 不是恒绿）", () => {
    const all = scanAll();
    const pass = all.filter((s) => s.local || s.readsEffective).map((s) => s.roleId);
    expect(
      pass.length,
      "❌ 对照失败：一个合规角色都没识别到 ⇒ ① 的绿灯不可信"
    ).toBeGreaterThan(5);
    const sc = all.find((s) => s.roleId === "snake_charmer");
    expect(sc, "❌ 未扫到 snake_charmer").toBeTruthy();
    expect(sc?.local, "❌ snake_charmer 应为本地判定合规（P1-17 修复）").toBe(true);
  });
});
