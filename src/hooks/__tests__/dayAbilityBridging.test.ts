/**
 * 日间新引擎能力「接入点」护栏（P0）
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────
 * dayAbilityBridge.test.ts 只证明**桥接函数本身**可用；
 * 它无法证明 useDayActions.handleDayAbility **真的调用了**桥接。
 * 这正是 2026-09-20 哲学家那轮的教训：把生产代码改坏（删掉调用），
 * 测试却依旧全绿 —— 属覆盖盲区。
 *
 * 本文件用源码级静态断言钉死接入点：
 *   ① handleDayAbility 内必须调用 getNewEngineDayAbility（查表）
 *   ② handleDayAbility 内必须调用 executeDayAbilityViaNewEngine（执行）
 *   ③ 两者必须位于「通用回退」之前（否则空转）
 *   ④ fearmonger 不得被标为 DAY（官方是每个夜晚）
 *
 * ⚠️ 反例验证：把 useDayActions 里的桥接调用删掉，本文件必须变红。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * 剔除注释后的代码文本。
 *
 * ⚠️ 必须剔除：护栏用正则扫源码，若注释里也写了 `executeDayAbilityViaNewEngine(`
 *   就会被误命中 —— 2026-09-20 自检 C 实测栽在此（把调用注释掉，测试依旧全绿）。
 *   剔除行注释 + 块注释即可（字符串内的 `//` 会有极小误伤，本文件场景可接受）。
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "") // 块注释
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1"); // 行注释（避免误伤 http:// 与字符串）
}

/** 抽出 handleDayAbility 的函数体（从声明到 deps 数组结束） */
function extractHandleDayAbility(src: string): string {
  const start = src.indexOf("const handleDayAbility = useCallback(");
  expect(start, "未找到 handleDayAbility 定义（重构了？）").toBeGreaterThan(
    -1
  );
  // ⚠️ handleDayAbility 是源码里**最后**一个 useCallback（后接 return useMemo）。
  //   故截取到 `return useMemo(` 前的 `  );` 为止，避免中途 `\n  );\n` 提前收口。
  const rest = src.slice(start);
  const memoIdx = rest.indexOf("\n  return useMemo(");
  return stripComments(memoIdx > 0 ? rest.slice(0, memoIdx) : rest);
}

describe("日间新引擎能力接入点护栏（P0）", () => {
  it("① handleDayAbility 必须通过桥接查表（getNewEngineDayAbility）", () => {
    const body = extractHandleDayAbility(read("src/hooks/useDayActions.ts"));
    expect(
      /getNewEngineDayAbility\s*\(/.test(body),
      "handleDayAbility 未调用 getNewEngineDayAbility —— " +
        "新引擎日间能力将再次落进通用回退（静默空转）。"
    ).toBe(true);
  });

  it("② handleDayAbility 必须真的执行桥接（executeDayAbilityViaNewEngine）", () => {
    const body = extractHandleDayAbility(read("src/hooks/useDayActions.ts"));
    expect(
      /executeDayAbilityViaNewEngine\s*\(/.test(body),
      "handleDayAbility 未调用 executeDayAbilityViaNewEngine —— " +
        "只查表不执行同样会空转。"
    ).toBe(true);
  });

  it("③ 桥接调用必须早于「通用回退」代码（否则永远不可达）", () => {
    const body = extractHandleDayAbility(read("src/hooks/useDayActions.ts"));
    const bridgeIdx = body.indexOf("executeDayAbilityViaNewEngine");
    // ⚠️ 锚点必须用**代码特征**，不能用注释：
    //   ① 裸「通用回退」会命中桥接块自己的注释；
    //   ② 剥注释后 `// 无 handler → 通用回退` 已不存在。
    //   真正回退代码的唯一特征是这段 addLog（无 handler 时只说书人提示）。
    const fallbackIdx = body.indexOf("号 [${effectiveRole.name}");
    expect(bridgeIdx, "未找到桥接调用").toBeGreaterThan(-1);
    expect(
      fallbackIdx,
      "未找到通用回退代码特征（`号 [${effectiveRole.name}`），源码结构变了？"
    ).toBeGreaterThan(-1);
    expect(
      bridgeIdx,
      "桥接调用出现在通用回退之后 —— 永远不可达（空转）"
    ).toBeLessThan(fallbackIdx);
  });

  it("④ 治愈性修正：fearmonger 不得标记为 DAY（官方为每个夜晚）", () => {
    const src = stripComments(
      read("src/roles/new_engine/fearmonger.ability.ts")
    );
    const m = src.match(/triggerTiming:\s*\[([^\]]*)\]/);
    expect(m, "未找到 fearmonger 的 triggerTiming").toBeTruthy();
    expect(
      m![1].includes("DAY"),
      "fearmonger 被标记为 DAY —— 官方规则是『每个夜晚』，" +
        "会导致该爪牙错误出现在日间按钮列表。"
    ).toBe(false);
    expect(
      m![1].includes("EVERY_NIGHT"),
      "fearmonger 应为 EVERY_NIGHT 触发"
    ).toBe(true);
  });

  it("⑤ 反例验证：本护栏的判据确实能变红（自检不为空跑）", () => {
    // 构造一个「无桥接调用」的假函数体，确认判据会把它判为违规。
    const fakeBody = `
      if (effectiveRole.id === "artist") { return; }
      // 通用回退：标记已使用 + 说书人提示
    `;
    const hasQuery = /getNewEngineDayAbility\s*\(/.test(fakeBody);
    const hasExec = /executeDayAbilityViaNewEngine\s*\(/.test(fakeBody);
    expect(
      hasQuery && hasExec,
      "判据失效：无桥接的假样本未被识别为违规（测试是空跑）"
    ).toBe(false);
  });
});
