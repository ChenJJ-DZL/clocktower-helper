import { describe, expect, it, beforeEach } from "vitest";
import {
  appendNominationRecord,
  canBeNominated,
  canNominate,
  clearVoteSettled,
  consumeVoteSettled,
  emptyNominationRecords,
  markVoteSettled,
  peekVoteSettled,
  revokeNominationOnVoteCancelled,
  NOMINATION_RECORDS_RESET,
} from "../nominationEligibility";

/**
 * 🗣️ 每个黄昏：每名玩家最多发起 1 次提名、最多被提名 1 次（官方规则）。
 *
 * 用户实测缺陷：完成一次投票后，提名者还能再提名、被提名者还能再被提名
 * （「当前实测可以发起 2 次提名，和被提名 2 次」）。
 *
 * 根因：GameStage 里「VOTE_INPUT 模态关闭」的 effect 无条件调用
 * `cancelNomination(lastNominator, pendingVoteFor)` —— 把**已完成投票**的
 * 提名者/被提名者也从 nominationRecords 里删掉，等于恢复了资格。
 *
 * 本文件是守卫这条规则的**唯一事实来源**的行为契约。
 */

const records = (nominators: number[], nominees: number[]) => ({
  nominators: new Set(nominators),
  nominees: new Set(nominees),
});

describe("🗣️ 提名资格：每个黄昏「每名玩家最多提名 1 次 / 被提名 1 次」", () => {
  it("空记录：任何人既可提名也可被提名", () => {
    const r = emptyNominationRecords();
    expect(canNominate(r, 3).ok).toBe(true);
    expect(canBeNominated(r, 3).ok).toBe(true);
  });

  it("A 提名 B 之后：A 不能再提名、B 不能再被提名；其他人不受影响", () => {
    const r = appendNominationRecord(emptyNominationRecords(), 0, 3);
    expect(canNominate(r, 0).ok).toBe(false);
    expect(canBeNominated(r, 3).ok).toBe(false);

    // 其他人仍然自由
    expect(canNominate(r, 1).ok).toBe(true);
    expect(canBeNominated(r, 4).ok).toBe(true);
  });

  it("拒绝时给出可直接展示的中文理由", () => {
    const r = appendNominationRecord(emptyNominationRecords(), 0, 3);
    expect(canNominate(r, 0).reason).toContain("1号");
    expect(canNominate(r, 0).reason).toContain("发起过提名");
    expect(canBeNominated(r, 3).reason).toContain("4号");
    expect(canBeNominated(r, 3).reason).toContain("已被提名过");
  });

  // ────────────────────────────────────────────────────────────────
  // 🔴 用户实测缺陷的直接回归：投票**完成**不等于「取消提名」
  // ────────────────────────────────────────────────────────────────
  describe("🔴 回归：投票完成后资格不得被恢复", () => {
    it("投票正常完成（已计票）→ 提名者与被提名者的资格都不恢复", () => {
      const recorded = appendNominationRecord(emptyNominationRecords(), 0, 3);

      // 投票完成 —— 这是**正常结算**，不是取消。记录必须原样保留。
      const afterVote = recorded;

      expect(canNominate(afterVote, 0).ok).toBe(false);
      expect(canBeNominated(afterVote, 3).ok).toBe(false);
    });

    it("只有「显式取消提名」才恢复资格（说书人反悔重来）", () => {
      const recorded = appendNominationRecord(emptyNominationRecords(), 0, 3);

      const afterCancel = revokeNominationOnVoteCancelled(
        recorded,
        0,
        3,
        { voteSettled: false }
      );

      expect(canNominate(afterCancel, 0).ok).toBe(true);
      expect(canBeNominated(afterCancel, 3).ok).toBe(true);
    });

    it("🔴 投票**已计票**后即便走到「模态关闭」分支，也不得恢复资格", () => {
      const recorded = appendNominationRecord(emptyNominationRecords(), 0, 3);

      // 这条就是把 GameStage 那个 effect 的条件代入后的真实调用：
      // 投票已结算 → voteSettled = true
      const afterModalClose = revokeNominationOnVoteCancelled(
        recorded,
        0,
        3,
        { voteSettled: true }
      );

      // ⛔ 修复前这里会是 true（等于允许第 2 次提名/被提名）
      expect(canNominate(afterModalClose, 0).ok).toBe(false);
      expect(canBeNominated(afterModalClose, 3).ok).toBe(false);
    });
  });

  it("黄昏推进时整体清空（新黄昏重新获得资格）", () => {
    const r = appendNominationRecord(emptyNominationRecords(), 0, 3);
    const next = NOMINATION_RECORDS_RESET();
    expect(next.nominators.size).toBe(0);
    expect(next.nominees.size).toBe(0);
    // 原对象不被污染
    expect(r.nominators.size).toBe(1);
    expect(canNominate(next, 0).ok).toBe(true);
    expect(canBeNominated(next, 3).ok).toBe(true);
  });

  it("支持 Array 形态的历史快照（撤销/读档后仍是数组）", () => {
    const legacy = { nominators: [0], nominees: [3] } as any;
    expect(canNominate(legacy, 0).ok).toBe(false);
    expect(canBeNominated(legacy, 3).ok).toBe(false);
    expect(canBeNominated(legacy, 4).ok).toBe(true);
  });

  it("同座位既是提名者又是被提名者时两条限制各自独立生效", () => {
    // 0 号提名了自己（规则允许自提名）
    const r = appendNominationRecord(emptyNominationRecords(), 0, 0);
    expect(canNominate(r, 0).ok).toBe(false);
    expect(canBeNominated(r, 0).ok).toBe(false);
  });

  it("appendNominationRecord 不修改入参（纯函数）", () => {
    const before = records([], []);
    const after = appendNominationRecord(before, 0, 3);
    expect(before.nominators.size).toBe(0);
    expect(before.nominees.size).toBe(0);
    expect(after).not.toBe(before);
  });
});

