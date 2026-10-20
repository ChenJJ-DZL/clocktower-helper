/**
 * 🪬 灵言师转化判据测试
 * ======================================================================
 * 官方：第一个说出关键词的**善良**玩家当晚变成邪恶；关键词只用一次。
 * 关键断言：阵营字段必须写 `isEvilConverted`（`seatAlignment` 唯一权威），
 * 而不是那个全仓没人读的 `isEvil`。
 */
import { describe, expect, it } from "vitest";
import {
  canOpenShamanConvert,
  hasLivingShaman,
  isShamanConversionSpent,
  resolveShamanConversion,
  SHAMAN_CONVERSION_TOKEN_NAME,
} from "../shamanRule";

const seat = (
  id: number,
  roleId: string,
  type: string,
  extra: Record<string, any> = {}
) => ({ id, role: { id: roleId, type }, ...extra });

/** 5 人：0 灵言师(爪牙) / 1 镇民 / 2 外来者 / 3 爪牙 / 4 恶魔 */
function board(overrides: Record<number, Record<string, any>> = {}) {
  const base = [
    seat(0, "shaman", "minion"),
    seat(1, "soldier", "townsfolk"),
    seat(2, "saint", "outsider"),
    seat(3, "poisoner", "minion"),
    seat(4, "imp", "demon"),
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.id] ?? {}) }));
}

describe("灵言师：入口判据", () => {
  it("有存活灵言师且未用过 ⇒ 允许打开", () => {
    expect(
      canOpenShamanConvert({ seats: board(), gamePhase: "day" }).allowed
    ).toBe(true);
  });

  it("设置阶段 ⇒ 不允许", () => {
    expect(
      canOpenShamanConvert({ seats: board(), gamePhase: "setup" }).allowed
    ).toBe(false);
  });

  it("灵言师已死 ⇒ 不允许", () => {
    const seats = board({ 0: { isDead: true } });
    expect(hasLivingShaman(seats)).toBeNull();
    expect(canOpenShamanConvert({ seats, gamePhase: "day" }).allowed).toBe(
      false
    );
  });

  it("本局已用过（有人带转化标记）⇒ 不允许", () => {
    const seats = board({
      1: { isEvilConverted: true },
    });
    expect(isShamanConversionSpent(seats)).toBe(true);
    expect(canOpenShamanConvert({ seats, gamePhase: "day" }).allowed).toBe(
      false
    );
  });
});

describe("灵言师：结算", () => {
  it("镇民说出 ⇒ 转换，写 isEvilConverted（不是 isEvil）", () => {
    const r = resolveShamanConversion({ seats: board(), targetId: 1 });
    expect(r.outcome).toBe("converted");
    expect(r.patch?.isEvilConverted).toBe(true);
    // 🔴 旧实现写的是 isEvil —— 全仓没人读，属于假生效
    expect(r.patch).not.toHaveProperty("isEvil");
  });

  it("外来者说出 ⇒ 同样转换", () => {
    const r = resolveShamanConversion({ seats: board(), targetId: 2 });
    expect(r.outcome).toBe("converted");
  });

  it("爪牙/恶魔说出 ⇒ 无额外效果", () => {
    expect(
      resolveShamanConversion({ seats: board(), targetId: 3 }).outcome
    ).toBe("already_evil");
    expect(
      resolveShamanConversion({ seats: board(), targetId: 4 }).outcome
    ).toBe("already_evil");
  });

  it("已经用过一次 ⇒ 后续说出者不再转化", () => {
    const seats = board({ 2: { reminderTokens: [{ name: SHAMAN_CONVERSION_TOKEN_NAME }] } });
    const r = resolveShamanConversion({ seats, targetId: 1 });
    expect(r.outcome).toBe("spent");
    expect(r.patch).toBeNull();
  });

  it("目标已死 / 不存在 ⇒ invalid", () => {
    expect(
      resolveShamanConversion({ seats: board({ 1: { isDead: true } }), targetId: 1 })
        .outcome
    ).toBe("invalid");
    expect(
      resolveShamanConversion({ seats: board(), targetId: 99 }).outcome
    ).toBe("invalid");
  });

  it("酒鬼伪装成镇民：按伪装身份算善良（官方：说书人只看当前身份）", () => {
    const seats = board({
      1: {
        role: { id: "drunk", type: "townsfolk" },
        charadeRole: { id: "soldier", type: "townsfolk" },
      },
    });
    expect(resolveShamanConversion({ seats, targetId: 1 }).outcome).toBe(
      "converted"
    );
  });
});
