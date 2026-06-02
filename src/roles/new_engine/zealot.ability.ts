/**
 * 狂热者（Zealot）新引擎技能实现
 * 【角色能力】"每次提名必须投票。如果你没投，你死亡。"
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";
const preCheck=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return ctx};
const calc=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{const voted=ctx.meta.zealotVoted===true;return{...ctx,meta:{...ctx.meta,abilityResult:{mustVote:true,diesIfNot:voted===false}}}};
const su=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{return{...ctx,meta:{...ctx.meta,zealotResult:ctx.meta.abilityResult}};};
const pp=async(ctx:MiddlewareContext):Promise<MiddlewareContext>=>{console.log("[Zealot] 狂热者必须每次投票");return ctx;};
export const zealotAbility=createRoleAbility({roleId:"zealot",abilityId:"zealot_vote",abilityName:"狂热投票",triggerTiming:[AbilityTriggerTiming.PASSIVE],wakePriority:0,firstNightOnly:false,wakePromptId:"",targetConfig:{min:0,max:0,allowSelf:false,allowDead:false},preCheck:[preCheck],calculate:[calc],stateUpdate:[su],postProcess:[pp]});
