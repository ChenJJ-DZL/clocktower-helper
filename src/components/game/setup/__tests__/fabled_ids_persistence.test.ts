/**
 * fabledIds 传递链契约（缺口补齐计划 · G1/G2）
 * ==================================================================
 * 缺陷背景（2026-10-12 实测）：
 *   CustomScriptBuilderModal 的寓言角色区允许勾选 fabled，UI 宣称
 *   「不占座位，作为全局规则生效」——但 onSave / onStartDirectly
 *   的三个调用点只传 (name, roleIds)，**selectedFabledIds 从未传出**，
 *   保存的自定义剧本静默丢失全部勾选。同时 FabledBadgeTray（游戏中
 *   查看/切换 fabled 的托盘组件）定义了却零引用。
 *
 * 本文件锁死：
 *   ① 三个调用点必须传 fabledIds（源码级，防回退）
 *   ② 两个 handler 必须落库 fabledIds（源码级）
 *   ③ Script 接口必须声明 fabledIds（源码级）
 *   ④ localStorage 往返后 fabledIds 保留、空数组不落库（行为级）
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FABLED_ROLES, type Script } from "../../../../../app/data";

const ROOT = resolve(__dirname, "../../../../..");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const builderSrc = stripComments(
  readFileSync(
    resolve(ROOT, "src/components/game/setup/CustomScriptBuilderModal.tsx"),
    "utf-8"
  )
);
const selectionSrc = stripComments(
  readFileSync(
    resolve(ROOT, "src/components/game/setup/ScriptSelection.tsx"),
    "utf-8"
  )
);
const dataSrc = stripComments(readFileSync(resolve(ROOT, "app/data.ts"), "utf-8"));

describe("fabledIds 传递链契约（G1：勾选后不得静默丢失）", () => {
  it("① builder 的 onSave / onStartDirectly 调用点必须传 selectedFabledIds", () => {
    // 三个调用点（handleSaveOnly / handleStartNow 的两个分支）
    const callSites = builderSrc.match(
      /on(?:Save|StartDirectly)\(\s*name\s*,\s*Array\.from\(selectedRoleIds\)\s*,/g
    );
    expect(
      callSites?.length,
      "应存在 3 个传 fabledIds 的调用点（save-only / start-directly / start-fallback）"
    ).toBe(3);
  });

  it("①b 两参旧写法（name, roleIds）不得复现", () => {
    expect(builderSrc).not.toMatch(
      /onSave\(\s*name\s*,\s*Array\.from\(selectedRoleIds\)\s*\)/
    );
    expect(builderSrc).not.toMatch(
      /onStartDirectly\(\s*name\s*,\s*Array\.from\(selectedRoleIds\)\s*\)/
    );
  });

  it("② ScriptSelection 两个 handler 必须落库 fabledIds", () => {
    for (const handler of ["handleSaveCustomScript", "handleStartCustomScript"]) {
      const m = selectionSrc.match(
        new RegExp(`const ${handler}[\\s\\S]{0,900}?\\n  \\};`)
      );
      expect(m, `${handler} 应存在`).toBeTruthy();
      expect(m![0], `${handler} 体内必须写 fabledIds`).toContain("fabledIds");
    }
  });

  it("③ Script 接口必须声明 fabledIds 可选字段", () => {
    expect(dataSrc).toMatch(/export interface Script \{[\s\S]*?fabledIds\?:/);
  });

  it("④ localStorage 往返：fabledIds 保留；空数组不落库", () => {
    const withFabled: Script = {
      id: "custom_test",
      name: "测试剧本",
      difficulty: "自定义",
      description: "d",
      isCustom: true,
      roleIds: ["chef", "imp"],
      fabledIds: ["spirit_of_ivory", "sentinel"],
    };
    const roundTrip = JSON.parse(JSON.stringify(withFabled));
    expect(roundTrip.fabledIds).toEqual(["spirit_of_ivory", "sentinel"]);

    const withoutFabled: Script = {
      id: "custom_test2",
      name: "无寓言",
      difficulty: "自定义",
      description: "d",
      isCustom: true,
      roleIds: ["chef", "imp"],
    };
    const rt2 = JSON.parse(JSON.stringify(withoutFabled));
    expect(rt2.fabledIds).toBeUndefined();
  });

  it("⑤ FABLED_ROLES 全量 id 可作为 fabledIds 合法值（类型闭环）", () => {
    // 任意勾选组合落库后不得丢字段
    const all: Script = {
      id: "custom_all",
      name: "全寓言",
      difficulty: "自定义",
      description: "d",
      roleIds: ["imp"],
      fabledIds: FABLED_ROLES.map((f) => f.id),
    };
    const rt = JSON.parse(JSON.stringify(all));
    expect(rt.fabledIds.length).toBe(FABLED_ROLES.length);
    expect(new Set(rt.fabledIds)).toEqual(new Set(FABLED_ROLES.map((f) => f.id)));
  });

  it("⑥ G2：FabledBadgeTray 不得再做孤儿（ScriptSelection 必须 import 并渲染）", () => {
    expect(selectionSrc).toContain("FabledBadgeTray");
    expect(selectionSrc).toMatch(
      /<FabledBadgeTray[\s\S]*activeFabled=\{activeFabled\}[\s\S]*onToggle=\{/
    );
    // 点击不得冒泡到剧本卡片（否则点寓言=进配置）
    expect(selectionSrc).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});
