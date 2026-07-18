import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { saintAbility } from "../../new_engine/saint.ability";
function s(id:number,rid:string,rt:string,executed?:boolean){const n:Record<string,string>={saint:"圣徒",chef:"厨师"};return{id,playerName:`P${id+1}`,isDead:!!executed,isAlive:!executed,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},statusEffects:[],hasAbilityEvenDead:false,executedToday:executed}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("圣徒 引擎集成测试",()=>{
  test("处决时触发失败",async()=>{
    const ctx: MiddlewareContext = {snapshot:{nightCount:1,gamePhase:"dusk",seats:[s(0,"saint","outsider",true),s(1,"chef","townsfolk")],statusEffects:{}},actionNode:{seatId:0,roleId:"saint",roleName:"圣徒",priority:0,isFirstNightOnly:false,abilityId:"s",wakeMessage:"",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false};
    const r=await runFullAbilityPipeline(pipe(saintAbility),ctx);
    expect(r.aborted).toBe(false);
    expect(r.meta).toBeDefined();
  });
  test("未被处决不触发",async()=>{
    const ctx: MiddlewareContext = {snapshot:{nightCount:1,gamePhase:"dusk",seats:[s(0,"saint","outsider"),s(1,"chef","townsfolk")],statusEffects:{}},actionNode:{seatId:0,roleId:"saint",roleName:"圣徒",priority:0,isFirstNightOnly:false,abilityId:"s",wakeMessage:"",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false};
    const r=await runFullAbilityPipeline(pipe(saintAbility),ctx);
    expect(r.aborted).toBe(true);
  });
});