/**
 * 官员（Bureaucrat）新引擎技能实现
 * 【角色能力】"每夜选择除你以外的一名玩家，明天白天他的投票算作三票。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??ctx.actionNode.targetIds?.[0]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t,tripleVote:true}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.targetId)return ctx;return{...ctx,snapshot:{...ctx.snapshot,tripleVote:{...((ctx.snapshot as any).tripleVote??{}),[r.targetId]:true},_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),bureaucrat:r}},meta:{...ctx.meta,bureaucratResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;console.log(r?.targetId?`[Bureaucrat] ${r.targetId+1}号明天三票`:"[Bureaucrat] 未行动");return{...ctx,meta:{...ctx.meta,abilityLog:r?.targetId?`${r.targetId+1}号明天三票`:"未行动"}};};
export const bureaucratAbility=createRoleAbility({roleId:"bureaucrat",abilityId:"bureaucrat_vote",abilityName:"三倍选票",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:25,firstNightOnly:false,wakePromptId:"role.bureaucrat.wake",targetConfig:{min:1,max:1,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
