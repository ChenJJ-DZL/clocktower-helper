/**
 * 乞丐（Beggar）新引擎技能实现
 * 【角色能力】"你不能投票。每天可请求一名玩家给你投票权，他同意则你获其投票权。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??ctx.actionNode.targetIds?.[0]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t,granted:true}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.granted)return ctx;return{...ctx,snapshot:{...ctx.snapshot,beggarVoteSource:r.targetId},meta:{...ctx.meta,beggarResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;console.log(r?.targetId?`[Beggar] 从${r.targetId+1}号获得投票权`:"[Beggar] 未行动");return ctx;};
export const beggarAbility=createRoleAbility({roleId:"beggar",abilityId:"beggar_vote",abilityName:"乞讨选票",triggerTiming:[AbilityTriggerTiming.DAY],wakePriority:0,firstNightOnly:false,wakePromptId:"role.beggar.wake",targetConfig:{min:1,max:1,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
