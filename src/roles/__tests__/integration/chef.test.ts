import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { chefAbility } from "../../new_engine/chef.ability";

function s(id:number,rid:string,rt:string){const n:Record<string,string>={chef:"厨师",imp:"小恶魔",spy:"间谍",poisoner:"投毒者",recluse:"陌客",soldier:"士兵",washerwoman:"洗衣妇",butler:"管家"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number,nc:number,phase:string,seats:ReturnType<typeof s>[]):MiddlewareContext{return{snapshot:{nightCount:nc,gamePhase:phase,seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"chef",roleName:"厨师",priority:55,isFirstNightOnly:true,abilityId:"chef_first",wakeMessage:"...",firstNightPriority:55,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});

describe("厨师 引擎集成测试",()=>{
  test("0对-邪恶不相邻",async()=>{
    const ss=[s(0,"chef","townsfolk"),s(1,"imp","demon"),s(2,"soldier","townsfolk"),s(3,"spy","minion"),s(4,"washerwoman","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(chefAbility),ctx(0,1,"firstNight",ss))).aborted).toBe(false);
  });
  test("1对-两名邪恶相邻",async()=>{
    const ss=[s(0,"chef","townsfolk"),s(1,"imp","demon"),s(2,"spy","minion"),s(3,"washerwoman","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(chefAbility),ctx(0,1,"firstNight",ss))).aborted).toBe(false);
  });
  test("非首夜不唤醒",async()=>{
    expect((await runFullAbilityPipeline(pipe(chefAbility),ctx(0,2,"night",[s(0,"chef","townsfolk"),s(1,"imp","demon")]))).aborted).toBe(true);
  });
});