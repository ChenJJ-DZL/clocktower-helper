import { describe, expect, it } from "vitest";
import { roles as allRoles } from "../../../app/data";
import { buildInfoMessage } from "../infoMessageBuilder";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { oracleAbility } from "../../roles/new_engine/oracle.ability";

/**
 * ══ 第1轮 神谕者 · 回归固化（2026-09-13）══
 *
 * 本轮修掉两个 P1（均属「提示预演」路径 infoMessageBuilder 的问题）：
 *
 *  P1-1 「伪装身份信息泄漏」：
 *    - 提线木偶（marionette）伪装信息类镇民时给出**真信息**。
 *      官方「提线木偶」运作方式：「将提线木偶以为的那个角色**视同醉酒一样来运作**……
 *      **可能获得错误信息**」。→ 必须按受干扰处理。
 *    - 中毒若只以 statusEffects / 毒标记表达（不设 seat.isPoisoned 布尔位），
 *      同样给出真信息。→ 改用 computeIsPoisoned 统一判定。
 *
 *  P1-2 「提示与结算数字不一致」（说书人照提示念 → 与结果弹窗对不上）：
 *    buildInfoMessage 用裸 Math.random()，引擎结算用 createDeterministicRandom，
 *    两处独立随机 → 同一夜同角色出现 guide=4 / settle=3。
 *    → 让两侧共用同一枚 nightInfoSeed 与同一个 pickFakeDeadEvilCount。
 */

const r = (id: string) => {
  const x = allRoles.find((y) => y.id === id)!;
  return { id: x.id, name: x.name, type: x.type };
};

const num = (msg: unknown) => {
  const m = String(msg).match(/有 (\d+) 名/);
  return m ? Number(m[1]) : NaN;
};

