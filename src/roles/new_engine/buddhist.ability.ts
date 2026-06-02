/**
 * 佛教徒（Buddhist）新引擎技能实现
 * 【角色能力】"每天的前两分钟，老玩家不能发言。新人可以。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{speechRestricted:true,duration:"2分钟"}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,speechRestricted:true},meta:{...ctx.meta,buddhistResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Buddhist] 前2分钟限制老玩家发言");return{...ctx,meta:{...ctx.meta,abilityLog:"佛教徒限制老玩家发言"}};};
export const buddhistAbility=createRoleAbility({roleId:"buddhist",abilityId:"buddhist_speech",abilityName:"静默",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
