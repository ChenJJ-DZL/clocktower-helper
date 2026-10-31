/**
 * 官方范例可执行夹具 · 暗流涌动 · 判胜语义
 * ======================================================================
 * 每条夹具对应 1 条官方【范例】，断言经过生产判胜入口
 * `app/gameLogic.ts::checkGameEnd`（以及猎手用例的真实能力管道）。
 * 判胜结果必须同时校验 `winner` 与 `reasonCode`，避免"碰巧结束"的假绿。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { slayerAbility } from "../../../src/roles/new_engine/abilityRegistry";
import { applyExileDeath } from "../../../src/utils/exile";
import { ctx, ensureAbilityRegistry, judge, runAbility, seat } from "./_harness";

beforeAll(() => {
  ensureAbilityRegistry();
});

describe("暗流涌动 · 判胜语义官方范例", () => {
  // 官方范例: 圣徒 #0
  it("圣徒#0：圣徒被处决 ⇒ 游戏结束，邪恶阵营获胜", async () => {
    const seats = [
      seat(0, "saint", { isDead: true, executedToday: true }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
      seat(5, "empath"),
      seat(6, "monk"),
    ];
    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("SAINT_EXECUTED");
    expect(verdict.evidence?.executedSeatId).toBe(0);
  });

  // 官方范例: 圣徒 #1
  it("圣徒#1：圣徒死于枪手（非处决）⇒ 游戏继续", async () => {
    // 官方：小恶魔被提名、玩家投票时枪手杀死了参与投票的圣徒；
    // 圣徒死亡，但游戏继续（圣徒只在**死于处决**时触发落败）。
    const seats = [
      seat(0, "saint", { isDead: true }), // 死于枪手，非处决 ⇒ 无 executedToday
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
      seat(5, "empath"),
    ];
    expect(seats[0].executedToday).toBeUndefined();
    const verdict = judge(seats, "check_phase");
    expect(verdict.isGameOver, "非处决死亡的圣徒不应导致阵营落败").toBe(false);
    expect(verdict.winner).toBeNull();
  });

  // 官方范例: 猎手 #0
  it("猎手#0：猎手射中小恶魔 ⇒ 小恶魔死亡，善良阵营获胜", async () => {
    const seats = [
      seat(0, "slayer"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      slayerAbility,
      ctx(seats, 0, "slayer", { phase: "day", targets: [1] })
    );
    expect(res.aborted).toBe(false);
    const after = res.snapshot.seats as any[];
    expect(after[1].isDead, "恶魔必须死亡").toBe(true);
    const verdict = judge(after, "check_phase");
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
  });

  // 官方范例: 猎手 #1
  it("猎手#1：猎手射中被当作小恶魔的陌客 ⇒ 陌客死亡，但游戏继续", async () => {
    const seats = [
      seat(0, "slayer"),
      seat(1, "recluse", { registerAsEvil: true, registerAsDemon: true }),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "mayor"),
      seat(5, "soldier"),
    ];
    const res = await runAbility(
      slayerAbility,
      ctx(seats, 0, "slayer", { phase: "day", targets: [1] })
    );
    expect(res.aborted).toBe(false);
    const after = res.snapshot.seats as any[];
    expect(after[1].isDead, "被当作恶魔的陌客会被猎手杀死").toBe(true);
    const verdict = judge(after, "check_phase");
    expect(verdict.isGameOver, "真正的小恶魔仍存活 ⇒ 游戏继续").toBe(false);
  });

  // 官方范例: 小恶魔 #0
  it("小恶魔#0：小恶魔被处决 ⇒ 恶魔全灭，善良阵营获胜", async () => {
    const seats = [
      seat(0, "imp", { isDead: true, executedToday: true }),
      seat(1, "poisoner"),
      seat(2, "chef"),
      seat(3, "soldier"),
      seat(4, "mayor"),
    ];
    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
    expect(verdict.evidence?.livingDemonCount).toBe(0);
  });

  // 官方范例: 镇长 #1
  it("镇长#1：两名旅行者被流放后剩余玩家平票（无人被处决）⇒ 善良阵营获胜", async () => {
    // 官方：含两名旅行者在内共 5 名玩家存活；两名旅行者都被流放，
    // 剩余玩家处决投票打平 ⇒ 无人被处决 ⇒ 镇长「3 人存活 + 平安日」获胜。
    const initialSeats = [
      seat(0, "mayor"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "gunslinger"),
      seat(4, "bureaucrat"),
    ];
    // 流放走真实流放结算函数（旅行者离场：立即死亡，但**不是处决**）
    const afterFirstExile = applyExileDeath(initialSeats, 3, 2);
    const afterExiles = applyExileDeath(afterFirstExile.seats, 4, 2);
    expect(afterExiles.seats.filter((s: any) => !s.isDead)).toHaveLength(3);
    expect(
      afterExiles.seats.filter((s: any) => !s.isDead).map((s: any) => s.role.id)
    ).toEqual(["mayor", "imp", "chef"]);

    // 平安日（executedPlayerId === null）⇒ 镇长和平获胜
    const verdict = judge(afterExiles.seats, "check_phase");
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("MAYOR_PEACEFUL_WIN");
    expect(verdict.evidence?.aliveCount).toBe(3);
  });
});
