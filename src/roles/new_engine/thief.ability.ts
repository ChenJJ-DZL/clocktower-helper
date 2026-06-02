import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,thiefResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Thief] 窃贼");return ctx;};
export const thiefAbility=createRoleAbility({roleId:"thief",abilityId:"thief_night",abilityName:"窃贼",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:50,firstNightOnly:false,wakePromptId:"role.thief.wake",targetConfig:{min:1,max:1,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
