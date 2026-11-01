/**
 * 官方范例夹具 · 管家 / Q宝（投票跟随主人）
 * ======================================================================
 * 官方【管家#1】：「管家和他的主人一同举手投票。轮到说书人开始计票时，主人的在最后一秒
 *   放下了自己的手。管家此时也必须立刻放下自己的手。」
 * 官方【Q宝#0】：同一条规则（Q宝 = 管家 的旅行者版本）。
 *
 * 判据唯一事实源：`butler.ability.ts::isButlerVoteLegal`（Q宝直接复用该能力）。
 */
import { describe, expect, it } from "vitest";
import { butlerAbility, isButlerVoteLegal } from "../../../src/roles/new_engine/butler.ability";
import { qutlerAbility } from "../../../src/roles/new_engine/qutler.ability";
import { seat } from "./_harness";

describe("管家 · 主人放下手后自己也不能投票（官方 管家#1）", () => {
  it("管家#1：主人在计票前收手 ⇒ 管家的票无效", () => {
    // 官方范例: 管家#1
    const butler = seat(0, "butler", { masterId: 1 });
    expect(
      isButlerVoteLegal(butler as any, false, false, false),
      "主人没投票 ⇒ 管家不得投票"
    ).toBe(false);
  });

  it("管家：主人举着手 ⇒ 管家可以投票（判据不得恒假）", () => {
    // 官方范例: 管家#1（正向对照：同一判据必须能给出 true）
    const butler = seat(0, "butler", { masterId: 1 });
    expect(
      isButlerVoteLegal(butler as any, true, false, false),
      "主人投票 ⇒ 管家可以投票"
    ).toBe(true);
  });
});

describe("Q宝 · 同一条规则，且确实复用管家能力（官方 Q宝#0）", () => {
  it("Q宝#0：主人没投票 ⇒ Q宝无法举手；主人投票 ⇒ 可以", () => {
    // 官方范例: Q宝#0
    const qutler = seat(0, "qutler", { masterId: 1 });
    expect(
      isButlerVoteLegal(qutler as any, false, false, false),
      "主人未投票 ⇒ Q宝不能投票"
    ).toBe(false);
    expect(
      isButlerVoteLegal(qutler as any, true, false, false),
      "主人投票 ⇒ Q宝可以投票"
    ).toBe(true);
  });

  it("Q宝 与 管家 共用同一份能力实现（避免两份规则各自漂移）", () => {
    // 官方范例: Q宝#0
    // 说明：Q宝是旅行者版管家，规则完全相同；这里钉住「同一实现」这件事，
    //       否则两份代码会各自演化（本项目已因「两个实现」栽过多次）。
    // 对象本身是新的（Q宝有自己的名字/描述），但**四段管道函数必须是同一引用**
    expect((qutlerAbility as any).calculate).toBe((butlerAbility as any).calculate);
    expect((qutlerAbility as any).preCheck).toBe((butlerAbility as any).preCheck);
    expect((qutlerAbility as any).stateUpdate).toBe((butlerAbility as any).stateUpdate);
  });
});
