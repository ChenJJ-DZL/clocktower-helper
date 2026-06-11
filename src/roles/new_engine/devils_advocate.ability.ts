/**
 * ⚠️ 此文件已被注释 — 与 devil_s_advocate.ability.ts 重复
 *
 * 此文件是无下划线命名版本（devils_advocate），与带下划线版本（devil_s_advocate）功能重复。
 * 保留带下划线的 "devil_s_advocate" 版本。
 *
 * 注释日期: 2026-06-10
 * 原因: 统一角色ID命名风格，所有复合词角色名使用下划线分隔（snake_case）。
 *       避免重复注册导致的能力冲突。
 */
// /**
//  * 魔鬼代言人（Devil's Advocate）新引擎技能实现
//  *
//  * 【角色能力】"每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：
//  *   如果明天白天他被处决，他不会死亡。"
//  *
//  * 每夜保护一名玩家免受处决。不能连续两晚选同一人。
//  */
// import type { MiddlewareContext } from "../../utils/middlewarePipeline";
// import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
//
// const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
//   if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
//   return ctx;
// };
//
// const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
//   return {
//     ...ctx, meta: {
//       ...ctx.meta, abilityResult: { targetId, protectedFromExecution: true },
//     },
//   };
// };
//
// const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const r = ctx.meta.abilityResult as any;
//   if (!r?.targetId) return ctx;
//   return {
//     ...ctx,
//     meta: { ...ctx.meta, daResult: r },
//     snapshot: {
//       ...ctx.snapshot,
//       executionProtected: { ...((ctx.snapshot as any).executionProtected ?? {}), [r.targetId]: true },
//       _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), devils_advocate: r },
//     },
//   };
// };
//
// const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
//   const r = ctx.meta.abilityResult as any;
//   if (!r?.targetId) return ctx;
//   const log = `[DevilsAdvocate] 保护 ${r.targetId + 1}号免受处决`;
//   console.log(log);
//   return {
//     ...ctx, meta: {
//       ...ctx.meta,
//       prompt: `唤醒${ctx.actionNode.seatId + 1}号【魔鬼代言人】，选择一名玩家（不能与昨晚相同）。`,
//       abilityLog: log,
//     },
//   };
// };
//
// export const devils_advocateAbility = createRoleAbility({
//   roleId: "devils_advocate", abilityId: "da_protect", abilityName: "处决豁免",
//   triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT], wakePriority: 35, firstNightOnly: false,
//   wakePromptId: "role.devils_advocate.wake",
//   targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
//   preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
// });
