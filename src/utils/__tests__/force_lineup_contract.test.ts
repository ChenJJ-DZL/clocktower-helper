import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAndSortQuickStartLineup } from "../quickStartGenerator";
import { scripts } from "../../../app/data";
import { getAllRoleDefinitions } from "../../roles";

/**
 * `window.__CT_FORCE_LINEUP__` 契约
 * ------------------------------------------------------------------
 * 这是「按剧本逐角色验证」的地基：没有它，15 人局要凑齐指定 15 个角色
 * 只能靠随机发牌（概率接近 0），覆盖表就永远无法复现。
 *
 * 四条契约（每条都要能单独打红）：
 *   ① 未注入 ⇒ 走原随机路径（行为不变）
 *   ② 注入合法阵容 ⇒ 发出来的就是这些人（集合相等，顺序由排序器决定）
 *   ③ 注入了但人数不符 / 角色不在剧本 ⇒ **抛错**，不许静默补齐
 *   ④ 注入了但配比非法 ⇒ **抛错**（否则会「少发一个 + 随机补一个」）
 */

const TB = (scripts as any[]).find((s) => s.name === "暗流涌动");
const allRoles = getAllRoleDefinitions() as any[];

function tbLineup(ids: string[]) {
  const byId = new Map(allRoles.map((r) => [r.id, r]));
  return ids.map((id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`测试数据里没有角色 ${id}`);
    return r;
  });
}

/** 9 人：5 镇民 / 2 外来者 / 1 爪牙 / 1 恶魔（STANDARD_COMPOSITIONS[9]） */
const LEGAL_9 = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "butler",
  "drunk",
  "poisoner",
  "imp",
];

beforeEach(() => {
  delete (globalThis as any).window;
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("🛡️ 强制阵容注入契约", () => {
  it("① 未注入 ⇒ 走随机路径，返回合法的 9 人阵容", () => {
    const res = generateAndSortQuickStartLineup(TB, allRoles, 9);
    expect(res.sortedRoles).toHaveLength(9);
    const types = res.sortedRoles.map((r: any) => r.type);
    expect(types.filter((t: string) => t === "demon")).toHaveLength(1);
    expect(types.filter((t: string) => t === "minion")).toHaveLength(1);
  });

  it("② 注入合法阵容 ⇒ 发出的就是这些人（集合相等）", () => {
    (globalThis as any).window = { __CT_FORCE_LINEUP__: LEGAL_9 };
    const res = generateAndSortQuickStartLineup(TB, allRoles, 9);
    expect(res.sortedRoles.map((r: any) => r.id).sort()).toEqual([...LEGAL_9].sort());
  });

  it("③-1 注入长度 ≠ 人数 ⇒ 回退随机（预览路径会用别的人数调它），不抛错", () => {
    (globalThis as any).window = { __CT_FORCE_LINEUP__: LEGAL_9.slice(0, 8) };
    const res = generateAndSortQuickStartLineup(TB, allRoles, 9);
    expect(res.sortedRoles).toHaveLength(9);
    // 回退后不应恰好等于被截断的注入（那是 8 人，长度都不对）
    expect(res.sortedRoles.map((r: any) => r.id).sort()).not.toEqual(
      [...LEGAL_9.slice(0, 8)].sort()
    );
  });

  it("③-2 注入剧本里没有的角色 ⇒ 抛错并点名", () => {
    // 圣女（virgin）在暗流涌动里存在；这里用「只属于别的剧本」的角斗士替代
    (globalThis as any).window = {
      __CT_FORCE_LINEUP__: [...LEGAL_9.slice(0, 8), "legion"],
    };
    expect(() => generateAndSortQuickStartLineup(TB, allRoles, 9)).toThrow(/legion/);
  });

  it("④ 注入配比非法（两个恶魔）⇒ 抛错，不静默补齐", () => {
    (globalThis as any).window = {
      // 4 镇民 + 2 外来者 + 1 爪牙 + 2 恶魔 = 9（期望 5/2/1/1）
      __CT_FORCE_LINEUP__: [
        "washerwoman",
        "librarian",
        "investigator",
        "chef",
        "butler",
        "drunk",
        "poisoner",
        "imp",
        "imp",
      ],
    };
    // 9 人里塞 2 个恶魔 ⇒ 镇民只剩 4 ⇒ 与配比不符
    expect(() => generateAndSortQuickStartLineup(TB, allRoles, 9)).toThrow(/配比非法/);
  });

  it("⑤ 生产路径不受影响：清掉注入后行为恢复", () => {
    (globalThis as any).window = { __CT_FORCE_LINEUP__: LEGAL_9 };
    const a = generateAndSortQuickStartLineup(TB, allRoles, 9);
    delete (globalThis as any).window;
    const b = generateAndSortQuickStartLineup(TB, allRoles, 9);
    expect(a.sortedRoles).toHaveLength(9);
    expect(b.sortedRoles).toHaveLength(9);
    // 随机路径不应被强制阵容「记住」
    expect(b.sortedRoles.map((r: any) => r.id).sort()).not.toEqual([...LEGAL_9].sort());
  });

  it("⑥ 幽灵数据：`__CT_FORCE_LINEUP__` 不是数组 ⇒ 视为未注入", () => {
    (globalThis as any).window = { __CT_FORCE_LINEUP__: "not-an-array" as any };
    const res = generateAndSortQuickStartLineup(TB, allRoles, 9);
    expect(res.sortedRoles).toHaveLength(9);
  });
});
