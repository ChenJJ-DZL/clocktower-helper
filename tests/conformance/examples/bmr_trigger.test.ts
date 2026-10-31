/**
 * 官方范例可执行夹具 · 黯月初升（触发链批次）
 * ======================================================================
 * 覆盖三条触发型规则：
 *   · 教父：只在「今日有外来者死亡」的夜晚才能额外击杀（否则不唤醒）
 *   · 主谋：恶魔在白天的**真实**死亡才触发「额外一天一夜」；假死不算
 *   · 沙巴洛斯：多目标攻击里，受保护的目标存活、未受保护的目标死亡
 *
 * ⚠️ 主谋#3 官方原文是「处决僵怖并未导致游戏结束 ⇒ 主谋未触发；第二次真死才触发」，
 *    对应实现里的 `snapshot.demonExecutedToday`。同一份快照字段的两次取值，
 *    合起来才是官方结论，所以这条用例内部跑两次能力。
 */
import { expect } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { ctx, ensureAbilityRegistry, runAbility, seat } from "./_harness";
import { describeOracle } from "./_rows";

describe("黯月初升 · 触发链官方范例", () => {
  describeOracle("教父 / 主谋 / 沙巴洛斯", [
    {
      // 官方范例: 教父 #0
      id: "教父#0：白天有外来者（疯子）死亡 ⇒ 当晚教父可额外杀死和平主义者",
      roleId: "godfather",
      seats: ["godfather", "pacifist", "imp", "chef"],
      night: 3,
      targets: [1],
      snapshot: { outsiderDiedToday: true },
      check: ({ info, seats }) => {
        expect(info?.killed, "应进入击杀分支").toBe(true);
        expect(seats[1]?.role?.id).toBe("pacifist");
        expect(seats[1]?.isDead, "和平主义者应被教父杀死").toBe(true);
      },
    },
    {
      // 官方范例: 教父 #1
      id: "教父#1：修补匠受魔鬼代言人保护而存活 ⇒ 当日无外来者死亡 ⇒ 教父当晚不行动",
      roleId: "godfather",
      seats: ["godfather", "tinker", "imp", "chef"],
      night: 3,
      targets: [1],
      snapshot: { outsiderDiedToday: false },
      expect: { aborted: true, alive: [1] },
    },
    {
      // 官方范例: 主谋 #3
      id: "主谋#3：僵怖假死时主谋不触发；真死才额外延长一天一夜",
      roleId: "mastermind",
      seats: ["mastermind", "imp", "chef"],
      phase: "day",
      snapshot: { demonExecutedToday: false },
      check: async () => {
        ensureAbilityRegistry();
        const ability = getAbilityForRole("mastermind");
        expect(ability, "主谋必须注册新引擎能力").toBeTruthy();

        const fakeDeath = await runAbility(
          ability,
          ctx([seat(0, "mastermind"), seat(1, "imp"), seat(2, "chef")], 0, "mastermind", {
            phase: "day",
            snapshot: { demonExecutedToday: false },
          })
        );
        expect(
          (fakeDeath.meta as any)?.abilityResult?.gameExtended,
          "假死（处决僵怖未导致游戏结束）不应触发主谋"
        ).toBe(false);

        const realDeath = await runAbility(
          ability,
          ctx([seat(0, "mastermind"), seat(1, "imp"), seat(2, "chef")], 0, "mastermind", {
            phase: "day",
            snapshot: { demonExecutedToday: true },
          })
        );
        expect(
          (realDeath.meta as any)?.abilityResult?.gameExtended,
          "真正的白天死亡必须触发额外一天一夜"
        ).toBe(true);
      },
    },
    {
      // 官方范例: 沙巴洛斯 #0
      id: "沙巴洛斯#0：同时攻击造谣者与受旅店老板保护的赌徒 ⇒ 前者死、后者活",
      roleId: "shabaloth",
      seats: [
        "shabaloth",
        "gossip",
        [2, "gambler", { statusEffects: [{ type: "protected" }] }],
        "chef",
        "soldier",
      ],
      night: 2,
      targets: [1, 2],
      check: ({ seats }) => {
        expect(seats[1]?.isDead, "造谣者未受保护 ⇒ 应死亡").toBe(true);
        expect(seats[2]?.isDead, "受保护的赌徒不应死亡").toBe(false);
      },
    },
  ]);
});
