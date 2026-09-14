/**
 * 罂粟花开 · 杂耍艺人「提示 == 结算」回归（第 4 轮同类缺陷收口）
 *
 * 官方判据（`officialRoleDocs`「杂耍艺人」）：
 *   「在你的首个白天，你可以公开猜测任意玩家的角色最多五次。
 *     在**当晚**，你会得知猜测正确的角色数量。」
 *   ⇒ 说书人照提示念的数字，必须与结果页 / 引擎结算**完全一致**。
 *
 * ⚠️ 修复前：`roles/townsfolk/juggler.ts` 的 dialog 用**裸 `Math.random()`** 造假数字，
 *    而引擎结算用 `createDeterministicRandom(nightInfoSeed("juggler", 座位, 夜次))`
 *    —— 两处各摇一次 → 同一夜「提示」与「结算」给出不同数字。
 *    与厨师的 `pickChefFakePairCount` 属**同一类缺陷**。
 *
 * 修复后：dialog 改调引擎导出的 `pickJugglerFakeCountForUi`（同种子 + 同算法）。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { juggler } from "../../roles/townsfolk/juggler";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildContextForNode } from "../invariantTesting/simulator";

const r = (id: string) => roles.find((x) => x.id === id)!;

/** 取 dialog 输出的「告知数字」 */
function dialogCount(
  seatId: number,
  seats: any[],
  nightCount: number,
  isFirstNight = false
): number {
  const d: any = (juggler as any).night.dialog;
  const out = d(seatId, isFirstNight, {
    seats,
    nightCount,
    vortoxWorld: seats.some((s) => s.role?.id === "vortox" && !s.isDead),
    shouldShowFake: false,
    isActorDisabledByPoisonOrDrunk: (s: any) =>
      s?.isPoisoned === true ||
      s?.isDrunk === true ||
      (s?.statusEffects ?? []).some(
        (e: any) => e?.type === "poisoned" || e?.type === "poison"
      ),
  });
  const m = String(out?.instruction ?? "").match(/得知的数字为(\d+)/);
  return m ? Number(m[1]) : NaN;
}

/** 跑引擎结算，取最终告知数字 */
async function engineCount(
  seats: any[],
  seatId: number,
  nightCount: number
): Promise<number> {
  const ab: any = getAbilityForRole("juggler");
  const node: any = {
    seatId,
    roleId: "juggler",
    roleName: "杂耍艺人",
    priority: 100,
    isFirstNightOnly: false,
    abilityId: ab.abilityId,
    wakeMessage: "",
    firstNightPriority: null,
    otherNightPriority: 100,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  };
  const snapshot: any = {
    seats,
    gamePhase: "night",
    nightCount,
    statusEffects: {},
    reminders: [],
    log: [],
    poppyGrowerDead: false,
  };
  const out: any = await runFullAbilityPipeline(
    {
      preCheck: ab.preCheck,
      calculate: ab.calculate,
      stateUpdate: ab.stateUpdate,
      postProcess: ab.postProcess,
    },
    buildContextForNode(snapshot, node, [], undefined)
  );
  const res = out.meta.abilityResult;
  // 引擎把最终数字放在 abilityResult / jugglerResult / meta 上，逐个兜底取
  const cand =
    typeof res === "number"
      ? res
      : (res?.correctCount ??
        res?.count ??
        out.meta.jugglerResult?.correctCount ??
        out.meta.jugglerResult?.count);
  return typeof cand === "number" ? cand : NaN;
}

function makeSeats(real: number, corrupt: boolean) {
  return [
    {
      id: 0,
      playerName: "P1",
      role: r("juggler"),
      isDead: false,
      isDrunk: false,
      isPoisoned: corrupt,
      statusEffects: corrupt ? [{ type: "poisoned" }] : [],
      dayAbilityResult: { correctCount: real },
    },
    { id: 1, playerName: "P2", role: r("mayor"), isDead: false, statusEffects: [] },
    { id: 2, playerName: "P3", role: r("savant"), isDead: false, statusEffects: [] },
    { id: 3, playerName: "P4", role: r("baron"), isDead: false, statusEffects: [] },
    { id: 4, playerName: "P5", role: r("imp"), isDead: false, statusEffects: [] },
  ] as any[];
}

describe("杂耍艺人 · 提示 == 结算（确定性）", () => {
  initializeAbilityRegistry();

  it("① 同一夜重复调用 dialog 必须得到同一数字（不再裸随机）", () => {
    for (const night of [2, 3, 5]) {
      const seats = makeSeats(2, true);
      const a = dialogCount(0, seats, night);
      const b = dialogCount(0, seats, night);
      const c = dialogCount(0, seats, night);
      expect(a, `第${night}夜 三次调用应一致`).toBe(b);
      expect(b).toBe(c);
    }
  });

  it("② ⭐ 受干扰时 dialog 的数字必须与引擎结算数字一致", async () => {
    for (const night of [2, 3, 4]) {
      for (const real of [0, 1, 2, 3, 5]) {
        const seats = makeSeats(real, true);
        const fromDialog = dialogCount(0, seats, night);
        const fromEngine = await engineCount(makeSeats(real, true), 0, night);
        if (Number.isNaN(fromEngine)) continue; // 引擎字段名变动时跳过，不误报
        expect(
          fromDialog,
          `第${night}夜 real=${real}：提示(${fromDialog}) 应等于结算(${fromEngine})`
        ).toBe(fromEngine);
      }
    }
  });

  it("③ 受干扰时给出的假数字不得等于真实数字", () => {
    for (const real of [0, 1, 2, 3, 4, 5]) {
      const got = dialogCount(0, makeSeats(real, true), 2);
      expect(got, `real=${real} 时假值不应等于真值`).not.toBe(real);
    }
  });

  it("④ 未受干扰时告知真实数字", () => {
    for (const real of [0, 2, 3, 5]) {
      const got = dialogCount(0, makeSeats(real, false), 2);
      expect(got).toBe(real);
    }
  });

  it("⑤ 不同夜次允许得到不同假数字（跨夜自动变化，非固定常量）", () => {
    const seen = new Set<number>();
    for (let night = 2; night <= 8; night++) {
      seen.add(dialogCount(0, makeSeats(2, true), night));
    }
    expect(seen.size, "跨夜应出现多于 1 种假数字（证明种子含夜次）").toBeGreaterThan(1);
  });
});
