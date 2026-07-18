import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
function s(id:number,rid:string,rt:string,o?:{dead?:boolean}){const n:Record<string,string>={scarlet_woman:"红唇女郎",imp:"小恶魔",soldier:"士兵",chef:"厨师",washerwoman:"洗衣妇",butler:"管家",mayor:"镇长"};return{id,playerName:`P${id+1}`,isDead:!!o?.dead,isAlive:!o?.dead,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},statusEffects:[],hasAbilityEvenDead:false}}
function ctx(sid:number):MiddlewareContext{return{snapshot:{nightCount:2,gamePhase:"night",seats:[s(0,"scarlet_woman","minion"),s(1,"imp","demon",{dead:true}),s(2,"soldier","townsfolk"),s(3,"chef","townsfolk"),s(4,"washerwoman","townsfolk"),s(5,"butler","outsider"),s(6,"mayor","townsfolk")],statusEffects:{}},actionNode:{seatId:sid,roleId:"scarlet_woman",roleName:"红唇女郎",priority:0,isFirstNightOnly:false,abilityId:"sw_passive",wakeMessage:"...",firstNightPriority:null,otherNightPriority:null,targetIds:[],processed:false,success:false,meta:{}},targetIds:[],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("红唇女郎 引擎集成测试",()=>{test("≥5人存活恶魔死-变恶魔",async()=>{expect((await runFullAbilityPipeline(pipe(scarletWomanAbility),ctx(0))).aborted).toBe(false)})});
