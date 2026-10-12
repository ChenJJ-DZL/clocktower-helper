/**
 * 传奇/旅行者「默认不设置」口径契约（2026-10-12 用户裁定）
 * ==================================================================
 * 用户口径：**默认不设置传奇角色和旅行者**——两者均为「每局说书人临时
 * 决定」的配置。新开一局一律为空：
 *   · 不继承剧本的 `fabledIds`（剧本级仅作建造器备忘记录）；
 *   · 不继承上一局残留；
 *   · 生效正路 = 圆桌说书人座（TableCenterHUD 手动选择，落座确认后锁定）。
 * resume（快照恢复）恢复当局实际状态，不受本口径约束。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../../../contexts/GameContext";

const ROOT = resolve(__dirname, "../../../../..");

describe("传奇/旅行者默认不设置（口径契约）", () => {
  it("① getInitialState：activeFabled 空 + travelers 4 席全 null", () => {
    const s = getInitialState();
    expect(s.activeFabled).toEqual([]);
    expect(s.travelers).toHaveLength(4);
    expect(s.travelers.every((t) => t === null)).toBe(true);
    expect(s.exileProposedToday).toBeNull();
  });

  it("② RESET_GAME 后回到干净初值（无残留）", () => {
    let s = getInitialState();
    // 制造残留
    s = gameReducer(s, gameActions.setActiveFabled([
      { id: "angel", name: "天使", type: "fabled" } as any,
    ]));
    s = gameReducer(
      s,
      gameActions.updateState({
        travelers: [null, { id: "beggar", name: "乞丐", type: "traveler" } as any, null, null],
      })
    );
    expect(s.activeFabled).toHaveLength(1);
    s = gameReducer(s, { type: "RESET_GAME" });
    expect(s.activeFabled).toEqual([]);
    expect(s.travelers.every((t) => t === null)).toBe(true);
  });

  it("③ 源码护栏：startFreshGame 显式置空，禁止从剧本灌入", () => {
    const src = readFileSync(
      resolve(ROOT, "src/components/game/setup/ScriptSelection.tsx"),
      "utf-8"
    );
    // initialSetupState 区必须显式 activeFabled: []
    expect(src).toMatch(/activeFabled:\s*\[\]/);
    // 禁止灌入表达式回归（FABLED_ROLES.find / script.fabledIds 灌入）
    expect(src).not.toMatch(/activeFabled:\s*\(\(\)\s*=>/);
    expect(src).not.toMatch(/FABLED_ROLES\.find\(\(f\)\s*=>\s*f\.id\s*===\s*ids\[0\]\)/);
    // travelers 每局重置仍在
    expect(src).toMatch(/travelers:\s*Array\.from\(\{\s*length:\s*TRAVELER_MAX/);
  });

  it("④ 剧本带 fabledIds 也不得成为开局默认（源码级：无继承链）", () => {
    const src = readFileSync(
      resolve(ROOT, "src/components/game/setup/ScriptSelection.tsx"),
      "utf-8"
    );
    // startFreshGame 函数体内不得出现 script.fabledIds 的读取
    const fnStart = src.indexOf("const startFreshGame");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnStart + 4000);
    expect(
      fnBody.includes("script.fabledIds"),
      "startFreshGame 不得读取 script.fabledIds（默认不设置）"
    ).toBe(false);
  });
});
