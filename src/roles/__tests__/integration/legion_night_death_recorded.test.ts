import { describe, expect, it } from "vitest";
import { legionAbility } from "../../new_engine/legion.ability";

/**
 * 回归：军团局「夜晚有人死亡，天亮却宣布平安夜」
 *
 * 旧代码：legion.ability 的 stateUpdate 只写 markedForDeath，
 *         isDead / deadThisNight 都不落地 →
 *         天亮播报读取 deadThisNight 为空 → 错误地宣布「平安夜」。
 * 本测试在旧代码下必定失败（isDead 为 undefined、deadThisNight 不含死者）。
 */
function makeCtx(victimId: number) {
  const seats = [
    { id: 0, isDead: false, isAlive: true },
    { id: 1, isDead: false, isAlive: true },
    { id: 2, isDead: false, isAlive: true },
    { id: 3, isDead: false, isAlive: true },
  ];
  return {
    snapshot: { seats, deadThisNight: [], nightCount: 2 },
    actionNode: { seatId: 0, roleId: "legion" },
    targetIds: [victimId],
    meta: {
      abilityResult: {
        killedPlayerId: victimId,
        isBlocked: false,
        reason: "军团夜杀",
      },
    },
  } as any;
}

async function runStateUpdate(ctx: any) {
  const mws = (legionAbility as any).stateUpdate;
  const list = Array.isArray(mws) ? mws : [mws];
  let out = ctx;
  for (const mw of list) {
    out = (await mw(out)) ?? out;
  }
  return out;
}

describe("军团夜杀：死亡必须落地到 isDead 与 deadThisNight（回归）", () => {
  it("被说书人选中的玩家必须真的死亡（isDead=true）", async () => {
    const out = await runStateUpdate(makeCtx(2));
    const victim = out.snapshot.seats.find((s: any) => s.id === 2);
    expect(victim.isDead).toBe(true);
  });

  it("死亡必须写入 deadThisNight，否则天亮会误报「平安夜」", async () => {
    const out = await runStateUpdate(makeCtx(2));
    expect(out.snapshot.deadThisNight).toContain(2);
  });

  it("空刀（未选目标）不得写入任何死亡", async () => {
    const ctx = makeCtx(2);
    ctx.meta.abilityResult = {
      killedPlayerId: null,
      isBlocked: false,
      reason: "空刀",
    };
    const out = await runStateUpdate(ctx);
    expect(out.snapshot.deadThisNight).toHaveLength(0);
    expect(out.snapshot.seats.every((s: any) => !s.isDead)).toBe(true);
  });
});
