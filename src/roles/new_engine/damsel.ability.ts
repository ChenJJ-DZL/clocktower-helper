/**
 * 少女（Damsel）新引擎技能实现
 * 【角色能力】"如果有邪恶玩家正确猜出你的角色，你立即死亡。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const guessed=ctx.meta.damselGuessed===true;return{...ctx,meta:{...ctx.meta,abilityResult:{guessed,dies:guessed}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.dies)return ctx;return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),damsel:r}},meta:{...ctx.meta,damselResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(r?.dies)console.log("[Damsel] 被猜中角色，死亡");else console.log("[Damsel] 未被猜中");return ctx;};
export const damselAbility=createRoleAbility({roleId:"damsel",abilityId:"damsel_guessed",abilityName:"身份暴露",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
