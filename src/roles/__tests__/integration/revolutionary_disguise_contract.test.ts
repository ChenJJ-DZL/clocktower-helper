/**
 * 革命者（Revolutionary）「被当作其他」契约测试
 * ==================================================================
 * 【官方原文】"每局游戏限一次，你可以使被标记了'被当作其他'的玩家之一
 *   被当作另一个角色和/或阵营。"
 *   ⇒ **只影响别人（信息类能力）怎么看他**；
 *     本人能力、真实身份、胜负判定均不变。
 *
 * 2026-10-20 用户实测报障：UI 只有 pair + 一个布尔开关，
 *   「具体以哪个玩家为准」没有交互 ⇒ 效果无处落地。
 *   修复：`fabledState.revolutionaryDisguise`（seatId + asRoleId + asAlignment）
 *   + `utils/revolutionaryDisguise.ts`（SST）
 *   + `middlewarePipeline` 在 calculate 阶段换「他人感知」座位视图。
 *
 * 本文件锁四条：
 *   A. 他人 calculate 看到的是**伪装角色**；
 *   B. 他人 calculate 看到的是**伪装阵营**；
 *   C. 被伪装者**本人** calculate 看到的是真实身份；
 *   D. stateUpdate 拿到的仍是**真实座位**（伪装视图绝不落写）。
 */
import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  getRevolutionaryDisguise,
  perceivedRoleId,
} from "../../../utils/revolutionaryDisguise";

function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon"
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    roleId,
    isDead: false,
    statusEffects: [],
  };
}

/** 探针能力：把「他人眼中 3 号的角色 id / 类型」写进 meta，不改任何状态 */
const probeAbility = {
  preCheck: [async (ctx: MiddlewareContext) => ctx],
  calculate: [
    async (ctx: MiddlewareContext) => {
      const t = (ctx.snapshot.seats as any[]).find((s) => s.id === 3);
      return {
        ...ctx,
        meta: {
          ...ctx.meta,
          abilityResult: {
            seenRoleId: t?.role?.id ?? null,
            seenRoleType: t?.role?.type ?? null,
          },
        },
      };
    },
  ],
  stateUpdate: [
    async (ctx: MiddlewareContext) => {
      const t = (ctx.snapshot.seats as any[]).find((s) => s.id === 3);
      return {
        ...ctx,
        meta: {
          ...ctx.meta,
          stateUpdateSawRoleId: t?.role?.id ?? null,
        },
      };
    },
  ],
  postProcess: [async (ctx: MiddlewareContext) => ctx],
};

function makeCtx(actorId: number, seats: any[], fabledState: any): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "night",
      seats: seats.map((s) => ({ ...s })),
      fabledState,
    } as any,
    actionNode: {
      seatId: actorId,
      roleId: "probe",
      roleName: "探针",
      priority: 1,
      abilityId: "probe",
      wakeMessage: "",
      firstNightPriority: 1,
      otherNightPriority: null,
      targetIds: [3],
      processed: false,
      success: false,
      meta: {},
    } as any,
    targetIds: [3],
    meta: {},
    aborted: false,
    preview: false,
  } as MiddlewareContext;
}

const seats = () => [
  seat(0, "washerwoman", "townsfolk"),
  seat(1, "monk", "townsfolk"),
  seat(2, "imp", "demon"),
  seat(3, "savant", "townsfolk"), // 被伪装者
];

const disguised = {
  revolutionaryPair: { a: 3, b: 2 },
  revolutionaryDisguiseUsed: true,
  revolutionaryDisguise: {
    seatId: 3,
    asRoleId: "imp",
    asAlignment: "evil" as const,
  },
};

describe("革命者「被当作其他」：他人视角 vs 本人视角 vs 写入安全", () => {
  it("A/B：他人 calculate 看到伪装角色与伪装阵营", async () => {
    const out = await runFullAbilityPipeline(probeAbility, makeCtx(0, seats(), disguised));
    const r = out.meta.abilityResult as any;
    expect(r.seenRoleId, "他人应看到伪装角色").toBe("imp");
    expect(r.seenRoleType, "他人应看到伪装阵营").toBe("minion");
  });

  it("C：被伪装者本人 calculate 看到真实身份", async () => {
    const out = await runFullAbilityPipeline(probeAbility, makeCtx(3, seats(), disguised));
    const r = out.meta.abilityResult as any;
    expect(r.seenRoleId, "本人应看到真实角色").toBe("savant");
    expect(r.seenRoleType, "本人应看到真实阵营").toBe("townsfolk");
  });

  it("D：stateUpdate 拿到真实座位（伪装视图绝不落写）", async () => {
    const out = await runFullAbilityPipeline(probeAbility, makeCtx(0, seats(), disguised));
    expect(
      out.meta.stateUpdateSawRoleId,
      "写入阶段必须恢复真实座位"
    ).toBe("savant");
  });

  it("未使用效果时（disguise 为空）：一切按真实身份", async () => {
    const out = await runFullAbilityPipeline(
      probeAbility,
      makeCtx(0, seats(), { revolutionaryPair: { a: 3, b: 2 } })
    );
    const r = out.meta.abilityResult as any;
    expect(r.seenRoleId).toBe("savant");
  });

  it("SST 判定：getRevolutionaryDisguise / perceivedRoleId", () => {
    const snap = { fabledState: disguised } as any;
    expect(getRevolutionaryDisguise(snap)?.seatId).toBe(3);
    expect(perceivedRoleId(snap, 3, "savant")).toBe("imp");
    expect(perceivedRoleId(snap, 0, "washerwoman")).toBe("washerwoman");
    // 空内容 = 未生效
    expect(
      getRevolutionaryDisguise({
        fabledState: {
          revolutionaryDisguise: { seatId: 3, asRoleId: null, asAlignment: null },
        },
      } as any)
    ).toBeNull();
  });
});
