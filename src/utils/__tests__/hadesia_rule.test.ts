import { describe, expect, it } from "vitest";
import { resolveHadesiaOutcome } from "../hadesiaRule";

/**
 * ⚔️ 哈迪寂亚生死结算（官方两个方向）
 * ----------------------------------------------------------------------------
 * 【角色能力】：「…他们分别秘密决定自己的生死，然后如果他们都存活则都死亡。」
 * 【运作方式】：「宣布黄昏时存活但黎明时死亡的玩家死亡，
 *               **宣布黄昏时死亡但黎明时存活的玩家复活**。」
 *
 * 本文件锁的正是第二条 —— 修复前「选生」对已死玩家没有任何效果。
 */
describe("resolveHadesiaOutcome · 哈迪寂亚生死结算", () => {
  const noneDead = () => false;
  const deadSet = (...ids: number[]) => (id: number) => ids.includes(id);

  it("三人全选「生」⇒ 三人全部死亡，且**不产生复活**（哪怕其中有人本来就死了）", () => {
    const r = resolveHadesiaOutcome([0, 1, 2], {}, /* 全生 */ deadSet(2));
    expect(r.allLive).toBe(true);
    expect(r.killIds).toEqual([0, 1, 2]);
    expect(r.reviveIds, "三人都选生时不存在复活").toEqual([]);
  });

  it("只有选「死」的人死亡（官方：否则仅选择死的玩家立即死亡）", () => {
    const r = resolveHadesiaOutcome(
      [0, 1, 2],
      { 0: "die", 1: "live", 2: "live" },
      noneDead
    );
    expect(r.allLive).toBe(false);
    expect(r.killIds).toEqual([0]);
    expect(r.reviveIds).toEqual([]);
  });

  it("选「生」且**当前已死** ⇒ 黎明复活（官方【运作方式】第二句）", () => {
    const r = resolveHadesiaOutcome(
      [0, 1, 2],
      { 0: "die", 1: "live", 2: "live" },
      deadSet(1, 2)
    );
    expect(r.killIds).toEqual([0]);
    expect(r.reviveIds).toEqual([1, 2]);
  });

  it("选「生」但当前存活 ⇒ 既不死亡也不复活（无变化）", () => {
    const r = resolveHadesiaOutcome(
      [0, 1, 2],
      { 0: "die", 1: "live", 2: "live" },
      deadSet(2)
    );
    expect(r.reviveIds).toEqual([2]);
    expect(r.killIds).toEqual([0]);
  });

  it("未选择的人默认「生」（与弹窗默认值一致）", () => {
    const r = resolveHadesiaOutcome([0, 1, 2], { 0: "die" }, noneDead);
    expect(r.killIds).toEqual([0]);
    expect(r.allLive).toBe(false);
    // 1/2 未选择 ⇒ 视为生；都没死 ⇒ 无复活
    expect(r.reviveIds).toEqual([]);
  });

  it("杀与复活天然互斥：同一座位不可能既死又复活", () => {
    const r = resolveHadesiaOutcome(
      [0, 1, 2],
      { 0: "die", 1: "die", 2: "live" },
      deadSet(0, 1, 2)
    );
    const overlap = r.killIds.filter((id) => r.reviveIds.includes(id));
    expect(overlap, "同一座位不得同时进入死亡与复活名单").toEqual([]);
    expect(r.reviveIds).toEqual([2]);
  });

  it("空/脏输入不抛错（恶魔选不满 3 人时不得崩）", () => {
    expect(resolveHadesiaOutcome([], {}, noneDead)).toEqual({
      killIds: [],
      reviveIds: [],
      allLive: false,
    });
    expect(
      resolveHadesiaOutcome(undefined as any, {}, noneDead).killIds
    ).toEqual([]);
    // choices 传 null ⇒ 全部按默认「生」⇒ 三人全死（不是「什么都不发生」）
    expect(
      resolveHadesiaOutcome([0, 1, 2], null as any, noneDead).killIds
    ).toEqual([0, 1, 2]);
  });
});
