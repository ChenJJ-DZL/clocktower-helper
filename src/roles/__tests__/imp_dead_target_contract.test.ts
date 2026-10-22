import { describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";

/**
 * 🐉 小恶魔（Imp）击杀「已死玩家」的契约
 * ----------------------------------------------------------------------------
 * 官方【角色能力】：「每个夜晚*，选择一名玩家：他死亡。」
 *
 * 🔴 实测缺陷（2026-10-22，seed=94027）：
 *   1 号在第 2 夜被小恶魔杀死（`diedAtNight: 2`）。
 *   第 3 夜小恶魔又点了这个**已经死了**的 1 号 —— 引擎无条件写
 *   `diedAtNight: 3`，把死亡时间篡改成今夜 ⇒ 黎明播报把同一个死者
 *   **每夜重复播报一遍**（说书人修正窗同时写着「今晚无新增伤亡」，自相矛盾）。
 *
 * 同型缺陷 2026-09-21 已在 `shabaloth.ability.ts` 修过（「已死目标不重复写死亡字段」），
 * 本文件锁死小恶魔这一侧，防止第 3 次复发。
 */
const BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

function seatOf(ctx: any, id: number) {
  return (ctx.snapshot.seats as any[]).find((s) => s.id === id);
}

describe("Imp · 对已死玩家的击杀必须无事发生", () => {
  // ⚠️ 不要用 soldier 当靶子 —— 士兵免疫恶魔击杀，会与「已死」判据混淆
  const layout = ["imp", "chef", "butler", "poisoner", "mayor", "soldier"];

  it("目标已死 ⇒ 不得改写 diedAtNight / deathSource（否则黎明重复播报）", async () => {
    const seats = board(layout) as any[];
    seats[1].isDead = true;
    seats[1].diedAtNight = 1;
    seats[1].deathSource = "imp_kill";

    const ctx = await runRole(BY_ROLE.imp, seats, 0, {
      night: 3,
      targets: [1],
    });

    const target = seatOf(ctx, 1);
    expect(target.isDead, "本来就死了，仍然应该是死的").toBe(true);
    expect(
      target.diedAtNight,
      "死亡夜号必须保持 1（原实现会篡改成 3）"
    ).toBe(1);
    const record = (ctx.snapshot as any)._abilityResults?.imp ?? {};
    expect(record.killed, "不得记为「今晚杀了人」").toBe(false);
    expect(
      record.log?.blockedByAlreadyDead,
      "应留下可观测的「目标已死」原因"
    ).toBe(true);
  });

  it("目标存活 ⇒ 正常击杀（对照组，防修过头）", async () => {
    const seats = board(layout) as any[];

    const ctx = await runRole(BY_ROLE.imp, seats, 0, {
      night: 3,
      targets: [1],
    });

    const target = seatOf(ctx, 1);
    // 夜杀走 `markedForDeath`，真正的 `isDead` 在黎明结算时落库
    expect(target.markedForDeath, "活人必须被标记为今夜死亡").toBe(true);
    expect(target.diedAtNight, "死亡夜号是今夜").toBe(3);
    expect((ctx.snapshot as any)._abilityResults?.imp?.killed).toBe(true);
  });
});
