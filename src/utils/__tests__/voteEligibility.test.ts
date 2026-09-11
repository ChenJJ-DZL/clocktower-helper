import { describe, expect, it } from "vitest";
import { isVoteInvalidSeat, pruneInvalidVoters } from "../voteEligibility";

const seat = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  isDead: false,
  hasGhostVote: true,
  ...extra,
});

describe("投票资格判定（幽灵票自愈）", () => {
  it("存活玩家始终可投票", () => {
    expect(isVoteInvalidSeat(seat(0) as any)).toBe(false);
  });

  it("死亡但仍有幽灵票 → 可投票", () => {
    expect(isVoteInvalidSeat(seat(3, { isDead: true }) as any)).toBe(false);
  });

  it("死亡且幽灵票已用尽 → 不可投票", () => {
    expect(
      isVoteInvalidSeat(seat(3, { isDead: true, hasGhostVote: false }) as any)
    ).toBe(true);
  });

  it("回归：勾选后幽灵票才被用尽，必须被自动剔除（否则确认按钮永久变灰）", () => {
    // 勾选时 4 号还有幽灵票
    const before = [seat(4, { isDead: true }), seat(5)];
    expect(pruneInvalidVoters([4, 5], before as any).pruned).toEqual([]);

    // 之后（例如另一次提交消耗掉）幽灵票被翻成 false
    const after = [seat(4, { isDead: true, hasGhostVote: false }), seat(5)];
    const res = pruneInvalidVoters([4, 5], after as any);
    expect(res.pruned).toEqual([4]);
    expect(res.valid).toEqual([5]);
    // 剔除后剩余选择不再失效 → 确认按钮可重新启用（不再永久变灰）
    expect(res.valid.every((id) => !isVoteInvalidSeat(after.find((s) => s.id === id) as any))).toBe(true);
  });

  it("座位不存在按失效处理（保守剔除）", () => {
    expect(pruneInvalidVoters([9], [seat(0)] as any).pruned).toEqual([9]);
  });
});