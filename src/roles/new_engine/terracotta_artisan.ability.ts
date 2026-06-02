import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{terracottaActive:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,terracottaResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[TerracottaArtisan] 陶艺匠");return ctx;};
export const terracotta_artisanAbility=createRoleAbility({roleId:"terracotta_artisan",abilityId:"terracotta_passive",abilityName:"陶艺匠",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
