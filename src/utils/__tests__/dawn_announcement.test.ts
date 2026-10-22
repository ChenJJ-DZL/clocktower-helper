import { describe, expect, it } from "vitest";
import {
  buildDawnAnnouncement,
  collectRevivedThisNight,
} from "../dawnAnnouncement";

/**
 * 黎明播报（死亡 + 复活）—— 唯一格式化入口的契约测试
 * ----------------------------------------------------------------------------
 * 官方依据：
 * · 沙巴洛斯【运作方式】：「在黎明时，在宣布哪些玩家死亡后，宣布哪些玩家复活了。
 *   （不要说明原因。）」
 * · 哈迪寂亚【运作方式】：「宣布黄昏时存活但黎明时死亡的玩家死亡，
 *   宣布黄昏时死亡但黎明时存活的玩家复活。」
 *
 * 本文件锁三件事：
 *   ① 四种组合的**逐字**文案（含「只有复活」时也要播「无人死亡」）；
 *   ② 脏输入（重复/乱序/null/负数/字符串数字）不炸、不重复、顺序稳定；
 *   ③ 复活判据必须走座位标记 `revivedAtNight`，**不能**用永久性的
 *      `statusEffects`（否则会把上一夜的复活重复播报）。
 */
describe("DawnAnnouncement · 黎明播报（官方：先死亡、后复活）", () => {
  it("无人死亡、无人复活 ⇒ 昨天是个平安夜", () => {
    expect(buildDawnAnnouncement({})).toBe("昨天是个平安夜");
    expect(buildDawnAnnouncement({ deadThisNight: [], revivedThisNight: [] })).toBe(
      "昨天是个平安夜"
    );
  });

  it("只有死亡 ⇒ 昨晚N号玩家死亡（与旧文案逐字一致，不得改动）", () => {
    expect(buildDawnAnnouncement({ deadThisNight: [0, 2] })).toBe(
      "昨晚1号、3号玩家死亡"
    );
  });

  it("只有复活 ⇒ 必须先播「昨晚无人死亡」，再播复活", () => {
    expect(buildDawnAnnouncement({ revivedThisNight: [4] })).toBe(
      "昨晚无人死亡；5号玩家复活"
    );
  });

  it("既有死亡又有复活 ⇒ 先死亡、后复活（官方顺序）", () => {
    expect(
      buildDawnAnnouncement({ deadThisNight: [1], revivedThisNight: [3, 5] })
    ).toBe("昨晚2号玩家死亡；4号、6号玩家复活");
  });

  it("不说明死因 / 不出现角色名 / 不出现阵营（官方「不要说明原因」）", () => {
    const msg = buildDawnAnnouncement({
      deadThisNight: [1],
      revivedThisNight: [2],
    });
    expect(msg).not.toMatch(/恶魔|爪牙|刺客|处决|毒|能力|善良|邪恶/);
  });

  it("脏输入归一：重复只报一次、乱序按座位升序、null/负数/非数字丢弃", () => {
    expect(
      buildDawnAnnouncement({
        deadThisNight: [3, 1, 3, null as any, undefined as any, -2],
        revivedThisNight: ["2" as any, 2, Number.NaN as any],
      })
    ).toBe("昨晚2号、4号玩家死亡；3号玩家复活");
  });

  it("非数组入参不抛错（快照恢复可能给出 undefined）", () => {
    expect(
      buildDawnAnnouncement({
        deadThisNight: undefined,
        revivedThisNight: null,
      })
    ).toBe("昨天是个平安夜");
  });
});

describe("DawnAnnouncement · collectRevivedThisNight（判据只能认 revivedAtNight）", () => {
  it("只认「本夜」打戳的复活，上一夜的复活不得重复播报", () => {
    const seats = [
      { id: 0, revivedAtNight: 2 },
      { id: 1, revivedAtNight: 3 },
      { id: 2 },
    ];
    expect(collectRevivedThisNight(seats, 3)).toEqual([1]);
    expect(collectRevivedThisNight(seats, 2)).toEqual([0]);
    expect(collectRevivedThisNight(seats, 9)).toEqual([]);
  });

  it("永久标记 statusEffects.resurrected 不得被当成「本夜复活」", () => {
    // 该座位上一夜复活过，statusEffects 里永久留着 resurrected，但本夜没复活
    const seats = [
      { id: 0, statusEffects: [{ type: "resurrected", source: "professor" }] },
    ];
    expect(collectRevivedThisNight(seats as any, 4)).toEqual([]);
  });

  it("空/脏输入不抛错", () => {
    expect(collectRevivedThisNight([], 1)).toEqual([]);
    expect(collectRevivedThisNight(null, 1)).toEqual([]);
    expect(collectRevivedThisNight(undefined, 1)).toEqual([]);
  });

  it("输出升序（播报顺序稳定，避免快照 diff 噪音）", () => {
    const seats = [
      { id: 5, revivedAtNight: 2 },
      { id: 1, revivedAtNight: 2 },
      { id: 3, revivedAtNight: 2 },
    ];
    expect(collectRevivedThisNight(seats, 2)).toEqual([1, 3, 5]);
  });
});
