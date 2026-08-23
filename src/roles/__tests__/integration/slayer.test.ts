import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { slayerAbility } from "../../new_engine/slayer.ability";
function s(id:number,rid:string,rt:string){const n:Record<string,string>={slayer:"猎手",imp:"小恶魔",soldier:"士兵",washerwoman:"洗衣妇"};return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,role:{id:rid,name:n[rid]||rid,type:rt},isDrunk:false,isPoisoned:false,statusEffects:[],hasAbilityEvenDead:false,hasUsedDayAbility:false}}
function ctx(sid:number,seats:ReturnType<typeof s>[]):MiddlewareContext{return{snapshot:{nightCount:2,gamePhase:"day",seats,statusEffects:{}},actionNode:{seatId:sid,roleId:"slayer",roleName:"猎手",priority:0,isFirstNightOnly:false,abilityId:"slayer_day",wakeMessage:"...",firstNightPriority:null,otherNightPriority:null,targetIds:[1],processed:false,success:false,meta:{}},targetIds:[1],meta:{},aborted:false}}
const pipe=(a:any)=>({preCheck:a.preCheck,calculate:a.calculate,stateUpdate:a.stateUpdate,postProcess:a.postProcess});
describe("猎手 引擎集成测试", () => {
  test("能力管道执行 - 真实猎手射中恶魔", async () => {
    const res = await runFullAbilityPipeline(
      pipe(slayerAbility),
      ctx(0, [s(0, "slayer", "townsfolk"), s(1, "imp", "demon")])
    );
    expect(res.aborted).toBe(false);
    expect(res.snapshot.seats[0].abilityUsed).toBe(true);
    expect(res.snapshot.seats[1].isAlive).toBe(false);
  });

  test("能力管道执行 - 酒鬼伪装猎手射击恶魔无效且标记已使用", async () => {
    const drunkSeat = {
      ...s(0, "drunk", "outsider"),
      isDrunk: true,
      charadeRole: { id: "slayer", name: "猎手", type: "townsfolk" },
    };
    const res = await runFullAbilityPipeline(
      pipe(slayerAbility),
      ctx(0, [drunkSeat, s(1, "imp", "demon")])
    );
    expect(res.aborted).toBe(false);
    expect(res.snapshot.seats[0].abilityUsed).toBe(true);
    // 恶魔存活
    expect(res.snapshot.seats[1].isAlive).toBe(true);
  });
});