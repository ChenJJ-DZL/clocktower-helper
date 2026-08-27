import { describe, expect, it } from "vitest";
import { abilityPriorityCalculation } from "../../../utils/abilityPriorityMiddleware";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 涡流（Vortox）专项 — 能力机制不应被反相短路。
 *
 * 核心规则：
 * ① 涡流在场时所有镇民（含提线木偶以为自己是镇民）通过能力获得的信息都是错误的；
 * ② 但技能机制本身（占卜师仍要选 2 人、僧侣仍要保护、cerenovus 仍要选目标+角色等）
 *    必须正常执行，abilityEffective=false 仅影响"最终信息生成"，不短路 targetIds 写入、
 *    protected 标记、cerenovus.madRoles 等状态。
 *
 * 酒鬼在涡流局 → 他以为自己是镇民但本身是 outsider，charadeRole.type 可能为 townsfolk，
 * 但酒鬼应当得正确信息（因为他不具有镇民能力）。此条由 charadeRole 路径决定：
 *   - 酒鬼自己的 effectiveType 应为 'outsider'（他的真实 type），不被反相；
 *   - 提线木偶的 effectiveType 应为 'townsfolk'（他的 charadeRole），被反相。
 *
 * 注：实际"信息反相"由各 ability 的 calculate 内根据 meta.abilityEffective 自行处理，
 * 涡流中间件只负责决定 abilityEffective 标记。本测试聚焦：
 *   (A) 中间件对不同角色 type 的 abilityEffective 设置正确；
 *   (B) 技能机制不被短路（abilityEffective=false 不阻止 targetIds 等写入）。
 */

function buildCtx(args: {
  seatId: number;
  roleType: string;
  roleId: string;
  charadeRole?: { type: string; id: string; name: string };
  vortoxWorld?: boolean;
}): MiddlewareContext {
  return {
    snapshot: {
      seats: [
        {
          id: args.seatId,
          role: {
            id: args.roleId,
            name: args.roleId,
            type: args.roleType,
          },
          ...(args.charadeRole ? { charadeRole: args.charadeRole } : {}),
          isDead: false,
          isAlive: true,
          statusEffects: [],
        },
      ],
      globalEffects: { vortoxWorld: args.vortoxWorld ?? false },
      statusEffects: {},
    },
    actionNode: { seatId: args.seatId, meta: {} },
    meta: {},
  } as unknown as MiddlewareContext;
}

describe("涡流世界 — abilityPriorityCalculation 对各类角色的 abilityEffective 判定", () => {
  it("普通镇民在涡流局 → abilityEffective=false, prioritySource=vortox", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "townsfolk",
      roleId: "librarian",
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(false);
    expect(next.meta.prioritySource).toBe("vortox");
    expect(next.meta.vortoxAffected).toBe(true);
  });

  it("酒鬼（outsider）在涡流局 → abilityEffective=true（酒鬼得正确信息）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "outsider",
      roleId: "drunk",
      charadeRole: { type: "townsfolk", id: "monk", name: "僧侣" },
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    // 酒鬼本身是 outsider，charadeRole 为 townsfolk；当前中间件按 charadeRole 判定 → false
    // 但官方 Wiki："酒鬼因为不具有镇民的能力，因此不会因为涡流而得错误信息"
    // 期望：酒鬼应当 effective=true（不被反相）
    expect(next.meta.abilityEffective).toBe(true);
  });

  it("提线木偶（minion + charadeRole=townsfolk）在涡流局 → 以为自己占卜师被反相", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "minion",
      roleId: "marionette",
      charadeRole: { type: "townsfolk", id: "fortune_teller", name: "占卜师" },
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(false);
    expect(next.meta.prioritySource).toBe("vortox");
  });

  it("普通爪牙（无 charadeRole）在涡流局 → abilityEffective=true（爪牙不受反相）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "minion",
      roleId: "poisoner",
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(true);
  });

  it("普通恶魔（vortox 自身）在涡流局 → abilityEffective=true（恶魔自身不受反相）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "demon",
      roleId: "vortox",
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(true);
  });

  it("普通外来者在涡流局 → abilityEffective=true（外来者不受反相）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "outsider",
      roleId: "lunatic",
      vortoxWorld: true,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(true);
  });

  it("无涡流时镇民 → abilityEffective=true（正常）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "townsfolk",
      roleId: "librarian",
      vortoxWorld: false,
    });
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(true);
    expect(next.meta.prioritySource).toBe("normal");
  });

  it("优先级：barista > vortox（咖啡师覆盖涡流）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "townsfolk",
      roleId: "librarian",
      vortoxWorld: true,
    });
    ctx.snapshot.seats[0].statusEffects = [
      { type: "barista", data: { isAbilityEffective: true } },
    ];
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.abilityEffective).toBe(true);
    expect(next.meta.prioritySource).toBe("barista");
  });

  it("优先级：vortox > drunk/poisoned（涡流先于醉酒/中毒判定）", async () => {
    const ctx = buildCtx({
      seatId: 0,
      roleType: "townsfolk",
      roleId: "librarian",
      vortoxWorld: true,
    });
    ctx.snapshot.seats[0].statusEffects = [{ type: "drunk" }];
    const next = await abilityPriorityCalculation(ctx);
    expect(next.meta.prioritySource).toBe("vortox");
  });
});
