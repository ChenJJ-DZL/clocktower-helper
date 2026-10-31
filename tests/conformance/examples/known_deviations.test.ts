/**
 * 官方范例 · 已核实的实现偏差登记（known deviations）
 * ======================================================================
 * 为什么用 `it.fails` 而不是 `test.fixme`：
 *   `it.fails` 断言「这里**当前确实不满足**官方规则」。一旦产品被修好，用例会立刻
 *   变红 ⇒ 强制把这条登记**转正**成 `tb_oracle_batch.test.ts` 里的正式夹具，
 *   并把覆盖率计入台账。比 `fixme`（永远绿、容易被遗忘）多一道棘轮。
 *
 * 登记纪律（本项目血泪）：
 *   · 必须先核对**官方原文**（`docs/poppyganda_official_spec.md` /
 *     `outputs/rule_conformance/official_spec.json` 的 examples 原文）；
 *   · 必须指出判据落在**哪个符号**上（符号没了这条登记就过期，评审要重核）；
 *   · 不得因为"测试写不出来"就把产品判成 bug。
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { ctx, ensureAbilityRegistry, runAbility, seat } from "./_harness";

describe("官方范例 · 已核实偏差（修好后请转正）", () => {
  it.fails(
    "图书管理员#1：陌客被说书人当作爪牙 ⇒ 场上无外来者，应得「0」",
    async () => {
      // 官方原文（图书管理员 范例#1）：
      //   「说书人决定将陌客当作一名爪牙而不是外来者。现在场上没有其他外来者了。
      //     图书管理员得知了「0」。」
      // 官方规则细节亦明示：「在仅有一名外来者且为陌客的情况下，图书管理员可能会将
      //   陌客当作非外来者角色，从而得知没有外来者在场。」
      //
      // 判据符号：`src/roles/new_engine/librarian.ability.ts::getOutsiderCandidates`
      //   —— 该函数只按 `role.type === "outsider"` 收候选，**不读**座位上的
      //   `registerAsEvil` / `registerAsDemon` 登记字段，因此陌客永远被当作外来者，
      //   「说书人把他登记成爪牙」这条分支在引擎里无法表达。
      //
      // 修复方向（不改判据语义，只补登记消费）：
      //   候选筛选时先走 `src/utils/gameRules.ts::getRegistration(seat)`，
      //   若 `registersAsOutsider === false` 则不收该座位（等价于"这不是外来者"）。
      ensureAbilityRegistry();
      const seats = [
        seat(0, "librarian"),
        seat(1, "recluse", { registerAsEvil: true, registerAsDemon: false }),
        seat(2, "imp"),
        seat(3, "chef"),
        seat(4, "soldier"),
      ];
      const res = await runAbility(
        getAbilityForRole("librarian") as any,
        ctx(seats, 0, "librarian", { night: 1, phase: "firstNight" })
      );
      const info = (res.meta as any)?.abilityResult;
      // ⚠️ 只断言**官方期望**，不要在这里写"现状是什么"——
      //    否则修好之后前半段通过、后半段失败，`it.fails` 永远不会转红（假棘轮）。
      expect(
        info?.roleName ?? "",
        `官方要求报「0」，当前报出的是「${info?.roleName}」`
      ).toBe("");
    }
  );

});
