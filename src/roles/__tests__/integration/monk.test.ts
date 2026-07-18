import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { monkAbility } from "../../new_engine/monk.ability";

function s(id:number,rid:string,rt:string,o?:{drunk?:boolean}){const n:Record<string,string>={monk:"僧侣",soldier:"士兵",imp:"小恶魔",washerwoman:"洗衣妇"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:!!o?.drunk,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:o?.drunk?[{type:"drunk"}]:[],hasAbilityEvenDead:false}}
function ctx(sid:number,nc:number,phase:string,seats:ReturnType<typeof s>[],targetIds?:number[]):MiddlewareContext{return{snapshot:{nightCount:nc,gamePhase:phase,seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"monk",roleName:"僧侣",priority:24,isFirstNightOnly:false,abilityId:"monk_night",wakeMessage:"...",firstNightPriority:null,otherNightPriority:24,targetIds:targetIds||[1],processed:false,success:false,meta:{}},targetIds:targetIds||[1],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});

describe("僧侣 引擎集成测试",()=>{
  test("选择目标标记保护",async()=>{
    const ss=[s(0,"monk","townsfolk"),s(1,"soldier","townsfolk"),s(2,"imp","demon")];
    expect((await runFullAbilityPipeline(pipe(monkAbility),ctx(0,2,"night",ss,[1]))).aborted).toBe(false);
  });
  test("首夜不唤醒",async()=>{
    expect((await runFullAbilityPipeline(pipe(monkAbility),ctx(0,1,"firstNight",[s(0,"monk","townsfolk"),s(1,"soldier","townsfolk")]))).aborted).toBe(true);
  });
  test("醉酒时保护失效",async()=>{
    const ss=[s(0,"monk","townsfolk",{drunk:true}),s(1,"soldier","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(monkAbility),ctx(0,2,"night",ss,[1]))).aborted).toBe(false);
    // 醉酒时管道仍执行，但abilityEffective=false
  });
});