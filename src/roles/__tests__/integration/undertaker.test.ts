import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { undertakerAbility } from "../../new_engine/undertaker.ability";

function s(id:number,rid:string,rt:string,o?:{dead?:boolean}){const n:Record<string,string>={undertaker:"送葬者",chef:"厨师",imp:"小恶魔",drunk:"酒鬼",washerwoman:"洗衣妇"};return{id,playerName:`P${id+1}`,isDead:!!o?.dead,isAlive:!o?.dead,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number,nc:number,phase:string,seats:ReturnType<typeof s>[],executedSeatId?:number):MiddlewareContext{
  // mark the executed seat
  const marked = seats.map(s => ({...s, executedToday: s.id === executedSeatId}));
  return{snapshot:{nightCount:nc,gamePhase:phase,seats:marked,statusEffects:{}},actionNode:{seatId:sid,roleId:"undertaker",roleName:"送葬者",priority:93,isFirstNightOnly:false,abilityId:"ut_night",wakeMessage:"...",firstNightPriority:null,otherNightPriority:93,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});

describe("送葬者 引擎集成测试",()=>{
  test("有处决时得知角色",async()=>{
    const ss=[s(0,"undertaker","townsfolk"),s(1,"chef","townsfolk"),s(2,"imp","demon")];
    const r=await runFullAbilityPipeline(pipe(undertakerAbility),ctx(0,2,"night",ss,1));
    expect(r.aborted).toBe(false); expect(r.meta.abilityResult).toBeDefined();
  });
  test("首夜不唤醒(无处决)",async()=>{
    const ss=[s(0,"undertaker","townsfolk"),s(1,"washerwoman","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(undertakerAbility),ctx(0,1,"firstNight",ss))).aborted).toBe(true);
  });
  test("无处决时不唤醒",async()=>{
    const ss=[s(0,"undertaker","townsfolk"),s(1,"washerwoman","townsfolk")];
    expect((await runFullAbilityPipeline(pipe(undertakerAbility),ctx(0,2,"night",ss))).aborted).toBe(true);
  });
});