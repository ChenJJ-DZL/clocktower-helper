/**
 * 涡流的「涡流世界」判定 —— 唯一事实来源收口回归测试（2026-09-15）
 *
 * ── 背景 ────────────────────────────────────────────────────────────────
 * 「涡流世界」在本项目里曾有 **三份各写各的** 实现，其中一份漏掉存活检查：
 *   · `GameStage.tsx`            —— ❌ 漏了 `!isDead`（涡流死后仍判为涡流世界）
 *   · `roleActionHandlers.ts`    —— ✅ `s.role?.id === "vortox" && !s.isDead`
 *   · `useNightActionHandler.ts` —— ✅ 同上
 * 同类缺陷：**生命周期 ≠ 判定条件**。
 *
 * 另一个更隐蔽的问题：`gameLogic.checkGameEnd` 的涡流分支**完全依赖入参
 * `isVortoxWorld`**，调用方漏传就会静默失效（游戏卡在白天）。
 *
 * ── 本文件的断言目标 ────────────────────────────────────────────────────
 * 1. `isVortoxWorldActive` 语义：涡流存活 → true；涡流死亡 → false；伪装涡流同样受存活约束。
 * 2. `checkGameEnd` **自推导**：不传 `isVortoxWorld` 也能凭 seats 判出涡流平安日获胜。
 * 3. 涡流死后：不再误判涡流平安日获胜。
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import {
  hasVortoxIdentity,
  isVortoxDuskWinActive,
  isVortoxWorldActive,
} from "../../utils/vortoxWorld";
import { seat } from "./_tbHarness";

// ─── 1. SST 模块本身 ─────────────────────────────────────────────────────

describe("🚰 isVortoxWorldActive（唯一事实来源）", () => {
  it("座位上有存活涡流 → true", () => {
    expect(isVortoxWorldActive([seat(0, "empath"), seat(1, "vortox")])).toBe(
      true
    );
  });

  it("涡流**已死亡** → false（旧 GameStage 实现会误判为 true）", () => {
    expect(
      isVortoxWorldActive([
        seat(0, "empath"),
        seat(1, "vortox", { isDead: true }),
      ])
    ).toBe(false);
  });

  it("伪装成涡流（charadeRole）且存活 → true", () => {
    expect(
      isVortoxWorldActive([seat(0, "drunk", { charadeRole: "vortox" })])
    ).toBe(true);
  });

  it("伪装成涡流但已死亡 → false（存活约束同样适用）", () => {
    expect(
      isVortoxWorldActive([
        seat(0, "drunk", { charadeRole: "vortox", isDead: true }),
      ])
    ).toBe(false);
  });

  it("空/无涡流 → false", () => {
    expect(isVortoxWorldActive([])).toBe(false);
    expect(isVortoxWorldActive(null)).toBe(false);
    expect(isVortoxWorldActive([seat(0, "empath")])).toBe(false);
  });

  it("hasVortoxIdentity 不含存活判断（涡流死后仍为 true）", () => {
    expect(hasVortoxIdentity(seat(0, "vortox", { isDead: true }))).toBe(true);
    expect(hasVortoxIdentity(seat(0, "empath"))).toBe(false);
  });

  it("isVortoxDuskWinActive：涡流存活 + 无人处决 → true；有人处决 → false", () => {
    const seats = [seat(0, "empath"), seat(1, "vortox")];
    expect(isVortoxDuskWinActive(seats, false)).toBe(true);
    expect(isVortoxDuskWinActive(seats, true)).toBe(false);
  });
});

// ─── 2. checkGameEnd 自推导（核心回归） ──────────────────────────────────

describe("🌪️ checkGameEnd 涡流平安日获胜 —— 自推导（不依赖入参 flag）", () => {
  const board = () => [
    seat(0, "empath"),
    seat(1, "soldier"),
    seat(2, "chef"),
    seat(3, "vortox"),
  ];

  it("⭐ 座位上有活涡流、调用方**不传** isVortoxWorld → 仍判邪恶获胜", () => {
    const res = checkGameEnd(board() as any, "execution", null, {} as any);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reason).toContain("涡流");
  });

  it("⭐ check_phase 路径同样自推导", () => {
    const res = checkGameEnd(board() as any, "check_phase", null, {
      todayHasExecution: false,
    } as any);
    expect(res.winner).toBe("Evil");
    expect(res.reason).toContain("涡流");
  });

  it("⭐ 涡流**已死亡** + 不传 flag → **不**误判涡流获胜", () => {
    const dead = [
      seat(0, "empath"),
      seat(1, "soldier"),
      seat(2, "chef"),
      seat(3, "vortox", { isDead: true }),
    ];
    const res = checkGameEnd(dead as any, "check_phase", null, {
      todayHasExecution: false,
    } as any);
    expect(res.reason ?? "").not.toContain("涡流");
  });

  it("今日已有人被处决 → 涡流平安日条件不成立", () => {
    const res = checkGameEnd(board() as any, "check_phase", null, {
      todayHasExecution: true,
    } as any);
    expect(res.reason ?? "").not.toContain("涡流");
  });

  it("优先级：涡流**已死**（恶魔全灭）→ 「恶魔全灭」先于涡流分支结算", () => {
    // 官方优先级：恶魔全灭（1.1）> 涡流平安日（4）。
    // 涡流自己就是恶魔，它死了意味着场上无恶魔 → 好人获胜，轮不到涡流分支。
    // 即使入参显式传 isVortoxWorld=true 也不能翻盘（这是正确的）。
    const dead = [
      seat(0, "empath"),
      seat(1, "soldier"),
      seat(2, "chef"),
      seat(3, "vortox", { isDead: true }),
    ];
    const res = checkGameEnd(dead as any, "check_phase", null, {
      isVortoxWorld: true,
      todayHasExecution: false,
    } as any);
    expect(res.winner).toBe("Good");
    expect(res.reason).toContain("恶魔");
  });

  it("向后兼容：涡流存活但有**另一只恶魔**也存活时，入参 true 仍生效", () => {
    // 涡流（恶）+ 小恶魔（恶）同场：涡流分支不应被"恶魔全灭"短路。
    const seats = [
      seat(0, "empath"),
      seat(1, "soldier"),
      seat(2, "chef"),
      seat(3, "vortox"),
      seat(4, "imp"),
    ];
    const res = checkGameEnd(seats as any, "check_phase", null, {
      todayHasExecution: false,
    } as any);
    expect(res.reason).toContain("涡流");
  });
});
