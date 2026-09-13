import { describe, expect, it } from "vitest";
import { roles as allRoles } from "../../../app/data";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildCorruptedInfoMask } from "../corruptedInfo";
import {
  chefAbility,
  pickChefFakePairCount,
} from "../../roles/new_engine/chef.ability";

/**
 * ══ 第4轮 厨师（chef） · 缺陷回归固化（2026-09-13）══
 *
 * 本轮修掉 3 个 P1，全部围绕**同一根因**：厨师的「受干扰假数字」被三处各造一遍，
 * 彼此种子/候选池不同 → 说书人照提示念的数字，与结果弹窗、玩家页**三方对不上**。
 *
 *  D1 提示预演 ≠ 引擎结算
 *     `roles/townsfolk/chef.ts` 的 dialog 自带一份「跳过厨师自身相邻对」的计算，
 *     且假数字用**裸 `Math.random()`**；引擎 `chef.ability.ts::calculateResult`
 *     用 `createDeterministicRandom`。实测 3/3 MISMATCH（guide 2 / settle 1）。
 *
 *  D2 受干扰时**泄漏真值**（确定性，不是偶发）
 *     `calculateResult` 动态分支把 `realCount` 传 `null` → 假值候选池不排除真值，
 *     在固定种子下恒定命中同一个数；一旦它恰好等于真值，中毒/醉酒玩家被直接
 *     告知真值。实测 6 座位/1 号位/首夜：真值 1 时假值恒为 1。
 *
 *  D3 玩家结果页 ≠ 提示预演（二次随机）
 *     `useNightActionHandler` 把**引擎已算好的假值**当 `trueValue` 喂给脱敏层
 *     `buildCorruptedInfoMask`，而脱敏层语义是「排除传入值」→ 再排除一次 →
 *     又换一个数。修法：引擎额外暴露真值 `meta.abilityResultTrue`，
 *     脱敏层以**真值**为排除口径 → 复现出同一枚假值。
 *
 * 官方判据（`src/data/officialRoleDocs.json` → 「厨师」）
 *   · 能力：「在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。」
 *   · 规则细节：「醉酒和中毒也会（影响厨师的结果）。」→ 受干扰必须给错误数字。
 *   · 规则细节：「厨师的能力探查的是相邻玩家，且并未加"存活"这一附加条件。」
 */

const r = (id: string) => {
  const x = allRoles.find((y) => y.id === id)!;
  return { id: x.id, name: x.name, type: x.type };
};

const guideNum = (g: unknown) => {
  const m = String(g).match(/有\s*(\d+)\s*对/);
  return m ? Number(m[1]) : NaN;
};
const resultNum = (t: unknown) => {
  const m = String(t).match(/场上有\s*(\d+)\s*对/);
  return m ? Number(m[1]) : NaN;
};

type PoisonMode = "none" | "bool" | "status";

function mkSeats(layout: string[], mode: PoisonMode, alignment?: Record<number, string>) {
  const seats: any[] = layout.map((rid, i) => ({
    id: i,
    role: r(rid),
    isDead: false,
    isAlive: true,
    playerName: `P${i + 1}`,
    statusEffects: [],
    ...(alignment?.[i] ? { alignment: alignment[i] } : {}),
  }));
  if (mode === "bool") seats[0].isPoisoned = true;
  if (mode === "status") {
    seats[0].statusEffects = [{ type: "poisoned", source: "pukka" }];
  }
  return seats;
}

async function settle(seats: any[], night = 1) {
  const res: any = await runFullAbilityPipeline(
    {
      preCheck: chefAbility.preCheck,
      calculate: chefAbility.calculate,
      stateUpdate: chefAbility.stateUpdate,
      postProcess: chefAbility.postProcess,
    },
    {
      actionNode: { seatId: 0, roleId: "chef" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: night === 1 ? "firstNight" : "night",
        nightCount: night,
        deadThisNight: [],
        statusEffects: {},
      },
      meta: {},
    } as any
  );
  return {
    aborted: Boolean(res.aborted),
    player: res.meta?.abilityResult as number,
    truth: res.meta?.abilityResultTrue as number,
    log: String(res.meta?.displayInfo?.log ?? ""),
    corrupted: res.meta?.isCorrupted as boolean,
  };
}

