/**
 * 经纪人（Broker）新引擎技能实现
 * 【角色能力】"每夜可选两名玩家交换手中的信息。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const t1=ctx.targetIds?.[0]??null;const t2=ctx.targetIds?.[1]??null;return{...ctx,meta:{...ctx.meta,abilityResult:{swapA:t1,swapB:t2,swapped:t1!==null&&t2!==null}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(!r?.swapped)return ctx;return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),broker:r}},meta:{...ctx.meta,brokerResult:r}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;if(r?.swapped)console.log(`[Broker] 交换${r.swapA+1}号和${r.swapB+1}号信息`);return ctx;};
export const brokerAbility=createRoleAbility({roleId:"broker",abilityId:"broker_swap",abilityName:"信息交换",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:40,firstNightOnly:false,wakePromptId:"role.broker.wake",targetConfig:{min:2,max:2,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
