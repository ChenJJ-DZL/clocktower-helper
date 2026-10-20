/**
 * 🛡️ 右键菜单动作「接线」护栏
 * ======================================================================
 * 真实事故（2026-10-21 发现）：`PlayerContextMenu` 里有 **7 个** `handleMenuAction("X")`，
 * 而 `useInteractionHandler::handleMenuAction` 只处理了其中 **4 个**
 *   —— `damselGuess`（落难少女）/ `tinker_die`（修补匠猝死）/ `gossip_record`（造谣者声明）
 *   点了**毫无反应**：菜单项渲染正常、按钮可点、什么都不会发生。
 *
 * 这类"幽灵按钮"的特点：类型齐全、UI 齐全、**只有消费端缺失**，
 * 单测与整局 E2E 都不会红（没人点它 ⇒ 没断言）。所以必须用静态护栏钉死：
 *
 *   ① 菜单发出的每个动作，必须有对应处理分支；
 *   ② 处理分支不得空转（必须 `setModal(...)` 或调用注入的实现）；
 *   ③ 处理分支不得多于菜单动作（防死分支累积）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MENU_FILE = resolve(ROOT, "src/components/game/PlayerContextMenu.tsx");
const HANDLER_FILE = resolve(ROOT, "src/hooks/useInteractionHandler.ts");

function readSource(path: string): string {
  // 剥注释：注释里提到 handleMenuAction("x") 不算真实调用
  return readFileSync(path, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** 菜单发出的动作清单 */
function emittedActions(): string[] {
  const src = readSource(MENU_FILE);
  const out = new Set<string>();
  const re = /handleMenuAction\(\s*"([A-Za-z_]+)"\s*\)/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out].sort();
}

/** 处理分支：action -> 分支体源码 */
function handledBranches(): Map<string, string> {
  const src = readSource(HANDLER_FILE);
  const out = new Map<string, string>();
  const re = /action === "([A-Za-z_]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    // 分支体 = 从该比较到下一个 `} else if (`（或 useCallback 结束）
    const start = m.index;
    const rest = src.slice(start);
    const endIdx = rest.search(/\}\s*else if\s*\(|\n\s*\}\s*,?\s*\n\s*\]\s*\)/);
    const body = endIdx > 0 ? rest.slice(0, endIdx) : rest;
    out.set(name, (out.get(name) ?? "") + body);
  }
  return out;
}

describe("🛡️ 右键菜单动作接线（防幽灵按钮）", () => {
  const emitted = emittedActions();
  const handled = handledBranches();

  it("菜单至少有 7 个动作（防止正则失效后变成空测）", () => {
    expect(emitted.length).toBeGreaterThanOrEqual(7);
  });

  it("① 每个菜单动作都必须有处理分支", () => {
    const missing = emitted.filter((a) => !handled.has(a));
    expect(
      missing,
      `以下菜单动作只有发出、没有处理（点击无反应）：${missing.join(", ")}`
    ).toEqual([]);
  });

  it("② 处理分支不得空转（必须 setModal 或调用注入实现）", () => {
    const inert: string[] = [];
    for (const [name, body] of handled) {
      const hasModal = /setModal\s*\(/.test(body);
      const hasInjected = /deps\.[A-Za-z_$][\w$]*\s*\(/.test(body);
      if (!hasModal && !hasInjected) inert.push(name);
    }
    expect(inert, `以下分支存在但什么也不做：${inert.join(", ")}`).toEqual([]);
  });

  it("③ 不得有死分支（处理了菜单根本不发出的动作）", () => {
    const orphans = [...handled.keys()].filter((a) => !emitted.includes(a));
    expect(orphans, `以下处理分支没有任何菜单项会触发：${orphans.join(", ")}`).toEqual([]);
  });

  it("④ 关键规则动作必须真的打开弹窗（逐一钉死）", () => {
    // 落难少女：官方「每局限一次，猜中即邪恶胜」—— 必须真的打开 DAMSEL_GUESS 弹窗
    // ⚠️ 断言用完整 `type: "..."` 字面量，不用裸子串（改个名也含相同前缀，会放过变异）
    expect(handled.get("damselGuess") ?? "").toContain('type: "DAMSEL_GUESS"');
    // 修补匠 / 造谣者：走统一日间能力入口
    expect(handled.get("tinker_die") ?? "").toContain("handleDayAbility(seatId)");
    expect(handled.get("gossip_record") ?? "").toContain(
      "handleDayAbility(seatId)"
    );
  });
});
