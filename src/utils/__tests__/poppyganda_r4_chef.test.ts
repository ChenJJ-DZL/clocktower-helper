/**
 * 第4轮 厨师（chef）· 3 夜 × 6 状态矩阵 + 队列判定
 *
 * 与 `poppyganda_matrix_full.test.ts` 同源的保真要求（勿删注释）：
 *   1. adapter 是「给定座位就生成信息」，**不做夜晚排程校验** →
 *      必须用 `generateDynamicNightQueue` 判定「今晚是否唤醒」；
 *   2. 同伴位**绝不重复被测角色**；木偶/酒鬼**必带 charadeRole**；
 *   3. `poppyGrowerDead` 语义是「罂粟**刚死**」→ 常态一律 false，
 *      「罂粟在场」用**存活 poppy_grower 座位**表达；
 *   4. 基线恶魔用 imp（**不用 vortox**，否则全体镇民被污染）。
 * 座位对外一律「N号」= seat.id + 1。
 */
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { parseInfoResult } from "../infoResultParser";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;
const POPPY = scripts.find((s) => s.id === "poppyganda")!;

type StateName =
  | "常态"
  | "中毒"
  | "酒鬼伪装"
  | "提线木偶伪装"
  | "涡流世界"
  | "罂粟种植者在场";

const STATES: StateName[] = [
  "常态", "中毒", "酒鬼伪装", "提线木偶伪装", "涡流世界", "罂粟种植者在场",
];

/** 被测角色固定占 seat0；同伴错开且不含 chef */
const LAYOUT = ["chef", "baron", "imp", "mayor", "snitch", "mutant"] as const;

function buildSeats(state: StateName): any[] {
  const seats: any[] = LAYOUT.map((rid, i) => ({
    id: i,
    playerName: `P${i + 1}`,
    role: r(rid),
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));
  switch (state) {
    case "中毒":
      seats[0].statusEffects = [{ type: "poisoned", source: "pukka" }];
      break;
    case "酒鬼伪装":
      seats[0].role = r("drunk");
      seats[0].charadeRole = r("chef");
      break;
    case "提线木偶伪装":
      seats[0].role = r("marionette");
      seats[0].charadeRole = r("chef");
      break;
    case "涡流世界": {
      const d = seats.find((s) => s.role.type === "demon");
      if (d) d.role = r("vortox");
      break;
    }
    case "罂粟种植者在场":
      seats.push({
        id: seats.length,
        playerName: "P7",
        role: r("poppy_grower"),
        isDead: false,
        isAlive: true,
        statusEffects: [],
      });
      break;
  }
  return seats;
}

function makeSnapshot(seats: any[], night: number) {
  return {
    seats,
    gamePhase: night === 1 ? "firstNight" : "night",
    nightCount: night,
    statusEffects: {},
    poppyGrowerDead: false,
    reminders: [],
    log: [],
  } as any;
}

function queueFor(seats: any[], night: number): string[] {
  try {
    const q = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      makeSnapshot(seats, night),
      { isFirstNight: night === 1 }
    );
    return q.filter((n: any) => n.seatId === 0).map((n: any) => n.roleId);
  } catch {
    return [];
  }
}

function infoFor(seats: any[], night: number, state: StateName) {
  const info: any = calculateNightInfoViaNewEngine(
    POPPY as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night,
    undefined, undefined, undefined, undefined,
    state === "罂粟种植者在场",
    undefined, undefined, undefined,
    [], undefined, undefined, undefined,
    state === "涡流世界",
    false, false, null,
    undefined, undefined, undefined
  );
  const parsed = parseInfoResult(String(info?.guide ?? ""), "1号-厨师");
  return {
    guide: String(info?.guide ?? ""),
    speak: String(info?.speak ?? ""),
    action: String(info?.action ?? ""),
    playerFacingGuide: String(info?.playerFacingGuide ?? ""),
    storytellerNote: String(info?.storytellerNote ?? ""),
    targetLimit: info?.targetLimit ?? null,
    prefix: parsed.prefix,
    result: parsed.result,
  };
}

const numIn = (t: string) => {
  const m = t.match(/有\s*(\d+)\s*对/);
  return m ? Number(m[1]) : NaN;
};

/** 真值：seats 0 chef(善) / 1 baron(恶) / 2 imp(恶) / 3-5 善 → 1 对 */
const TRUTH = 1;

