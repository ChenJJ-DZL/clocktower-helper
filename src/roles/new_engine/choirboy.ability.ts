/**
 * ⚠️ 此文件已被注释 — 与 choir_boy.ability.ts 重复
 *
 * 此文件是无下划线命名版本（choirboy），与带下划线版本（choir_boy）功能重复。
 * 保留带下划线的 "choir_boy" 版本。
 *
 * 注释日期: 2026-06-10
 * 原因: 统一角色ID命名风格，所有复合词角色名使用下划线分隔（snake_case）。
 *       避免重复注册导致的能力冲突。
 */
// import type { MiddlewareContext } from "../../utils/middlewarePipeline";
// import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
//
// const pc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const s = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
//   if (!s?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
//   return ctx;
// };
// const calc = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const demon = ctx.snapshot.seats.find((s: any) => !s.isDead && s.role?.type === "demon");
//   return { ...ctx, meta: { ...ctx.meta, abilityResult: { demonSeatId: demon?.id ?? null, demonName: demon?.role?.name ?? null, found: demon !== undefined } } };
// };
// const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   return { ...ctx, meta: { ...ctx.meta, choirboyResult: ctx.meta.abilityResult } };
// };
// const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const r = ctx.meta.abilityResult as any;
//   console.log(r?.found ? `[Choirboy] 得知恶魔: ${r.demonSeatId + 1}号` : "[Choirboy] 未发现恶魔");
//   return ctx;
// };
// export const choirboyAbility = createRoleAbility({
//   roleId: "choirboy", abilityId: "choirboy_demon", abilityName: "弑君线索",
//   triggerTiming: [AbilityTriggerTiming.PASSIVE], firstNightPriority: null, otherNightPriority: 84, firstNightOnly: false,
//   wakePromptId: "",
//   targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
//   preCheck: [pc], calculate: [calc], stateUpdate: [su], postProcess: [pp],
// });
