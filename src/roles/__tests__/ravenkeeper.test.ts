import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { board, queueFor } from "./_tbHarness";

/**
 * 守鸦人 (Ravenkeeper) —— 官方：
 * 【角色能力】如果你在**夜晚死亡**，你会被唤醒，然后你要选择一名玩家：
 *   你会得知他的角色。
 * 【角色简介】「守鸦人仅当在夜晚死去时，才能得知任意玩家的角色。」
 *   「如果他愿意，他可以选择一名已死亡的玩家。」
 *
 * ⚠️ 入队机制（重要，别断言错层）：
 *   · 排程元数据里 `deathTriggered = true`（来自能力的 ON_DEATH 声明）是"武装"；
 *   · 但**队列生成器本身不生成他的节点** —— 生产是恶魔击杀之后由
 *     `enqueueDeathTriggeredIfNeeded`（useGameController.ts）把座位**插到当前行动节点之后**。
 *   ⇒ 断言"队列应唤醒守鸦人"属断言错层（见 skill「剧本全量测试」§2.2 陷阱 9）。
 */
describe("守鸦人 (Ravenkeeper)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["ravenkeeper", "empath", "chef", "imp", "poisoner"]);

  it("⭐ 死亡触发已武装：夜序条目 deathTriggered = true（来自 ON_DEATH）", () => {
    const entry = (ENGINE_CONFIG.fullNightOrder as any[]).find(
      (e) => e.roleId === "ravenkeeper"
    );
    expect(entry, "夜序表缺少守鸦人条目").toBeDefined();
    expect(
      entry.deathTriggered,
      "未武装 deathTriggered → 击杀后专用入队路径的前提失效"
    ).toBe(true);
  });

  it("⭐⭐ 存活时三个夜晚都不入队（官方：仅夜死才唤醒）", () => {
    const seats = mk();
    for (const night of [1, 2, 3]) {
      expect(
        queueFor(seats, 0, night),
        `存活 第${night}夜 不应被唤醒`
      ).not.toContain("ravenkeeper");
    }
  });

  it("⭐⭐ 即便本人当晚已死，队列生成器也不产出其节点（入队由击杀后专用路径注入）", () => {
    const seats = mk();
    seats[0] = { ...seats[0], isDead: true, };
    for (const night of [2, 3]) {
      expect(
        queueFor(seats, 0, night, { deadThisNight: [0] }),
        `第${night}夜：队列生成器不负责守鸦人入队（这是设计如此）`
      ).not.toContain("ravenkeeper");
    }
  });

  it("⭐ 首夜的夜序表中没有守鸦人条目（官方「如果你在夜晚死亡」不等同首夜行动）", () => {
    const entry = (ENGINE_CONFIG.fullNightOrder as any[]).find(
      (e) => e.roleId === "ravenkeeper"
    );
    expect(entry.firstNightPriority ?? 0).toBe(0);
    expect(entry.otherNightPriority ?? 0).toBeGreaterThan(0);
  });
});
