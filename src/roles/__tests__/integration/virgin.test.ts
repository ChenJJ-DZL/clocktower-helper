import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { virginAbility } from "../../new_engine/virgin.ability";
function s(id:number,rid:string,rt:string,o?:{drunk?:boolean}){const n:Record<string,string>={virgin:"贞洁者",chef:"厨师",butler:"管家"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:!!o?.drunk,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:o?.drunk?[{type:"drunk"}]:[],hasAbilityEvenDead:false,hasUsedVirginAbility:false}}
function ctx(sid:number,phase:string,seats:ReturnType<typeof s>[],nominatorId?:number):MiddlewareContext{return{snapshot:{nightCount:1,gamePhase:phase,seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"virgin",roleName:"贞洁者",priority:0,isFirstNightOnly:false,abilityId:"virgin_day",wakeMessage:"...",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{nominatorId}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("贞洁者 引擎集成测试",()=>{
  test("管道不中止(被动触发角色)",async()=>{const r=await runFullAbilityPipeline(pipe(virginAbility),ctx(0,"day",[s(0,"virgin","townsfolk"),s(1,"chef","townsfolk")]));expect(r.aborted).toBe(false)});
});