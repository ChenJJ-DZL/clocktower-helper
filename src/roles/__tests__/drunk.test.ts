import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { drunkAbility, initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { generateDynamicNightQueue } from "../../utils/dynamicQueueGenerator";
import { board, r, runRole } from "./_tbHarness";

/**
 * 酒鬼 (Drunk) —— 官方：
 * 【角色能力】你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。
 * 【角色简介】「酒鬼以为自己是镇民，且对自己实际上是酒鬼一事毫不知情。」
 * → 机制：拿到一个**伪装镇民角色（charadeRole）**，永久醉酒，
 *   能力不生效、所获信息为假，但说书人照常唤醒走流程。
 */
describe("酒鬼 (Drunk)", () => {
  initializeAbilityRegistry();

  it("官方：真值是**外来者**，伪装是镇民", () => {
    expect(r("drunk").type, "酒鬼本身是外来者").toBe("outsider");
    expect(r("soldier").type).toBe("townsfolk");
  });

  it("⭐⭐ 首夜设置：写入永久醉酒 + 伪装角色必须是**在场镇民**", async () => {
    // 官方：「会有一个镇民的角色标记放进盲抽袋中，且抽到该角色标记的玩家会在
    //   整场游戏中秘密地成为酒鬼。」→ 伪装角色是**在场镇民**，不是凭空捏的。
    const seats = board(["drunk", "empath", "chef", "imp"]);
    const res = await runRole(drunkAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      meta: {},
    });
    expect(res.aborted, "不应被 preCheck 中止").toBe(false);
    expect(res.meta.drunkSetupApplied).toBe(true);

    const self = res.snapshot.seats.find((s: any) => s.id === 0);
    const effects = self.statusEffects ?? [];
    expect(
      effects.some((e: any) => e.type === "drunk" && e.source === "drunk"),
      "应写入 source=drunk 的永久醉酒（能力失效的判据）"
    ).toBe(true);
    expect(self.fakeRole?.type, "伪装角色必须是镇民").toBe("townsfolk");
    expect(
      ["empath", "chef"],
      `伪装角色应是在场镇民，实际 ${self.fakeRole?.id}`
    ).toContain(self.fakeRole?.id);
  });

  it("⭐ 伪装角色是**确定性**的：同一夜重复计算必须挑中同一个镇民（提示预演 == 结算）", async () => {
    const seats = board(["drunk", "empath", "chef", "imp"]);
    const run = () =>
      runRole(drunkAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        meta: {},
      });
    const a = await run();
    const b = await run();
    expect(a.snapshot.seats.find((s: any) => s.id === 0).fakeRole?.id).toBe(
      b.snapshot.seats.find((s: any) => s.id === 0).fakeRole?.id
    );
  });

  it("⭐ 酒鬼没有任何自身夜间能力 → 三个夜晚都不进队列（他的「能力」实际由伪装角色的适配器给出假信息）", () => {
    const seats = board(["drunk", "empath", "imp"]);
    seats[0].charadeRole = r("soldier");
    for (const night of [1, 2, 3]) {
      const q = generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        {
          seats,
          gamePhase: night === 1 ? "firstNight" : "night",
          nightCount: night,
          statusEffects: {},
          poppyGrowerDead: false,
          reminders: [],
          log: [],
        } as any,
        { isFirstNight: night === 1 }
      ).filter((n: any) => n.seatId === 0);
      expect(
        q.map((n: any) => n.roleId),
        `酒鬼 第${night}夜 不应有自身能力节点`
      ).not.toContain("drunk");
    }
  });
});
