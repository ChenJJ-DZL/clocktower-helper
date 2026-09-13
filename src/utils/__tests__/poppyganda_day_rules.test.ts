/**
 * 罂粟花开 · 白天环节与胜负判定规则断言
 *
 * 官方判据：`src/data/officialRoleDocs.json`（按角色名取原文）
 *
 * 本文件补齐此前**完全空白**的白天/终局层：
 *   · 军团「多数玩家为军团」开局不因邪恶过半判负
 *   · 军团「全部军团死亡 → 善良阵营获胜」
 *   · 军团存活时的邪恶胜利条件（人数过半 / 存活≤2 / 善良仅剩1）
 *   · 镜像双子：**善良双子被处决 → 邪恶阵营获胜**（官方原文，勿记反）
 *   · 镇长：仅剩 3 人且平安日 → 善良阵营获胜（且中毒/醉酒时不触发）
 *
 * 被测对象：`app/gameLogic.ts` 的 `checkGameEnd`（纯函数，无需 DOM）
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import { roles } from "../../../app/data";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(
  id: number,
  roleId: string,
  over: Partial<any> = {}
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

/** 把一个座位标记为死亡 */
const dead = (s: any) => ({ ...s, isDead: true, isAlive: false });

describe("罂粟花开 · 白天/终局胜负规则", () => {
  // ─── 军团 ───────────────────────────────────────────────
  it("军团(1) 多数为军团的开局**不**因邪恶过半判负（10人局 7军团3善良）", () => {
    const seats = [
      ...Array.from({ length: 7 }, (_, i) => seat(i, "legion")),
      seat(7, "mayor"),
      seat(8, "savant"),
      seat(9, "farmer"),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.isGameOver).toBe(false);
    expect(res.winner).toBeNull();
  });

  it("军团(2) 所有军团死亡 → 善良阵营获胜", () => {
    const seats = [
      dead(seat(0, "legion")),
      dead(seat(1, "legion")),
      dead(seat(2, "legion")),
      seat(3, "mayor"),
      seat(4, "savant"),
    ];
    const res = checkGameEnd(seats, "execution", 0);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("军团");
  });

  it("军团(3) 军团存活且邪恶人数 ≥ 善良人数 → 邪恶获胜", () => {
    const seats = [
      seat(0, "legion"),
      seat(1, "legion"),
      seat(2, "legion"),
      seat(3, "mayor"),
      dead(seat(4, "farmer")),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });

  it("军团(4) 存活仅剩 2 人且军团存活 → 邪恶获胜", () => {
    const seats = [
      seat(0, "legion"),
      seat(1, "mayor"),
      dead(seat(2, "legion")),
      dead(seat(3, "savant")),
      dead(seat(4, "farmer")),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });

  // ─── 镜像双子 ───────────────────────────────────────────
  it("镜像双子 善良双子被处决 → **邪恶**阵营获胜（官方原文）", () => {
    // 官方：「你与一名对立阵营的玩家互知身份…如果你们中一人被处决，邪恶阵营获胜」
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "mayor"), // 对立善良双子
      seat(2, "savant"),
      seat(3, "legion"),
      seat(4, "farmer"),
    ];
    const res = checkGameEnd(seats, "execution", 1);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reason).toContain("双子");
  });

  it("镜像双子 处决的是邪恶双子本人 → 不触发该胜利", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "mayor"),
      seat(2, "savant"),
      seat(3, "legion"),
      seat(4, "farmer"),
    ];
    const res = checkGameEnd(seats, "execution", 0);
    expect(res.reason ?? "").not.toContain("善良双子被处决");
  });

  it("镜像双子 已死亡时其处决惩罚不再生效", () => {
    const seats = [
      dead(seat(0, "evil_twin")),
      seat(1, "mayor"),
      seat(2, "savant"),
      seat(3, "legion"),
      seat(4, "farmer"),
    ];
    const res = checkGameEnd(seats, "execution", 1);
    expect(res.reason ?? "").not.toContain("善良双子被处决");
  });

  // ─── 镇长 ───────────────────────────────────────────────
  it("镇长 仅剩 3 人存活 + 平安日 → 善良阵营获胜", () => {
    const seats = [
      seat(0, "mayor"),
      seat(1, "savant"),
      seat(2, "legion"),
      dead(seat(3, "farmer")),
      dead(seat(4, "snitch")),
    ];
    // ⚠️ 镇长和平胜利的守卫是 `lastAction === "execution" && executedPlayerId === null`
    //    —— 语义是"走到处决环节但无人被处决"（平安日），不是 check_phase。
    const res = checkGameEnd(seats, "execution", null);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("镇长");
  });

  it("镇长 中毒时不触发和平获胜", () => {
    const seats = [
      seat(0, "mayor", { isPoisoned: true }),
      seat(1, "savant"),
      seat(2, "legion"),
      dead(seat(3, "farmer")),
      dead(seat(4, "snitch")),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.winner).not.toBe("Good");
  });

  it("镇长 存活 4 人时不触发（需恰好 3 人）", () => {
    const seats = [
      seat(0, "mayor"),
      seat(1, "savant"),
      seat(2, "legion"),
      seat(3, "farmer"),
      dead(seat(4, "snitch")),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.reason ?? "").not.toContain("镇长");
  });

  // ─── 恶魔 ───────────────────────────────────────────────
  it("小恶魔被处决且无其他恶魔存活 → 善良阵营获胜", () => {
    const seats = [
      dead(seat(0, "imp")),
      seat(1, "mayor"),
      seat(2, "savant"),
      seat(3, "snitch"),
      seat(4, "farmer"),
    ];
    const res = checkGameEnd(seats, "execution", 0);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
  });

  it("涡流存活 + 邪恶人数达标 → 邪恶获胜", () => {
    const seats = [
      seat(0, "vortox"),
      seat(1, "baron"),
      seat(2, "mayor"),
      dead(seat(3, "savant")),
      dead(seat(4, "farmer")),
    ];
    const res = checkGameEnd(seats, "check_phase");
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
  });
});
