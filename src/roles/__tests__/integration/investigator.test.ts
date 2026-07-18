import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { investigatorAbility } from "../../new_engine/investigator.ability";

function s(id:number,rid:string,rt:string,o?:{dead?:boolean}){const n:Record<string,string>={investigator:"调查员",poisoner:"投毒者",spy:"间谍",baron:"男爵",scarlet_woman:"红唇女郎",recluse:"陌客",chef:"厨师",imp:"小恶魔",washerwoman:"洗衣妇",soldier:"士兵"};return{id,playerName:`P${id+1}`,isDead:!!o?.dead,isAlive:!o?.dead,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number,nc:number,phase:string,seats:ReturnType<typeof s>[]):MiddlewareContext{return{snapshot:{nightCount:nc,gamePhase:phase,seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"investigator",roleName:"调查员",priority:54,isFirstNightOnly:true,abilityId:"inv_first",wakeMessage:"...",firstNightPriority:54,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});

describe("调查员 引擎集成测试",()=>{
  test("首夜获取爪牙信息",async()=>{
    const ss=[s(0,"investigator","townsfolk"),s(1,"poisoner","minion"),s(2,"chef","townsfolk"),s(3,"imp","demon"),s(4,"soldier","townsfolk")];
    const r=await runFullAbilityPipeline(pipe(investigatorAbility),ctx(0,1,"firstNight",ss));
    expect(r.aborted).toBe(false);expect(r.meta.abilityResult).toBeDefined();
  });
  test("无爪牙返回0",async()=>{
    const ss=[s(0,"investigator","townsfolk"),s(1,"chef","townsfolk"),s(2,"soldier","townsfolk"),s(3,"imp","demon")];
    const r=await runFullAbilityPipeline(pipe(investigatorAbility),ctx(0,1,"firstNight",ss));
    expect(r.aborted).toBe(false);
  });
  test("非首夜不唤醒",async()=>{
    const r=await runFullAbilityPipeline(pipe(investigatorAbility),ctx(0,2,"night",[s(0,"investigator","townsfolk"),s(1,"poisoner","minion")]));
    expect(r.aborted).toBe(true);
  });
  test("陌客可被当作爪牙",async()=>{
    const ss=[s(0,"investigator","townsfolk"),s(1,"recluse","outsider"),s(2,"chef","townsfolk"),s(3,"imp","demon")];
    const r=await runFullAbilityPipeline(pipe(investigatorAbility),ctx(0,1,"firstNight",ss));
    expect(r.aborted).toBe(false);
  });
});