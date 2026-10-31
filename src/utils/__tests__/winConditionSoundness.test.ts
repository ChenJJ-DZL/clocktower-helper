/**
 * 判胜可证明性 · 属性/模糊测试（2026-11-01 P0 防线）
 * ======================================================================
 * 目标：把「isGameOver 的结果必须可被状态严格证明」从 P0 个例
 *       （处决 15号-小精灵被误判）泛化为**不变量**。
 *
 * 全部断言真实经由 `app/gameLogic.ts::checkGameEnd`（及 evilTwinHelper 的
 * 严格 resolver 复算），不复制产品内部规则。
 *
 * 随机源：**自写 LCG**（禁止 Math.random），固定 seed ⇒ 失败可 100% 复现。
 *
 * 不变量：
 *   I1  isGameOver=true ⇒ reasonCode ∈ 注册表 且 winner === WIN_REASON_META[code].side；
 *       isGameOver=false ⇒ reasonCode === undefined。
 *   I2  任一结果的 findMissingWinEvidence(code, evidence) 必须为空。
 *   I3  GOOD_TWIN_EXECUTED ⇒ 证据与传入状态独立复算一致（executedSeatId==goodTwinSeatId，
 *       twinPairSource ∈ {explicit, seatFlag}，evilTwinSeatId 为存活邪恶双子）。
 *   I4  含存活镜像双子但没有**任何配对证据**（无 evilTwinPair、无 isGoodTwin 标记）的棋盘，
 *       随机处决任意非 evil_twin 玩家 ⇒ 永不出现 GOOD_TWIN_EXECUTED。
 *   I5  受限简单盘（1 evil_twin + 1 imp + 纯镇民/外来者、5~9 人存活、无 saint/goblin/
 *       mayor/legion/vortox、处决普通好人）⇒ 永不 isGameOver —— 本 P0 的泛化形态。
 *   I6  镜像双子本人被毒/醉 ⇒ 永不判 GOOD_TWIN_EXECUTED（对照组：不 droison 时必须判）。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { checkGameEnd } from "../../../app/gameLogic";
import {
  resolveEvilTwinPair,
  resolveEvilTwinPairForDisplay,
} from "../evilTwinHelper";
import { isSeatAlive, isSeatDead } from "../seatAlive";
import {
  ALL_WIN_REASON_CODES,
  findMissingWinEvidence,
  WIN_REASON_META,
  type WinEvidence,
  type WinReasonCode,
} from "../winConditions/winReasonCodes";

// ────────────────────────────────────────────────────────────────
// 确定性伪随机（自写 LCG，禁止 Math.random）
// ────────────────────────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes LCG 参数；Math.imul 保持 32 位整数乘法
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const FREEZE_SEED = 0x2026_1101;

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}
function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(
  id: number,
  roleId: string,
  over: Record<string, unknown> = {},
  roleObj?: any
): any {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: roleObj ?? r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

const align = (s: any): "good" | "evil" => {
  if (s.isEvilConverted) return "evil";
  if (s.isGoodConverted) return "good";
  return s.role?.type === "demon" || s.role?.type === "minion"
    ? "evil"
    : "good";
};

/** 失败时输出最小复现所需的状态（seed 固定 ⇒ 直接可重跑） */
function dump(
  label: string,
  seats: any[],
  lastAction: string,
  exec: any,
  opts: any
) {
  return `${label}\nseats=${JSON.stringify(
    seats.map((s) => ({
      id: s.id,
      role: s.role?.id,
      dead: isSeatDead(s),
      poisoned: !!s.isPoisoned,
      drunk: !!s.isDrunk,
      goodTwin: !!s.isGoodTwin,
    }))
  )}\nlastAction=${lastAction} executed=${JSON.stringify(exec)} options=${JSON.stringify(opts)}`;
}

// ────────────────────────────────────────────────────────────────
// 随机棋盘（I1/I2 用）
// ────────────────────────────────────────────────────────────────
const ROLE_POOL = [
  "imp",
  "imp",
  "vortox",
  "leviathan",
  "legion",
  "evil_twin",
  "evil_twin",
  "mastermind",
  "fearmonger",
  "cerenovus",
  "baron",
  "saint",
  "mayor",
  "grandmother",
  "heretic",
  "atheist",
  "librarian",
  "chef",
  "soldier",
  "washerwoman",
  "fortune_teller",
  "monk",
  "farmer",
  "savant",
  "pixie",
  "butler",
  "drunk",
  "recluse",
  "klutz",
  "damsel",
] as const;

