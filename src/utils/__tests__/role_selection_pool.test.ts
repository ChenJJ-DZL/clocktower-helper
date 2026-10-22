import { describe, expect, it } from "vitest";
import {
  availableRolesForRoleSelection,
  isGoodOnlyRoleSelection,
} from "../roleSelectionPool";

/**
 * 🎯 选角色能力（洗脑师 / 哲学家 / 麻脸巫婆 …）的候选角色池
 * ----------------------------------------------------------------------------
 * 官方（`officialRoleDocs.json` 逐字）：
 * · 洗脑师【角色能力】：「每个夜晚，你要选择一名玩家和**一个善良角色**。」
 *   【角色简介】：「洗脑师会选择让一名玩家"疯狂"地证明自己是**某个镇民或外来者角色**。」
 * · 哲学家【角色能力】：「…你可以选择**一个善良角色**：你获得该角色的能力。」
 * · 麻脸巫婆【角色能力】：「…选择一个角色，如果该角色不在场，他变成该角色。」
 *   —— 没有「善良」限定。
 *
 * 🔴 修复前的真缺陷（2026-10-22 文案对账批 2）：只有哲学家过滤了善良角色，
 *   洗脑师拿到全量角色 ⇒ 说书人能把「小恶魔」指定成疯狂角色，与官方相反。
 */
const R = (id: string, type: string) => ({ id, type });

const ROLES = [
  R("washerwoman", "townsfolk"),
  R("saint", "outsider"),
  R("poisoner", "minion"),
  R("imp", "demon"),
  R("scapegoat", "traveler"),
  R("djinn", "fabled"),
];

describe("availableRolesForRoleSelection · 谁能选邪恶角色", () => {
  it("洗脑师只能选善良角色（镇民 / 外来者）", () => {
    const pool = availableRolesForRoleSelection("cerenovus", ROLES);
    expect(pool.map((r) => r.id)).toEqual(["washerwoman", "saint"]);
    expect(
      pool.some((r) => r.type === "minion" || r.type === "demon"),
      "官方：只能让目标疯狂证明自己是「镇民或外来者」"
    ).toBe(false);
  });

  it("哲学家同样只能选善良角色（原有行为不得回退）", () => {
    const pool = availableRolesForRoleSelection("philosopher", ROLES);
    expect(pool.map((r) => r.id)).toEqual(["washerwoman", "saint"]);
  });

  it("麻脸巫婆可选任意角色（官方无「善良」限定）", () => {
    const pool = availableRolesForRoleSelection("pit_hag", ROLES);
    expect(pool.length).toBe(ROLES.length);
    expect(pool.map((r) => r.id)).toContain("imp");
  });

  it("奥乔 / 酿酒师保持全量（本仓口径）", () => {
    expect(availableRolesForRoleSelection("ojo", ROLES).length).toBe(
      ROLES.length
    );
    expect(availableRolesForRoleSelection("brewer", ROLES).length).toBe(
      ROLES.length
    );
  });

  it("空 / 脏输入不抛错", () => {
    expect(availableRolesForRoleSelection("cerenovus", null)).toEqual([]);
    expect(availableRolesForRoleSelection("cerenovus", undefined)).toEqual([]);
    expect(availableRolesForRoleSelection(null, ROLES).length).toBe(
      ROLES.length
    );
    expect(availableRolesForRoleSelection("cerenovus", [] as any)).toEqual([]);
  });

  it("isGoodOnlyRoleSelection 只认白名单里的两个角色", () => {
    expect(isGoodOnlyRoleSelection("cerenovus")).toBe(true);
    expect(isGoodOnlyRoleSelection("philosopher")).toBe(true);
    expect(isGoodOnlyRoleSelection("pit_hag")).toBe(false);
    expect(isGoodOnlyRoleSelection(undefined)).toBe(false);
  });
});
