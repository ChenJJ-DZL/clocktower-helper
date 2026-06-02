/**
 * 国王（King）新引擎技能实现
 * 【角色能力】"如果你被处决，得知一名爪牙。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const minions=ctx.snapshot.seats.filter((s:any)=>s.role?.type==="minion");const t=minions.length>0?minions[Math.floor(Math.random()*minions.length)]:null;return{...ctx,meta:{...ctx.meta,abilityResult:{targetId:t?.id??null,found:t!==null}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,kingResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const r=ctx.meta.abilityResult as any;console.log(r?.found?`[King] 得知爪牙: ${r.targetId+1}号`:"[King] 无处决无爪牙");return ctx;};
export const kingAbility=createRoleAbility({roleId:"king",abilityId:"king_execution",abilityName:"国王陨落",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