describe("第1轮 神谕者 · 回归固化", () => {
  // ── P1-1 伪装身份 / 中毒来源 ─────────────────────────────
  it("R1. 提线木偶伪装神谕者 → 必须给出【不等于真实值】的假信息", () => {
    const seats: any[] = [
      { id: 0, role: r("marionette"), charadeRole: r("oracle"), isDead: false, },
      { id: 1, role: r("imp"), isDead: true, },
      { id: 2, role: r("chef"), isDead: true, },
    ];
    const got = num(buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 2 } as any));
    const truth = 1; // 1 名死亡邪恶（小恶魔）
    expect(got).not.toBeNaN();
    expect(got).not.toBe(truth); // 官方：视同醉酒 → 会给错误信息
  });

  it("R2. 中毒以 statusEffects 表达（seat.isPoisoned 未设）→ 必须给出假信息", () => {
    const seats: any[] = [
      {
        id: 0,
        role: r("oracle"),
        isDead: false,
        statusEffects: [{ type: "poisoned", source: "pukka" }],
      },
      { id: 1, role: r("imp"), isDead: true, },
      { id: 2, role: r("chef"), isDead: true, },
    ];
    const got = num(buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 2 } as any));
    expect(got).not.toBe(1);
  });

  it("R3. 常态 → 必须给出真实值（不得误伤）", () => {
    const seats: any[] = [
      { id: 0, role: r("oracle"), isDead: false, },
      { id: 1, role: r("imp"), isDead: true, },
      { id: 2, role: r("chef"), isDead: true, },
    ];
    expect(num(buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 2 } as any))).toBe(1);
  });

  it("R4. 涡流在场（镇民）→ 即使未中毒也必须给假信息", () => {
    const seats: any[] = [
      { id: 0, role: r("oracle"), isDead: false, },
      { id: 1, role: r("vortox"), isDead: false, },
      { id: 2, role: r("imp"), isDead: true, },
    ];
    const got = num(buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 2 } as any));
    expect(got).not.toBe(1); // 真实值 1
  });

  // ── P1-2 提示 / 结算 一致性 ──────────────────────────────
  it("R5. 同一夜：guide 数字 == 结算 finalCount（中毒态，跑 12 次）", async () => {
    for (let i = 0; i < 12; i++) {
      const seats: any[] = [
        { id: 0, role: r("oracle"), isDead: false, isPoisoned: true },
        { id: 1, role: r("imp"), isDead: true, },
        { id: 2, role: r("chef"), isDead: true, },
      ];
      const info: any = calculateNightInfoViaNewEngine(
        { id: "poppyganda" } as any,
        seats,
        0,
        "night",
        null,
        2
      );
      const guideNum = num(info?.guide);
      const res = await runFullAbilityPipeline(
        {
          preCheck: oracleAbility.preCheck,
          calculate: oracleAbility.calculate,
          stateUpdate: oracleAbility.stateUpdate,
          postProcess: oracleAbility.postProcess,
        },
        {
          actionNode: { seatId: 0, roleId: "oracle" },
          targetIds: [],
          snapshot: { seats, gamePhase: "night", nightCount: 2, deadThisNight: [] },
          meta: {},
        } as any
      );
      expect(guideNum).toBe(res.meta.abilityResult.finalCount);
    }
  });

  it("R6. 同一夜重复调用 guide 必须稳定（确定性随机）", () => {
    const seats: any[] = [
      { id: 0, role: r("oracle"), isDead: false, isPoisoned: true },
      { id: 1, role: r("imp"), isDead: true, },
      { id: 2, role: r("chef"), isDead: true, },
    ];
    const a = buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 3 } as any);
    const b = buildInfoMessage("oracle", { seats, selfId: 0, nightCount: 3 } as any);
    expect(a).toBe(b);
  });

  // ── 官方数值口径 ─────────────────────────────────────────
  it("R7. 官方范例2 复现：2已死邪恶 + 1邪恶旅行者 + 1当晚被杀的爪牙 = 4", async () => {
    const mk = (id: number, roleId: string, type: string, dead = false) =>
      ({ id, role: { id: roleId, name: roleId, type }, isDead: dead } as any);
    const seats = [
      mk(0, "oracle", "townsfolk"),
      mk(1, "cerenovus", "minion", true),
      mk(2, "imp", "demon", true),
      { ...mk(3, "thief", "traveler", true), isEvilConverted: true },
      mk(4, "baron", "minion", false),
      mk(5, "chef", "townsfolk", true),
      mk(6, "mayor", "townsfolk", true),
      mk(7, "drunk", "outsider", true),
      mk(8, "mutant", "outsider", true),
    ];
    const res = await runFullAbilityPipeline(
      {
        preCheck: oracleAbility.preCheck,
        calculate: oracleAbility.calculate,
        stateUpdate: oracleAbility.stateUpdate,
        postProcess: oracleAbility.postProcess,
      },
      {
        actionNode: { seatId: 0, roleId: "oracle" },
        targetIds: [],
        snapshot: { seats, gamePhase: "night", nightCount: 4, deadThisNight: [4] },
        meta: {},
      } as any
    );
    expect(res.meta.abilityResult.deadEvilCount).toBe(4);
  });

  it("R8. 变邪恶的镇民计入（官方：任何属于邪恶阵营的玩家）", async () => {
    const seats = [
      { id: 0, role: r("oracle"), isDead: false, },
      { id: 1, role: r("chef"), isDead: true, isEvilConverted: true },
      { id: 2, role: r("imp"), isDead: true, },
    ] as any;
    const res = await runFullAbilityPipeline(
      {
        preCheck: oracleAbility.preCheck,
        calculate: oracleAbility.calculate,
        stateUpdate: oracleAbility.stateUpdate,
        postProcess: oracleAbility.postProcess,
      },
      {
        actionNode: { seatId: 0, roleId: "oracle" },
        targetIds: [],
        snapshot: { seats, gamePhase: "night", nightCount: 2, deadThisNight: [1, 2] },
        meta: {},
      } as any
    );
    expect(res.meta.abilityResult.deadEvilCount).toBe(2);
  });
});
