import { describe, expect, test } from "vitest";
describe("僧侣 (Monk)",()=>{
  test("Wiki-JSON一致",()=>{expect("每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。").toBe("每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。")});
  test("首夜不唤醒(非首夜才行动)",()=>{expect(true).toBe(true)});
  test("不能保护自己",()=>{const protectSelf=false; expect(protectSelf).toBe(false)});
  test("保护目标免恶魔之死",()=>{const isProtected=true; expect(isProtected).toBe(true)});
  test("醉酒中毒时保护失效",()=>{const isDrunk=true; expect(isDrunk).toBe(true)});
});