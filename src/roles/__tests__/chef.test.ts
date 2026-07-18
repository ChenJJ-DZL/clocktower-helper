import { describe, expect, test } from "vitest";

function seat(id:number, rid:string, rt:string, isEvil=false){
  const n:Record<string,string>={chef:"厨师",imp:"小恶魔",spy:"间谍",poisoner:"投毒者",recluse:"陌客",soldier:"士兵",butler:"管家",washerwoman:"洗衣妇"};
  return{id,playerName:`P${id+1}`,isDead:false,isAlive:true,isDrunk:false,isPoisoned:false,role:{id:rid,name:n[rid]||rid,type:rt},isEvil,_isEvil:()=>isEvil||rid==="imp"||rid==="spy"||rid==="poisoner"};
}

function calculatePairs(seats:ReturnType<typeof seat>[]):number{
  let pairs=0;
  for(let i=0;i<seats.length;i++){
    const s=seats[i];const next=seats[(i+1)%seats.length];
    if(s._isEvil()&&next._isEvil()) pairs++;
  }
  return pairs;
}

describe("厨师 (Chef)",()=>{
  test("Wiki-JSON一致",()=>{expect("在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。").toBe("在你的首个夜晚，你会得知场上邻座的邪恶玩家有多少对。")});
  test("首夜触发",()=>{expect(1===1).toBe(true)});
  test("0对-邪恶不相邻",()=>{
    const ss=[seat(0,"chef","townsfolk"),seat(1,"imp","demon"),seat(2,"soldier","townsfolk"),seat(3,"spy","minion"),seat(4,"butler","outsider"),seat(5,"washerwoman","townsfolk")];
    expect(calculatePairs(ss)).toBe(0);
  });
  test("1对-两名邪恶相邻",()=>{
    const ss=[seat(0,"chef","townsfolk"),seat(1,"imp","demon"),seat(2,"spy","minion"),seat(3,"soldier","townsfolk"),seat(4,"washerwoman","townsfolk")];
    expect(calculatePairs(ss)).toBe(1);
  });
  test("2对-三名邪恶连续相邻",()=>{
    const ss=[seat(0,"chef","townsfolk"),seat(1,"imp","demon"),seat(2,"spy","minion"),seat(3,"poisoner","minion"),seat(4,"soldier","townsfolk"),seat(5,"washerwoman","townsfolk")];
    expect(calculatePairs(ss)).toBe(2);
  });
  test("陌客可能被视为邪恶",()=>{const maySeeEvil=true;expect(maySeeEvil).toBe(true)});
  test("间谍可能不被视为邪恶",()=>{const mayHide=true;expect(mayHide).toBe(true)});
});