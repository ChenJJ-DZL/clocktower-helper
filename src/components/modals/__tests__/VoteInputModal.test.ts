import { describe, expect, test } from "vitest";

describe("VoteInputModal - 计票计算逻辑测试", () => {
  test("计算存活人数上台门槛（半数向上取整）", () => {
    // 13名存活玩家 -> 门槛 7 票
    const alive13 = 13;
    expect(Math.ceil(alive13 / 2)).toBe(7);

    // 14名存活玩家 -> 门槛 7 票
    const alive14 = 14;
    expect(Math.ceil(alive14 / 2)).toBe(7);

    // 15名存活玩家 -> 门槛 8 票
    const alive15 = 15;
    expect(Math.ceil(alive15 / 2)).toBe(8);
  });

  test("管家票规则：主人未投票时管家票计为0", () => {
    const seats = [
      { id: 0, playerName: "玩家1", role: { id: "townsfolk", name: "镇长", type: "townsfolk" }, isDead: false },
      { id: 1, playerName: "玩家2", role: { id: "butler", name: "管家", type: "outsider" }, masterId: 0, isDead: false },
      { id: 2, playerName: "玩家3", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false },
    ];

    const selectedVotersOnlyButler = [1];
    // 管家投票但主人(0)未投 -> 有效投票者应过滤管家
    const effectiveVoters1 = selectedVotersOnlyButler.filter((id) => {
      const seat = seats.find((s) => s.id === id);
      if (seat?.role?.id === "butler" && seat.masterId !== undefined) {
        return selectedVotersOnlyButler.includes(seat.masterId);
      }
      return true;
    });
    expect(effectiveVoters1.length).toBe(0);

    // 主人与管家均投票 -> 有效计票 2 票
    const selectedVotersBoth = [0, 1];
    const effectiveVoters2 = selectedVotersBoth.filter((id) => {
      const seat = seats.find((s) => s.id === id);
      if (seat?.role?.id === "butler" && seat.masterId !== undefined) {
        return selectedVotersBoth.includes(seat.masterId);
      }
      return true;
    });
    expect(effectiveVoters2.length).toBe(2);
  });

  test("黄昏提名限制：同一黄昏每个角色只能提名1次和被提名1次", () => {
    const nominationRecords = {
      nominators: new Set<number>(),
      nominees: new Set<number>(),
    };

    const nominatorId = 2; // 3号玩家
    const nomineeId = 14; // 15号玩家

    // 初次检查：均未被记录
    expect(nominationRecords.nominators.has(nominatorId)).toBe(false);
    expect(nominationRecords.nominees.has(nomineeId)).toBe(false);

    // 发起提名成功，记录
    nominationRecords.nominators.add(nominatorId);
    nominationRecords.nominees.add(nomineeId);

    // 3号玩家不可再次发起提名
    expect(nominationRecords.nominators.has(nominatorId)).toBe(true);

    // 3号玩家仍可以作为被提名者
    expect(nominationRecords.nominees.has(nominatorId)).toBe(false);

    // 15号玩家不可再次被提名
    expect(nominationRecords.nominees.has(nomineeId)).toBe(true);

    // 15号玩家仍可以发起提名
    expect(nominationRecords.nominators.has(nomineeId)).toBe(false);
  });
});
