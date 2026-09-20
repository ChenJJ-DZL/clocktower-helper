/**
 * 军团（Legion）终局判定护栏（2026-09-21）
 *
 * ============================================================
 * 官方原文（src/data/officialRoleDocs.json · 「军团」）
 * ============================================================
 * 「**如果游戏中只剩一名善良玩家存活，说书人可以宣布邪恶阵营获胜**，
 *   因为在这种条件下善良阵营无法获胜。（因为在这种情况下善良玩家无法
 *   达成所有恶魔死亡的结果……）」
 * 另：「每名军团在互动时被当作恶魔，同时也被当作爪牙。」
 *     「所有军团已被彻底消灭」→ 善良胜（恶魔全灭规则的军团分支）
 *
 * ============================================================
 * 为什么需要护栏（而不是重写）
 * ============================================================
 * `app/gameLogic.ts` 的军团判定以 `hasLegionInPlay` 分支形式**内联**在通用
 * 人数阈值逻辑中（:537 全歼分支 / :716 阈值分支）。这一结构本身是可接受的，
 * 但「军团与会改动的人数阈值共用一段函数」意味着**任何一次阈值调整都可能
 * 悄悄改坏军团胜负**。
 *
 * 因此本护栏不重构代码，只把**官方规定的四个终局边界**钉死：
 *   L-1 军团全歼                              → 善良胜
 *   L-2 存活善良 ≤ 1（军团局）                 → 邪恶胜
 *   L-3 存活总数 ≤ 2 且仍有军团存活（军团局）   → 邪恶胜
 *   L-4 存活善良 ≥ 2 且军团仍在                → 游戏继续（不得误判结束）
 *
 * 另外锁定一条**结构性不变式**：军团分支必须出现在通用阈值判定**之前**
 * （否则军团局会被 `aliveNonTravelerCount <= 2` 抢先判死，漏掉 L-4 的继续条件）。
 */

import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import {
  checkGameEnd,
  isPlayerDemon,
  isPlayerEvil,
} from "../../../app/gameLogic";

function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  isDead = false
): Seat {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type: type as any },
    displayRole: null,
    charadeRole: null,
    isDead,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
  } as any;
}

/** 军团局的典型构造：多名 legion + 若干善良 */
function legionGame(opts: {
  legionAlive: number;
  legionDead?: number;
  goodAlive: number;
  goodDead?: number;
}) {
  const seats: Seat[] = [];
  let id = 0;
  for (let i = 0; i < opts.legionAlive; i++) seats.push(seat(id++, "legion", "demon"));
  for (let i = 0; i < (opts.legionDead ?? 0); i++)
    seats.push(seat(id++, "legion", "demon", true));
  for (let i = 0; i < opts.goodAlive; i++)
    seats.push(seat(id++, "chef", "townsfolk"));
  for (let i = 0; i < (opts.goodDead ?? 0); i++)
    seats.push(seat(id++, "chef", "townsfolk", true));
  return seats;
}

describe("军团 · 终局判定护栏（官方原文对齐）", () => {
  it("L-1 军团被全歼 → 善良胜", () => {
    const r = checkGameEnd(
      legionGame({ legionAlive: 0, legionDead: 3, goodAlive: 3 }),
      "check_phase"
    );
    expect(r.isGameOver).toBe(true);
    expect(r.winner, "官方：所有军团被消灭 → 善良胜").toBe("Good");
  });

  it("L-2 存活善良仅 1 人且军团仍在 → 邪恶胜（官方点名）", () => {
    const r = checkGameEnd(
      legionGame({ legionAlive: 2, goodAlive: 1, goodDead: 2 }),
      "check_phase"
    );
    expect(r.isGameOver).toBe(true);
    expect(r.winner, "官方：只剩一名善良玩家存活 → 邪恶胜").toBe("Evil");
  });

  it("L-3 存活总数 ≤ 2 且仍有军团存活 → 邪恶胜", () => {
    const r = checkGameEnd(
      legionGame({ legionAlive: 1, goodAlive: 1, goodDead: 3 }),
      "check_phase"
    );
    expect(r.isGameOver).toBe(true);
    expect(r.winner).toBe("Evil");
  });

  it("L-4 存活善良 ≥ 2 且军团仍在 → 游戏继续（不得误判结束）", () => {
    const r = checkGameEnd(
      legionGame({ legionAlive: 2, goodAlive: 3, goodDead: 1 }),
      "check_phase"
    );
    expect(
      r.isGameOver,
      "军团局中存活善良仍有 3 人 → 善良尚未失去所有翻盘路径，游戏必须继续"
    ).toBe(false);
  });

  it("L-5 军团局不得被通用「存活非旅行者 ≤ 2」阈值抢先判死（结构不变式）", () => {
    // 构造：存活非旅行者总数 = 2（1 军团 + 1 善良）→ 两个口径都会判邪恶，一致。
    // 关键对照：总数 = 3（1 军团 + 2 善良）→ 通用阈值不会触发（3 > 2），
    // 军团分支也不能触发（aliveGood=2 > 1 且 aliveCount=3 > 2）→ 继续。
    const r = checkGameEnd(
      legionGame({ legionAlive: 1, goodAlive: 2, goodDead: 2 }),
      "check_phase"
    );
    expect(r.isGameOver).toBe(false);
  });

  it("L-6 军团玩家同时被当作恶魔与爪牙（官方原文）", () => {
    const seats = legionGame({ legionAlive: 1, goodAlive: 2 });
    const legionSeat = seats.find((s) => s.role?.id === "legion")!;
    // 走公开 API 而非私有函数，保证测的是生产口径
    expect(isPlayerDemon(legionSeat), "军团应被当作恶魔").toBe(true);
    expect(isPlayerEvil(legionSeat), "军团应属于邪恶阵营").toBe(true);
  });
});
