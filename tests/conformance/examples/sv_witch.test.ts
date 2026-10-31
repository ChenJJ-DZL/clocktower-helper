/**
 * 官方范例可执行夹具 · 梦殒春宵 · 女巫（诅咒）
 * ======================================================================
 * 判据唯一事实源：`src/utils/snvMechanics.ts::checkWitchCurseOnNomination`
 *   · 被诅咒者**发起提名** ⇒ 立即死亡
 *   · 场上只剩 ≤3 名存活玩家 ⇒ 诅咒自动移除（不再触发）
 *
 * 未编码：官方 女巫#4（流放不受诅咒影响）。流放不经过「提名」判据，
 * 现状没有可断言的流放入口函数 —— 宁可不计覆盖，也不写一条恒真的假断言。
 */
import { describe, expect, it } from "vitest";
import { checkWitchCurseOnNomination } from "../../../src/utils/snvMechanics";
import { seat } from "./_harness";

const CURSED = [{ type: "cursed", source: "witch" }];

describe("梦殒春宵 · 女巫诅咒官方范例", () => {
  // 官方范例: 女巫 #0
  it("女巫#0：贤者被诅咒后发起提名 ⇒ 立即死亡", () => {
    const sage = seat(1, "sage", { statusEffects: CURSED });
    expect(checkWitchCurseOnNomination(sage, 8, [1]).shouldDie).toBe(true);
  });

  // 官方范例: 女巫 #1
  it("女巫#1：女巫诅咒自己 ⇒ 她自己提名时同样立即死亡", () => {
    const witch = seat(0, "witch", { statusEffects: CURSED });
    expect(checkWitchCurseOnNomination(witch, 8, [0]).shouldDie).toBe(true);
    // 对照：未被诅咒的玩家提名不会死（判据不是恒真）
    const innocent = seat(2, "chef");
    expect(checkWitchCurseOnNomination(innocent, 8, [0]).shouldDie).toBe(false);
  });

  // 官方范例: 女巫 #2
  it("女巫#2：呆瓜被方古转化后仍带着诅咒 ⇒ 发起提名依然死亡", () => {
    // 官方：方古攻击呆瓜 ⇒ 呆瓜变成新的方古；「新的方古现在被诅咒，他发起了提名，然后死了」
    const transformed = seat(3, "fang_gu", { statusEffects: CURSED });
    expect(
      checkWitchCurseOnNomination(transformed, 8, []).shouldDie,
      "角色变化不应丢失诅咒标记"
    ).toBe(true);
  });

  // 官方范例: 女巫 #3
  it("女巫#3：只剩三名存活玩家 ⇒ 诅咒被移除，被诅咒者可以安全提名", () => {
    const savant = seat(4, "savant", { statusEffects: CURSED });
    expect(
      checkWitchCurseOnNomination(savant, 3, [4]).shouldDie,
      "官方：只剩 3 人时诅咒移出游戏"
    ).toBe(false);
    // 对照：4 名存活时诅咒仍然有效（边界不是恒假）
    expect(checkWitchCurseOnNomination(savant, 4, [4]).shouldDie).toBe(true);
  });
});
