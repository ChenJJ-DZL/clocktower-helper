/**
 * 将军（General）新引擎技能实现
 * 【角色能力】"每夜得知场上善良与邪恶阵营谁占优势。"
 */
import type{ MiddlewareContext } from"../../utils/middlewarePipeline";import{ AbilityTriggerTiming,createRoleAbility}from"../core/roleAbility.types";
const pc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=ctx.snapshot.seats.find((s:any)=>s.id===ctx.actionNode.seatId);if(!s?.isAlive)return{...ctx,aborted:true,abortReason:"已死亡"};return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const evil=ctx.snapshot.seats.filter((s:any)=>s.isAlive&&s.role&&(s.role.type==="minion"||s.role.type==="demon")).length;const good=ctx.snapshot.seats.filter((s:any)=>s.isAlive&&s.role&&(s.role.type==="townsfolk"||s.role.type==="outsider")).length;const status=evil>good?"邪恶占优":good>evil?"善良占优":"势均力敌";return{...ctx,meta:{...ctx.meta,abilityResult:{status}}};};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,snapshot:{...ctx.snapshot,_abilityResults:{...((ctx.snapshot as any)._abilityResults??{}),general:ctx.meta.abilityResult}},meta:{...ctx.meta,generalResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const s=(ctx.meta.abilityResult as any)?.status;console.log(`[General] 阵营局势: ${s}`);return{...ctx,meta:{...ctx.meta,abilityLog:`阵营局势: ${s}`}};};
export const generalAbility=createRoleAbility({roleId:"general",abilityId:"general_status",abilityName:"局势感知",triggerTiming:[AbilityTriggerTiming.EVERY_NIGHT],wakePriority:45,firstNightOnly:false,wakePromptId:"role.general.wake",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[pc],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
