import { describe, expect, it } from "vitest";
import { hasPendingCerenovusCheck } from "../cerenovusGate";

const seat = (id: number, roleId: string | null, isDead = false) => ({
  id,
  isDead,
  role: roleId ? { id: roleId } : null,
});

describe("hasPendingCerenovusCheck（白天疯狂洗脑门禁）", () => {
  it("场上没有洗脑师时，上一局残留的 cerenovusTarget 不得禁用白天流程（回归）", () => {
    const seats = [seat(0, "baron"), seat(1, "washerwoman"), seat(2, "imp")];
    // 上一局残留的洗脑师目标
    const stale = { targetId: 6, roleName: "厨师", checkedToday: false };
    expect(hasPendingCerenovusCheck(seats, stale)).toBe(false);
  });

  it("洗脑师在场且目标未判定时，需要门禁", () => {
    const seats = [seat(0, "cerenovus"), seat(3, "chef"), seat(5, "imp")];
    expect(
      hasPendingCerenovusCheck(seats, {
        targetId: 3,
        roleName: "厨师",
        checkedToday: false,
      })
    ).toBe(true);
  });

  it("已完成今日判定后不再门禁", () => {
    const seats = [seat(0, "cerenovus"), seat(3, "chef")];
    expect(
      hasPendingCerenovusCheck(seats, {
        targetId: 3,
        roleName: "厨师",
        checkedToday: true,
      })
    ).toBe(false);
  });

  it("洗脑师已死亡 / 目标已死亡时不门禁", () => {
    expect(
      hasPendingCerenovusCheck([seat(0, "cerenovus", true), seat(3, "chef")], {
        targetId: 3,
        roleName: "厨师",
        checkedToday: false,
      })
    ).toBe(false);
    expect(
      hasPendingCerenovusCheck([seat(0, "cerenovus"), seat(3, "chef", true)], {
        targetId: 3,
        roleName: "厨师",
        checkedToday: false,
      })
    ).toBe(false);
  });

  it("没有洗脑师目标时不门禁", () => {
    expect(hasPendingCerenovusCheck([seat(0, "cerenovus")], null)).toBe(false);
  });
});
