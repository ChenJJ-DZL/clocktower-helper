/**
 * 天文学家（Astronomer）新引擎技能实现
 * 【角色能力】"每夜得知月相，月相决定额外效果。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{moonPhase:Math.floor(Math.random()*4)}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),astronomer:ctx.meta.abilityResult}},meta:{...ctx.meta,astronomerResult:ctx.meta.abilityResult}};
};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Astronomer] 观测月相");return{...ctx,meta:{...ctx.meta,abilityLog:"天文学家观测了月相"}};};
export const astronomerAbility=createRoleAbility({roleId:"astronomer",abilityId:"astronomer_moon",abilityName:"月相观测",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:50,firstNightOnly:false,wakePromptId:"role.astronomer.wake",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
