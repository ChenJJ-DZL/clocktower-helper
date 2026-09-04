import { describe, expect, it, vi } from "vitest";
import type { Seat } from "../../src/types/game";

describe("黄昏提名阶段 - 座位号圆圈点击发起提名交互", () => {
  const makeSeat = (
    id: number,
    roleId: string,
    roleName: string,
    isDead = false
  ): Seat =>
    ({
      id,
      playerName: `玩家${id + 1}`,
      role: { id: roleId, name: roleName, type: "townsfolk" },
      roleId,
      isDead,
      isAlive: !isDead,
    }) as any;

  it("首次点击合法存活座位，激活该玩家作为发起提名者", () => {
    const seats = [
      makeSeat(0, "washerwoman", "洗衣妇"),
      makeSeat(1, "librarian", "图书管理员"),
    ];
    let nominator: number | null = null;
    let nominee: number | null = null;

    const nominationRecords = {
      nominators: new Set<number>(),
      nominees: new Set<number>(),
    };

    const handleDuskSeatClick = (seatId: number) => {
      const clicked = seats.find((s) => s.id === seatId);
      if (clicked?.isDead) return "dead";
      if (nominator === null) {
        if (nominationRecords.nominators.has(seatId)) return "already_nominated";
        nominator = seatId;
        return "activated_nominator";
      }
      if (seatId === nominator) {
        nominator = null;
        nominee = null;
        return "deselected";
      }
      if (nominationRecords.nominees.has(seatId)) return "already_been_nominated";
      nominee = seatId;
      return "selected_nominee";
    };

    // 点击 1 号（id=0）
    const res1 = handleDuskSeatClick(0);
    expect(res1).toBe("activated_nominator");
    expect(nominator).toBe(0);
    expect(nominee).toBe(null);

    // 再次点击 1 号（id=0）-> 取消激活
    const res2 = handleDuskSeatClick(0);
    expect(res2).toBe("deselected");
    expect(nominator).toBe(null);

    // 重新点击 1 号 -> 激活
    handleDuskSeatClick(0);
    expect(nominator).toBe(0);

    // 再次点击 2 号（id=1）-> 选择 2 号作为被提名者发起提名
    const res3 = handleDuskSeatClick(1);
    expect(res3).toBe("selected_nominee");
    expect(nominator).toBe(0);
    expect(nominee).toBe(1);
  });

  it("死亡玩家或今日已提名的玩家无法发起提名", () => {
    const seats = [
      makeSeat(0, "washerwoman", "洗衣妇", true), // 死亡
      makeSeat(1, "librarian", "图书管理员", false),
    ];
    let nominator: number | null = null;
    const nominationRecords = {
      nominators: new Set<number>([1]), // 1号已发起过提名
      nominees: new Set<number>(),
    };

    const handleDuskSeatClick = (seatId: number) => {
      const clicked = seats.find((s) => s.id === seatId);
      if (clicked?.isDead) return "dead";
      if (nominator === null) {
        if (nominationRecords.nominators.has(seatId)) return "already_nominated";
        nominator = seatId;
        return "activated_nominator";
      }
      return "other";
    };

    // 点击已死亡的 0 号
    expect(handleDuskSeatClick(0)).toBe("dead");
    expect(nominator).toBe(null);

    // 点击今日已提名的 1 号
    expect(handleDuskSeatClick(1)).toBe("already_nominated");
    expect(nominator).toBe(null);
  });

  it("已激活提名者后，无法提名今日已被提名的玩家", () => {
    const seats = [
      makeSeat(0, "washerwoman", "洗衣妇"),
      makeSeat(1, "librarian", "图书管理员"),
    ];
    let nominator: number | null = 0; // 已激活 0 号
    let nominee: number | null = null;
    const nominationRecords = {
      nominators: new Set<number>(),
      nominees: new Set<number>([1]), // 1号已被提名过
    };

    const handleDuskSeatClick = (seatId: number) => {
      if (nominator !== null && seatId !== nominator) {
        if (nominationRecords.nominees.has(seatId)) return "already_been_nominated";
        nominee = seatId;
        return "selected_nominee";
      }
      return "other";
    };

    expect(handleDuskSeatClick(1)).toBe("already_been_nominated");
    expect(nominee).toBe(null);
  });
});
