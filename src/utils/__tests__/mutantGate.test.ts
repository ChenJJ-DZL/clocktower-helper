import { describe, expect, it } from "vitest";
import {
  canJudgeMutantExecution,
  hasPendingMutantMadnessCheck,
  listPendingMutantSeats,
} from "../mutantGate";

type TestSeat = {
  id: number;
  isDead?: boolean;
  role?: { id: string | null; name?: string } | null;
  charadeRole?: { id: string; name?: string } | null;
  hasUsedDayAbility?: boolean;
  mutantMadnessCheckedToday?: boolean;
};

const seat = (
  id: number,
  roleId: string | null,
  extra: Partial<TestSeat> = {}
): TestSeat => ({
  id,
  isDead: false,
  role: roleId ? { id: roleId } : null,
  ...extra,
});

const MUTANT = "mutant";

describe("hasPendingMutantMadnessCheck（畸形秀演员白天疯狂仲裁门禁）", () => {
  it("场上没有畸形秀演员时不门禁（回归：不得把全新一局卡死在白天）", () => {
    const seats = [
      seat(0, "baron"),
      seat(1, "washerwoman"),
      seat(2, "imp"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(false);
  });

  it("畸形秀演员在场且今日未仲裁时，需要门禁", () => {
    const seats = [seat(0, MUTANT), seat(3, "chef"), seat(5, "imp")];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(true);
  });

  it("今日已完成仲裁后不再门禁", () => {
    const seats = [
      seat(0, MUTANT, { mutantMadnessCheckedToday: true }),
      seat(3, "chef"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(false);
  });

  it("畸形秀演员已死亡时不门禁（死者无需裁定）", () => {
    const seats = [seat(0, MUTANT, { isDead: true }), seat(3, "chef")];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(false);
  });

  it("酒鬼伪装成畸形秀演员时也要门禁（effectiveRole 判据）", () => {
    const seats = [
      seat(0, "drunk", { charadeRole: { id: MUTANT, name: "畸形秀演员" } }),
      seat(3, "chef"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(true);
  });

  it("提线木偶伪装成畸形秀演员时也要门禁", () => {
    const seats = [
      seat(0, "marionette", { charadeRole: { id: MUTANT, name: "畸形秀演员" } }),
      seat(3, "chef"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(true);
  });

  it("酒鬼伪装成其他角色（非畸形秀演员）时不门禁", () => {
    const seats = [
      seat(0, "drunk", { charadeRole: { id: "chef", name: "厨师" } }),
      seat(3, "chef"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(false);
  });

  it("多个畸形秀演员中只要有一个未仲裁，仍然门禁", () => {
    const seats = [
      seat(0, MUTANT, { mutantMadnessCheckedToday: true }),
      seat(1, MUTANT, { mutantMadnessCheckedToday: false }),
      seat(5, "imp"),
    ];
    expect(hasPendingMutantMadnessCheck(seats)).toBe(true);
    expect(listPendingMutantSeats(seats)).toEqual([1]);
  });
});

describe("listPendingMutantSeats（待仲裁座位列表）", () => {
  it("只列出存活且未仲裁的畸形秀演员座位", () => {
    const seats = [
      seat(0, MUTANT),
      seat(1, "chef"),
      seat(2, MUTANT, { isDead: true }),
      seat(3, MUTANT, { mutantMadnessCheckedToday: true }),
      seat(4, "drunk", { charadeRole: { id: MUTANT } }),
    ];
    expect(listPendingMutantSeats(seats)).toEqual([0, 4]);
  });

  it("无畸形秀演员时返回空数组", () => {
    expect(listPendingMutantSeats([seat(0, "imp"), seat(1, "chef")])).toEqual(
      []
    );
  });
});

describe("canJudgeMutantExecution（是否可被仲裁处决）", () => {
  it("存活畸形秀演员可被处决", () => {
    expect(canJudgeMutantExecution(seat(0, MUTANT) as any)).toBe(true);
  });

  it("已死亡者不可被处决", () => {
    expect(
      canJudgeMutantExecution(seat(0, MUTANT, { isDead: true }) as any)
    ).toBe(false);
  });

  it("非畸形秀演员不可被处决（避免误伤）", () => {
    expect(canJudgeMutantExecution(seat(0, "chef") as any)).toBe(false);
    expect(canJudgeMutantExecution(null)).toBe(false);
    expect(canJudgeMutantExecution(undefined)).toBe(false);
  });

  it("伪装成畸形秀演员的玩家同样可被处决（effectiveRole 判据）", () => {
    expect(
      canJudgeMutantExecution(
        seat(0, "drunk", { charadeRole: { id: MUTANT } }) as any
      )
    ).toBe(true);
  });
});
