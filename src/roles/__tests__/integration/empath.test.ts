import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { empathAbility } from "../../new_engine/empath.ability";

function s(id:number,rid:string,rt:string,o?:{dead?:boolean}){const n:Record<string,string>={empath:"共情者",imp:"小恶魔",spy:"间谍",soldier:"士兵",washerwoman:"洗衣妇",butler:"管家"};return{id,playerName:`P${id+1}`,isDead:!!o?.dead,isAlive:!o?.dead,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number,nc:number,phase:string,seats:ReturnType<typeof s>[]):MiddlewareContext{return{snapshot:{nightCount:nc,gamePhase:phase,seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"empath",roleName:"共情者",priority:56,isFirstNightOnly:false,abilityId:"empath_night",wakeMessage:"...",firstNightPriority:56,otherNightPriority:90,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});

describe("共情者 引擎集成测试",()=>{
  test("两旁皆善-返回0",async()=>{
    const ss=[s(1,"washerwoman","townsfolk"),s(0,"empath","townsfolk"),s(2,"soldier","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(empathAbility),ctx(0,1,"firstNight",ss))).aborted).toBe(false);
  });
  test("一旁邪恶-返回1",async()=>{
    const ss=[s(1,"imp","demon"),s(0,"empath","townsfolk"),s(2,"soldier","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(empathAbility),ctx(0,1,"firstNight",ss))).aborted).toBe(false);
  });
  test("每夜唤醒",async()=>{
    const ss=[s(0,"empath","townsfolk"),s(1,"washerwoman","townsfolk"),s(2,"soldier","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(empathAbility),ctx(0,3,"night",ss))).aborted).toBe(false);
  });
});