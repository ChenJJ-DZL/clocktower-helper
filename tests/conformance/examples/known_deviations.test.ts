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
  it(
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

  it(
    "贤者#2：死于麻脸巫婆（非恶魔）⇒ 不应醒来、不应得知任何信息",
    async () => {
      // 官方范例: 贤者 #2
      // 官方原文（贤者 范例#2）：
      //   「麻脸巫婆创造了一名恶魔。……说书人决定旧恶魔死亡，贤者也死亡，且当晚这些恶魔
      //     选择攻击的目标中没有贤者。**因为贤者死于麻脸巫婆，而非恶魔，所以贤者不会醒来
      //     也不会得知任何信息。**」
      //
      // 判据符号：`src/roles/new_engine/sage.ability.ts::calculate` 的
      //   `const killedByDemon = ctx.storytellerInput?.killedByDemon ?? ctx.meta.killedByDemon ?? true`
      //   —— 默认值是 **true**（缺省按「被恶魔杀」处理），而这里的死亡来源就写在座位上
      //   （`deathSource: "pit_hag_kill"`），能力完全不读 ⇒ 只要说书人漏填就必报信息。
      //   对照 `banshee.ability.ts` 的同名字段是 fail-closed（默认 false）。
      //
      // 修复方向：按 `deathSource` / `meta.killerRoleId` 推导，取不到才回落到说书人裁定；
      //   ⚠️ 不能只把默认值改成 false —— 生产链路目前没透传 killerRoleId，
      //      那样会让**真正的恶魔击杀**也静默失声（故本轮只登记、不改）。
      ensureAbilityRegistry();
      const seats = [
        seat(0, "sage", { isDead: true, deathSource: "pit_hag_kill" }),
        seat(1, "imp"),
        seat(2, "chef"),
        seat(3, "soldier"),
      ];
      const res = await runAbility(
        getAbilityForRole("sage") as any,
        ctx(seats, 0, "sage", { night: 2, phase: "night" })
      );
      const info = (res.meta as any)?.abilityResult;
      expect(info?.found, "官方：死于非恶魔 ⇒ 不得产出任何候选").toBe(false);
    }
  );

  it(
    "数学家#0：中毒的神谕者给出错误信息 ⇒ 数学家应得知「1」（异常能力计数）",
    async () => {
      // 官方范例: 数学家 #0
      // 官方原文（数学家 范例#0）：
      //   「中毒的神谕者得知有两名死亡玩家是邪恶的，但是事实上有三名死亡玩家是邪恶的。
      //     所有其他能力正常生效。数学家得知了「1」。」
      //
      // 判据符号：`src/roles/new_engine/mathematician.ability.ts::calculate` 读
      //   `snapshot.abnormalAbilityCount`，而**全仓没有任何写入点**（`grep` 只命中读取处）
      //   ⇒ 实际游戏中数学家恒报 0。这不是"元数据口径差"，是「字段有读无写」。
      //
      // 修复方向：在夜/昼结算处统计「因醉酒/中毒（或涡流）而未按真值生效的能力次数」，
      //   写入 `abnormalAbilityCount`；涡流世界的折算口径见官方 数学家#2。
      ensureAbilityRegistry();
      const seats = [
        seat(0, "mathematician"),
        seat(1, "oracle", { isPoisoned: true }),
        seat(2, "imp"),
        seat(3, "poisoner", { isDead: true }),
        seat(4, "scarlet_woman", { isDead: true }),
        seat(5, "chef", { isDead: true }),
      ];
      const res = await runAbility(
        getAbilityForRole("mathematician") as any,
        ctx(seats, 0, "mathematician", { night: 2, phase: "night" })
      );
      const info = (res.meta as any)?.abilityResult;
      expect(info?.abnormalCount, "官方：一名能力未正常生效").toBe(1);
    }
  );
});
