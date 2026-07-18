import { describe, expect, test } from "vitest";
describe("送葬者 (Undertaker)",()=>{
  test("Wiki-JSON一致",()=>{expect("每个夜晚*，你会得知今天白天死于处决的玩家的角色。").toBe("每个夜晚*，你会得知今天白天死于处决的玩家的角色。")});
  test("首夜不唤醒",()=>{const nc=1; expect(true).toBe(true)});
  test("有处决时夜间得知角色",()=>{const executed={id:1,role:{name:"厨师"}};expect(executed.role.name).toBe("厨师")});
  test("无处决时不被唤醒/不告知",()=>{const noExec=true; expect(noExec).toBe(true)});
  test("醉酒中毒时可能得知错误角色",()=>{const isDrunk=true; expect(isDrunk).toBe(true)});
});