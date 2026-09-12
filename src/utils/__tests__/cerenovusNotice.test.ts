import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import { roles as allRoles } from "../../../app/data";
import {
  CERENOVUS_NOTICE_STEP_ID,
  CERENOVUS_NOTICE_STORYTELLER_NOTE,
  buildCerenovusNoticeNightInfo,
  getCerenovusNoticePlayerText,
  getCerenovusNoticeStepLabel,
  isCerenovusNoticePending,
  isCerenovusNoticeStep,
} from "../cerenovusNotice";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

/**
 * 🧠 洗脑师「被洗脑告知」节点硬证据
 *   ① 节点归属 = 被洗脑玩家本人（不是洗脑师）；
 *   ② 玩家面文案零行动者信息（无「洗脑师」/「cerenovus」/「11号」）；
 *   ③ 夜限：换夜后旧标记自动失效，不会把昨晚的洗脑在今晚重放。
 */

const roleOf = (id: string) => {
  const r = allRoles.find((x) => x.id === id)!;
  return { id: r.id, name: r.name, type: r.type };
};

const seat = (id: number, roleId: string, extra: Record<string, any> = {}) =>
  ({
    id,
    role: roleOf(roleId),
    isDead: false,
    ...extra,
  }) as unknown as Seat;

const CERENOVUS_SEAT = 10; // 11号-洗脑师
const MAD_SEAT = 2; // 3号-被洗脑玩家
const MADNESS_ROLE = "图书管理员";

const buildSeats = (overrides: Record<string, any> = {}) => {
  const list = [
    seat(0, "chef"),
    seat(1, "empath"),
    seat(MAD_SEAT, "villager", overrides),
    seat(3, "imp"),
    seat(4, "saint"),
    seat(CERENOVUS_SEAT, "cerenovus"),
  ];
  return list;
};

const SEATS = buildSeats({
  cerenovusMadnessRole: MADNESS_ROLE,
  cerenovusNoticeNight: 1,
});

describe("🧠 洗脑告知节点 · 数据与夜限", () => {
  it("① 夜号匹配时该座位有待送达的洗脑告知", () => {
    expect(isCerenovusNoticePending(SEATS[MAD_SEAT], 1)).toBe(true);
  });

  it("② 夜号不匹配（换夜）后自动失效，无需任何清理逻辑", () => {
    expect(isCerenovusNoticePending(SEATS[MAD_SEAT], 2)).toBe(false);
    expect(buildCerenovusNoticeNightInfo(SEATS[MAD_SEAT], 2)).toBeNull();
  });

  it("③ 没有洗脑标记的座位不会凭空产生节点", () => {
    expect(buildCerenovusNoticeNightInfo(SEATS[0], 1)).toBeNull();
  });

  it("④ 合成节点的行动者 = 被洗脑玩家本人（绝不是洗脑师）", () => {
    const info = buildCerenovusNoticeNightInfo(SEATS[MAD_SEAT], 1)!;
    expect(info).toBeTruthy();
    expect(info.seat.id).toBe(MAD_SEAT);
    expect(info.effectiveRole.id).toBe(CERENOVUS_NOTICE_STEP_ID);
    expect((info as any).cerenovusNotice).toEqual({
      targetId: MAD_SEAT,
      roleName: MADNESS_ROLE,
    });
    expect(isCerenovusNoticeStep(info)).toBe(true);
  });

  it("⑤ 玩家面文案零行动者信息（不是「11号」也不是「洗脑师」）", () => {
    const playerText = getCerenovusNoticePlayerText(MADNESS_ROLE);
    expect(playerText).toBe("你需要疯狂证明自己是【图书管理员】");
    for (const leak of ["洗脑师", "cerenovus", "11号", "10号", "唤醒"]) {
      expect(playerText, `玩家文案泄漏了 ${leak}`).not.toContain(leak);
    }
  });

  it("⑥ 队列步骤名保留「唤醒 N号：得知自己被洗脑」口径（说书人侧）", () => {
    expect(getCerenovusNoticeStepLabel(MAD_SEAT, MADNESS_ROLE)).toBe(
      "唤醒 3号：得知自己被洗脑（必须疯狂证明自己是【图书管理员】）"
    );
  });

  it("⑦ 说书人备注明确「不要让他知道是谁洗的」", () => {
    expect(CERENOVUS_NOTICE_STORYTELLER_NOTE).toContain("不要让他知道是谁洗的");
  });
});

describe("🧠 洗脑告知节点 · 夜间队列落地（nightInfoAdapter）", () => {
  it("① 被洗脑玩家当夜一定拿到属于他自己的一个步骤（送达路径 A：合并到自身节点）", () => {
    const info = calculateNightInfoViaNewEngine(
      null,
      SEATS,
      MAD_SEAT,
      "night",
      null,
      1
    ) as any;
    expect(info, "空步骤会被安全网自动跳过 → 信息丢失").not.toBeNull();
    // 行动者 = 被洗脑玩家本人（不是洗脑师）
    expect(info.seat.id).toBe(MAD_SEAT);
    // 该步骤上能取到当夜的洗脑告知（NightActionPage 据此渲染告知卡）
    expect(isCerenovusNoticePending(info.seat, 1)).toBe(true);
  });

  it("①b 送达路径 B：角色完全没有任何夜间信息时退化为合成告知节点（信息不丢）", () => {
    const noNightSeats = buildSeats({
      role: { id: "no_night_skill", name: "无夜间技能", type: "townsfolk" },
      cerenovusMadnessRole: MADNESS_ROLE,
      cerenovusNoticeNight: 1,
    });
    const info = calculateNightInfoViaNewEngine(
      null,
      noNightSeats,
      MAD_SEAT,
      "night",
      null,
      1
    ) as any;
    expect(info).not.toBeNull();
    expect(info.seat.id).toBe(MAD_SEAT);
    expect(info.cerenovusNotice).toEqual({
      targetId: MAD_SEAT,
      roleName: MADNESS_ROLE,
    });
    expect(isCerenovusNoticeStep(info)).toBe(true);
  });

  it("② 洗脑师自己那一步不会被改写成告知节点", () => {
    const info = calculateNightInfoViaNewEngine(
      null,
      SEATS,
      CERENOVUS_SEAT,
      "night",
      null,
      1
    ) as any;
    expect(info).not.toBeNull();
    expect(info.seat.id).toBe(CERENOVUS_SEAT);
    expect(isCerenovusNoticeStep(info)).toBe(false);
  });

  it("③ 换夜后同一步骤不再产生告知节点（夜限生效）", () => {
    const info = calculateNightInfoViaNewEngine(
      null,
      SEATS,
      MAD_SEAT,
      "night",
      null,
      2
    ) as any;
    expect(isCerenovusNoticeStep(info)).toBe(false);
  });

  it("④ 合成节点玩家面文案不含任何行动者线索", () => {
    const info = buildCerenovusNoticeNightInfo(SEATS[MAD_SEAT], 1) as any;
    const playerFacing = String(info.playerFacingGuide ?? "");
    const storyteller = String(info.guide ?? "");
    for (const leak of ["洗脑师", "cerenovus", "11号"]) {
      expect(playerFacing).not.toContain(leak);
    }
    // 说书人侧（含队列步骤名）才允许出现"唤醒 N号"口径
    expect(storyteller).toContain("唤醒 3号：得知自己被洗脑");
  });
});
