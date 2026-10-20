/**
 * 白天规则矩阵 —— 提名资格 / 投票置零（L1-day）
 * ======================================================================
 * 背景（2026-10-21 覆盖面审计）：整局 E2E 此前对白天的断言只有
 *   「不超时 + 处决真的死一人（I14）」，**提名资格与票数计算零断言**。
 *   「同一黄昏重复提名同一人」「投票结算后资格被错误回退」这类缺陷
 *   在整局跑里完全看不出来。
 *
 * 本矩阵直接打纯函数，逐条对齐官方规则：
 *   · 每名玩家每个黄昏**最多发起 1 次**提名、**最多被提名 1 次**；
 *   · 投票**取消**才回退资格，投票**结算**不得回退（既成事实）；
 *   · 军团在场时，若全部有效票都来自邪恶，本次提名记 0 票。
 */
import { describe, expect, it } from "vitest";
import {
  appendNominationRecord,
  canBeNominated,
  canNominate,
  checkNominationPair,
  emptyNominationRecords,
  revokeNominationOnVoteCancelled,
} from "../nominationEligibility";
import { shouldZeroLegionVote } from "../legionVoteRule";

describe("提名资格：每人每黄昏一次", () => {
  it("✅ 空记录 ⇒ 可提名、可被提名", () => {
    const rec = emptyNominationRecords();
    expect(canNominate(rec, 3).ok).toBe(true);
    expect(canBeNominated(rec, 3).ok).toBe(true);
  });

  it("✅ 已发起过提名 ⇒ 不得再次发起，且理由里带座位号", () => {
    let rec = emptyNominationRecords();
    rec = appendNominationRecord(rec, 3, 5);
    const r = canNominate(rec, 3);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("4号");
  });

  it("✅ 已被提名过 ⇒ 不得再次被提名", () => {
    let rec = emptyNominationRecords();
    rec = appendNominationRecord(rec, 3, 5);
    expect(canBeNominated(rec, 5).ok).toBe(false);
  });

  it("✅ 只消耗「发起者」与「被提名者」两侧，第三人不受影响", () => {
    const rec = appendNominationRecord(emptyNominationRecords(), 3, 5);
    expect(canNominate(rec, 7).ok).toBe(true);
    expect(canBeNominated(rec, 7).ok).toBe(true);
    // 同一人既是提名者又可能被别人提名 ⇒ 两侧是独立计数
    expect(canBeNominated(rec, 3).ok).toBe(true);
    expect(canNominate(rec, 5).ok).toBe(true);
  });

  it("🔴 提名者已用 ⇒ checkNominationPair 必须整体拒绝", () => {
    const rec = appendNominationRecord(emptyNominationRecords(), 3, 9);
    expect(checkNominationPair(rec, 3, 5).ok).toBe(false);
  });

  it("🔴 被提名者已用 ⇒ checkNominationPair 必须整体拒绝", () => {
    const rec = appendNominationRecord(emptyNominationRecords(), 3, 5);
    expect(checkNominationPair(rec, 7, 5).ok).toBe(false);
  });

  it("✅ 归档是纯函数：不得就地修改入参", () => {
    const rec = emptyNominationRecords();
    const next = appendNominationRecord(rec, 3, 5);
    expect(rec.nominators.size, "原记录被就地污染").toBe(0);
    expect(rec.nominees.size).toBe(0);
    expect(next.nominators.has(3)).toBe(true);
    expect(next.nominees.has(5)).toBe(true);
  });

  it("✅ 兼容数组形态（JSON 往返后 Set 会变成数组）", () => {
    const rec = { nominators: [3], nominees: [5] } as any;
    expect(canNominate(rec, 3).ok).toBe(false);
    expect(canBeNominated(rec, 5).ok).toBe(false);
    expect(canNominate(rec, 4).ok).toBe(true);
  });
});

describe("投票取消 vs 投票结算：资格回退只允许前者", () => {
  it("✅ 投票取消 ⇒ 资格回退，同一黄昏可重新提名", () => {
    let rec = appendNominationRecord(emptyNominationRecords(), 3, 5);
    rec = revokeNominationOnVoteCancelled(rec, 3, 5, { voteSettled: false });
    expect(canNominate(rec, 3).ok).toBe(true);
    expect(canBeNominated(rec, 5).ok).toBe(true);
  });

  it("🔴 投票已结算 ⇒ 资格**不得**回退（否则同一黄昏能再提名一次）", () => {
    const rec = appendNominationRecord(emptyNominationRecords(), 3, 5);
    const after = revokeNominationOnVoteCancelled(rec, 3, 5, { voteSettled: true });
    expect(canNominate(after, 3).ok, "结算后仍可再次发起提名 = 违反每黄昏一次").toBe(
      false
    );
    expect(canBeNominated(after, 5).ok, "结算后仍可再次被提名 = 违反每黄昏一次").toBe(
      false
    );
  });

  it("✅ 只回退指定的一对，不误伤其他人的记录", () => {
    let rec = appendNominationRecord(emptyNominationRecords(), 1, 2);
    rec = appendNominationRecord(rec, 3, 5);
    rec = revokeNominationOnVoteCancelled(rec, 3, 5, { voteSettled: false });
    expect(canNominate(rec, 1).ok).toBe(false);
    expect(canBeNominated(rec, 2).ok).toBe(false);
    expect(canNominate(rec, 3).ok).toBe(true);
  });
});

describe("军团：全体邪恶投票 ⇒ 本次提名记 0 票", () => {
  const seats = (ids: Array<[number, string]>) =>
    ids.map(([id, roleId]) => ({ id, role: { id: roleId, type: roleId === "legion" ? "demon" : "townsfolk" } }));
  const isEvil = (s: any) => s.role.id === "legion";

  it("🔴 军团在场 + 全部有效票都是邪恶 ⇒ 必须置零", () => {
    const board = seats([[0, "legion"], [1, "chef"], [2, "empath"]]);
    expect(shouldZeroLegionVote(board, [0], isEvil)).toBe(true);
  });

  it("✅ 有善良玩家投票 ⇒ 不置零", () => {
    const board = seats([[0, "legion"], [1, "chef"], [2, "empath"]]);
    expect(shouldZeroLegionVote(board, [0, 1], isEvil)).toBe(false);
  });

  it("✅ 场上无军团 ⇒ 不置零（该规则仅军团局生效）", () => {
    const board = seats([[0, "chef"], [1, "empath"]]);
    expect(shouldZeroLegionVote(board, [0], () => true)).toBe(false);
  });

  it("✅ 0 张有效票 ⇒ 不置零（本来就无效，无需该规则）", () => {
    const board = seats([[0, "legion"], [1, "chef"]]);
    expect(shouldZeroLegionVote(board, [], isEvil)).toBe(false);
  });
});
