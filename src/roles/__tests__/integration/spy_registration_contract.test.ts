/**
 * 间谍「被当作好人」登记契约（2026-10-20）
 * ==================================================================
 * 规则（用户明确表述）：
 *   间谍会被识别为**好人**。因此
 *     · 图书管理员（查**外来者**）不能得知间谍；
 *       若场上没有真外来者，应得到「没有外来者」。
 *     · 调查员（查**爪牙**）默认也查不到间谍；
 *       若间谍是**唯一爪牙**，应得到「没有爪牙」。
 *
 * 实测事故（暗流涌动 seed=4，2号=间谍、5号=男爵、10号=士兵）：
 *   图书管理员输出「2号和10号之中有一名是【间谍】」——
 *   候选对里没有任何外来者，报出的角色名也不是外来者 ⇒ 双重违规。
 *
 * 本文件同时锁两条：
 *   A 图书管理员：间谍不进候选；0 真外来者 ⇒「没有外来者」
 *   B 调查员：间谍不进候选；唯一爪牙是间谍 ⇒「没有爪牙」
 *   C 合法保留：`registerAsEvil === true` 时间谍仍可作为爪牙被查出
 */
import { describe, expect, it } from "vitest";
import {
  generateRealInfo as librarianInfo,
} from "../../new_engine/librarian.ability";
import {
  generateRealInfo as investigatorInfo,
} from "../../new_engine/investigator.ability";

type T = "townsfolk" | "outsider" | "minion" | "demon";

const seat = (
  id: number,
  roleId: string,
  name: string,
  type: T,
  extra: Record<string, unknown> = {}
) => ({
  id,
  isDead: false,
  role: { id: roleId, name, type },
  ...extra,
});

/** 固定 rng：返回 0，保证候选选取确定 */
const rng0 = () => 0;

describe("A 图书管理员：间谍对「外来者识别」完全不可见", () => {
  it("🔴 场上有间谍 + 真外来者 ⇒ 角色名必须是外来者，绝不能是「间谍」", () => {
    const seats = [
      seat(0, "librarian", "图书管理员", "townsfolk"),
      seat(1, "spy", "间谍", "minion"),
      seat(2, "drunk", "酒鬼", "outsider"),
      seat(3, "recluse", "陌客", "outsider"),
      seat(4, "butler", "管家", "outsider"),
      seat(5, "imp", "小恶魔", "demon"),
    ] as any[];
    // 多跑几组 rng，确保任何候选组合都报外来者名
    for (const r of [0, 0.2, 0.5, 0.8, 0.99]) {
      const info = librarianInfo(seats, 0, () => r);
      expect(info.roleName, "角色名必须是某个外来者").toMatch(
        /酒鬼|陌客|管家/
      );
      expect(info.roleName).not.toBe("间谍");
      // 候选对里必须真有一名该角色（间谍被排除后，只能落在真外来者上）
      const picked = [info.seat1, info.seat2].filter((s) => s >= 0);
      const hasOutsider = picked.some(
        (id) => seats.find((s) => s.id === id)?.role?.type === "outsider"
      );
      expect(hasOutsider, "候选对必须包含真外来者").toBe(true);
    }
  });

  it("🔴 场上只有间谍像外来者（真外来者 0 个）⇒ 必须报「没有外来者」", () => {
    const seats = [
      seat(0, "librarian", "图书管理员", "townsfolk"),
      seat(1, "spy", "间谍", "minion"),
      seat(2, "soldier", "士兵", "townsfolk"),
      seat(3, "imp", "小恶魔", "demon"),
    ] as any[];
    const info = librarianInfo(seats, 0, rng0);
    expect(info.roleName, "没有外来者时应返回空角色名").toBe("");
    expect(info.seat1).toBe(-1);
  });
});

describe("B 调查员：间谍是唯一爪牙 ⇒「没有爪牙」", () => {
  it("🔴 唯一爪牙是间谍 ⇒ 不得报出间谍", () => {
    const seats = [
      seat(0, "investigator", "调查员", "townsfolk"),
      seat(1, "spy", "间谍", "minion"),
      seat(2, "soldier", "士兵", "townsfolk"),
      seat(3, "imp", "小恶魔", "demon"),
    ] as any[];
    const info = investigatorInfo(seats, 0, rng0);
    expect(info.roleName, "应得到「没有爪牙」").toBe("");
    expect(info.seat1).toBe(-1);
  });

  it("间谍 + 男爵 ⇒ 只能报男爵（间谍不参与）", () => {
    const seats = [
      seat(0, "investigator", "调查员", "townsfolk"),
      seat(1, "spy", "间谍", "minion"),
      seat(2, "baron", "男爵", "minion"),
      seat(3, "soldier", "士兵", "townsfolk"),
      seat(4, "imp", "小恶魔", "demon"),
    ] as any[];
    for (const r of [0, 0.5, 0.99]) {
      const info = investigatorInfo(seats, 0, () => r);
      expect(info.roleName).toBe("男爵");
      expect([info.seat1, info.seat2]).toContain(2);
    }
  });
});

describe("C 合法保留：说书人手动把间谍当作邪恶时仍可被查出", () => {
  it("registerAsEvil === true ⇒ 调查员可以报「间谍」", () => {
    const seats = [
      seat(0, "investigator", "调查员", "townsfolk"),
      seat(1, "spy", "间谍", "minion", { registerAsEvil: true }),
      seat(2, "soldier", "士兵", "townsfolk"),
      seat(3, "imp", "小恶魔", "demon"),
    ] as any[];
    const info = investigatorInfo(seats, 0, rng0);
    expect(info.roleName).toBe("间谍");
  });
});
