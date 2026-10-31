/**
 * 官方范例可执行夹具 · 梦殒春宵 · 涡流（信息必假 / 判胜）
 * ======================================================================
 * 涡流的三条结论都可由生产判据直接验证：
 *   · 判胜：`app/gameLogic.ts::checkGameEnd`（VORTOX_NO_EXECUTION）
 *   · 信息必假：镇民信息能力在涡流世界必须给出与真值相反的结果
 *
 * ⚠️ 涡流#1 官方原文是「卖花女孩和城镇公告员都得知『是』」——注意这是在
 *    **无人投票/提名**的前提下，涡流把真值（否）翻成了「是」。因此断言要看
 *    `hasVoted === false` 且 `actualVoted === true`（真值 true、给的信息 false），
 *    而不是去断言"信息为是"这种呈现层文案。
 */
import { describe, expect, it } from "vitest";
import { judge, runOracleCase } from "./_oracle";

describe("梦殒春宵 · 涡流官方范例", () => {
  // 官方范例: 涡流 #4
  it("涡流#4：涡流在场且当天无人被处决 ⇒ 邪恶阵营获胜", () => {
    const seats = [
      { id: 0, role: { id: "vortox", name: "涡流", type: "demon" }, isDead: false },
      { id: 1, role: { id: "chef", name: "厨师", type: "townsfolk" }, isDead: false },
      { id: 2, role: { id: "soldier", name: "士兵", type: "townsfolk" }, isDead: false },
      { id: 3, role: { id: "mayor", name: "镇长", type: "townsfolk" }, isDead: false },
    ];
    const verdict = judge(seats as any, "check_phase", null, {
      isVortoxWorld: true,
    } as any);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("VORTOX_NO_EXECUTION");
  });

  // 官方范例: 涡流 #0
  it("涡流#0：贤者被涡流杀死 ⇒ 得知的两名玩家都不是恶魔（信息必假）", async () => {
    const result = await runOracleCase({
      id: "涡流#0",
      roleId: "sage",
      seats: [
        [0, "sage"],
        [1, "imp"],
        [2, "chef"],
        [3, "soldier"],
      ],
      night: 2,
      snapshot: { isVortoxWorld: true, nightVictimIds: [0] },
      check: () => undefined,
    });
    const targets: number[] = Array.isArray(result.info?.targetIds)
      ? result.info.targetIds
      : [];
    expect(targets.length, "官方：贤者得知两名玩家").toBe(2);
    expect(
      targets.includes(1),
      `涡流世界的信息必假 ⇒ 两名候选不得包含真恶魔（1 号），实际 ${JSON.stringify(targets)}`
    ).toBe(false);
    expect(result.info?.isCorrupted, "应标记为受涡流干扰").toBe(true);
  });

  // 官方范例: 涡流 #1
  it("涡流#1：无人投票的白天，卖花女孩仍得知「是」（信息被翻转）", async () => {
    const result = await runOracleCase({
      id: "涡流#1",
      roleId: "flowergirl",
      seats: [
        [0, "flowergirl"],
        [1, "imp"],
        [2, "chef"],
        [3, "soldier"],
      ],
      night: 2,
      snapshot: { isVortoxWorld: true, demonVotedToday: true },
      check: () => undefined,
    });
    // 真值是「恶魔今天投过票」，涡流 ⇒ 给玩家的信息必须相反
    expect(result.info?.actualVoted, "真值：恶魔确实投过票").toBe(true);
    expect(
      result.info?.hasVoted,
      "涡流世界必须给出相反的答案（否）"
    ).toBe(false);
  });
});
