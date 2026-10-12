/**
 * fabledLock + 生产接线 单测 —— 传奇/旅行者核心不变量
 * ======================================================================
 * 覆盖：
 *   1. 传奇角色数量上限为 1（选第 2 个 = 替换第 1 个）
 *   2. 旅行者数量上限为 4（位置化定长 4 座，setTravelerAt 越界原样返回）
 *   3. 锁定语义：9 个 gamePhase 逐一断言 canEditFabled 返回值
 *   4. 传奇 / 旅行者不占用玩家的 15 个座位（锚定生产接线，非同义反复）
 *   5. fabledLock.ts 源码不得硬编码角色名（按 roleId 解析）
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GamePhase, Role } from "../../../app/data";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../contexts/GameContext";
import { createSnapshotFromState } from "../persistence";
import {
  canEditFabled,
  FABLED_MAX,
  setTravelerAt,
  TRAVELER_MAX,
  withFabled,
  withoutRole,
} from "../fabledLock";

function makeRole(id: string): Role {
  return {
    id,
    name: `角色_${id}`,
    type: "traveler",
    ability: "",
    fullDescription: "",
  } as Role;
}

const R1 = makeRole("r1");
const R2 = makeRole("r2");
const R3 = makeRole("r3");
const R4 = makeRole("r4");
const R5 = makeRole("r5");

describe("不变量 1：传奇角色数量上限为 1", () => {
  it("FABLED_MAX === 1", () => {
    expect(FABLED_MAX).toBe(1);
  });

  it("选第 2 个 = 替换第 1 个（列表永远只有 1 个）", () => {
    const step1 = withFabled([], R1);
    expect(step1.map((r) => r.id)).toEqual(["r1"]);
    const step2 = withFabled(step1, R2);
    expect(step2.map((r) => r.id)).toEqual(["r2"]);
    expect(step2.length).toBe(FABLED_MAX);
    const step3 = withFabled(step2, R3);
    expect(step3.map((r) => r.id)).toEqual(["r3"]);
    expect(step3.length).toBe(1);
  });

  it("withFabled(list, null) 清除选择", () => {
    expect(withFabled([R1], null)).toEqual([]);
  });
});

describe("不变量 2：旅行者数量上限为 4（位置化）", () => {
  it("TRAVELER_MAX === 4", () => {
    expect(TRAVELER_MAX).toBe(4);
  });

  it("setTravelerAt 只写指定位置，不串位", () => {
    const list: (Role | null)[] = [null, null, null, null];
    const next = setTravelerAt(list, 2, R3);
    expect(next.map((r) => r?.id ?? null)).toEqual([null, null, "r3", null]);
    expect(list.map((r) => r?.id ?? null)).toEqual([null, null, null, null]);
  });

  it("setTravelerAt 越界原样返回同一引用", () => {
    const list: (Role | null)[] = [null, null, null, null];
    expect(setTravelerAt(list, 4, R5)).toBe(list);
    expect(setTravelerAt(list, -1, R5)).toBe(list);
  });

  it("setTravelerAt 满 4 座后仍是定长 4（第 5 座写不进去）", () => {
    let list: (Role | null)[] = [null, null, null, null];
    for (const [i, r] of [R1, R2, R3, R4].entries()) {
      list = setTravelerAt(list, i, r);
    }
    expect(list.map((r) => r?.id ?? null)).toEqual(["r1", "r2", "r3", "r4"]);
    const overflow = setTravelerAt(list, 4, R5);
    expect(overflow).toBe(list);
    expect(overflow.filter(Boolean).length).toBe(TRAVELER_MAX);
  });

  it("setTravelerAt(index, null) 清空该座位", () => {
    const list: (Role | null)[] = [R1, R2, null, null];
    const next = setTravelerAt(list, 0, null);
    expect(next.map((r) => r?.id ?? null)).toEqual([null, "r2", null, null]);
  });

  it("withoutRole 按 roleId 移除", () => {
    expect(withoutRole([R1, R2, R3], "r2").map((r) => r.id)).toEqual([
      "r1",
      "r3",
    ]);
  });
});

describe("不变量 3：锁定语义 —— 9 个 GamePhase 逐一断言", () => {
  const CASES: Array<[GamePhase, boolean]> = [
    ["scriptSelection", true],
    ["setup", true],
    ["check", false],
    ["firstNight", false],
    ["day", false],
    ["dusk", false],
    ["night", false],
    ["dawnReport", false],
    ["gameOver", false],
  ];

  it("覆盖全部 9 个 GamePhase", () => {
    expect(CASES).toHaveLength(9);
  });

  for (const [phase, expected] of CASES) {
    it(`canEditFabled("${phase}") === ${expected}`, () => {
      expect(canEditFabled(phase)).toBe(expected);
    });
  }

  it("落座确认（check）后锁定，新开一局（回 scriptSelection）解锁", () => {
    expect(canEditFabled("check")).toBe(false);
    expect(canEditFabled("scriptSelection")).toBe(true);
  });
});

describe("不变量 4：传奇 / 旅行者不占用玩家的 15 个座位（锚定生产接线）", () => {
  it("getInitialState：travelers 定长 4 位全 null，activeFabled 为空", () => {
    const s = getInitialState();
    expect(s.travelers).toHaveLength(TRAVELER_MAX);
    expect(s.travelers.every((t) => t === null)).toBe(true);
    expect(s.activeFabled).toEqual([]);
  });

  it("dispatch SET_ACTIVE_FABLED 不改写 state.seats（长度与内容不变）", () => {
    const before = getInitialState();
    const seatsJsonBefore = JSON.stringify(before.seats);
    const after = gameReducer(before, gameActions.setActiveFabled([R1]));
    expect(after.seats.length).toBe(before.seats.length);
    expect(JSON.stringify(after.seats)).toBe(seatsJsonBefore);
    expect(after.activeFabled.map((r) => r.id)).toEqual(["r1"]);
  });

  it("setTravelerAt 只改 travelers，不触碰 seats", () => {
    const before = getInitialState();
    const seatsJsonBefore = JSON.stringify(before.seats);
    const nextTravelers = setTravelerAt(before.travelers, 1, R2);
    expect(nextTravelers[1]?.id).toBe("r2");
    // 纯函数不接触 seats：before.seats 内容不变
    expect(JSON.stringify(before.seats)).toBe(seatsJsonBefore);
    // 写回 state 后 seats 依旧不变
    const after = gameReducer(
      before,
      gameActions.updateState({ travelers: nextTravelers })
    );
    expect(JSON.stringify(after.seats)).toBe(seatsJsonBefore);
    expect(after.travelers[1]?.id).toBe("r2");
  });

  it("快照往返：activeFabled / travelers 保留（刷新恢复不丢选择）", () => {
    const s = gameReducer(getInitialState(), gameActions.setActiveFabled([R1]));
    const s2 = gameReducer(
      s,
      gameActions.updateState({ travelers: setTravelerAt(s.travelers, 0, R2) })
    );
    const snap = createSnapshotFromState(s2) as any;
    expect(snap.activeFabled.map((r: Role) => r.id)).toEqual(["r1"]);
    expect(snap.travelers.map((r: Role | null) => r?.id ?? null)).toEqual([
      "r2",
      null,
      null,
      null,
    ]);
    // JSON 往返后仍保留（localStorage 即 JSON 序列化）
    const rt = JSON.parse(JSON.stringify(snap));
    expect(rt.activeFabled.map((r: Role) => r.id)).toEqual(["r1"]);
    expect(rt.travelers.map((r: Role | null) => r?.id ?? null)).toEqual([
      "r2",
      null,
      null,
      null,
    ]);
  });
});

describe("不变量 5：fabledLock.ts 禁止硬编码角色名", () => {
  it("源码字符串字面量不得含中文（角色名一律走 roleId 解析）", () => {
    const src = readFileSync(resolve(__dirname, "../fabledLock.ts"), "utf-8");
    // 先剥离注释，再查字符串字面量中是否出现中文
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const literalsWithCJK = noComments.match(
      /["'`][^"'`\n]*[\u4e00-\u9fff][^"'`\n]*["'`]/
    );
    expect(
      literalsWithCJK,
      `发现疑似硬编码角色名: ${literalsWithCJK}`
    ).toBeNull();
  });
});
