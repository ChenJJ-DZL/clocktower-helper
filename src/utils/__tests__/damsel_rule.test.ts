/**
 * 🎯 落难少女猜测判据测试（官方四条硬规则）
 * ======================================================================
 * 每条断言都对得上 `officialRoleDocs.json` 原文，**不套英文原版**：
 *   ① 猜中 ⇒ 邪恶获胜；
 *   ② 猜错 ⇒ **无事发生**（旧实现杀掉猜错的爪牙 —— 违规）；
 *   ③ 「已被猜测」是**全局一次**（旧实现 per-minion —— 违规）；
 *   ④ 恶魔/提线木偶的猜测不计入、不消耗机会；
 *   ⑤ 落难少女死后不再承担风险（猜她也无效）。
 */
import { describe, expect, it } from "vitest";
import {
  canOpenDamselGuess,
  hasLivingDamsel,
  isLivingDamsel,
  resolveDamselGuess,
  shouldKeepGuessedMarker,
} from "../damselRule";

const seat = (
  id: number,
  roleId: string,
  type: string,
  extra: Record<string, any> = {}
) => ({ id, role: { id: roleId, type }, ...extra });

/**
 * 标准 6 人棋盘：
 *   0 号真爪牙（投毒者）/ 1 号落难少女 / 2 号镇民 / 3 号恶魔
 *   4 号提线木偶（假爪牙）/ 5 号另一名真爪牙（间谍）
 */
function board(overrides: Record<number, Record<string, any>> = {}) {
  const base = [
    seat(0, "poisoner", "minion"),
    seat(1, "damsel", "outsider"),
    seat(2, "soldier", "townsfolk"),
    seat(3, "imp", "demon"),
    seat(4, "marionette", "minion"),
    seat(5, "spy", "minion"),
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.id] ?? {}) }));
}

describe("落难少女：猜测结算", () => {
  it("猜中活着的落难少女 ⇒ 邪恶获胜 + 落「已被猜测」标记", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 0,
      targetId: 1,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("correct");
    expect(r.evilWins).toBe(true);
    expect(r.consumesGuess).toBe(true);
  });

  it("猜错 ⇒ 无事发生（不得杀人），但机会用尽", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 0,
      targetId: 2,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("wrong");
    expect(r.evilWins).toBe(false);
    expect(r.consumesGuess).toBe(true);
    // 🔴 官方：猜测错误「无事发生」；旧实现让猜测者当场死亡 —— 显式钉死
    expect(r.minionDies).toBe(false);
  });

  it("全局一次：别人猜过之后再猜 ⇒ 不生效", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 5, // 另一名**真**爪牙（间谍）
      targetId: 1,
      alreadyGuessed: true,
    });
    expect(r.outcome).toBe("already_guessed");
    expect(r.evilWins).toBe(false);
    expect(r.consumesGuess).toBe(false);
  });

  it("恶魔发起猜测 ⇒ 不计入、不消耗机会（官方：恶魔假装爪牙的猜测不计算在内）", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 3,
      targetId: 1,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("invalid");
    expect(r.consumesGuess).toBe(false);
    expect(r.evilWins).toBe(false);
  });

  it("提线木偶发起猜测 ⇒ 不计入（官方相克：木偶不知落难少女在场）", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 4,
      targetId: 1,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("invalid");
    expect(r.consumesGuess).toBe(false);
  });

  it("落难少女已死 ⇒ 猜她不成立，且只算猜错（不获胜）", () => {
    const r = resolveDamselGuess({
      seats: board({ 1: { isDead: true } }),
      minionId: 0,
      targetId: 1,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("wrong");
    expect(r.evilWins).toBe(false);
  });

  it("目标座位不存在 ⇒ invalid，不消耗", () => {
    const r = resolveDamselGuess({
      seats: board(),
      minionId: 0,
      targetId: 99,
      alreadyGuessed: false,
    });
    expect(r.outcome).toBe("invalid");
    expect(r.consumesGuess).toBe(false);
  });
});

describe("落难少女：入口与标记", () => {
  it("活着的落难少女 ⇒ 允许真爪牙发起猜测", () => {
    expect(
      canOpenDamselGuess({ seats: board(), minionId: 0, alreadyGuessed: false })
        .allowed
    ).toBe(true);
  });

  it("已猜过 ⇒ 入口关闭（全局一次）", () => {
    const r = canOpenDamselGuess({
      seats: board(),
      minionId: 0,
      alreadyGuessed: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("全局仅一次");
  });

  it("没有活着的落难少女 ⇒ 入口关闭", () => {
    const seats = board({ 1: { isDead: true } });
    expect(hasLivingDamsel(seats)).toBe(false);
    expect(
      canOpenDamselGuess({ seats, minionId: 0, alreadyGuessed: false }).allowed
    ).toBe(false);
  });

  it("恶魔/提线木偶 ⇒ 入口关闭", () => {
    expect(
      canOpenDamselGuess({ seats: board(), minionId: 3, alreadyGuessed: false })
        .allowed
    ).toBe(false);
    expect(
      canOpenDamselGuess({ seats: board(), minionId: 4, alreadyGuessed: false })
        .allowed
    ).toBe(false);
  });

  it("落难少女死亡 ⇒ 「已被猜测」标记应移除", () => {
    expect(shouldKeepGuessedMarker(board())).toBe(true);
    expect(shouldKeepGuessedMarker(board({ 1: { isDead: true } }))).toBe(false);
  });

  it("isLivingDamsel：酒鬼伪装成落难少女不算（只看真实角色）", () => {
    const fake = {
      id: 9,
      role: { id: "drunk", type: "townsfolk" },
      charadeRole: { id: "damsel", type: "outsider" },
    };
    expect(isLivingDamsel(fake as any)).toBe(false);
  });
});
