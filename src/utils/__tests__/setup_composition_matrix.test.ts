/**
 * 专项 X06 · 人数边界与配比修正（17 条）
 * ==================================================================
 * 计划见 `outputs/全量验证计划V2-场次用例清单-2026-10-21.md` §X06。
 *
 * 判据全部落在**唯一入口** `utils/setupComposition::computeSetupComposition`
 * （官方标准表 `STANDARD_COMPOSITIONS` + 五种角色自带修正）：
 *   · 男爵 baron        +2 外来者（外来者池不足时**必须告警**，不许悄悄少配）
 *   · 方古 fang_gu      +1 外来者
 *   · 亡骨魔 vigormortis −1 外来者
 *   · 教父 godfather    −1 / 0 / +1（说书人选择，默认 0）
 *   · 气球驾驶员 balloonist 0 / +1（说书人选择，默认 0）
 *
 * ⚠️ 本文件不重复测 `app/data.ts::roles`（那是「池子」本身），只测**配比算术**。
 *    池子与引擎注册表不同源的问题（`scapegoat` 缺失）由 `setup_pool_contract` 覆盖。
 *
 * 军团（X06-17）拆成两条规则函数：
 *   · setup 反转：`applyLegionRoleSwap` —— 军团数 = 原镇民+外来者（多数）
 *   · 投票无效：`shouldZeroLegionVote` —— 一项提名只有邪恶投票 ⇒ 记 0 票
 */

import { describe, expect, it } from "vitest";
import {
  applyLegionRoleSwap,
  shouldApplyLegionSwap,
} from "../legionSetupSwap";
import { shouldZeroLegionVote } from "../legionVoteRule";
import {
  computeSetupComposition,
  STANDARD_COMPOSITIONS,
  validateSetupComposition,
} from "../setupComposition";

const NO_ROLES = { baronInPlay: false, inPlayRoleIds: [] as string[] };

/** 用于军团测试的最小座位形状 */
const seat = (id: number, roleId: string, type: string, evil = false) =>
  ({
    id,
    role: { id: roleId, type },
    isEvilConverted: evil,
  }) as any;

// ═══════════════════════════════════════════════════════════════════
// X06-01…11 —— 5~15 人基础配比必须 === 官方标准表
// ═══════════════════════════════════════════════════════════════════

