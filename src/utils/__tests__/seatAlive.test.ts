import { describe, expect, it } from "vitest";
import { countAliveSeats, isSeatDead } from "../seatAlive";

describe("座位存活判定（提名/胜负守卫的唯一事实来源）", () => {
  it("isDead:true 视为已死亡", () => {
    expect(isSeatDead({ isDead: true })).toBe(true);
  });

  it("isAlive:false 同样视为已死亡（旧守卫只判断 isDead，会漏掉这种标记）", () => {
    expect(isSeatDead({ isDead: false, isAlive: false } as any)).toBe(true);
    expect(isSeatDead({ isAlive: false } as any)).toBe(true);
  });

  it("存活玩家判定为未死亡", () => {
    expect(isSeatDead({ isDead: false, isAlive: true })).toBe(false);
    expect(isSeatDead({})).toBe(false);
  });

  it("座位不存在时按已死亡处理（守卫保守拒绝）", () => {
    expect(isSeatDead(null)).toBe(true);
    expect(isSeatDead(undefined)).toBe(true);
  });

  it("countAliveSeats 只统计已分配角色的存活座位", () => {
    const seats = [
      { role: { type: "townsfolk" } },
      { role: { type: "minion" }, isDead: true },
      { role: { type: "demon" }, isAlive: false } as any,
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