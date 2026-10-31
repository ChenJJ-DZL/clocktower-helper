/**
 * 官方范例可执行夹具 · 暗流涌动（表驱动批次）
 * ======================================================================
 * 用 `_oracle.ts` 的 runner 写「数据行 + 断言」，把每条官方【范例】压到 ~10 行。
 * 覆盖范围是本轮新编码的三条规则链：
 *   · 僧侣在场时的恶魔自杀（保护 ⇒ 不死亡、不传位）
 *   · 猎手射非恶魔（无事发生，且不误判终局）
 *   · 送葬者查被处决的间谍（登记为镇民 ⇒ 不得报出「间谍」）
 *
 * 仍不覆盖的（见 `known_deviations.test.ts` 的显式登记）：
 *   图书管理员把陌客当作非外来者、贞洁者被死者提名不消耗能力。
 */
import { describe, expect, it } from "vitest";
import { role } from "./_harness";
import { judge, runOracleCase, type OracleCase } from "./_oracle";

const cases: OracleCase[] = [
  {
    id: "僧侣#2", // 官方范例: 僧侣 #2
    roleId: "imp",
    official:
      "僧侣保护了小恶魔。小恶魔选择在当晚自杀，但无事发生。小恶魔仍然存活，并且也没有新的小恶魔被创造出来。",
    seats: [
      // 0 号带 `protected` 状态 = 僧侣前一晚已经保护了他（生产里由僧侣能力写入
      // `statusEffects[].type === "protected"`，见 imp.ability.ts 的 isProtected 判定）。
      [0, "imp", { statusEffects: [{ type: "protected" }] }],
      [1, "monk"],
      [2, "baron"],
      [3, "chef"],
      [4, "soldier"],
      [5, "mayor"],
    ],
    night: 2,
    targets: [0],
    check: ({ info, seats }) => {
      // 自伤声明成立（否则断言无意义：先证明"确实选了自杀"）
      expect(info?.isSuicide, "夹具前提：小恶魔确实选择了自杀").toBe(true);
      expect(
        seats[0]?.statusEffects?.some((effect: any) => effect.type === "protected"),
        "夹具前提：目标带着僧侣的保护状态"
      ).toBe(true);
      // 官方：被僧侣保护 ⇒ 什么都不发生
      expect(seats[0]?.isDead, "受保护的小恶魔不得死亡").not.toBe(true);
      expect(seats[0]?.markedForDeath, "受保护时不得落死亡标记").not.toBe(true);
      // 也不得传位（2 号仍是男爵，不应变成小恶魔）
      expect(seats[2]?.role?.id, "受保护的自杀不得触发传位").toBe("baron");
    },
  },
  {
    id: "猎手#2", // 官方范例: 猎手 #2
    roleId: "slayer",
    official: "小恶魔谎称自己是猎手。他对红唇女郎宣布使用了猎手的能力。无事发生。",
    phase: "day",
    seats: [
      [0, "slayer"],
      [1, "scarlet_woman"],
      [2, "imp"],
      [3, "chef"],
      [4, "soldier"],
      [5, "mayor"],
    ],
    targets: [1],
    check: ({ seats }) => {
      expect(seats[1]?.isDead, "红唇女郎不是恶魔 ⇒ 不得死亡").not.toBe(true);
      const verdict = judge(seats, "check_phase");
      expect(verdict.isGameOver, "无事发生 ⇒ 游戏继续").toBe(false);
    },
  },
  {
    id: "送葬者#2", // 官方范例: 送葬者 #2
    roleId: "undertaker",
    official:
      "间谍被处决。两名旅行者被流放。在当晚，送葬者被展示了管家标记，因为此时间谍被当作了管家，且流放并不是处决。",
    night: 2,
    seats: [
      [0, "undertaker"],
      [1, "spy", { isDead: true, executedToday: true }],
      [2, "imp"],
      [3, "chef"],
      [4, "soldier"],
    ],
    snapshot: { todayExecutedId: 1 },
    check: ({ info }) => {
      expect(info?.executedSeatId).toBe(1);
      // 官方：间谍被当作「某个镇民」展示，绝不能暴露「间谍」
      expect(info?.roleName, "不得把被处决的间谍报成【间谍】").not.toBe(
        role("spy").name
      );
      const reported = [role("chef").name, role("soldier").name, "管家"];
      expect(reported).toContain(info?.roleName);
    },
  },
];

describe("暗流涌动 · 官方范例（表驱动批次）", () => {
  for (const testCase of cases) {
    it(`${testCase.id}：${testCase.official ?? ""}`, async () => {
      const result = await runOracleCase(testCase);
      expect(result.res.aborted, `能力被中止：${result.res.abortReason}`).toBe(
        false
      );
      await testCase.check(result);
    });
  }
});
