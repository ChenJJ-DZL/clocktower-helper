import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{shugenjaActive:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,shugenjaResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Shugenja] 修验者");return ctx;};
export const shugenjaAbility=createRoleAbility({roleId:"shugenja",abilityId:"shugenja_first_night",abilityName:"修验者",triggerTiming:[AbilityTriggerTiming.FIRST_NIGHT],wakePriority:50,firstNightOnly:true,wakePromptId:"role.shugenja.wake",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