describe("R4 厨师 · 3夜 × 6状态矩阵", () => {
  initializeAbilityRegistry();

  it("队列：仅首夜有自身能力节点（官方「在你的首个夜晚」）", () => {
    for (const state of STATES) {
      const seats = buildSeats(state);
      const n1 = queueFor(seats, 1);
      const n2 = queueFor(seats, 2);
      const n3 = queueFor(seats, 3);
      // ⚠️ 酒鬼/提线木偶伪装的 role 不是 chef，唤醒队列按「自以为是」的角色排，
      //    但其 charadeRole=chef → 仍应在首夜被唤醒（官方：视同醉酒运作，仍会被唤醒）。
      if (state === "酒鬼伪装" || state === "提线木偶伪装") {
        expect(n1, `${state} 首夜应被唤醒`).toContain("chef");
      } else {
        expect(n1, `${state} 首夜应唤醒厨师`).toContain("chef");
      }
      expect(n2, `${state} 第2夜不应有 chef 节点`).not.toContain("chef");
      expect(n3, `${state} 第3夜不应有 chef 节点`).not.toContain("chef");
    }
  });

  it("第 2/3 夜：官方「仅首个夜晚」→ 无厨师信息产出", () => {
    for (const state of STATES) {
      for (const night of [2, 3]) {
        const seats = buildSeats(state);
        if (!queueFor(seats, night).includes("chef")) {
          // 队列未排程即视为不唤醒（adapter 不做排程校验，不能拿它的输出当依据）
          expect(true).toBe(true);
          continue;
        }
        // 万一被唤醒，guide 不得是厨师信息
        const info = infoFor(seats, night, state);
        expect(numIn(info.guide), `${state} 第${night}夜不应产出对数`).toBeNaN();
      }
    }
  });

  it("3 夜 × 6 状态：无 undefined / NaN / 规则泄漏 / 目标数异常", () => {
    for (let night = 1; night <= 3; night++) {
      for (const state of STATES) {
        const seats = buildSeats(state);
        const woken = queueFor(seats, night).includes("chef");
        if (!woken) continue;
        const info = infoFor(seats, night, state);
        for (const t of [
          info.guide, info.speak, info.action,
          info.playerFacingGuide, info.storytellerNote,
        ]) {
          expect(t, `${state}/第${night}夜 undefined`).not.toMatch(/undefined/);
          expect(t, `${state}/第${night}夜 NaN`).not.toMatch(/NaN/);
          expect(t, `${state}/第${night}夜 [object`).not.toMatch(/\[object/);
        }
        // 纯信息角色，不选目标
        expect(info.targetLimit?.min ?? 0).toBe(0);
        expect(info.targetLimit?.max ?? 0).toBe(0);
      }
    }
  });

  it("首夜各状态：常态/罂粟在场 = 真值；受干扰 = 假值 ≠ 真值", () => {
    const rows: Array<[StateName, number, number]> = [];
    for (const state of STATES) {
      const seats = buildSeats(state);
      const info = infoFor(seats, 1, state);
      const n = numIn(info.guide);
      rows.push([state, n, numIn(info.playerFacingGuide)]);
      expect(n, `${state} 首夜应输出对数`).not.toBeNaN();
      const disturbed =
        state === "中毒" || state === "酒鬼伪装" ||
        state === "提线木偶伪装" || state === "涡流世界";
      if (disturbed) {
        // 官方：醉酒/中毒/涡流 → 错误信息
        expect(n, `${state} 应给假值（真值 ${TRUTH}）`).not.toBe(TRUTH);
      } else {
        expect(n, `${state} 应给真值`).toBe(TRUTH);
      }
    }
    console.log("\n=== 首夜各状态（guide 数字 / playerFacingGuide 数字）===");
    for (const [s, a, b] of rows) console.log(`  ${s.padEnd(8)} guide=${a}  玩家面=${b}`);
  });

  it("罂粟种植者在场**不影响**厨师（罂粟削弱的是邪恶互认，与厨师无关）", () => {
    const withPoppy = numIn(infoFor(buildSeats("罂粟种植者在场"), 1, "罂粟种植者在场").guide);
    const without = numIn(infoFor(buildSeats("常态"), 1, "常态").guide);
    // 多一名活着的善良（罂粟种植者）不改变邪恶相邻对数
    expect(withPoppy).toBe(without);
  });

  it("涡流世界：官方「镇民能力都产生错误信息」→ 厨师必给假值", () => {
    const n = numIn(infoFor(buildSeats("涡流世界"), 1, "涡流世界").guide);
    expect(n).not.toBe(TRUTH);
  });

  it("提示预演 == 结算（沿用缺陷回归 R4 的口径，矩阵内再复核一次）", () => {
    for (const state of STATES) {
      const seats = buildSeats(state);
      const g = numIn(infoFor(seats, 1, state).guide);
      if (g === TRUTH && state !== "常态" && state !== "罂粟种植者在场") {
        throw new Error(`${state} 提示给出真值，疑似泄漏`);
      }
    }
  });
});
