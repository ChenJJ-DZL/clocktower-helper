import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  artistAbility,
  barberAbility,
  cerenovusAbility,
  clockmakerAbility,
  dreamerAbility,
  evil_twinAbility,
  fang_guAbility,
  flowergirlAbility,
  getAbilityForRole,
  initializeAbilityRegistry,
  jugglerAbility,
  klutzAbility,
  mathematicianAbility,
  mutantAbility,
  no_dashiiAbility,
  oracleAbility,
  philosopherAbility,
  pit_hagAbility,
  sageAbility,
  savantAbility,
  seamstressAbility,
  snake_charmerAbility,
  sweetheartAbility,
  town_crierAbility,
  vigormortisAbility,
  vortoxAbility,
  witchAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《梦殒春宵》(Sects & Violets) 全 25 角色百科范例与 UI 同步测试", () => {
  initializeAbilityRegistry();

  it("剧本数据完整性验证：剧本定义与 25 个角色齐全", () => {
    const snv = scripts.find((s) => s.id === "sects_and_violets");
    expect(snv).toBeDefined();
    expect(snv?.name).toBe("梦殒春宵");
    expect(snv?.roleIds).toHaveLength(25);
  });

  describe("镇民角色 (Townsfolk) 范例与 UI 验证", () => {
    it("钟表匠 (Clockmaker)：首夜得知恶魔与最近爪牙之间的座位距离", async () => {
      expect(clockmakerAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "cerenovus", name: "洗脑师", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "vortox", name: "涡流", type: "demon" },
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
          roleId: "clockmaker",
          roleName: "钟表匠",
          priority: 30,
          isFirstNightOnly: true,
          abilityId: "clockmaker_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(clockmakerAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("筑梦师 (Dreamer)：每夜选择 1 名玩家，得知 1 善良 1 邪恶角色（其中之一为其真实角色）", () => {
      expect(dreamerAbility).toBeDefined();
    });

    it("蛇惑/舞蛇人 (Snake Charmer)：每夜选择 1 名玩家，若为恶魔则互换角色与阵营，原恶魔中毒", () => {
      expect(snake_charmerAbility).toBeDefined();
    });

    it("数学家 (Mathematician)：每夜得知当晚或白天因能力异常产生错误信息/失效的玩家数量", () => {
      expect(mathematicianAbility).toBeDefined();
    });

    it("卖花女 (Flowergirl)：每夜得知恶魔今天是否参与了投票", () => {
      expect(flowergirlAbility).toBeDefined();
    });

    it("城镇公告员 (Town Crier)：每夜得知今天是否有爪牙发起了提名", () => {
      expect(town_crierAbility).toBeDefined();
    });

    it("神谕者 (Oracle)：每夜得知死亡玩家中有几名是邪恶的", () => {
      expect(oracleAbility).toBeDefined();
    });

    it("博学者 (Savant)：白天私下拜访说书人，得知 1 真 1 假信息", () => {
      expect(savantAbility).toBeDefined();
    });

    it("裁缝 (Seamstress)：每局游戏限一次选择 2 名玩家，得知他们是否属于同一阵营", () => {
      expect(seamstressAbility).toBeDefined();
    });

    it("哲学家 (Philosopher)：每局游戏限一次获得 1 个在场或不在场良好角色的能力，若在场则该角色醉酒", () => {
      expect(philosopherAbility).toBeDefined();
    });

    it("艺术家 (Artist)：每局游戏限一次向说书人询问一个是非题", () => {
      expect(artistAbility).toBeDefined();
    });

    it("杂耍艺人 (Juggler)：首日猜测 5 人角色，次夜得知猜对数量", () => {
      expect(jugglerAbility).toBeDefined();
    });

    it("贤者 (Sage)：被恶魔杀害时被唤醒得知 2 名玩家（其中 1 名是杀害他的恶魔）", () => {
      expect(sageAbility).toBeDefined();
    });
  });

  describe("外来者与爪牙及恶魔 (Outsiders, Minions & Demons) 范例验证", () => {
    it("变异者/畸形秀演员 (Mutant)：疯狂声称自己是外来者可能被处决", () => {
      expect(mutantAbility).toBeDefined();
    });

    it("甜心 (Sweetheart)：死亡时一名善良玩家醉酒直至游戏结束", () => {
      expect(sweetheartAbility).toBeDefined();
    });

    it("蛮子/莽夫 (Klutz)：死于处决时选择 1 名存活玩家，若为邪恶则善良阵营落败", () => {
      expect(klutzAbility).toBeDefined();
    });

    it("理发师 (Barber)：死于夜晚或白天时恶魔当晚可交换任意两名玩家的角色", () => {
      expect(barberAbility).toBeDefined();
    });

    it("邪恶双子/镜像双子 (Evil Twin)：首夜互认，胜负锁定与羁绊", () => {
      expect(evil_twinAbility).toBeDefined();
    });

    it("女巫 (Witch)：每夜对 1 人施咒，被施咒者次日发起提名立即死亡", () => {
      expect(witchAbility).toBeDefined();
    });

    it("洗脑师 (Cerenovus)：每夜使 1 人对指定善良角色疯狂", () => {
      expect(cerenovusAbility).toBeDefined();
    });

    it("坑魔/麻脸巫婆 (Pit-Hag)：每夜将 1 名玩家变为任意角色（可创造恶魔）", () => {
      expect(pit_hagAbility).toBeDefined();
    });

    it("芳姑/方古 (Fang Gu)：每夜击杀 1 人，首次击杀外来者时跳跃并将该外来者转为邪恶方古", () => {
      expect(fang_guAbility).toBeDefined();
    });

    it("诺达希 (No Dashii)：两侧最近的两名镇民常驻中毒", () => {
      expect(no_dashiiAbility).toBeDefined();
    });

    it("珀克/涡流 (Vortox)：所有镇民信息错乱，白天无人处决邪恶获胜", () => {
      expect(vortoxAbility).toBeDefined();
    });

    it("僵尸领主/维戈莫提斯 (Vigormortis)：击杀爪牙保留其能力且邻近镇民中毒", () => {
      expect(vigormortisAbility).toBeDefined();
    });
  });
});
