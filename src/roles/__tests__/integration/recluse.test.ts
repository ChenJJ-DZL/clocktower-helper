import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { recluseAbility } from "../../new_engine/recluse.ability";
function s(id:number,rid:string,rt:string){const n:Record<string,string>={recluse:"陌客",chef:"厨师"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number):MiddlewareContext{return{snapshot:{nightCount:1,gamePhase:"night",seats:[s(0,"recluse","outsider"),s(1,"chef","townsfolk")],statusEffects:{}},actionNode:{seatId:sid,roleId:"recluse",roleName:"陌客",priority:0,isFirstNightOnly:false,abilityId:"recluse_passive",wakeMessage:"...",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("陌客 引擎集成测试",()=>{test("被动管道不中止",async()=>{expect((await runFullAbilityPipeline(pipe(recluseAbility),ctx(0))).aborted).toBe(false)})});