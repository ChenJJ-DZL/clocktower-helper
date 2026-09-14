import { describe, expect, it } from "vitest";
import { countAliveSeats, isSeatDead } from "../seatAlive";

/**
 * 座位存活判定（提名/胜负守卫的唯一事实来源）
 *
 * ⚠️ 2026-09-14 死亡标记**统一为 `isDead`**：
 *   项目曾同时使用 `isDead: true` 与 `isAlive: false` 表示「已死亡」，
 *   各处守卫只判断其中一种 → 「已死亡玩家仍能发起/接受提名」这类违规从缝隙漏过。
 *   现在全仓只认 `isDead`，`isAlive` 已移除（含持久化存档的加载期迁移）。
 */
describe("座位存活判定（提名/胜负守卫的唯一事实来源）", () => {
  it("isDead:true 视为已死亡", () => {
    expect(isSeatDead({ isDead: true })).toBe(true);
  });

  it("isDead:false / 缺省 视为存活", () => {
    expect(isSeatDead({ isDead: false })).toBe(false);
    expect(isSeatDead({})).toBe(false);
  });

  it("⭐ 已废弃的 isAlive 字段不再影响判定（单一标记）", () => {
    // 统一后 `isAlive` 不是判据 —— 它既不在类型里，也不参与运算。
    const legacy = { isAlive: false } as unknown as { isDead?: boolean };
    expect(
      isSeatDead(legacy),
      "仅带 isAlive 的旧对象不再被判为死亡（旧存档由加载期迁移兜住）"
    ).toBe(false);
  });

  it("座位不存在时按已死亡处理（守卫保守拒绝）", () => {
    expect(isSeatDead(null)).toBe(true);
    expect(isSeatDead(undefined)).toBe(true);
  });

  it("countAliveSeats 只统计已分配角色的存活座位", () => {
    const seats = [
      { role: { type: "townsfolk" } },
      { role: { type: "minion" }, isDead: true },
      { role: { type: "demon" }, isDead: true },
      { role: null },
    ];
    expect(countAliveSeats(seats as any)).toBe(1);
    expect(countAliveSeats([] as any)).toBe(0);
  });

  it("全员死亡时 countAliveSeats 归零（触发对局立即结束的判据）", () => {
    const seats = [
      { role: { type: "townsfolk" }, isDead: true },
      { role: { type: "demon" }, isDead: true },
    ];
    expect(countAliveSeats(seats as any)).toBe(0);
  });
});
