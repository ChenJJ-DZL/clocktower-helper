import { describe, expect, it } from "vitest";
import { runAbilityPipeline } from "../../../utils/middlewarePipeline";
import {
  investigatorAbility,
  librarianAbility,
  washerwomanAbility,
} from "../../new_engine/abilityRegistry";
import { applyInfoSeatMark } from "../../../utils/seatMarks";

/**
 * 第 12 条：洗衣妇 / 调查员的座位标记，规格与「图书目标」完全一致。
 * 统一实现见 utils/seatMarks.ts（先清同名再落位 → 幂等、可迁移、互不干扰）。
 */

const seats = (marks: Record<number, string[]> = {}) =>
  [0, 1, 2, 3, 4].map((id) => ({
    id,
    isAlive: true,
    statusDetails: marks[id] ?? [],
  }));

const markOf = (list: any[], id: number) =>
  (list.find((s) => s.id === id)?.statusDetails ?? []) as string[];

describe("applyInfoSeatMark · 数据层规则", () => {
  it("只有被展示的座位拿到标记", () => {
    const out = applyInfoSeatMark(seats(), "洗衣目标", [1, 3]);
    expect(markOf(out, 1)).toEqual(["洗衣目标"]);
    expect(markOf(out, 3)).toEqual(["洗衣目标"]);
    expect(markOf(out, 0)).toEqual([]);
    expect(markOf(out, 2)).toEqual([]);
    expect(markOf(out, 4)).toEqual([]);
  });

  it("重复执行不重复叠加（幂等）", () => {
    const once = applyInfoSeatMark(seats(), "洗衣目标", [1, 3]);
    const twice = applyInfoSeatMark(once, "洗衣目标", [1, 3]);
    expect(markOf(twice, 1)).toEqual(["洗衣目标"]);
    expect(markOf(twice, 3)).toEqual(["洗衣目标"]);
    // 幂等：内容不变
    expect(twice).toEqual(once);
  });

  it("改派后旧座位标记被清掉", () => {
    const before = applyInfoSeatMark(seats(), "调查目标", [0, 2]);
    const after = applyInfoSeatMark(before, "调查目标", [4]);
    expect(markOf(after, 0)).toEqual([]);
    expect(markOf(after, 2)).toEqual([]);
    expect(markOf(after, 4)).toEqual(["调查目标"]);
  });

  it("三个信息角色的标记互不干扰", () => {
    let out = applyInfoSeatMark(seats(), "图书目标", [0, 1]);
    out = applyInfoSeatMark(out, "洗衣目标", [2, 3]);
    out = applyInfoSeatMark(out, "调查目标", [4]);
    expect(markOf(out, 0)).toEqual(["图书目标"]);
    expect(markOf(out, 1)).toEqual(["图书目标"]);
    expect(markOf(out, 2)).toEqual(["洗衣目标"]);
    expect(markOf(out, 3)).toEqual(["洗衣目标"]);
    expect(markOf(out, 4)).toEqual(["调查目标"]);
    // 再改派「洗衣目标」不应动到另外两个标记
    out = applyInfoSeatMark(out, "洗衣目标", [0]);
    expect(markOf(out, 0)).toEqual(["图书目标", "洗衣目标"]);
    expect(markOf(out, 2)).toEqual([]);
    expect(markOf(out, 1)).toEqual(["图书目标"]);
    expect(markOf(out, 4)).toEqual(["调查目标"]);
  });

  it("传空目标数组 = 清掉所有该标记（图书管理员 0 外来者场景）", () => {
    const before = applyInfoSeatMark(seats(), "图书目标", [1, 2]);
    const after = applyInfoSeatMark(before, "图书目标", []);
    expect(after.every((s) => !s.statusDetails.includes("图书目标"))).toBe(true);
  });
});

