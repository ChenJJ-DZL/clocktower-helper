/**
 * 解谜大师（Puzzlemaster）新引擎技能实现
 * 【角色能力】"一名玩家醉酒（即使你已死亡）。每局限一次，白天猜是谁。猜对则解除醉酒。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const guess=ctx.storytellerInput?.guessSeatId??null;return{...ctx,meta:{...ctx.meta,abilityResult:{guessSeat:guess,correct:false}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,puzzlemasterResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Puzzlemaster] 触发");return ctx;};
export const puzzlemasterAbility=createRoleAbility({roleId:"puzzlemaster",abilityId:"puzzlemaster_guess",abilityName:"解谜猜测",triggerTiming:[AbilityTriggerTiming.DAY],wakePriority:0,firstNightOnly:false,wakePromptId:"role.puzzlemaster.wake",targetConfig:{min:1,max:1,allowSelf:true,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
