/**
 * ⚠️ 此文件已被注释 — 与 night_watchman.ability.ts 重复
 *
 * 此文件是无下划线命名版本（nightwatchman），与带下划线版本（night_watchman）功能重复。
 * 保留带下划线的 "night_watchman" 版本。
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
//   return { ...ctx, meta: { ...ctx.meta, abilityResult: { watchmanActive: true } } };
// };
// const su = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   return { ...ctx, meta: { ...ctx.meta, nightwatchmanResult: ctx.meta.abilityResult } };
// };
// const pp = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   console.log("[Nightwatchman] 守夜人(alt)");
//   return ctx;
// };
// export const nightwatchmanAbility = createRoleAbility({
//   roleId: "nightwatchman",
//   abilityId: "nightwatchman_passive",
//   abilityName: "守夜人(alt)",
//   triggerTiming: [AbilityTriggerTiming.PASSIVE],
//   firstNightPriority: 73, otherNightPriority: 106,
//   firstNightOnly: false,
//   wakePromptId: "",
//   targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
//   preCheck: [pc],
//   calculate: [calc],
//   stateUpdate: [su],
//   postProcess: [pp],
// });
