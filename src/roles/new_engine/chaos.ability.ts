/**
 * 混沌（Chaos）新引擎技能实现（恶魔）
 * 【角色能力】"每个夜晚，选择两名玩家：他们死亡。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const seat=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!seat?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t1=ctx.targetIds?.[0]??null;const t2=ctx.targetIds?.[1]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{target1:t1,target2:t2,killed:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.killed)return ctx;return{...ctx,snapshot:{...ctx.snapshot,lastKill:{demonId:ctx.actionNode.seatId,killCount:2},_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),chaos:r}},meta:{...ctx.meta,chaosResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;const log=r?.target1?`[Chaos] 击杀 ${r.target1+1}号和${r.target2+1}号`:"[Chaos] 未行动";console.log(log);return{...ctx,meta:{...ctx.meta,abilityLog:log,prompt:`唤醒${ctx.actionNode.seatId+1}号【混沌】，选择两名玩家杀害。`}};};
export const chaosAbility=createRoleAbility({roleId:"chaos",abilityId:"chaos_kill",abilityName:"混沌杀戮",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:48,firstNightOnly:false,wakePromptId:"role.chaos.wake",targetConfig:{min:2,max:2,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