const guideOf = (seats: any[], night = 1) => {
  const info: any = calculateNightInfoViaNewEngine(
    { id: "poppyganda" } as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night
  );
  return { guide: String(info?.guide ?? ""), num: guideNum(info?.guide) };
};

// ── 布局（真值已按官方「每名玩家与两侧各成一对」算法人工验算）──
/** 真值 1：男爵-小恶魔相邻 */
const L1 = ["chef", "baron", "imp", "mayor", "mutant", "snitch"];
/** 真值 0：邪恶全分散 */
const L3 = ["chef", "baron", "mayor", "imp", "mutant", "snitch"];
/** 真值 2：三名邪恶连排（小恶魔-投毒者-男爵） */
const L4 = ["chef", "imp", "poisoner", "baron", "mutant", "snitch"];

const LAYOUTS: Array<[string, string[], number]> = [
  ["L1", L1, 1],
  ["L3", L3, 0],
  ["L4", L4, 2],
];

describe("R4 厨师 · 缺陷回归", () => {
  // ── D2：受干扰时假值永不等于真值 ─────────────────────────────
  it("R1. 受干扰（中毒 × 两种表达 × 3 布局）→ 玩家可见值必须 ≠ 真值", async () => {
    for (const [n, L, truth] of LAYOUTS) {
      for (const mode of ["bool", "status"] as const) {
        const s = await settle(mkSeats([...L], mode));
        expect(s.truth, `${n} 真值口径`).toBe(truth);
        expect(s.corrupted, `${n}/${mode} 应判定受干扰`).toBe(true);
        expect(s.player, `${n}/${mode} 假值泄漏真值`).not.toBe(truth);
      }
    }
  });

  it("R2. 修复前会命中真值的具体场景（1 号位/首夜/真值 1）不再泄漏", async () => {
    // 修复前：generateFakePairCount(seats, null, seed) 在 6 座位下恒定给 1，
    // 真值恰为 1 → 中毒玩家被直接告知真值。
    const s = await settle(mkSeats([...L1], "bool"));
    expect(s.truth).toBe(1);
    expect(s.player).not.toBe(1);
  });

  it("R3. 常态（未受干扰）→ 必须给真值，且不得走假值分支", async () => {
    for (const [n, L, truth] of LAYOUTS) {
      const s = await settle(mkSeats([...L], "none"));
      expect(s.corrupted, `${n} 常态不应判定受干扰`).toBe(false);
      expect(s.player, `${n} 常态真值`).toBe(truth);
    }
  });

  // ── D1：提示预演 == 引擎结算 ────────────────────────────────
  it("R4. 同一夜：guide 数字 == 引擎结算数字（中毒，两种表达 × 3 布局）", async () => {
    for (const [n, L] of LAYOUTS) {
      for (const mode of ["bool", "status"] as const) {
        const seats = mkSeats([...L], mode);
        const g = guideOf(seats).num;
        const s = await settle(seats);
        expect(g, `${n}/${mode} guide 非 NaN`).not.toBeNaN();
        expect(g, `${n}/${mode} 提示/结算不一致（guide=${g} settle=${s.player}）`).toBe(
          s.player
        );
      }
    }
  });

  it("R5. 提示预演必须稳定（同夜重复调用完全一致，不得裸随机）", async () => {
    const seats = mkSeats([...L1], "bool");
    const a = guideOf(seats).guide;
    const b = guideOf(seats).guide;
    const c = guideOf(seats).guide;
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("R6. 常态下提示必须为真值（不得误伤）", async () => {
    for (const [n, L, truth] of LAYOUTS) {
      expect(guideOf(mkSeats([...L], "none")).num, `${n} 常态提示`).toBe(truth);
    }
  });

  // ── D3：结果页 == 提示预演（不得二次随机）────────────────────
  it("R7. 结果页脱敏后的数字 == 提示预演数字，且 ≠ 真值", async () => {
    for (const [n, L] of LAYOUTS) {
      const seats = mkSeats([...L], "bool");
      const g = guideOf(seats).num;
      const s = await settle(seats);
      // 复刻 useNightActionHandler：以「引擎暴露的真值」为排除口径喂脱敏层
      const masked = buildCorruptedInfoMask({
        roleId: "chef",
        roleName: "厨师",
        truthText: s.log,
        trueValue: s.truth,
        actorSeatId: 0,
        nightCount: 1,
      });
      const page = resultNum(masked.playerText);
      expect(page, `${n} 结果页数字`).toBe(g);
      expect(page, `${n} 结果页不得等于真值`).not.toBe(s.truth);
    }
  });

  it("R8. 引擎必须暴露真值 abilityResultTrue（否则脱敏层会二次随机）", async () => {
    const seats = mkSeats([...L1], "status");
    const s = await settle(seats);
    expect(s.truth).toBe(1);
    expect(s.player).not.toBe(s.truth);
  });

  // ── 官方数值口径 ────────────────────────────────────────────
  it("R9. 官方范例1：没有邪恶玩家相邻而坐 → 0", async () => {
    const s = await settle(mkSeats([...L3], "none"));
    expect(s.player).toBe(0);
  });

  it("R10. 官方范例2：小恶魔+男爵相邻、投毒者+红唇女郎相邻 → 2", async () => {
    const L = ["chef", "imp", "baron", "mayor", "poisoner", "scarlet_woman", "mutant", "snitch"];
    const s = await settle(mkSeats(L, "none"));
    expect(s.player).toBe(2);
  });

  it("R11. 官方范例3：邪恶替罪羊夹在小恶魔与红唇女郎之间，另一侧投毒者+男爵相邻 → 3", async () => {
    const L = [
      "chef", "poisoner", "baron", "mayor",
      "imp", "scapegoat", "scarlet_woman", "mutant", "snitch",
    ];
    // 替罪羊在本项目登记为 outsider；官方把它作为「邪恶阵营」参与本例，
    // 因此夹具给它打 seat.alignment = "evil"（引擎 isEvilForChef 优先级 5）。
    const s = await settle(mkSeats(L, "none", { 5: "evil" }));
    expect(s.player).toBe(3);
  });

  it("R12. 官方范例4：陌客夹在小恶魔与投毒者之间 → 按「同一阵营口径」得 0 或 2（非 1）", async () => {
    // 官方原文：官方建议说书人在单次探查中保持同一阵营判断，
    // 「应该默认这种情况下要么得知 0，要么得知 2」。
    // 本项目实现为「首次判定后缓存」→ 恒等于 2（陌客默认注册为邪恶）。
    const L = ["chef", "imp", "recluse", "poisoner", "mayor", "mutant"];
    const s = await settle(mkSeats(L, "none"));
    expect([0, 2]).toContain(s.player);
    expect(s.player).toBe(2);
  });

  it("R13. 已死亡玩家仍计入（官方：并未加『存活』附加条件）", async () => {
    const L = ["chef", "imp", "poisoner", "mayor", "mutant", "snitch"];
    const seats = mkSeats(L, "none");
    seats[2].isDead = true;
    seats[2].isAlive = false;
    const s = await settle(seats);
    expect(s.player).toBe(1); // 小恶魔-投毒者仍相邻
  });

  it("R14. 非首夜不唤醒（官方：仅首个夜晚）", async () => {
    const seats = mkSeats([...L1], "none");
    const s = await settle(seats, 2);
    expect(s.aborted).toBe(true);
  });

  it("R15. 假值同夜恒定、跨夜变化（厨师仅首夜生效，故直接测纯函数）", async () => {
    const seats = mkSeats([...L1], "bool");
    // 同夜重复执行 → 完全一致
    const a = await settle(seats, 1);
    const b = await settle(seats, 1);
    expect(b.player).toBe(a.player);
    expect(a.player).not.toBe(1);
    // 第 2 夜起 preCheck 直接 aborted（官方：仅首个夜晚）
    expect((await settle(seats, 2)).aborted).toBe(true);
    // 跨夜变化性：纯函数 pickChefFakePairCount 换夜必须给出不同数字
    const seen = new Set<number>();
    for (let night = 1; night <= 10; night++) {
      seen.add(pickChefFakePairCount(1, 0, night));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
