/**
 * P1-13 护栏：夜间确认弹窗的「只能选活人」判据必须真的接通
 * （2026-09-21）
 *
 * ============================================================
 * 背景：一个"永远为假"的条件
 * ============================================================
 * `NightActionConfirmModal.tsx:521`
 *   `const isDeadDisabled = seat.isDead && aliveOnly === true;`
 * 是"已死玩家不可点选"的**唯一**守门条件。
 *
 * 它的 `aliveOnly` 来自 `useNightActionHandler.ts:~573`：
 *   `const aliveOnly = targetConfig?.aliveOnly ?? false;`        ← 旧写法（错）
 * 而新引擎 `targetConfig` 的官方字段名是 `allowDead`
 * （`roles/core/roleAbility.types.ts:134`），**214 个能力全部只定义 `allowDead`**。
 * ⇒ `aliveOnly` 恒为 `undefined ?? false` = false ⇒ `isDeadDisabled` **恒为 false**
 * ⇒ 说书人可以在确认弹窗里点选任何死者（例如给僧侣选一具尸体当保护目标）。
 *
 * ============================================================
 * 本护栏做什么
 * ============================================================
 * 1. **数据校验**：注册表里每个能力的 `targetConfig` 都不得出现 `aliveOnly` 字段
 *    （SST 是 `allowDead`）——防止有人加回旧字段名造成两套口径。
 * 2. **源码校验**：`useNightActionHandler` 里的 `aliveOnly` 计算必须**同时**引用
 *    `allowDead`，否则说明又退回了"读不存在字段"的写法。
 * 3. **行为校验**：用真实能力（monk）走一遍判据函数，确认能产出 true。
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRawAbilityMap,
  initializeAbilityRegistry,
} from "../new_engine/abilityRegistry";

const HANDLER_PATH = path.resolve(
  __dirname,
  "../../hooks/useNightActionHandler.ts"
);

describe("P1-13 · 夜间确认弹窗「只能选活人」判据接通性", () => {
  initializeAbilityRegistry();

  it("① 注册表 targetConfig 一律用 allowDead，禁止出现 aliveOnly", () => {
    const map = getRawAbilityMap();
    const offenders: string[] = [];
    let checked = 0;
    for (const [key, ab] of Object.entries(map) as any[]) {
      const tc = ab?.targetConfig;
      if (!tc) continue;
      checked++;
      if ("aliveOnly" in tc) {
        offenders.push(`${ab.roleId} :: ${key} :: targetConfig.aliveOnly`);
      }
    }
    expect(checked, "应检查到大量能力（若为 0 说明注册表未初始化）").toBeGreaterThan(100);
    expect(
      offenders,
      `❌ 以下能力在 targetConfig 里用了 aliveOnly（SST 是 allowDead）：\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("② useNightActionHandler 的 aliveOnly 计算必须引用 allowDead", () => {
    const src = fs.readFileSync(HANDLER_PATH, "utf8");
    // 剥掉注释，避免命中注释里的说明文字（元教训：静态扫描必须先剥注释）
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const idx = code.indexOf("const aliveOnly");
    expect(idx, "未找到 `const aliveOnly` 定义，疑似被重命名/删除").toBeGreaterThan(-1);
    // 取该语句前后 400 字符窗口
    const window = code.slice(idx, idx + 400);
    expect(
      window.includes("allowDead"),
      `❌ aliveOnly 的计算没有引用 allowDead —— 说明又退回了"读取不存在的字段名"，` +
        `会导致 isDeadDisabled 恒为 false（已死玩家可被点选）。\n实际代码片段：\n${window.slice(0, 300)}`
    ).toBe(true);
  });

  it("③ 行为校验：monk 的 allowDead:false 应能推出 aliveOnly=true", () => {
    const map = getRawAbilityMap();
    const monk = (Object.values(map) as any[]).find(
      (a) => a.roleId === "monk"
    );
    expect(monk, "注册表中未找到 monk 能力").toBeTruthy();
    expect(monk.targetConfig.allowDead).toBe(false);

    // 复刻消费方的判据（与 useNightActionHandler 保持一致）
    const derive = (tc: any): boolean =>
      tc?.aliveOnly ??
      (typeof tc?.allowDead === "boolean" ? !tc.allowDead : false);

    expect(derive(monk.targetConfig)).toBe(true);
    // 反向：允许死者的能力应为 false
    expect(derive({ allowDead: true })).toBe(false);
    // 兼容：显式 aliveOnly 优先
    expect(derive({ aliveOnly: true, allowDead: true })).toBe(true);
  });
});
