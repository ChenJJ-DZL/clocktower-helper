import { describe, expect, it } from "vitest";
import { computeSetupComposition } from "../setupComposition";

/**
 * 开局配比契约测试
 *
 * 官方 setup 修正一览（外来者数量变化 ⇒ 镇民数量反向变化）：
 *   · 男爵   baron        +2 外来者
 *   · 方古   fang_gu      +1 外来者
 *   · 亡骨魔 vigormortis  -1 外来者
 *   · 教父   godfather    -1 / 0 / +1 外来者（说书人选择，默认 0）
 *   · 气球驾驶员 balloonist 0 / +1 外来者（说书人选择，默认 0）
 */

/** 外来者池充足（够用，不会触发钳制） */
const POOL = 12;

describe("computeSetupComposition · 基础配比", () => {
  it("15 人无任何修正 ⇒ 9 镇民 / 2 外来者 / 3 爪牙 / 1 恶魔", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
    });
    expect(res.counts).toEqual({
      townsfolk: 9,
      outsider: 2,
      minion: 3,
      demon: 1,
    });
    expect(res.outsiderDelta).toBe(0);
    expect(res.clampedDelta).toBe(0);
    expect(res.warnings).toHaveLength(0);
  });

  it("不传 inPlayRoleIds 等价于空数组（不抛错、不改配比）", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
    });
    expect(res.counts.outsider).toBe(2);
    expect(res.outsiderDelta).toBe(0);
  });

  it("不传 availableOutsiderPool ⇒ 不按池钳制", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: true,
    });
    // 男爵 +2，外来者 2 → 4（池子未知 ⇒ 不受池限制）
    expect(res.counts.outsider).toBe(4);
    expect(res.counts.townsfolk).toBe(7);
    expect(res.clampedDelta).toBe(0);
  });
});

describe("computeSetupComposition · 角色自带的 setup 修正", () => {
  it("15 人 + 方古 ⇒ 8 镇民 / 3 外来者 / 3 爪牙 / 1 恶魔", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["fang_gu"],
    });
    expect(res.counts).toEqual({
      townsfolk: 8,
      outsider: 3,
      minion: 3,
      demon: 1,
    });
    expect(res.outsiderDelta).toBe(1);
    expect(res.clampedDelta).toBe(0);
  });

  it("9 人 + 亡骨魔 ⇒ 6 镇民 / 1 外来者 / 1 爪牙 / 1 恶魔（-1 外来者）", () => {
    const res = computeSetupComposition(9, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["vigormortis"],
    });
    expect(res.counts).toEqual({
      townsfolk: 6,
      outsider: 1,
      minion: 1,
      demon: 1,
    });
    expect(res.outsiderDelta).toBe(-1);
    expect(res.clampedDelta).toBe(0);
  });

  it("15 人 + 男爵 ⇒ 7 镇民 / 4 外来者 / 3 爪牙 / 1 恶魔（既有行为不回退）", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: true,
      availableOutsiderPool: POOL,
    });
    expect(res.counts).toEqual({
      townsfolk: 7,
      outsider: 4,
      minion: 3,
      demon: 1,
    });
    expect(res.baronAdjusted).toBe(true);
    expect(res.baronAddedOutsiders).toBe(2);
    expect(res.baronRemovedTownsfolk).toBe(2);
    expect(res.outsiderDelta).toBe(2);
  });

  it("7 人 + 男爵 ⇒ 3 镇民 / 2 外来者 / 1 爪牙 / 1 恶魔（官方范例）", () => {
    const res = computeSetupComposition(7, {
      baronInPlay: true,
      availableOutsiderPool: POOL,
    });
    expect(res.counts).toEqual({
      townsfolk: 3,
      outsider: 2,
      minion: 1,
      demon: 1,
    });
  });

  it("15 人 + 男爵 + 方古 ⇒ 6 镇民 / 5 外来者 / 3 爪牙 / 1 恶魔（+2+1）", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: true,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["fang_gu", "baron"],
    });
    expect(res.counts).toEqual({
      townsfolk: 6,
      outsider: 5,
      minion: 3,
      demon: 1,
    });
    expect(res.outsiderDelta).toBe(3);
    expect(res.clampedDelta).toBe(0);
  });

  it("baronInPlay 与 inPlayRoleIds 同时含男爵 ⇒ 只算一次（不重复 +2）", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: true,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["baron"],
    });
    expect(res.counts.outsider).toBe(4);
    expect(res.outsiderDelta).toBe(2);
  });
});

