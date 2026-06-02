/**
 * 心上人（Sweetheart）新引擎技能实现
 * 【角色能力】"当你死亡时，一名玩家醉酒。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const target=ctx.storytellerInput?.drunkTarget??null;return{...ctx,meta:{...ctx.meta,abilityResult:{drunkTarget:target,causesDrunk:true}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.causesDrunk)return ctx;return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),sweetheart:r}},meta:{...ctx.meta,sweetheartResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Sweetheart] 死亡，使1名玩家醉酒");return ctx;};
export const sweetheartAbility=createRoleAbility({roleId:"sweetheart",abilityId:"sweetheart_death",abilityName:"香消玉殒",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
