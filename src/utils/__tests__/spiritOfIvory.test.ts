/**
 * 圣洁之魂（Spirit of Ivory）邪恶上限 —— 契约测试
 * ==================================================================
 * 【官方原文】"游戏过程中邪恶玩家的总数**最多能比初始设置多一名**。"
 *   【运作方式】"当通过角色能力将善良玩家转变为邪恶阵营时，如果已经有一名
 *     额外邪恶角色在场，则阻止转变。"
 *
 * 2026-10-20 审计发现：UI 只有"重新评估是否已封顶"按钮 + 提示
 *   "说书人应拒绝" —— **靠人肉**，转邪恶入口根本不查上限 ⇒ 假效果。
 * 本轮补齐：判据收敛 `utils/spiritOfIvory.ts`，PlayerContextMenu 引擎强制拦截。
 */
import { describe, expect, it } from "vitest";
import {
  isEvilConversionBlockedBySpiritOfIvory,
  spiritOfIvoryBudget,
} from "../spiritOfIvory";

function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  opts: Record<string, unknown> = {}
) {
  return {
    id,
    role: { id: roleId, name: roleId, type },
    isDead: false,
    ...opts,
  };
}

/** 初始：2 邪恶（爪牙+恶魔）/ 3 善良 */
const initial = [
  seat(0, "washerwoman", "townsfolk"),
  seat(1, "monk", "townsfolk"),
  seat(2, "savant", "townsfolk"),
  seat(3, "baron", "minion"),
  seat(4, "imp", "demon"),
];

describe("圣洁之魂：邪恶总数最多比初始多一名", () => {
  it("还没有额外邪恶 ⇒ 不拦（还能再转 1 名）", () => {
    // 仍是初始 2 邪恶，0 额外
    expect(
      isEvilConversionBlockedBySpiritOfIvory({
        seats: initial,
        initialSeats: initial,
        spiritOfIvoryInPlay: true,
      })
    ).toBe(false);
  });

  it("已有 1 名额外邪恶（= 初始 + 1）⇒ 必须拦住下一次转邪恶", () => {
    // 官方【运作方式】："如果已经有一名额外邪恶角色在场，则阻止转变。"
    const seats = initial.map((s) =>
      s.id === 0 ? { ...s, isEvilConverted: true } : s
    );
    expect(
      isEvilConversionBlockedBySpiritOfIvory({
        seats,
        initialSeats: initial,
        spiritOfIvoryInPlay: true,
      })
    ).toBe(true);
  });

  it("圣洁之魂不在场 ⇒ 不设上限（不拦）", () => {
    const seats = initial.map((s) =>
      s.id === 0 ? { ...s, isEvilConverted: true } : s
    );
    expect(
      isEvilConversionBlockedBySpiritOfIvory({
        seats,
        initialSeats: initial,
        spiritOfIvoryInPlay: false,
      })
    ).toBe(false);
  });

  it("budget 口径：初始 2 / 当前 3 / 上限 3 ⇒ 已封顶", () => {
    const seats = initial.map((s) =>
      s.id === 0 ? { ...s, isEvilConverted: true } : s
    );
    const b = spiritOfIvoryBudget({
      seats,
      initialSeats: initial,
      spiritOfIvoryInPlay: true,
    });
    expect(b.initialEvil).toBe(2);
    expect(b.currentEvil).toBe(3);
    expect(b.cap).toBe(3);
    expect(b.blocked).toBe(true);
  });
});
