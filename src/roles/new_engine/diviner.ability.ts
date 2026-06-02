/**
 * 预言家（Diviner）新引擎技能实现
 * 【角色能力】"每夜得知一个阵营线索。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const evil=ctx.snapshot.seats.filter((s:any)=>s.role&&(s.role.type==="minion"||s.role.type==="demon"));return{...ctx,meta:{...ctx.meta,abilityResult:{evilCount:evil.length}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),diviner:ctx.meta.abilityResult}},meta:{...ctx.meta,divinerResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Diviner] 预言家获得线索");return ctx;};
export const divinerAbility=createRoleAbility({roleId:"diviner",abilityId:"diviner_clue",abilityName:"预言",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:50,firstNightOnly:false,wakePromptId:"role.diviner.wake",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
