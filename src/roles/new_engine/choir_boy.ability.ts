/**
 * 唱诗男孩（Choir Boy）新引擎技能实现（实验角色）
 *
 * 【角色能力】"如果国王死亡，你会得知谁是恶魔。"
 *
 * PASSIVE 触发：当国王（King）角色死亡时，唱诗男孩会得知恶魔是谁。
 * 说书人可以选择告知正确的恶魔身份，或模糊的线索。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 查找恶魔
  const demon = ctx.snapshot.seats.find((s: any) =>
    !s.isDead && s.role && (s.role.type === "demon")
  );
  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        demonFound: demon !== undefined,
        demonSeatId: demon?.id ?? null,
        demonRoleName: demon?.role?.name ?? null,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) { console.log("[ChoirBoy] 未找到恶魔"); return ctx; }
  return {
    ...ctx, meta: { ...ctx.meta, choirBoyResult: r },
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), choirBoy: r } },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) return ctx;
  const log = `[ChoirBoy] 国王死亡，恶魔是 ${r.demonSeatId + 1}号（${r.demonRoleName ?? "未知"}）`;
  console.log(log);
  return {
    ...ctx, meta: {
      ...ctx.meta,
      prompt: `国王已死亡。唤醒${ctx.actionNode.seatId + 1}号【唱诗男孩】，告知${r.demonSeatId + 1}号是恶魔。`,
      abilityLog: log,
    },
  };
};

export const choirBoyAbility = createRoleAbility({
  roleId: "choir_boy", abilityId: "choir_boy_king_death", abilityName: "国王之殁",
  triggerTiming: [AbilityTriggerTiming.PASSIVE], wakePriority: 0, firstNightOnly: false, wakePromptId: "role.choir_boy.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});
