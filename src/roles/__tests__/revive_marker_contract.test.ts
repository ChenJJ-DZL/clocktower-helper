import { describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";

/** roleId → ability（`buildAbilityMap()` 的 key 是 abilityId，须按 roleId 反查） */
const BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

/**
 * 🌅 复活打戳契约：`Seat.revivedAtNight`
 * ----------------------------------------------------------------------------
 * 官方依据：
 * · 沙巴洛斯【运作方式】：「在黎明时，在宣布哪些玩家死亡后，宣布哪些玩家复活了。
 *   （不要说明原因。）」
 * · 哈迪寂亚【运作方式】：「宣布黄昏时死亡但黎明时存活的玩家复活。」
 * · 教授【角色能力】：「…如果他是镇民，你会将他起死回生。」
 *
 * 判据链：
 *   复活写入方（教授 / 沙巴洛斯反刍 / 哈迪寂亚「生」）在座位上打 `revivedAtNight = nightCount`
 *   → 黎明时 `utils/dawnAnnouncement::collectRevivedThisNight` 只收「本夜」的
 *   → `buildDawnAnnouncement` 拼出「昨晚N号玩家死亡；M号玩家复活」。
 *
 * ❌ 反例锁死：**不能**用 `statusEffects.resurrected` 当判据 —— 那是永久记录，
 *    会把上一夜的复活在之后的每个黎明重复播报（本文件最后一条用例专门抓这个）。
 */
function seatOf(ctx: any, id: number) {
  return (ctx.snapshot.seats as any[]).find((s) => s.id === id);
}

describe("revivedAtNight · 复活必须打本夜戳", () => {
  it("教授复活镇民 ⇒ 目标座位 revivedAtNight === 当前夜", async () => {
    const seats = board([
      "professor",
      "soldier",
      "poisoner",
      "imp",
      "chef",
      "butler",
    ]) as any[];
    seats[1].isDead = true;

    const ctx = await runRole(BY_ROLE.professor, seats, 0, {
      night: 2,
      targets: [1],
    });

    const target = seatOf(ctx, 1);
    expect(target.isDead, "教授应复活目标").toBe(false);
    expect(
      target.revivedAtNight,
      "复活必须写 revivedAtNight（黎明播报的唯一判据）"
    ).toBe(2);
  });

  it("教授复活失败（目标是爪牙）⇒ 不得留下复活戳", async () => {
    const seats = board([
      "professor",
      "soldier",
      "poisoner",
      "imp",
      "chef",
      "butler",
    ]) as any[];
    seats[2].isDead = true; // 爪牙

    const ctx = await runRole(BY_ROLE.professor, seats, 0, {
      night: 2,
      targets: [2],
    });

    const target = seatOf(ctx, 2);
    expect(target.isDead, "爪牙不得被复活").toBe(true);
    expect(target.revivedAtNight, "未复活不得打戳").toBeUndefined();
  });

  it("沙巴洛斯反刍 ⇒ 被反刍者 revivedAtNight === 当前夜", async () => {
    const seats = board([
      "shabaloth",
      "soldier",
      "chef",
      "butler",
      "poisoner",
      "imp",
    ]) as any[];
    // 3 号上一夜被吃掉，本夜反刍
    seats[2].isDead = true;
    seats[2].diedAtNight = 1;

    const ctx = await runRole(BY_ROLE.shabaloth, seats, 0, {
      night: 2,
      // 沙巴洛斯「每个夜晚*，选择两名玩家：他们死亡」
      targets: [1, 3],
      storytellerInput: { regurgitatedSeatId: 2 },
    });

    const target = seatOf(ctx, 2);
    expect(target.isDead, "反刍目标必须复活").toBe(false);
    expect(
      target.revivedAtNight,
      "反刍也必须写 revivedAtNight（官方：黎明宣布谁复活了）"
    ).toBe(2);
  });

  it("永久标记 resurrected ≠ 本夜复活：收集器不得把它算进本夜", async () => {
    // 该座位上一夜复活过，statusEffects 永久留着 resurrected，本夜没复活
    const seats = [
      {
        id: 0,
        statusEffects: [{ type: "resurrected", source: "professor" }],
        revivedAtNight: 1,
      },
    ];
    const { collectRevivedThisNight } = await import(
      "../../utils/dawnAnnouncement"
    );
    expect(
      collectRevivedThisNight(seats as any, 2),
      "上一夜的复活不得在本夜重复播报"
    ).toEqual([]);
    expect(collectRevivedThisNight(seats as any, 1)).toEqual([0]);
  });
});