describe("🗣️ 投票结算闩锁（跨组件区分「完成」与「取消」）", () => {
  beforeEach(() => {
    clearVoteSettled();
  });

  it("初始为未结算", () => {
    expect(peekVoteSettled()).toBe(false);
    expect(consumeVoteSettled()).toBe(false);
  });

  it("submitVotes 打闩锁后，消费得到 true 且自动复位（只生效一次）", () => {
    markVoteSettled();
    expect(peekVoteSettled()).toBe(true);
    expect(consumeVoteSettled()).toBe(true);
    // 复位：不会污染下一次投票
    expect(peekVoteSettled()).toBe(false);
    expect(consumeVoteSettled()).toBe(false);
  });

  it("clearVoteSettled 用于「打开新投票弹窗 / 进入新黄昏」时清残留", () => {
    markVoteSettled();
    clearVoteSettled();
    expect(consumeVoteSettled()).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────
  // 🔴 端到端（纯逻辑）：一个黄昏内连做两次提名必须被拒绝
  // ────────────────────────────────────────────────────────────────
  it("🔴 一个月黄昏内：A 提名 B 并完成投票后，A 再提名 C 必须被拒", () => {
    let rec = emptyNominationRecords();

    // 第 1 次提名：A(0) → B(3)
    expect(checkPairOk(rec, 0, 3)).toBe(true);
    rec = appendNominationRecord(rec, 0, 3);

    // 投票完成 → 打闩锁；弹窗关闭 effect 走「不恢复」分支
    markVoteSettled();
    const settled = consumeVoteSettled();
    expect(settled).toBe(true);
    const afterClose = revokeNominationOnVoteCancelled(rec, 0, 3, {
      voteSettled: settled,
    });

    // A 不能再提名任何人
    expect(canNominate(afterClose, 0).ok).toBe(false);
    // B 不能再被任何人提名
    expect(canBeNominated(afterClose, 3).ok).toBe(false);
    // 但 C(5) 仍可被 A 之外的人提名 —— 限制是"每人各一次"，不是全局一次
    expect(canBeNominated(afterClose, 5).ok).toBe(true);
    expect(canNominate(afterClose, 1).ok).toBe(true);
  });

  it("🔴 一个月黄昏内：A 提名 B 并完成投票后，C 再提名 B 必须被拒", () => {
    let rec = emptyNominationRecords();
    rec = appendNominationRecord(rec, 0, 3);

    markVoteSettled();
    const afterClose = revokeNominationOnVoteCancelled(rec, 0, 3, {
      voteSettled: consumeVoteSettled(),
    });

    // 换个人再来提名 B —— 也必须被拒（B 本黄昏已被提名过）
    expect(checkPairOk(afterClose, 1, 3)).toBe(false);
    // 但 C(1) 提名 别人(5) 是允许的
    expect(checkPairOk(afterClose, 1, 5)).toBe(true);
  });

  it("取消投票则恢复资格（说书人反悔的正当路径）", () => {
    let rec = emptyNominationRecords();
    rec = appendNominationRecord(rec, 0, 3);

    // 没有 markVoteSettled → 视为取消
    const settled = consumeVoteSettled();
    expect(settled).toBe(false);
    const afterCancel = revokeNominationOnVoteCancelled(rec, 0, 3, {
      voteSettled: settled,
    });

    expect(canNominate(afterCancel, 0).ok).toBe(true);
    expect(canBeNominated(afterCancel, 3).ok).toBe(true);
  });
});

/** 测试内联：一次校验提名者+被提名者两侧 */
function checkPairOk(
  records: any,
  nominatorId: number,
  nomineeId: number
): boolean {
  return canNominate(records, nominatorId).ok && canBeNominated(records, nomineeId).ok;
}
