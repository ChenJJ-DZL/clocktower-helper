/**
 * 邪教首领（Cult Leader）新引擎技能实现
 * 【角色能力】"每个夜晚，你选择一名玩家。白天你们一起投票。如果你俩都没投给被处决者，你们变成邪恶。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const seat=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!seat?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??ctx.actionNode.targetIds?.[0]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t,choosen:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.choosen)return ctx;return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),cult_leader:r}},meta:{...ctx.meta,cultLeaderResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;const log=r?.targetId?`[CultLeader] 选择 ${r.targetId+1}号结盟`:"[CultLeader] 未选择";console.log(log);return{...ctx,meta:{...ctx.meta,abilityLog:log,prompt:`唤醒${ctx.actionNode.seatId+1}号【邪教首领】，选择一名玩家结盟。`}};};
export const cult_leaderAbility=createRoleAbility({roleId:"cult_leader",abilityId:"cult_leader_ally",abilityName:"邪教结盟",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:30,firstNightOnly:false,wakePromptId:"role.cult_leader.wake",targetConfig:{min:1,max:1,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
