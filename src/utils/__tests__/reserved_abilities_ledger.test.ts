/**
 * 「保留能力」台账护栏（2026-09-22 新增）
 * ==================================================================
 * 背景：`app/data.ts` 定义 135 个角色、`roles/new_engine/` 有 216 个 `*.ability.ts`，
 *   而 9 个内置剧本只引用 **84** 个 ⇒ 约 **132 个能力"不在任何剧本"**。
 *   2026-09-22 用户询问「这些是否可以清理」，**实测结论：不能删**，理由有三（都可执行验证）：
 *
 *   ① 🔴 **`king` 反例**：`king` 不在任何剧本的 `roleIds` 里，
 *      但**唱诗男孩的 `[+国王]`** 会在设置阶段把它**注入牌局**
 *      （`expansionMechanics::applyChoirboyKingSetup`，经 `choir_boy.ability.ts::onSetup`）
 *      ⇒ 删了它就等于砍掉唱诗男孩的官方机制（这正是历史上 P0-15 的形态）。
 *   ② **运行时按 roleId 解析能力**：`getAbilityForRole` 被 4 个生产文件调用
 *      （`useNightActionHandler` / `useSeatManager` / `dayAbilityBridge` / `abilityRegistry`），
 *      且存在「**获得其他角色能力**」机制（哲学家 / 精灵 / 仙女：`grantedAbilityHelper`、
 *      `acquiredAbilities`、`philosopherGainedRole`）⇒ roleId 是**运行时数据**，不是静态引用。
 *   ③ **存在自定义剧本构建器**（`components/game/setup/CustomScriptBuilderModal.tsx`，
 *      `Script.isCustom`）⇒ 用户可**自由组池**，任意已注册能力都可能被用上。
 *
 *   ⇒ 这些能力是**保留素材**（用户长期目标：全部角色按官方规则可玩），
 *      **不是死代码**。本护栏把它们**登记**下来，并保证：
 *       · 数量**只能增长**（新增角色会 +N）——**缩水必须显式更新本文件**（防止被误删）；
 *       · `king` 这个具体反例**必须始终注册**（保护 `[+国王]`）。
 *
 * ⚠️ 与 `e2e_wait_pattern_guard` 相反：那边是"只许变小"，这边是"只许变大"（保留素材只增不减）。
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/** 基线：2026-09-22 实测「不在任何内置剧本 roleIds 里的能力」数量。**只许变大**。 */
const BASELINE_RESERVED = 132;

function readScriptRoleIds(): Set<string> {
  const src = fs
    .readFileSync(path.resolve(process.cwd(), "app/data.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const start = src.indexOf("export const scripts");
  const region = src.slice(start, src.indexOf("\n];", start));
  const out = new Set<string>();
  for (const part of region.split("roleIds:").slice(1)) {
    const body = part.slice(0, part.indexOf("]"));
    for (const m of body.matchAll(/"([a-z_0-9]+)"/g)) out.add(m[1]);
  }
  return out;
}

function abilityFileIds(): string[] {
  const dir = path.resolve(process.cwd(), "src/roles/new_engine");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ability.ts"))
    .map((f) => f.slice(0, -".ability.ts".length));
}

describe("保留能力台账（防误删；只许变大）", () => {
  const scriptRoles = readScriptRoleIds();
  const abilityIds = abilityFileIds();
  const reserved = abilityIds.filter((id) => !scriptRoles.has(id));

  it("扫描本身必须有效（否则护栏是空转）", () => {
    expect(scriptRoles.size, "❌ 没解析出剧本角色池").toBeGreaterThan(50);
    expect(abilityIds.length, "❌ 没扫到 ability 文件").toBeGreaterThan(150);
  });

  it(`保留能力数量不得少于基线 ${BASELINE_RESERVED}（缩水 = 有人删了保留素材）`, () => {
    expect(
      reserved.length,
      `❌ 「不在任何剧本」的能力从基线 ${BASELINE_RESERVED} 降到 ${reserved.length}。\n` +
        `   这些是**保留素材**（见本文件头部三条理由），删除会破坏：\n` +
        `     · 唱诗男孩 [+国王]（king 就不在剧本里）；\n` +
        `     · 运行时按 roleId 取能力（哲学家/精灵/仙女「获得能力」）；\n` +
        `     · 自定义剧本构建器（用户可自由组池）。\n` +
        `   ⇒ 若确实有意移除，请**同时**更新本文件的 BASELINE 并在 skill 记录理由。`
    ).toBeGreaterThanOrEqual(BASELINE_RESERVED);
  });

  it("🔴 反例守卫：king 必须始终注册（它不在任何剧本里，但 [+国王] 会注入它）", () => {
    expect(
      scriptRoles.has("king"),
      "⚠️ 本用例的前提是 king **不在**剧本 roleIds（若已加入，请连同本用例一起更新）"
    ).toBe(false);
    expect(
      abilityIds.includes("king"),
      "❌ king.ability.ts 被删了 —— 唱诗男孩的官方机制 `[+国王]`（设置阶段注入国王）会直接失效"
    ).toBe(true);
  });
});
