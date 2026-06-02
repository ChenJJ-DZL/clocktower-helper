/**
 * 医生（Doctor）新引擎技能实现
 * 【角色能力】"每夜选择一名玩家保护，使其免受夜间死亡。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??ctx.actionNode.targetIds?.[0]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t,protected:true}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.targetId)return ctx;return{...ctx,snapshot:{...ctx.snapshot,protectedTonight:[...((ctx.snapshot as any).protectedTonight??[]),r.targetId],_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),doctor:r}},meta:{...ctx.meta,doctorResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;console.log(r?.targetId?`[Doctor] 保护${r.targetId+1}号`:"[Doctor] 未行动");return{...ctx,meta:{...ctx.meta,abilityLog:`保护${r?.targetId!=null?r.targetId+1+"号":"无"}号`}};};
export const doctorAbility=createRoleAbility({roleId:"doctor",abilityId:"doctor_protect",abilityName:"医疗保护",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:23,firstNightOnly:false,wakePromptId:"role.doctor.wake",targetConfig:{min:1,max:1,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
