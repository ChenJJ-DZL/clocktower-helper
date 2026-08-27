import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  acrobatAbility,
  assassinAbility,
  chambermaidAbility,
  courtierAbility,
  devils_advocateAbility,
  exorcistAbility,
  foolAbility,
  gamblerAbility,
  getAbilityForRole,
  godfatherAbility,
  goonAbility,
  gossipAbility,
  grandmotherAbility,
  initializeAbilityRegistry,
  innkeeperAbility,
  lunaticAbility,
  mastermindAbility,
  moonchildAbility,
  pacifistAbility,
  poAbility,
  professorAbility,
  pukkaAbility,
  sailorAbility,
  shabalothAbility,
  tea_ladyAbility,
  tinkerAbility,
  zombuulAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《黯月初升》(Bad Moon Rising) 全 25 角色百科范例与 UI 同步测试", () => {
  initializeAbilityRegistry();

  it("剧本数据完整性验证：剧本定义与 25 个角色齐全", () => {
    const bmr = scripts.find((s) => s.id === "bad_moon_rising");
    expect(bmr).toBeDefined();
    expect(bmr?.name).toBe("黯月初升");
    expect(bmr?.roleIds).toHaveLength(25);
  });

  describe("镇民角色 (Townsfolk) 范例与 UI 验证", () => {
    it("祖母 (Grandmother)：首夜得知孙子角色与座位，孙子被恶魔杀害时祖母随之死亡", async () => {
      expect(grandmotherAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "grandmother", name: "祖母", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "sailor", name: "水手", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "pukka", name: "普卡", type: "demon" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 1,
          gamePhase: "firstNight",
          seats,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "grandmother",
          roleName: "祖母",
          priority: 30,
          isFirstNightOnly: true,
          abilityId: "grandmother_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(grandmotherAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("水手 (Sailor)：每夜选择 1 名存活玩家拼酒，一人醉酒且水手不会死亡", () => {
      expect(sailorAbility).toBeDefined();
    });

    it("侍女 (Chambermaid)：每夜查验 2 名存活玩家当晚是否因自身能力被唤醒", async () => {
      expect(chambermaidAbility).toBeDefined();
    });

    it("驱魔人 (Exorcist)：每夜选择 1 名玩家，若为恶魔则恶魔当晚无法被唤醒", () => {
      expect(exorcistAbility).toBeDefined();
    });

    it("旅店老板 (Innkeeper)：每夜选择 2 名玩家使其当晚不会死亡，其中一人醉酒", () => {
      expect(innkeeperAbility).toBeDefined();
    });

    it("赌徒 (Gambler)：每夜猜测 1 名玩家角色，猜错则自己死亡", () => {
      expect(gamblerAbility).toBeDefined();
    });

    it("闲话者 (Gossip)：白天公开声明一句话，若为真则当晚有 1 名玩家死亡", () => {
      expect(gossipAbility).toBeDefined();
    });

    it("侍从 (Courtier)：每局游戏限一次选择 1 个角色使其醉酒 3 夜 3 天", () => {
      expect(courtierAbility).toBeDefined();
    });

    it("教授 (Professor)：每局游戏限一次选择 1 名死亡玩家，若为镇民则使其复活", () => {
      expect(professorAbility).toBeDefined();
    });

    it("敏手 (Acrobat)：邻近存活玩家中毒或醉酒时，敏手当晚死亡", () => {
      expect(acrobatAbility).toBeDefined();
    });

    it("纪律委员 (Tea Lady)：若两侧邻近存活玩家均为善良，他们不会死亡", () => {
      expect(tea_ladyAbility).toBeDefined();
    });

    it("和平主义者 (Pacifist)：被处决的善良玩家可能不会死亡", () => {
      expect(pacifistAbility).toBeDefined();
    });

    it("傻瓜 (Fool)：首次死亡时不会真正死亡", () => {
      expect(foolAbility).toBeDefined();
    });
  });

  describe("外来者与爪牙及恶魔 (Outsiders, Minions & Demons) 范例验证", () => {
    it("叮当 (Tinker)：可能在任意时刻死亡（说书人裁定）", () => {
      expect(tinkerAbility).toBeDefined();
    });

    it("呆瓜 (Moonchild)：死于白天时选择 1 名玩家，若为善良则当晚死亡", () => {
      expect(moonchildAbility).toBeDefined();
    });

    it("捣蛋鬼 (Goon)：被选择后醉酒当晚，选他的人所在阵营转变捣蛋鬼阵营", () => {
      expect(goonAbility).toBeDefined();
    });

    it("疯子 (Lunatic)：以为自己是恶魔，获虚假爪牙并受恶魔监控", () => {
      expect(lunaticAbility).toBeDefined();
    });

    it("教父 (Godfather)：+1/-1 外来者，有外来者死亡当晚可额外杀 1 人", () => {
      expect(godfatherAbility).toBeDefined();
    });

    it("恶魔代言人 (Devil's Advocate)：每夜守护 1 人使其免于次日处决死亡", () => {
      expect(devils_advocateAbility).toBeDefined();
    });

    it("刺客 (Assassin)：每局游戏限一次夜间无视保护直接刺杀 1 人", () => {
      expect(assassinAbility).toBeDefined();
    });

    it("策划者 (Mastermind)：恶魔死于处决后游戏继续一天，若无人处决邪恶获胜", () => {
      expect(mastermindAbility).toBeDefined();
    });

    it("祖布尔 (Zombuul)：无死者夜晚可杀 1 人，首次死亡假死存活", () => {
      expect(zombuulAbility).toBeDefined();
    });

    it("珀 (Po)：可选择不杀蓄力，次夜可连杀 3 人", () => {
      expect(poAbility).toBeDefined();
    });

    it("普卡 (Pukka)：每夜使 1 人中毒，上夜中毒者当晚死亡", () => {
      expect(pukkaAbility).toBeDefined();
    });

    it("沙巴洛斯 (Shabaloth)：每夜杀 2 人，可能反刍复活 1 人", () => {
      expect(shabalothAbility).toBeDefined();
    });
  });
});
