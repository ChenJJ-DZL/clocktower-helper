/**
 * 告密者（Snitch）新引擎技能实现
 * 【角色能力】"如果告密者在场，爪牙会在首夜额外得知三个伪装角色。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{snitchActive:true,minionBluffs:3}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,snitchActive:true,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),snitch:ctx.meta.abilityResult}},meta:{...ctx.meta,snitchResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Snitch] 告密者在场，爪牙获3个伪装");return ctx;};
export const snitchAbility=createRoleAbility({roleId:"snitch",abilityId:"snitch_passive",abilityName:"告密",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
