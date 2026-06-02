/**
 * 酿酒师（Brewer）新引擎技能实现
 * 【角色能力】"每个夜晚，选择两名玩家：如果他们今晚都会死亡，他们不会死亡。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const seat=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!seat?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t=ctx.targetIds?.[0]??ctx.actionNode.targetIds?.[0]??null;const t2=ctx.targetIds?.[1]??ctx.actionNode.targetIds?.[1]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{target1:t,target2:t2,protected:true}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.protected)return ctx;return{...ctx,snapshot:{...ctx.snapshot,protectedTonight:[...((ctx.snapshot as any).protectedTonight??[]),r.target1,r.target2].filter(Boolean)},meta:{...ctx.meta,brewerResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;const log=r?.target1?`[Brewer] 保护 ${r.target1+1}号和${r.target2+1}号`:"[Brewer] 未行动";console.log(log);return{...ctx,meta:{...ctx.meta,abilityLog:log,prompt:`唤醒${ctx.actionNode.seatId+1}号【酿酒师】，选择两名玩家保护。`}};};
export const brewerAbility=createRoleAbility({roleId:"brewer",abilityId:"brewer_protect",abilityName:"酿酒保护",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:25,firstNightOnly:false,wakePromptId:"role.brewer.wake",targetConfig:{min:2,max:2,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
