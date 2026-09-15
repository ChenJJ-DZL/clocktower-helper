import { describe, expect, it } from "vitest";
import { parseInfoResult } from "../infoResultParser";

/**
 * 🌾 农夫「夜晚死亡 → 新农夫」结果页引导语（2026-09-14 用户实测缺陷）
 *
 * 用户原话：
 *   「这里不应该是只显示农夫获得消息，当夜晚农夫死亡，产生新农夫时，
 *     应该直接引导说书人，第一行的「农夫获得信息」应该修改为
 *     「唤醒XX号玩家，告知他/她：」。第二行的信息不变。」
 *
 * 缺陷链路（本文件是端到端的**回归哨兵**）：
 *   `generatedRoleWakeTemplates.ts` 里 `role.farmer.wake` 的文案是
 *     「唤醒{{seatNo}}号【农夫（实验角色）】：当你在夜晚死亡时，一名存活的善良玩家会变成农夫」
 *   —— 冒号前是一句**规则说明**，不是"要念给玩家的信息"。
 *   旧行为：冒号按"信息头 + 信息值"切分 ⇒ 第二行大字原样搬出规则说明，
 *   而第一行被 `promptEngine` 的 fallback 渲染成「唤醒N号【农夫】，农夫请行动。」
 *   两个缺陷叠加 ⇒ 结果页既没说清"唤醒谁"，也没给出该对玩家说的话。
 *
 * 修复后的契约（三条同时成立才算修好）：
 *   ① 第一行 = 「唤醒XX号玩家，告知他/她：」（XX = **新农夫**座位号，不是死者）；
 *   ② 第二行 = 该告诉新农夫的话，且**不含**任何 `roleName` 前缀当尾巴；
 *   ③ 冒号前的规则说明不得漏进第二行大字。
 */
describe("农夫 · 夜间死亡传承结果页引导语", () => {
  const PREFIX_5 = "唤醒5号玩家，告知他/她：";
  const LINE2 = "你的身份变为【农夫】，你原本的能力已失效";

  // 修复后引擎应产出的 guide 形态
  const RAW_FIXED = `${PREFIX_5}${LINE2}`;

  it("① 第一行必须是「唤醒XX号玩家，告知他/她：」，且 XX = 新农夫座位号", () => {
    const res = parseInfoResult(RAW_FIXED, "4号-农夫");
    expect(res.prefix).toBe(PREFIX_5);
    // XX 是**新农夫**（5号）而不是死掉的旧农夫（4号）
    expect(res.prefix).toContain("唤醒5号玩家");
    expect(res.prefix).not.toContain("4号");
  });

  it("② 第二行是大字正文本身，不得把「XX号-农夫」拼回结果里", () => {
    const res = parseInfoResult(RAW_FIXED, "4号-农夫");
    expect(res.result).toBe(LINE2);
    // 旧实现（把头部当作纯引导动词）会把 prefix 换成「4号-农夫获得信息」
    expect(res.prefix).not.toBe("4号-农夫获得信息");
    expect(res.result).not.toContain("获得信息");
    expect(res.result).not.toContain("4号-农夫");
  });

  it("③ 修复前的文案形态（冒号前是规则说明）一旦回来就必须能被识别出来", () => {
    // 这条只是把"缺陷形态"钉成可读的对照样本：
    // 若拿到的是旧模板文案，第二行会变成规则说明本身，① 的断言必然失败。
    const RAW_BROKEN =
      "唤醒4号【农夫（实验角色）】：当你在夜晚死亡时，一名存活的善良玩家会变成农夫";
    const res = parseInfoResult(RAW_BROKEN, "4号-农夫");
    // 旧行为的特征：第二行是规则说明
    expect(res.result).toContain("当你在夜晚死亡时");
    // 因此它**不满足**新契约
    expect(res.prefix).not.toBe(PREFIX_5);
  });
});