describe("X06-01…11 人数边界：无任何修正时配比 === STANDARD_COMPOSITIONS", () => {
  for (let n = 5; n <= 15; n++) {
    const seq = String(n - 4).padStart(2, "0");
    it(`X06-${seq} ${n} 人局 ⇒ ${JSON.stringify(STANDARD_COMPOSITIONS[n])}`, () => {
      const r = computeSetupComposition(n, NO_ROLES);
      expect(r.counts).toEqual(STANDARD_COMPOSITIONS[n]);
      expect(r.warnings, `${n} 人标准局不得有任何告警`).toEqual([]);
      expect(r.outsiderDelta).toBe(0);
      expect(r.clampedDelta).toBe(0);
      // 总和必须等于人数（多一类少一类都是配比错）
      const sum =
        r.counts.townsfolk +
        r.counts.outsider +
        r.counts.minion +
        r.counts.demon;
      expect(sum, `${n} 人局配比总和必须等于人数`).toBe(n);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// X06-12 / X06-13 —— 男爵：池子充足要加满，池子不足必须告警
// ═══════════════════════════════════════════════════════════════════

describe("X06-12 男爵在场且外来者池充足（15 人，罂粟花开）", () => {
  it("外来者 4 / 镇民 7，无告警，baronAddedOutsiders === 2", () => {
    const r = computeSetupComposition(15, {
      baronInPlay: true,
      availableOutsiderPool: 6,
    });
    expect(r.counts).toEqual({
      townsfolk: 7,
      outsider: 4,
      minion: 3,
      demon: 1,
    });
    expect(r.baronAddedOutsiders, "池子够就必须实加 2 名外来者").toBe(2);
    expect(r.baronRemovedTownsfolk).toBe(2);
    expect(r.baronAdjusted).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});

describe("X06-13 男爵在场但外来者池不足（15 人，无名之墓）", () => {
  it("baronAddedOutsiders === 0 + 必须告警 + 配比仍是 9/2", () => {
    const r = computeSetupComposition(15, {
      baronInPlay: true,
      // 基础配比已用掉 2 名外来者，池子只有 2 ⇒ 一个也加不了
      availableOutsiderPool: 2,
    });
    expect(r.baronAddedOutsiders).toBe(0);
    expect(r.counts).toEqual({
      townsfolk: 9,
      outsider: 2,
      minion: 3,
      demon: 1,
    });
    // 关键：不许静默少配 —— 这是 P0-10 事故的原型
    expect(r.warnings.length, "池子不足必须有告警").toBeGreaterThan(0);
    expect(r.warnings.join("\n")).toContain("男爵");
    expect(r.warnings.join("\n")).toContain("外来者池不足");
  });

  it("validateSetupComposition：实际名单 8/3 会被判为不符 9/2", () => {
    const v = validateSetupComposition(
      15,
      { townsfolk: 8, outsider: 3, minion: 3, demon: 1 },
      { baronInPlay: true, availableOutsiderPool: 2 }
    );
    expect(v.valid).toBe(false);
    expect(v.warnings.join("\n")).toContain("配比不符官方表");
  });
});

// ═══════════════════════════════════════════════════════════════════
// X06-14 / X06-15 / X06-16 —— 其余角色自带的配比修正
// ═══════════════════════════════════════════════════════════════════

describe("X06-14 方古在场（梦殒春宵 15 人）", () => {
  it("外来者 +1（3）、镇民 −1（8）", () => {
    const r = computeSetupComposition(15, {
      baronInPlay: false,
      inPlayRoleIds: ["fang_gu"],
    });
    expect(r.counts).toEqual({
      townsfolk: 8,
      outsider: 3,
      minion: 3,
      demon: 1,
    });
    expect(r.outsiderDelta).toBe(1);
    expect(r.warnings).toEqual([]);
  });
});

describe("X06-15 亡骨魔在场（梦殒春宵 9 人）", () => {
  it("外来者 −1（1）、镇民 +1（6）", () => {
    const r = computeSetupComposition(9, {
      baronInPlay: false,
      inPlayRoleIds: ["vigormortis"],
    });
    expect(r.counts).toEqual({
      townsfolk: 6,
      outsider: 1,
      minion: 1,
      demon: 1,
    });
    expect(r.outsiderDelta).toBe(-1);
    expect(r.warnings).toEqual([]);
  });
});

describe("X06-16 教父在场（±1 由说书人选择，必须与选择一致并留痕）", () => {
  const base11 = STANDARD_COMPOSITIONS[11]; // 7/1/2/1

  it("选择 −1 ⇒ 外来者 0 / 镇民 8，outsiderDelta = −1", () => {
    const r = computeSetupComposition(11, {
      baronInPlay: false,
      inPlayRoleIds: ["godfather"],
      godfatherAdjustment: -1,
    });
    expect(r.counts.outsider).toBe(Math.max(0, base11.outsider - 1));
    expect(r.counts.townsfolk).toBe(base11.townsfolk + 1);
    expect(r.outsiderDelta).toBe(-1);
  });

  it("不选（默认 0）⇒ 配比不变，outsiderDelta = 0", () => {
    const r = computeSetupComposition(11, {
      baronInPlay: false,
      inPlayRoleIds: ["godfather"],
    });
    expect(r.counts).toEqual(base11);
    expect(r.outsiderDelta).toBe(0);
  });

  it("选择 +1 ⇒ 外来者 2 / 镇民 6，outsiderDelta = +1", () => {
    const r = computeSetupComposition(11, {
      baronInPlay: false,
      inPlayRoleIds: ["godfather"],
      godfatherAdjustment: 1,
    });
    expect(r.counts.outsider).toBe(base11.outsider + 1);
    expect(r.counts.townsfolk).toBe(base11.townsfolk - 1);
    expect(r.outsiderDelta).toBe(1);
  });

  it("气球驾驶员 +1（15 人）⇒ 外来者 3 / 镇民 8", () => {
    const r = computeSetupComposition(15, {
      baronInPlay: false,
      inPlayRoleIds: ["balloonist"],
      balloonistAdjustment: 1,
    });
    expect(r.counts).toEqual({
      townsfolk: 8,
      outsider: 3,
      minion: 3,
      demon: 1,
    });
  });

  it("教父 +1 与男爵叠加（11 人，池子够）⇒ 外来者 4 / 镇民 4", () => {
    const r = computeSetupComposition(11, {
      baronInPlay: true,
      availableOutsiderPool: 8,
      inPlayRoleIds: ["godfather"],
      godfatherAdjustment: 1,
    });
    expect(r.counts).toEqual({
      townsfolk: 4,
      outsider: 4,
      minion: 2,
      demon: 1,
    });
    expect(r.baronAddedOutsiders).toBe(2);
    expect(r.outsiderDelta).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// X06-17 —— 军团：setup 反转 + 全邪恶投票无效
// ═══════════════════════════════════════════════════════════════════

describe("X06-17 军团（Legion）", () => {
  it("setup 反转：10 人局 7 善良 + 3 邪恶 ⇒ legionCount 7（多数）", () => {
    const seats = [
      ...Array.from({ length: 7 }, (_, i) => seat(i, "chef", "townsfolk")),
      seat(7, "legion", "demon"),
      seat(8, "assassin", "minion"),
      seat(9, "poisoner", "minion"),
    ];
    expect(shouldApplyLegionSwap(seats)).toBe(true);

    const r = applyLegionRoleSwap({ seats, scriptRoles: [] });
    expect(r.applied).toBe(true);
    expect(r.legionCount, "军团数 = 原镇民+外来者数").toBe(7);
    /**
     * 原恶魔/爪牙变镇民，但**原 legion 座位保持不动**（它本来就该是军团）
     * ⇒ 实际转换的是另外 2 名邪恶（刺客 + 投毒者），不是 3。
     */
    expect(r.newTownsfolkCount, "非军团的原邪恶玩家变镇民").toBe(2);
    // 官方：「多数玩家为军团」—— 军团必须过半
    expect(r.legionCount).toBeGreaterThan(seats.length / 2);
  });

  it("无军团 ⇒ 不反转", () => {
    const seats = [seat(0, "chef", "townsfolk"), seat(1, "imp", "demon")];
    expect(shouldApplyLegionSwap(seats)).toBe(false);
    const r = applyLegionRoleSwap({ seats, scriptRoles: [] });
    expect(r.applied).toBe(false);
    expect(r.legionCount).toBe(0);
  });

  it("一项提名只有邪恶投票 ⇒ 记 0 票", () => {
    const seats = [
      seat(0, "legion", "demon"),
      seat(1, "assassin", "minion"),
      seat(2, "chef", "townsfolk"),
      seat(3, "soldier", "townsfolk"),
    ];
    const isEvil = (s: any) =>
      s.role.type === "demon" || s.role.type === "minion";
    expect(
      shouldZeroLegionVote(seats, [0, 1], isEvil),
      "只有邪恶投票 ⇒ 无效"
    ).toBe(true);
    expect(
      shouldZeroLegionVote(seats, [0, 1, 2], isEvil),
      "有善良投票 ⇒ 正常计票"
    ).toBe(false);
    expect(shouldZeroLegionVote(seats, [], isEvil), "0 票本就不计").toBe(false);
  });

  it("军团不在场 ⇒ 全邪恶投票也照常计票", () => {
    const seats = [
      seat(0, "imp", "demon"),
      seat(1, "assassin", "minion"),
      seat(2, "chef", "townsfolk"),
    ];
    const isEvil = (s: any) =>
      s.role.type === "demon" || s.role.type === "minion";
    expect(shouldZeroLegionVote(seats, [0, 1], isEvil)).toBe(false);
  });
});
