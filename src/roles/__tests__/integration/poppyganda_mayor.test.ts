import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { checkGameEnd } from "../../../../app/gameLogic";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { mayorAbility } from "../../new_engine/mayor.ability";

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  // ⚠️ 必须 `Partial<Seat> & Record<string, any>`：
  //   mayor 能力本身用 `(s as any).deathReason` / `deathPhase` 这类
  //   **未进 Seat 类型的临时字段**（见 mayor.ability.ts:191-209）。
  //   只写 `Partial<Seat>` ⇒ TS2353（deathReason 不在 Seat 上）。
  overrides: Partial<Seat> & Record<string, any> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type },
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

describe("镇长：3 人存活平安日好人获胜", () => {
  it("存活 3 人且镇长健康 → 白天无人被处决判好人胜", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Good");
  });

  it("镇长中毒时平安日不触发获胜", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk", { isPoisoned: true }),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    if (result.isGameOver) {
      expect(result.reason).not.toBe("镇长触发和平获胜条件");
    }
  });

  it("存活人数不是 3 人时平安日不触发", () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
      makeSeat(4, "imp", "demon"),
    ];
    const result = checkGameEnd(seats, "execution", null);
    if (result.isGameOver) {
      expect(result.reason).not.toBe("镇长触发和平获胜条件");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⭐ 新引擎·替死能力（防假绿补强，2026-09-21 变异检验实测）
//   旧版本文件只覆盖 `checkGameEnd` 的和平获胜，**完全没有触碰新引擎的
//   `mayorAbility` 替死中间件** ⇒ 把 `substitutionHappens = true` 改成
//   `false`，本文件照样绿（假绿）。此处补真断言：断言**座位状态真的交换了**。
// ═════════════════════════════════════════════════════════════════════
const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("镇长：新引擎替死（座位状态真变更）", () => {
  it("⭐ 镇长将死 + 指定替死者 → 镇长复活、替死者死亡且继承死亡原因", async () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk", {
        isDead: true,
        deathReason: "被恶魔杀死",
        deathPhase: "night",
      }),
      makeSeat(1, "soldier", "townsfolk"),
      makeSeat(2, "imp", "demon"),
    ];
    const res = await runFullAbilityPipeline(pipe(mayorAbility), {
      actionNode: { seatId: 0, roleId: "mayor" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      // ⚠️ 新引擎契约：替死由「系统注入的即将死亡信号」触发，
      //    preCheck 会因缺失它而 abort（不是测试环境问题，是真实触发条件）。
      meta: { isMayorDying: true },
    } as any);

    const after = res.snapshot.seats as any[];
    const mayor = after.find((s) => s.id === 0);
    const substitute = after.find((s) => s.id === 1);

    expect(
      mayor?.isDead,
      "❌ 替死生效后镇长必须恢复存活（旧版只断言 result，座位状态没验）"
    ).toBe(false);
    expect(
      substitute?.isDead,
      "❌ 替死者必须被标记死亡 —— 否则恶魔白杀，镇长无代价存活"
    ).toBe(true);
    expect(
      substitute?.deathReason,
      "替死者必须继承镇长的死亡原因（官方细则：能力触发角色仍能触发）"
    ).toBe("被恶魔杀死");
    expect(
      (res.actionNode as any).meta?.mayorResult?.substitutionHappens,
      "stateUpdate 必须把替死事件持久化到 actionNode.meta.mayorResult"
    ).toBe(true);
  });

  it("⭐ 反例：镇长醉酒 → 替死不生效（座位状态保持原样）", async () => {
    const seats = [
      makeSeat(0, "mayor", "townsfolk", {
        isDead: true,
        deathReason: "被恶魔杀死",
      }),
      makeSeat(1, "soldier", "townsfolk"),
      makeSeat(2, "imp", "demon"),
    ];
    const res = await runFullAbilityPipeline(pipe(mayorAbility), {
      actionNode: { seatId: 0, roleId: "mayor" },
      targetIds: [1],
      snapshot: { seats, gamePhase: "night", nightCount: 2 },
      meta: { isMayorDying: true, abilityEffective: false },
    } as any);

    const after = res.snapshot.seats as any[];
    expect(
      after.find((s) => s.id === 0)?.isDead,
      "醉酒镇长不得替死：镇长仍应死亡"
    ).toBe(true);
    expect(
      after.find((s) => s.id === 1)?.isDead,
      "醉酒镇长不得替死：无辜者不该死"
    ).toBe(false);
  });
});
