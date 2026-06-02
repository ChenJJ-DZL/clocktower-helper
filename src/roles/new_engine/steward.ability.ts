import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,abilityResult:{stewardActive:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,stewardResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Steward] 管家");return ctx;};
export const stewardAbility=createRoleAbility({roleId:"steward",abilityId:"steward_passive",abilityName:"管家",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
