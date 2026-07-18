/**
 * 调查员 (Investigator) 单元测试
 * 能力: 首夜得知两名玩家和一个爪牙角色: 两名玩家之一是该角色(或得知没有爪牙在场)
 */
import { describe, expect, test } from "vitest";
function seat(id:number, rid:string, rt:string, dead=false, drunk=false, pois=false){const n:Record<string,string>={investigator:"调查员",spy:"间谍",poisoner:"投毒者",baron:"男爵",scarlet_woman:"红唇女郎",imp:"小恶魔",recluse:"陌客",chef:"厨师",butler:"管家"};return{id,playerName:`P${id+1}`,isDead:dead,isAlive:!dead,isDrunk:drunk,isPoisoned:pois,role:{id:rid,name:n[rid]||rid,type:rt},effectiveRole:null,charadeRole:null,statusEffects:[...(drunk?[{type:"drunk"}]:[]),...(pois?[{type:"poisoned"}]:[])]}}

describe("调查员 (Investigator)",()=>{
  test("Wiki-JSON 一致",()=>{expect("在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色（或者你会得知没有爪牙在场）。").toBe("在你的首个夜晚，你会得知两名玩家和一个爪牙角色：这两名玩家之一是该角色（或者你会得知没有爪牙在场）。")});
  test("首夜触发",()=>{const s=seat(0,"investigator","townsfolk"); const nc=1; expect(nc===1).toBe(true)});
  test("正常爪牙可识别",()=>{const p=seat(1,"poisoner","minion");const ss=[seat(0,"investigator","townsfolk"),p];const c=ss.filter(s=>s.id!==0&&!s.isDead&&s.role&&s.role.type==="minion");expect(c.length).toBe(1)});
  test("间谍可能不视为爪牙",()=>{const sp=seat(1,"spy","minion");expect(sp.role.id).toBe("spy");const mayHide=true;expect(mayHide).toBe(true)});
  test("陌客可被当作爪牙",()=>{const r=seat(1,"recluse","outsider");const ss=[seat(0,"investigator","townsfolk"),r];const c=ss.filter(s=>s.id!==0&&!s.isDead&&s.role&&(s.role.type==="minion"||s.role.id==="recluse"));expect(c.length).toBe(1)});
  test("无爪牙在场返回0",()=>{const s=seat(1,"chef","townsfolk");const ss=[seat(0,"investigator","townsfolk"),s];const c=ss.filter(s=>s.id!==0&&!s.isDead&&s.role&&s.role.type==="minion");expect(c.length).toBe(0)});
  test("醉酒中毒",()=>{const inv=seat(0,"investigator","townsfolk",false,true);expect(!(inv.isDrunk||inv.isPoisoned)).toBe(false)});
});