function randomBoard(rng: () => number) {
  const size = randInt(rng, 3, 10);
  const seats: any[] = [];
  for (let id = 0; id < size; id++) {
    const roleId = pick(rng, ROLE_POOL);
    seats.push(
      seat(id, roleId, {
        isDead: chance(rng, 0.3),
        isPoisoned: chance(rng, 0.12),
        isDrunk: chance(rng, 0.1),
      })
    );
  }
  // 随机写入一条 seatFlag 证据（约 15%）
  if (chance(rng, 0.15)) {
    const candidate = pick(rng, seats);
    candidate.isGoodTwin = true;
  }
  // 随机 explicit 配对（约 40%）
  let evilTwinPair: any = null;
  const evilTwin = seats.find((s) => s.role?.id === "evil_twin");
  if (evilTwin && chance(rng, 0.4)) {
    const goodCandidate = seats.find((s) => s.id !== evilTwin.id) ?? null;
    evilTwinPair = {
      evilId: evilTwin.id,
      goodId: goodCandidate ? goodCandidate.id : null,
    };
  }

  const lastAction = pick(rng, [
    "execution",
    "night_death",
    "check_phase",
  ] as const);
  let executedId: number | null = null;
  if (lastAction === "execution") {
    executedId = chance(rng, 0.65)
      ? pick(rng, seats).id
      : chance(rng, 0.5)
        ? null
        : randInt(rng, 0, size + 2); // 防御脏 id
    if (executedId !== null) {
      const seat = seats.find((s) => s.id === executedId);
      if (seat) seat.isDead = true; // 真实流程：处决后座位已死
    }
  }

  const options: any = {
    evilTwinPair,
    damselGuessed: chance(rng, 0.04),
    klutzGuessedEvil: chance(rng, 0.04),
    isMastermindExtraDay: chance(rng, 0.06),
    isVortoxWorld: chance(rng, 0.05),
    leviathanDay: chance(rng, 0.2) ? randInt(rng, 0, 6) : 0,
    goodExecutionsCount: chance(rng, 0.2) ? randInt(rng, 0, 3) : 0,
    fearmongerTargetId: chance(rng, 0.15)
      ? (() => {
          const s = pick(rng, seats);
          return s ? s.id : null;
        })()
      : null,
    fearmongerNominated: chance(rng, 0.1),
    storytellerExecuted: chance(rng, 0.06),
    atheistPresent: chance(rng, 0.05),
    grandmotherGrandchildId: chance(rng, 0.15)
      ? (() => {
          const s = pick(rng, seats);
          return s ? s.id : null;
        })()
      : null,
    nightCount: randInt(rng, 0, 6),
  };
  if (chance(rng, 0.1)) {
    options.scriptSpecialRules = {
      evilAutoWinOnEnteringNight: randInt(rng, 1, 4),
    };
    options.nightCount = randInt(rng, 1, 6);
  }
  return { seats, lastAction, executedId, options };
}

describe("I1/I2 · 终局结果必须带合法 reasonCode + 齐全 evidence（随机 300 盘）", () => {
  it("固定 seed 的 300 盘随机对局全部满足判胜契约", () => {
    const rng = makeRng(FREEZE_SEED);
    let gameOverCount = 0;
    const seen = new Map<WinReasonCode, number>();

    for (let i = 0; i < 300; i++) {
      const { seats, lastAction, executedId, options } = randomBoard(rng);
      const res = checkGameEnd(seats, lastAction, executedId, options);
      const ctx = dump(`第 ${i} 盘`, seats, lastAction, executedId, options);

      // ── I1 ──
      if (res.isGameOver) {
        gameOverCount++;
        expect(
          res.reasonCode,
          `isGameOver=true 却无 reasonCode\n${ctx}`
        ).toBeDefined();
        const code = res.reasonCode as WinReasonCode;
        expect(ALL_WIN_REASON_CODES, `reasonCode 不在注册表\n${ctx}`).toContain(
          code
        );
        expect(res.winner, `winner 必须由注册表 side 派生\n${ctx}`).toBe(
          WIN_REASON_META[code].side
        );

        // ── I2 ──
        const missing = findMissingWinEvidence(code, res.evidence);
        expect(missing, `证据缺失 ${JSON.stringify(missing)}\n${ctx}`).toEqual(
          []
        );
        seen.set(code, (seen.get(code) ?? 0) + 1);
      } else {
        expect(
          res.reasonCode,
          `isGameOver=false 不得携带 reasonCode\n${ctx}`
        ).toBeUndefined();
        expect(res.winner, `游戏未结束 winner 必须为 null\n${ctx}`).toBeNull();
      }
    }

    // 生成器覆盖度自检：避免「全是非终局」的假绿
    expect(gameOverCount, "随机盘应能命中若干终局").toBeGreaterThan(10);
    expect(seen.size, "随机盘应覆盖多种 reasonCode").toBeGreaterThanOrEqual(5);
  });
});

// ────────────────────────────────────────────────────────────────
// I3 · GOOD_TWIN_EXECUTED 的证据必须与状态独立复算一致
// ────────────────────────────────────────────────────────────────
const GOOD_TWIN_ROLES = [
  "chef",
  "librarian",
  "soldier",
  "washerwoman",
  "monk",
] as const;

