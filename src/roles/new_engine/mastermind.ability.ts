/**
 * 主谋（Mastermind）新引擎技能实现
 * 【角色能力】"如果恶魔在白天被处决，游戏继续到次日。如果次日无人被处决，邪恶获胜。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const demonExecuted=ctx.snapshot.demonExecutedToday===true;return{...ctx,meta:{...ctx.meta,abilityResult:{demonExecuted,gameExtended:demonExecuted}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.gameExtended)return ctx;return{...ctx,snapshot:{...ctx.snapshot,mastermindActive:true,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),mastermind:r}},meta:{...ctx.meta,mastermindResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(r?.gameExtended)console.log("[Mastermind] 恶魔被处决，游戏延长一天");return ctx;};
export const mastermindAbility=createRoleAbility({roleId:"mastermind",abilityId:"mastermind_extend",abilityName:"恶魔延续",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
