import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeInfo,
  generateRealInfo,
} from "../../new_engine/librarian.ability";
import { librarian } from "../../townsfolk/librarian";

/**
 * 回归背景（实测复现）：
 * 7 人局·暗流涌动，4号酒鬼伪装成图书管理员。
 *   修复前——「当前的行动」提示：「6号和1号其中一位是【圣徒】」
 *           「结果」弹窗    ：「7号和2号之中有一名是【陌客】」
 *   说书人照提示念、魔典却按结果标记，两边对不上，直接导致开局错误。
 * 根因：提示由 legacy 的 roles/townsfolk/librarian.ts 自行 Math.random 生成，
 *      而结果由 new_engine 的 ability 生成，是两套互不相干的随机。
 * 修复：legacy 的 dialog 改为复用 new_engine 的结构化生成器 + 同一种子。
 */

const seats: any[] = [
  { id: 0, isDead: false, role: { id: "drunk", name: "酒鬼", type: "outsider" } },
  { id: 1, isDead: false, role: { id: "saint", name: "圣徒", type: "outsider" } },
  { id: 2, isDead: false, role: { id: "recluse", name: "陌客", type: "outsider" } },
  {
    id: 3,
    isDead: false,
    role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  },
  { id: 4, isDead: false, role: { id: "imp", name: "小恶魔", type: "demon" } },
  { id: 5, isDead: false, role: { id: "baron", name: "男爵", type: "minion" } },
];

const ctx = (disabled: boolean) =>
  ({
    seats,
    isActorDisabledByPoisonOrDrunk: () => disabled,
    nightCount: 1,
  }) as never;

const guideOf = (disabled: boolean): string =>
  (librarian.firstNight as any).dialog(0, true, ctx(disabled)).wake;

describe("图书管理员：legacy 提示 与 new_engine 结果 必须表达同一份信息（回归）", () => {
  it("醉酒/中毒（假信息）：提示里的两名玩家与角色名必须与结果完全一致", () => {
    const rng = createDeterministicRandom(nightInfoSeed("librarian", 0, 1));
    const info = generateFakeInfo(seats as never, 0, undefined, rng);

    const guide = guideOf(true);
    expect(guide).toContain(`${info.seat1 + 1}号和${info.seat2 + 1}号`);
    expect(guide).toContain(`【${info.roleName}】`);
  });

  it("正常状态（真实信息）：提示里的两名玩家与角色名必须与结果完全一致", () => {
    const rng = createDeterministicRandom(nightInfoSeed("librarian", 0, 1));
    const info = generateRealInfo(seats as never, 0, rng);

    const guide = guideOf(false);
    expect(guide).toContain(`${info.seat1 + 1}号和${info.seat2 + 1}号`);
    expect(guide).toContain(`【${info.roleName}】`);
  });

  it("真实信息必须指向场上真实存在的外来者（信息合法性）", () => {
    const guide = guideOf(false);
    expect(guide).toMatch(/【(圣徒|陌客)】/);
    const nums = [...guide.matchAll(/(\d+)号/g)].map((m) => Number(m[1]));
    const picked = nums.slice(1);
    const outsiderSeats = seats
      .filter((s) => s.role.id === "saint" || s.role.id === "recluse")
      .map((s) => s.id + 1);
    expect(picked.some((n) => outsiderSeats.includes(n))).toBe(true);
  });

  it("跨夜仍然重新随机（不得把随机性锁死）", () => {
    const roleAt = (night: number) => {
      const rng = createDeterministicRandom(nightInfoSeed("librarian", 0, night));
      const info = generateRealInfo(seats as never, 0, rng);
      return `${info.seat1}-${info.seat2}-${info.roleName}`;
    };
    const set = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(roleAt));
    expect(set.size).toBeGreaterThan(1);
  });
});