const ROLE_NAMES: Record<string, string> = {
  washerwoman: "洗衣妇",
  investigator: "调查员",
  librarian: "图书管理员",
  chef: "厨师",
  empath: "共情者",
  soldier: "士兵",
  saint: "圣徒",
  poisoner: "投毒者",
  baron: "男爵",
  imp: "小恶魔",
};

const makeSeat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `玩家${id + 1}`,
  isAlive: true,
  isDead: false,
  role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
  statusEffects: [],
  statusDetails: [],
});

const TB_SEATS = [
  makeSeat(0, "washerwoman", "townsfolk"),
  makeSeat(1, "chef", "townsfolk"),
  makeSeat(2, "empath", "townsfolk"),
  makeSeat(3, "saint", "outsider"),
  makeSeat(4, "poisoner", "minion"),
  makeSeat(5, "imp", "demon"),
  makeSeat(6, "soldier", "townsfolk"),
];

const runOnce = async (ability: any, roleId: string) =>
  runAbilityPipeline(ability, {
    actionNode: { seatId: 0, roleId, abilityId: `${roleId}_ability` },
    targetIds: [],
    snapshot: {
      seats: TB_SEATS.map((s) => ({ ...s })),
      nightCount: 1,
      gamePhase: "firstNight",
      isFirstNight: true,
    },
    meta: {},
    aborted: false,
  } as any);

describe("洗衣妇 / 调查员 / 图书管理员 · 管线真实写入落座标记", () => {
  it("洗衣妇：被展示的两个座位拿到「洗衣目标」，其余座位没有", async () => {
    const result = await runOnce(washerwomanAbility, "washerwoman");
    const rec = (result.meta as any).washerwomanResult;
    expect(rec).toBeTruthy();
    const info = (result.snapshot as any)._abilityResults.washerwoman;
    const targets = [info.seat1, info.seat2].filter((n: number) => n >= 0);
    expect(targets.length).toBeGreaterThan(0);
    for (const s of (result.snapshot as any).seats as any[]) {
      const has = (s.statusDetails ?? []).includes("洗衣目标");
      expect(has).toBe(targets.includes(s.id));
    }
  });

  it("调查员：被展示的两个座位拿到「调查目标」", async () => {
    const result = await runOnce(investigatorAbility, "investigator");
    const info = (result.snapshot as any)._abilityResults.investigator;
    const targets = [info.seat1, info.seat2].filter((n: number) => n >= 0);
    expect(targets.length).toBeGreaterThan(0);
    for (const s of (result.snapshot as any).seats as any[]) {
      const has = (s.statusDetails ?? []).includes("调查目标");
      expect(has).toBe(targets.includes(s.id));
    }
  });

  it("图书管理员：被展示的两个座位拿到「图书目标」", async () => {
    const result = await runOnce(librarianAbility, "librarian");
    const info = (result.snapshot as any)._abilityResults.librarian;
    const targets =
      info?.roleName && info.seat1 !== undefined
        ? [info.seat1, info.seat2].filter((n: number) => n >= 0)
        : [];
    for (const s of (result.snapshot as any).seats as any[]) {
      const has = (s.statusDetails ?? []).includes("图书目标");
      expect(has).toBe(targets.includes(s.id));
    }
  });

  it("三个角色的标记互不干扰（同一次管线只写自己的名字）", async () => {
    const w = await runOnce(washerwomanAbility, "washerwoman");
    const wSeats = (w.snapshot as any).seats as any[];
    expect(wSeats.some((s) => (s.statusDetails ?? []).includes("调查目标"))).toBe(
      false
    );
    expect(wSeats.some((s) => (s.statusDetails ?? []).includes("图书目标"))).toBe(
      false
    );
    const i = await runOnce(investigatorAbility, "investigator");
    const iSeats = (i.snapshot as any).seats as any[];
    expect(iSeats.some((s) => (s.statusDetails ?? []).includes("洗衣目标"))).toBe(
      false
    );
  });
});
