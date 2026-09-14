import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry, poisonerAbility } from "../new_engine/abilityRegistry";
import { generateDynamicNightQueue } from "../../utils/dynamicQueueGenerator";
import { board, runRole } from "./_tbHarness";

/**
 * 投毒者 (Poisoner) —— 官方：
 * 【角色能力】每个夜晚，你要选择一名玩家：他在**当晚**和**明天白天**中毒。
 * 【角色简介】「中毒的玩家会失去能力，但说书人会装作他仍具有能力。」
 */
describe("投毒者 (Poisoner)", () => {
  initializeAbilityRegistry();

  const mk = () => board(["poisoner", "empath", "chef", "monk", "imp"]);

  it("⭐⭐ 被选中的玩家获得 poisoned 状态（来源标记为 poisoner）", async () => {
    const seats = mk();
    const res = await runRole(poisonerAbility, seats, 0, { targets: [1] });
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    const effects = target.statusEffects ?? [];
    expect(
      effects.some((e: any) => e.type === "poisoned"),
      "目标应带 poisoned 状态"
    ).toBe(true);
    expect(
      effects.some((e: any) => e.type === "poisoned" && e.source === "poisoner"),
      "毒源应标记为 poisoner（用于过期回收）"
    ).toBe(true);
  });

  it("只毒一个：其余玩家不被下毒", async () => {
    const res = await runRole(poisonerAbility, mk(), 0, { targets: [1] });
    for (const id of [2, 3, 4]) {
      const s = res.snapshot.seats.find((x: any) => x.id === id);
      expect(
        (s.statusEffects ?? []).some((e: any) => e.type === "poisoned"),
        `${id + 1}号不应被下毒`
      ).toBe(false);
    }
  });

  it("投毒者自己不会被自己的毒影响（除非另有人毒他）", async () => {
    const res = await runRole(poisonerAbility, mk(), 0, { targets: [1] });
    const self = res.snapshot.seats.find((s: any) => s.id === 0);
    expect(
      (self.statusEffects ?? []).some(
        (e: any) => e.type === "poisoned" && e.source === "poisoner"
      )
    ).toBe(false);
  });

  it("⭐ 毒效果带夜次元数据（appliedAtNight / expiresAtNight），供过期回收使用", async () => {
    // 引擎契约：同一目标**重复下毒不叠加**（先过滤掉旧的 poisoner 毒再加新的），
    // 并写明 `appliedAtNight` / `expiresAtNight`（毒到"明天白天"为止）。
    const seats = mk();
    seats[1].statusEffects = [
      { type: "poisoned", source: "poisoner", sourceSeatId: 0, expiresAtNight: 1 },
    ];
    const res = await runRole(poisonerAbility, seats, 0, {
      night: 2,
      targets: [1],
    });
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    const poisonEffects = (target.statusEffects ?? []).filter(
      (e: any) => e.type === "poisoned" && e.source === "poisoner"
    );
    expect(
      poisonEffects.length,
      "同一目标不应叠出两条 poisoner 毒（旧的应先被过滤）"
    ).toBe(1);
    expect(poisonEffects[0].appliedAtNight).toBe(2);
    expect(poisonEffects[0].expiresAtNight).toBe(3);

    // 换目标：新目标中毒
    const res2 = await runRole(poisonerAbility, mk(), 0, {
      night: 2,
      targets: [2],
    });
    expect(
      (res2.snapshot.seats.find((s: any) => s.id === 2).statusEffects ?? []).some(
        (e: any) => e.type === "poisoned"
      ),
      "本夜新目标应中毒"
    ).toBe(true);
  });

  it("⭐ 官方：说书人会装作中毒者仍有能力 → 中毒的共情者**仍被排进夜间队列**", () => {
    // 中毒 = 能力失效 + 信息为假，**不是**"不唤醒"。
    const seats = mk();
    seats[1].statusEffects = [{ type: "poisoned", source: "poisoner" }];
    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      {
        seats,
        gamePhase: "night",
        nightCount: 2,
        statusEffects: {},
        poppyGrowerDead: false,
        reminders: [],
        log: [],
      } as any,
      { isFirstNight: false }
    );
    const empathNodes = queue.filter(
      (n: any) => n.seatId === 1 && n.roleId === "empath"
    );
    expect(
      empathNodes.length,
      "中毒的共情者仍应被唤醒（说书人照常走流程）"
    ).toBe(1);
  });
});
