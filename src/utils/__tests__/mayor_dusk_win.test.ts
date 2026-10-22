import { describe, expect, it } from "vitest";
import { resolveMayorDuskWin, type MayorRuleSeat } from "../mayorRule";

/**
 * 镇长「三人生存」特殊胜利 · 判据契约
 *
 * 官方【角色能力】：如果只有三名玩家存活且白天没有人被处决，你的阵营获胜。
 * 官方【运作方式】：在黄昏时，如果正好有三名玩家存活，且当天没有玩家被处决，
 *   宣布镇长所在的阵营获胜。
 * 官方【规则细节】：镇长的特殊胜利在黄昏宣布，但触发是在白天，
 *   因此中毒/醉酒的镇长无法以此获胜。
 *
 * 2026-10-22：该判据此前**零生产调用点**（只有注释与唤醒文案），
 * 由 5 人局 E2E 暴露（3 人存活 + 无人处决时游戏照常入夜）。
 */

const seat = (over: Partial<MayorRuleSeat> = {}): MayorRuleSeat => ({
  id: 0,
  isDead: false,
  role: { id: "chef", type: "townsfolk" },
  ...over,
});

const mayor = (over: Partial<MayorRuleSeat> = {}): MayorRuleSeat =>
  seat({ id: 0, role: { id: "mayor", type: "townsfolk" }, ...over });

describe("镇长三人生存胜利", () => {
  it("恰好 3 人存活 + 白天无人被处决 ⇒ 善良获胜", () => {
    const seats = [
      mayor(),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    const win = resolveMayorDuskWin(seats, false);
    expect(win).not.toBeNull();
    expect(win?.winner).toBe("good");
    expect(win?.reason).toContain("镇长");
    expect(win?.mayorSeatId).toBe(0);
  });

  it("4 人存活 ⇒ 不触发", () => {
    const seats = [
      mayor(),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
      seat({ id: 3 }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("2 人存活 ⇒ 不触发（交给『存活 ≤2 ⇒ 邪恶胜』的兜底判据）", () => {
    const seats = [
      mayor(),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("今天有人被处决 ⇒ 不触发", () => {
    const seats = [
      mayor(),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    expect(resolveMayorDuskWin(seats, true)).toBeNull();
  });

  it("镇长已死 ⇒ 不触发", () => {
    const seats = [
      mayor({ isDead: true }),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("镇长中毒 ⇒ 不触发（官方：醉/毒会阻止特殊胜利）", () => {
    const seats = [
      mayor({ isPoisoned: true }),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("镇长醉酒 ⇒ 不触发", () => {
    const seats = [
      mayor({ isDrunk: true }),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("镇长被转为邪恶 ⇒ 胜方是邪恶（官方：你的阵营获胜）", () => {
    const seats = [
      mayor({ isEvilConverted: true } as Partial<MayorRuleSeat>),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    const win = resolveMayorDuskWin(seats, false);
    expect(win?.winner).toBe("evil");
  });

  it("旅行者不计入存活数（3 名非旅行者 + 1 旅行者仍触发）", () => {
    const seats = [
      mayor(),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
      seat({ id: 3, role: { id: "scapegoat", type: "traveler" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)?.winner).toBe("good");
  });

  it("镇长不在场 ⇒ 不触发", () => {
    const seats = [
      seat({ id: 0 }),
      seat({ id: 1, role: { id: "imp", type: "demon" } }),
      seat({ id: 2, role: { id: "poisoner", type: "minion" } }),
    ];
    expect(resolveMayorDuskWin(seats, false)).toBeNull();
  });

  it("空座位表 ⇒ 不触发（不得抛错）", () => {
    expect(resolveMayorDuskWin([], false)).toBeNull();
    expect(resolveMayorDuskWin(null, false)).toBeNull();
    expect(resolveMayorDuskWin(undefined, false)).toBeNull();
  });
});