describe("computeSetupComposition · 钳制与告警", () => {
  it("外来者池只有 2 时 + 男爵 ⇒ 钳到 2，并给出告警与 clampedDelta", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: true,
      availableOutsiderPool: 2,
    });
    expect(res.counts.outsider).toBe(2);
    expect(res.counts.townsfolk).toBe(9);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.clampedDelta).toBeGreaterThan(0);
    // 期望 +2 但实际 +0
    expect(res.outsiderDelta).toBe(0);
    // 告警必须说清「希望多少、实际多少、为什么」
    const text = res.warnings.join(" ");
    expect(text).toContain("外来者");
    expect(text).toContain("2");
  });

  it("9 人 + 亡骨魔且外来者池为 0 ⇒ 外来者不为负，镇民至少 1", () => {
    const res = computeSetupComposition(9, {
      baronInPlay: false,
      availableOutsiderPool: 0,
      inPlayRoleIds: ["vigormortis"],
    });
    expect(res.counts.outsider).toBeGreaterThanOrEqual(0);
    expect(res.counts.outsider).toBe(0);
    expect(res.counts.townsfolk).toBeGreaterThanOrEqual(1);
    expect(res.counts.townsfolk).toBe(7);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("钳制后配比总和仍等于人数", () => {
    const res = computeSetupComposition(13, {
      baronInPlay: true,
      availableOutsiderPool: 1,
      inPlayRoleIds: ["fang_gu"],
    });
    const total =
      res.counts.townsfolk +
      res.counts.outsider +
      res.counts.minion +
      res.counts.demon;
    expect(total).toBe(13);
    expect(res.counts.townsfolk).toBeGreaterThanOrEqual(1);
  });
});

describe("computeSetupComposition · 说书人可选修正", () => {
  it("教父默认 0 ⇒ 不改配比", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["godfather"],
    });
    expect(res.counts.outsider).toBe(2);
    expect(res.counts.townsfolk).toBe(9);
    expect(res.outsiderDelta).toBe(0);
  });

  it("教父选 -1 ⇒ 外来者 1 / 镇民 10", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["godfather"],
      godfatherAdjustment: -1,
    });
    expect(res.counts.outsider).toBe(1);
    expect(res.counts.townsfolk).toBe(10);
    expect(res.outsiderDelta).toBe(-1);
  });

  it("教父选 +1 ⇒ 外来者 3 / 镇民 8", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["godfather"],
      godfatherAdjustment: 1,
    });
    expect(res.counts.outsider).toBe(3);
    expect(res.counts.townsfolk).toBe(8);
    expect(res.outsiderDelta).toBe(1);
  });

  it("气球驾驶员默认 0 ⇒ 不改配比", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["balloonist"],
    });
    expect(res.counts.outsider).toBe(2);
    expect(res.counts.townsfolk).toBe(9);
    expect(res.outsiderDelta).toBe(0);
  });

  it("气球驾驶员选 +1 ⇒ 外来者 3 / 镇民 8", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["balloonist"],
      balloonistAdjustment: 1,
    });
    expect(res.counts.outsider).toBe(3);
    expect(res.counts.townsfolk).toBe(8);
    expect(res.outsiderDelta).toBe(1);
  });

  it("角色不在场时，其说书人修正一律不生效", () => {
    const res = computeSetupComposition(15, {
      baronInPlay: false,
      availableOutsiderPool: POOL,
      inPlayRoleIds: ["chef", "imp"],
      godfatherAdjustment: 1,
      balloonistAdjustment: 1,
    });
    expect(res.counts.outsider).toBe(2);
    expect(res.counts.townsfolk).toBe(9);
  });
});
