import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { baronAbility } from "../../new_engine/baron.ability";
function s(id:number,rid:string,rt:string){const n:Record<string,string>={baron:"男爵",imp:"小恶魔",butler:"管家",saint:"圣徒"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number):MiddlewareContext{return{snapshot:{nightCount:1,gamePhase:"setup",seats:[s(0,"baron","minion"),s(1,"imp","demon")],statusEffects:{}},actionNode:{seatId:sid,roleId:"baron",roleName:"男爵",priority:0,isFirstNightOnly:false,abilityId:"baron_setup",wakeMessage:"...",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("男爵 引擎集成测试",()=>{test("设置阶段能力",async()=>{expect((await runFullAbilityPipeline(pipe(baronAbility),ctx(0))).aborted).toBe(false)})});