describe("I3 · GOOD_TWIN_EXECUTED 证据与状态独立复算一致（200 盘）", () => {
  it("显式配对 + 处决善良双子：证据字段逐项可复算", () => {
    const rng = makeRng(FREEZE_SEED ^ 0x3333);
    let checked = 0;

    for (let i = 0; i < 200; i++) {
      const evilTwinId = 0;
      const goodTwinId = 1;
      const seats: any[] = [
        seat(evilTwinId, "evil_twin", {
          isPoisoned: false,
          isDrunk: false,
        }),
        seat(goodTwinId, pick(rng, GOOD_TWIN_ROLES)),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
        seat(5, "pixie"),
      ];
      // 随机打乱部分普通座位生死；恶魔与双子必须存活（否则先走 1.1 恶魔全灭分支）
      for (const s of seats.slice(3)) if (chance(rng, 0.25)) s.isDead = true;

      const useSeatFlag = chance(rng, 0.35);
      const options: any = useSeatFlag
        ? { evilTwinPair: null }
        : { evilTwinPair: { evilId: evilTwinId, goodId: goodTwinId } };
      if (useSeatFlag) seats[goodTwinId].isGoodTwin = true;
      seats[goodTwinId].isDead = true; // 已被处决

      const res = checkGameEnd(seats, "execution", goodTwinId, options);
      const ctx = dump("I3 盘", seats, "execution", goodTwinId, options);

      expect(res.isGameOver, `应判邪恶胜\n${ctx}`).toBe(true);
      expect(res.winner, ctx).toBe("Evil");
      expect(res.reasonCode, ctx).toBe("GOOD_TWIN_EXECUTED");

      const ev = res.evidence as WinEvidence;
      expect(ev.executedSeatId, ctx).toBe(ev.goodTwinSeatId);
      expect(ev.executedSeatId, ctx).toBe(goodTwinId);
      expect(["explicit", "seatFlag"], ctx).toContain(ev.twinPairSource);
      expect(ev.evilTwinSeatId, ctx).toBe(evilTwinId);
      expect(findMissingWinEvidence("GOOD_TWIN_EXECUTED", ev), ctx).toEqual([]);

      // 与传入状态独立复算：严格 resolver 必须给出同一结论
      const recomputed = resolveEvilTwinPair(seats, options.evilTwinPair);
      expect(recomputed.resolved, ctx).toBe(true);
      expect(recomputed.source, ctx).toBe(ev.twinPairSource);
      expect(recomputed.goodTwinSeat?.id, ctx).toBe(ev.goodTwinSeatId);
      expect(recomputed.evilTwinSeat?.id, ctx).toBe(ev.evilTwinSeatId);
      expect(recomputed.isGoodTwin(ev.executedSeatId as number), ctx).toBe(
        true
      );
      checked++;
    }

    expect(checked, "应完整覆盖 200 盘正例").toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────
// I4 · 有存活镜像双子但无任何配对证据 ⇒ 永不 GOOD_TWIN_EXECUTED
// ────────────────────────────────────────────────────────────────
describe("I4 · 无证据棋盘随机处决非 evil_twin 玩家，永不判善良双子被处决（200 盘）", () => {
  it("无 evilTwinPair、无 isGoodTwin 标记时处决任意玩家", () => {
    const rng = makeRng(FREEZE_SEED ^ 0x5555);
    let heuristicBoards = 0;

    for (let i = 0; i < 200; i++) {
      const seats: any[] = [
        seat(0, "evil_twin", {
          isPoisoned: chance(rng, 0.15),
          isDrunk: chance(rng, 0.15),
        }),
        seat(1, "imp"),
        seat(2, pick(rng, GOOD_TWIN_ROLES)), // 启发式会优先猜这名镇民
        seat(3, "chef"),
        seat(4, "soldier"),
        seat(5, pick(rng, ["drunk", "recluse", "butler", "pixie"] as const)),
      ];
      // 随机生死，但保持镜像双子存活（题目要求「含存活镜像双子」）
      seats[0].isDead = false;
      for (const s of seats.slice(1)) if (chance(rng, 0.2)) s.isDead = true;

      // 「无任何配对证据」：显式配对缺省 + 无 isGoodTwin 标记
      for (const s of seats) delete s.isGoodTwin;

      const executable = seats.filter(
        (s) => s.role?.id !== "evil_twin" && isSeatAlive(s)
      );
      if (executable.length === 0) continue;
      const target = pick(rng, executable);
      target.isDead = true;

      const res = checkGameEnd(seats, "execution", target.id, {});
      const ctx = dump("I4 盘", seats, "execution", target.id, {});
      expect(
        res.reasonCode,
        `无证据却判了善良双子被处决（启发式回流）\n${ctx}`
      ).not.toBe("GOOD_TWIN_EXECUTED");
    }

    // 覆盖度自检：这些棋盘在展示版 resolver 眼里确实是「会猜」的形态
    const probe = [
      seat(0, "evil_twin"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "soldier"),
    ];
    const displayProbe = resolveEvilTwinPairForDisplay(probe);
    if (displayProbe.source === "heuristic") heuristicBoards++;
    expect(heuristicBoards, "探针盘必须能触发展示启发式").toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────
// I5 · 受限简单盘（P0 泛化形态）⇒ 永不 isGameOver
// ────────────────────────────────────────────────────────────────
const SIMPLE_GOOD_POOL = [
  "chef",
  "librarian",
  "soldier",
  "washerwoman",
  "monk",
  "farmer",
  "savant",
  "butler",
  "drunk",
  "recluse",
  "pixie",
  "klutz",
] as const;

describe("I5 · 受限简单盘处决普通好人 ⇒ 永不 isGameOver（250 盘，P0 泛化形态）", () => {
  it("1 evil_twin + 1 imp + 纯镇民/外来者、5~9 人存活、无 saint/goblin/mayor/legion/vortox", () => {
    const rng = makeRng(FREEZE_SEED ^ 0x7777);

    for (let i = 0; i < 250; i++) {
      const size = randInt(rng, 5, 9);
      const seats: any[] = [
        seat(0, "evil_twin", { isPoisoned: chance(rng, 0.1) }),
        seat(1, "imp"),
      ];
      for (let id = 2; id < size; id++) {
        seats.push(seat(id, pick(rng, SIMPLE_GOOD_POOL)));
      }
      // 被处决者：普通好人（非双子/非恶魔/非特殊终局角色），处决后死亡
      const executable = seats.filter((s) => s.id >= 2);
      const victim = pick(rng, executable);
      victim.isDead = true;

      const res = checkGameEnd(seats, "execution", victim.id, {});
      const ctx = dump("I5 盘", seats, "execution", victim.id, {});
      expect(res.isGameOver, `简单盘被误判终局\n${ctx}`).toBe(false);
      expect(res.reasonCode, ctx).toBeUndefined();
    }
  });
});

// ────────────────────────────────────────────────────────────────
// I6 · 镜像双子本人被毒/醉 ⇒ 永不 GOOD_TWIN_EXECUTED（对照组必判）
// ────────────────────────────────────────────────────────────────
describe("I6 · 镜像双子 droison 时其能力失效（200 盘 + 50 盘对照）", () => {
  it("双子被毒/醉 ⇒ 处决善良双子也永不 GOOD_TWIN_EXECUTED", () => {
    const rng = makeRng(FREEZE_SEED ^ 0x9999);

    for (let i = 0; i < 200; i++) {
      const droison = chance(rng, 0.5) ? "isPoisoned" : "isDrunk";
      const seats: any[] = [
        seat(0, "evil_twin", { [droison]: true }),
        seat(1, pick(rng, GOOD_TWIN_ROLES)),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
        seat(5, "pixie"),
      ];
      seats[1].isDead = true;
      const options = { evilTwinPair: { evilId: 0, goodId: 1 } };
      const res = checkGameEnd(seats, "execution", 1, options);
      const ctx = dump("I6 droison 盘", seats, "execution", 1, options);
      expect(res.reasonCode, `${droison} 应让双子能力失效\n${ctx}`).not.toBe(
        "GOOD_TWIN_EXECUTED"
      );
    }
  });

  it("对照组：相同棋盘但双子未 droison ⇒ 必须 GOOD_TWIN_EXECUTED（证明生成器有效）", () => {
    const rng = makeRng(FREEZE_SEED ^ 0xaaaa);
    let hits = 0;
    for (let i = 0; i < 50; i++) {
      const seats: any[] = [
        seat(0, "evil_twin", { isPoisoned: false, isDrunk: false }),
        seat(1, pick(rng, GOOD_TWIN_ROLES)),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
        seat(5, "pixie"),
      ];
      seats[1].isDead = true;
      const res = checkGameEnd(seats, "execution", 1, {
        evilTwinPair: { evilId: 0, goodId: 1 },
      });
      if (res.reasonCode === "GOOD_TWIN_EXECUTED") hits++;
    }
    expect(hits, "对照组必须每盘命中 GOOD_TWIN_EXECUTED").toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────
// 随机源确定性自检（固定 seed ⇒ 可复现）
// ────────────────────────────────────────────────────────────────
describe("确定性随机源自检（禁止 Math.random）", () => {
  it("同一 seed 的 LCG 序列完全一致", () => {
    const a = makeRng(FREEZE_SEED);
    const b = makeRng(FREEZE_SEED);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("不同 seed 的序列不同（避免固定常量假随机）", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});
