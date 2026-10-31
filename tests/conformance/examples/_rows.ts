/**
 * 官方范例 Oracle · 紧凑 DSL runner（第二层抽象）
 * ======================================================================
 * 第一层（`_oracle.ts::OracleCase`）已经能把一条范例压到 ~10 行；但要补 200+ 条
 * 仍然太贵。这一层把「造座位 → 取能力 → 跑管道 → 断言」再压一次：
 *
 *   row("厨师#3", { role: "chef", seats: ["chef","imp","poisoner","recluse","soldier","mayor"],
 *                   night: 1, phase: "firstNight" }, { info: 1 })
 *
 * 设计原则：
 *   · **只做高频断言**（信息数字 / 信息字段 / 死亡存活 / 判胜 / 中止），
 *     表达不了的场景一律用 `check` 逃生舱，不硬塞进 DSL；
 *   · 每条 row 仍必须带 `// 官方范例: <角色> #<n>` 注释（台账按注释对账）；
 *   · 断言值必须来自**官方原文**，不是从实现输出抄回来的（否则等于自证）。
 */
import { describe, expect, it } from "vitest";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { role } from "./_harness";
import { judge, runOracleCase, type OracleRunResult, type OracleSeat } from "./_oracle";

export interface OracleExpect {
  /** `meta.abilityResult` 直接等于该值（数字/字符串/布尔） */
  info?: unknown;
  /** `meta.abilityResult` 对象的字段断言（浅比较） */
  infoFields?: Record<string, unknown>;
  /** `meta.abilityResult` 对象字段「必须不等于」 */
  infoNotFields?: Record<string, unknown>;
  /** 这些座位必须死亡（或已落死亡标记） */
  dead?: number[];
  /** 这些座位必须存活且无死亡标记 */
  alive?: number[];
  /** 能力必须被中止（官方场景里"不唤醒/无效"） */
  aborted?: boolean;
  /** 判胜断言（走生产 checkGameEnd） */
  win?: { winner?: "Good" | "Evil"; reasonCode?: string; gameOver?: boolean };
  /** 官方要求"无事发生"：所有座位都不死 */
  nothingHappens?: boolean;
}

export interface OracleRow {
  /** 官方范例 id `<角色名>#<序号>` */
  id: string;
  roleId: string;
  /** 座位表：索引即座位号；字符串=角色 id，元组=带覆盖字段 */
  seats: Array<string | OracleSeat>;
  night?: number;
  phase?: "firstNight" | "night" | "day" | "dusk" | "voting";
  targets?: number[];
  storytellerInput?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  expect?: OracleExpect;
  /** 逃生舱：DSL 表达不了时用（与 expect 可并存） */
  check?: (result: OracleRunResult) => void | Promise<void>;
}

/** 把 `["chef","imp"]` 编译成 `[[0,"chef"],[1,"imp"]]` */
function normalizeSeats(
  seats: Array<string | OracleSeat>
): OracleSeat[] {
  return seats.map((entry, index) => {
    if (typeof entry === "string") return [index, entry] as const;
    return entry;
  });
}

/**
 * 跑一批紧凑范例。
 *
 * ⚠️ 每个 row 单独一个 `it()`：失败时能一眼看出是哪条官方规则破了，
 *    而不是"第 N 行断言失败"。
 */
export function describeOracle(title: string, rows: OracleRow[]): void {
  describe(title, () => {
    for (const row of rows) {
      it(`${row.id}`, async () => {
        // 🔴 限次能力（刺客/教授/侍臣…）的 instanceUses 是**模块级单例**，
        //    跨用例累积会让后面的用例被 preCheck 拒绝（"已经使用过"）。
        //    必须每例重置，否则夹具之间互相污染 —— 表现为"能力被意外中止"。
        resetLimitedAbilityUses();
        const result = await runOracleCase({
          id: row.id,
          roleId: row.roleId,
          seats: normalizeSeats(row.seats),
          night: row.night,
          phase: row.phase,
          targets: row.targets,
          storytellerInput: row.storytellerInput,
          meta: row.meta,
          snapshot: row.snapshot,
          check: () => undefined,
        });

        const expectSpec = row.expect ?? {};

        if (expectSpec.aborted !== undefined) {
          expect(
            result.res.aborted,
            `中止状态不符（abortReason=${result.res.abortReason}）`
          ).toBe(expectSpec.aborted);
        } else {
          // 绝大多数范例默认"能力应当正常执行"；只有显式声明 aborted 的才允许中止
          expect(
            result.res.aborted,
            `能力被意外中止：${result.res.abortReason}`
          ).toBe(false);
        }

        if ("info" in expectSpec) {
          expect(result.info).toEqual(expectSpec.info);
        }
        for (const [field, expected] of Object.entries(
          expectSpec.infoFields ?? {}
        )) {
          expect(result.info?.[field], `信息字段 ${field} 不符`).toEqual(expected);
        }
        for (const [field, forbidden] of Object.entries(
          expectSpec.infoNotFields ?? {}
        )) {
          expect(result.info?.[field], `信息字段 ${field} 不该等于该值`).not.toEqual(
            forbidden
          );
        }

        const isDead = (seatId: number): boolean => {
          const seat = result.seats.find((candidate: any) => candidate.id === seatId);
          return seat?.isDead === true || seat?.markedForDeath === true;
        };

        for (const seatId of expectSpec.dead ?? []) {
          expect(isDead(seatId), `${seatId + 1} 号应当死亡`).toBe(true);
        }
        for (const seatId of expectSpec.alive ?? []) {
          expect(isDead(seatId), `${seatId + 1} 号应当存活`).toBe(false);
        }
        if (expectSpec.nothingHappens) {
          const deadSeats = result.seats
            .filter((seat: any) => seat.isDead || seat.markedForDeath)
            .map((seat: any) => seat.id);
          expect(deadSeats, "官方要求无事发生，不应有玩家死亡").toEqual([]);
        }

        if (expectSpec.win) {
          const verdict = judge(result.seats, "check_phase");
          if (expectSpec.win.gameOver !== undefined) {
            expect(verdict.isGameOver).toBe(expectSpec.win.gameOver);
          }
          if (expectSpec.win.winner) {
            expect(verdict.winner).toBe(expectSpec.win.winner);
          }
          if (expectSpec.win.reasonCode) {
            expect(verdict.reasonCode).toBe(expectSpec.win.reasonCode);
          }
        }

        if (row.check) await row.check(result);
      });
    }
  });
}

export { role };
