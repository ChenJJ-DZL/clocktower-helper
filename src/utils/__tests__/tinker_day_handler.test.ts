/**
 * 🛠️ 修补匠「猝死」——日间 handler 接线测试
 * ======================================================================
 * 真实事故（2026-10-21 发现）：
 *   `src/roles/outsider/tinker.ts` 的 `day` 配置只有 name/maxUses/target，
 *   **没有 handler** ⇒ `useDayActions::handleDayAbility` 落进「无 handler → 通用回退」，
 *   只记一条「发动技能」日志，玩家血量纹丝不动 —— 说书人点了「猝死」，人没死。
 *
 * 官方（officialRoleDocs · 修补匠）：
 *   「你随时可能死亡。」「说书人随时可以杀死修补匠。」
 *   「修补匠在受到免于死亡的能力保护时，不能因自己的能力而死亡。」
 */
import { describe, expect, it } from "vitest";
import { getRoleDefinition } from "../../roles";

const tinkerDay = () => {
  const def = getRoleDefinition("tinker");
  if (!def?.day) throw new Error("修补匠缺少 day 配置");
  return def.day;
};

function runHandler(opts: {
  selfDead?: boolean;
  protectedBy?: string | null;
  gamePhase?: string;
  statusEffects?: Array<{ type: string }>;
}) {
  const seats: any[] = [
    {
      id: 0,
      role: { id: "tinker", type: "outsider" },
      isDead: opts.selfDead === true,
      isProtected: !!opts.protectedBy,
      protectedBy: opts.protectedBy ?? null,
      statusEffects: opts.statusEffects ?? [],
    },
    { id: 1, role: { id: "soldier", type: "townsfolk" }, isDead: false },
  ];
  const kills: Array<{ id: number; options: any }> = [];
  const day = tinkerDay();
  const result = day.handler!({
    seats,
    selfId: 0,
    targets: [],
    gamePhase: (opts.gamePhase ?? "day") as any,
    roles: [],
    killPlayer: (id: number, options?: any) => kills.push({ id, options }),
  });
  return { result, kills };
}

describe("修补匠：猝死 handler", () => {
  it("day 配置必须带 handler（否则按钮是假的）", () => {
    expect(typeof tinkerDay().handler).toBe("function");
  });

  it("白天裁定 ⇒ 立即杀死自己，不记入夜间死亡", () => {
    const { kills } = runHandler({ gamePhase: "day" });
    expect(kills.map((k) => k.id)).toEqual([0]);
    expect(kills[0].options?.recordNightDeath).toBe(false);
  });

  it("夜间裁定 ⇒ 记入当晚死亡（黎明宣布）", () => {
    const { kills } = runHandler({ gamePhase: "night" });
    expect(kills.map((k) => k.id)).toEqual([0]);
    expect(kills[0].options?.recordNightDeath).toBe(true);
  });

  it("处于免死保护 ⇒ 不得因自身能力死亡", () => {
    const { kills, result } = runHandler({ protectedBy: "tea_lady" });
    expect(kills).toEqual([]);
    expect(JSON.stringify(result.logs)).toContain("不能因自身能力死亡");
  });

  it("状态效果里带保护标记 ⇒ 同样不死亡", () => {
    const { kills } = runHandler({
      statusEffects: [{ type: "protected" }],
    });
    expect(kills).toEqual([]);
  });

  it("已死亡的修补匠 ⇒ 不会二次击杀", () => {
    const { kills } = runHandler({ selfDead: true });
    expect(kills).toEqual([]);
  });
});
