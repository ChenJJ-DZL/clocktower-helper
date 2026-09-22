import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { librarianAbility } from "../../new_engine/librarian.ability";

function makeSeat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusDetails: [],
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("图书管理员：首夜得知外来者信息", () => {
  it("说书人指定结果 → 原样输出两名玩家与外来者角色", async () => {
    const seats = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "drunk", "outsider"),
      makeSeat(3, "monk", "townsfolk"),
    ];
    const res = await runFullAbilityPipeline(pipe(librarianAbility), {
      actionNode: { seatId: 0, roleId: "librarian" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
      storytellerInput: {
        overrideResult: { seat1: 1, seat2: 2, roleName: "drunk" },
      },
    } as any);
    expect(res.meta.abilityResult).toEqual({
      seat1: 1,
      seat2: 2,
      roleName: "drunk",
    });

    // ⚠️⚠️ 防假绿补强（2026-09-21 变异检验实测）：
    //   旧版只断言 `meta.abilityResult`（中间产物）—— 把 stateUpdate 里的
    //   `hasOutsider: !!result.roleName` 改成 `false`，本文件照样绿（假绿）。
    //   ⇒ 必须断言**落座后的真实状态**：① 座位标记「图书目标」落在 1/2 号；
    //      ② `stateUpdate` 产出的 record 里 hasOutsider 为 true。
    const seatsAfter = res.snapshot.seats as any[];
    expect(
      (seatsAfter.find((s) => s.id === 1)?.statusDetails ?? []),
      "❌ 1 号座位未落「图书目标」标记 —— 说书人看不到图书管理员指认了谁"
    ).toContain("图书目标");
    expect(
      (seatsAfter.find((s) => s.id === 2)?.statusDetails ?? []),
      "❌ 2 号座位未落「图书目标」标记"
    ).toContain("图书目标");
    expect(
      (seatsAfter.find((s) => s.id === 3)?.statusDetails ?? []),
      "非目标座位（3 号）不得带「图书目标」标记"
    ).not.toContain("图书目标");
    expect(
      (res.meta as any).librarianResult?.hasOutsider,
      "❌ stateUpdate 的 record.hasOutsider 必须为 true（有外来者）—— 旧实现若恒 false 会误导 UI"
    ).toBe(true);
  });

  it("⭐ 无外来者（roleName 为空）→ hasOutsider=false 且清空旧座位标记", async () => {
    const seats = [
      makeSeat(0, "librarian", "townsfolk"),
      { ...makeSeat(1, "washerwoman", "townsfolk"), statusDetails: ["图书目标"] } as Seat,
    ];
    const res = await runFullAbilityPipeline(pipe(librarianAbility), {
      actionNode: { seatId: 0, roleId: "librarian" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
      storytellerInput: { overrideResult: { roleName: "" } },
    } as any);
    expect(
      (res.meta as any).librarianResult?.hasOutsider,
      "roleName 为空时必须 hasOutsider=false"
    ).toBe(false);
    const seatsAfter = res.snapshot.seats as any[];
    expect(
      (seatsAfter.find((s) => s.id === 1)?.statusDetails ?? []),
      "❌ 本轮无外来者时应清掉上一轮的「图书目标」标记（改派/重开不得残留）"
    ).not.toContain("图书目标");
  });

  it("醉酒时采用说书人预设的假信息并标记干扰", async () => {
    const seats = [makeSeat(0, "librarian", "townsfolk")];
    const res = await runFullAbilityPipeline(pipe(librarianAbility), {
      actionNode: { seatId: 0, roleId: "librarian" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: { seat1: 1, seat2: 3, roleName: "butler" },
      },
    } as any);
    expect(res.meta.abilityResult).toEqual({
      seat1: 1,
      seat2: 3,
      roleName: "butler",
    });
    expect(res.meta.isCorrupted).toBe(true);
  });
});
