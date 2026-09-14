import { describe, expect, it } from "vitest";
import { initializeAbilityRegistry, slayerAbility } from "../new_engine/abilityRegistry";
import { board, runRole } from "./_tbHarness";

/**
 * 猎手 (Slayer) —— 官方：
 * 【角色能力】每局游戏**限一次**，你可以在**白天**时公开选择一名玩家：
 *   如果他是**恶魔**，他死亡。
 * 【角色简介】「猎手只有一次机会，无论是否成功。」
 * 范例（官方）：「猎手对陌客使用了自己的能力。说书人决定让陌客被当作小恶魔，
 *   因此陌客死亡。猎手认为他刚刚杀死了小恶魔。」
 */
describe("猎手 (Slayer)", () => {
  initializeAbilityRegistry();

  const mk = (targetRole: string) =>
    board(["slayer", targetRole, "empath", "baron", "chef"]);

  /**
   * ⚠️ 引擎契约（`slayer.ability.ts` handleSlayerKill）：
   *    命中恶魔时把目标置 `isDead: true,` + `deathReason: "被猎手杀死"`，
   *    并把快照 `gamePhase` 置为 `"gameOver"` / `gameResult.winner = "good"`。
   *    它**不**写 `isDead`（旧层字段，由缝合处同步）。
   */
  const killed = (res: any, seatId: number) => {
    const s = res.snapshot.seats.find((x: any) => x.id === seatId);
    return s.isDead === true;
  };

  it("⭐⭐ 目标是小恶魔 → 被击杀，且游戏立即结束、善良获胜", async () => {
    const res = await runRole(slayerAbility, mk("imp"), 0, {
      phase: "day",
      targets: [1],
    });
    expect(killed(res, 1), "恶魔应被猎手射杀").toBe(true);
    expect(res.snapshot.gamePhase).toBe("gameOver");
    expect(res.snapshot.gameResult?.winner).toBe("good");
    expect(
      res.snapshot.seats.find((s: any) => s.id === 1).deathReason
    ).toContain("猎手");
  });

  it("⭐⭐ 目标是镇民 → 不死亡、游戏继续（官方：只有恶魔才死）", async () => {
    const res = await runRole(slayerAbility, mk("empath"), 0, {
      phase: "day",
      targets: [1],
    });
    expect(killed(res, 1), "镇民不应被猎手射杀").toBe(false);
    expect(res.snapshot.gamePhase, "误杀镇民不应结束游戏").not.toBe("gameOver");
  });

  it("⭐ 官方范例：目标是**陌客** → 默认登记为恶魔 → 被击杀", async () => {
    const res = await runRole(slayerAbility, mk("recluse"), 0, {
      phase: "day",
      targets: [1],
    });
    expect(res.snapshot.seats.find((s: any) => s.id === 1).role?.id).toBe(
      "recluse"
    );
    expect(killed(res, 1), "官方范例：陌客被当作小恶魔，因此死亡").toBe(true);
  });

  it("⭐ 目标是**间谍** → 默认登记为善良 → 不被击杀", async () => {
    const res = await runRole(slayerAbility, mk("spy"), 0, {
      phase: "day",
      targets: [1],
    });
    expect(killed(res, 1), "间谍登记为善良，不应被射杀").toBe(false);
  });

  it("⭐ 每局限一次：已使用过的猎手不再生效", async () => {
    const seats = mk("imp");
    seats[0].hasUsedSlayerAbility = true;
    seats[0].abilityUsed = true;
    const res = await runRole(slayerAbility, seats, 0, {
      phase: "day",
      targets: [1],
    });
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(
      res.aborted || !(target.isDead === true),
      "已用完的猎手不应再杀人"
    ).toBe(true);
  });

  it("中毒 / 醉酒的猎手 → 能力不生效，恶魔不死", async () => {
    const seats = mk("imp");
    seats[0].statusEffects = [{ type: "poisoned", source: "poisoner" }];
    const res = await runRole(slayerAbility, seats, 0, {
      phase: "day",
      targets: [1],
    });
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(
      target.isDead === true,
      "中毒猎手不应杀死恶魔"
    ).toBe(false);
  });
});
