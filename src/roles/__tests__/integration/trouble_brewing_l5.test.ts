import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { isSaintExecuted } from "../../new_engine/saint.ability";
import { slayerAbility } from "../../new_engine/slayer.ability";

/**
 * L5 · 暗流涌动 · （2026-09-21）
 * ------------------------------------------------------------------
 * 背景：审计发现暗流涌动 22 个角色中 **9 个 L5 覆盖为 0**：
 *   empath / fortune_teller / undertaker / ravenkeeper / virgin /
 *   slayer / butler / saint / scarlet_woman
 *
 * 本文件先覆盖其中**判据最明确**的两个：
 *   · slayer —— 白天一次性能力，打恶魔则恶魔死，打非恶魔则无事（**天然自带对照组**）
 *   · saint  —— 被处决则善良败（用其导出的纯函数 `isSaintExecuted` 直接验证判据）
 *
 * ⚠️ 另外三个（virgin / scarlet_woman / butler）的触发点在 **hook 层**
 *   （virgin → `useDayActions.ts:266` 提名时；scarlet_woman → `useDayActions.ts:1306`；
 *     butler → 投票限制），`runRole` 驱动不到，需要组件/hook 级测试 ⇒ 留待下一批。
 *
 * 沿用 §30.8 三问：
 *   ① 靶子安全 —— 目标用 `chambermaid`（侍女，无免疫）
 *   ② 前提齐 —— slayer 用 `phase:"day"`（其 `triggerTiming` 就是 DAY）
 *   ③ 判据差分 —— before/after 比语义字段；并**加对照组**（打非恶魔不得死）
 */

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

describe("L5 · 暗流涌动", () => {
  describe("① 猎手(slayer)：白天一次性能力", () => {
    /** 布局：0=猎手，3=小恶魔(imp)，1/2/4=普通镇民/外来者 */
    const LAYOUT = ["slayer", "chambermaid", "gossip", "imp", "tinker"];
    const DEMON_ID = 3;

    it("打中恶魔 → 恶魔必须真的死亡（状态落库，不是只写日志）", async () => {
      const seats = board(LAYOUT);
      const before = clone(seats);

      const res = await runRole(slayerAbility, seats, 0, {
        phase: "day",
        targets: [DEMON_ID],
      });

      const after = seatAfter(res, DEMON_ID);
      expect(
        after?.isDead,
        `❌ 猎手命中恶魔后，恶魔的 isDead 仍为 ${after?.isDead} —— ` +
          `能力在 UI 上可发动、可确认，状态却没落库（跑通≠能玩）。` +
          `aborted=${res?.aborted} reason=${res?.abortReason ?? "无"}`
      ).toBe(true);

      expect(
        before[DEMON_ID]?.isDead,
        "（前置）恶魔开局必须是活的 —— 否则本用例测不出差分"
      ).toBe(false);
    });

    it("⭐ 对照组：打中非恶魔 → 目标**不得**死亡（猎手核心规则）", async () => {
      const seats = board(LAYOUT);
      const NON_DEMON_ID = 1;

      const res = await runRole(slayerAbility, seats, 0, {
        phase: "day",
        targets: [NON_DEMON_ID],
      });

      const after = seatAfter(res, NON_DEMON_ID);
      expect(
        after?.isDead,
        `❌ 猎手打中【非恶魔】的 2号，但该玩家竟然死亡了 —— ` +
          `这是严重的规则错误（猎手只在命中恶魔时击杀）`
      ).toBe(false);
    });
  });

  describe("② 圣徒(saint)：被处决则善良阵营失败", () => {
    /**
     * ⚠️ 实测澄清（写测试时发现）：`isSaintExecuted(seat)` 的**实际实现是
     *   `seat.executedToday === true`** —— 它**完全不检查 `role.id === "saint"`**
     *   （函数名有误导性）。
     *   生产调用方都自行补了角色检查：
     *     · `useExecutionHandlers.ts:261` → `t.role.id === "saint" && !options?.forceExecution`
     *     · `app/gameLogic.ts:602`      → `executedSeat.role?.id === "saint"`
     *   ⇒ 当前**安全**。
     *   🔎 **风险（非缺陷，已记录）**：若将来有人直接拿它当「善良败」判据，
     *   会导致**任何玩家被处决都判善良方失败**。建议重命名为
     *   `isExecutedToday`，或把角色检查并入函数内部。
     */
    it("契约：executedToday=true → 为真（注意它不看角色）", () => {
      const seat: any = { id: 0, role: { id: "saint" }, executedToday: true };
      expect(
        isSaintExecuted(seat),
        "❌ executedToday=true 应判定为真（这是该函数的实际契约）"
      ).toBe(true);
    });

    it("⭐ 生产组合判据：只有「圣徒 + 今日被处决」才构成善良败", () => {
      /** 复刻生产调用方的组合判据 */
      const judge = (s: any) => s?.role?.id === "saint" && isSaintExecuted(s);

      expect(
        judge({ role: { id: "saint" }, executedToday: true }),
        "❌ 圣徒今日被处决 → 必须判善良败"
      ).toBe(true);

      expect(
        judge({ role: { id: "chambermaid" }, executedToday: true }),
        "❌ 非圣徒被处决不得判善良败（为真说明误用了 isSaintExecuted）"
      ).toBe(false);

      expect(
        judge({ role: { id: "saint" }, executedToday: false }),
        "❌ 圣徒未被处决不得判善良败"
      ).toBe(false);
    });
  });
});
