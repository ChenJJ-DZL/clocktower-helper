/**
 * 哥布林（Goblin）新引擎技能实现
 * 【角色能力】"如果你被处决，邪恶阵营获胜。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{evilWinsIfExecuted:true}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,goblinExecutedWin:true},meta:{...ctx.meta,goblinResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Goblin] 若被处决邪恶获胜");return ctx;};
export const goblinAbility=createRoleAbility({roleId:"goblin",abilityId:"goblin_execution",abilityName:"哥布林处决",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
