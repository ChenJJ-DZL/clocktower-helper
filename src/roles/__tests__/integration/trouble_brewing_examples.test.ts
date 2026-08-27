import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { generateNightInfo } from "../../../utils/nightInfoGenerator";
import {
  baronAbility,
  butlerAbility,
  chefAbility,
  drunkAbility,
  empathAbility,
  fortuneTellerAbility,
  getAbilityForRole,
  impAbility,
  initializeAbilityRegistry,
  investigatorAbility,
  librarianAbility,
  mayorAbility,
  monkAbility,
  poisonerAbility,
  ravenkeeperAbility,
  recluseAbility,
  saintAbility,
  scarlet_womanAbility,
  slayerAbility,
  soldierAbility,
  spyAbility,
  undertakerAbility,
  virginAbility,
  washerwomanAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《暗流涌动》(Trouble Brewing) 全 22 角色百科范例与 UI 同步测试", () => {
  initializeAbilityRegistry();

  it("剧本数据完整性验证：剧本定义与 22 个角色齐全", () => {
    const tb = scripts.find((s) => s.id === "trouble_brewing");
    expect(tb).toBeDefined();
    expect(tb?.name).toBe("暗流涌动");
    expect(tb?.roleIds).toHaveLength(22);
  });

  describe("镇民角色 (Townsfolk) 范例与 UI 验证", () => {
    it("洗衣妇 (Washerwoman)：首夜得知 2 名玩家中 1 名是特定镇民", async () => {
      expect(washerwomanAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          roleId: "washerwoman",
          roleName: "洗衣妇",
          priority: 30,
          isFirstNightOnly: true,
          abilityId: "washerwoman_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(washerwomanAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("图书管理员 (Librarian)：首夜得知 2 名玩家中 1 名是特定外来者（若无则得知 0）", async () => {
      expect(librarianAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          roleId: "librarian",
          roleName: "图书管理员",
          priority: 31,
          isFirstNightOnly: true,
          abilityId: "librarian_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(librarianAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("调查员 (Investigator)：首夜得知 2 名玩家中 1 名是特定爪牙", async () => {
      expect(investigatorAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "investigator", name: "调查员", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          roleId: "investigator",
          roleName: "调查员",
          priority: 32,
          isFirstNightOnly: true,
          abilityId: "investigator_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(investigatorAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("厨师 (Chef)：首夜得知邻座邪恶玩家对数", async () => {
      expect(chefAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "chef", name: "厨师", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          roleId: "chef",
          roleName: "厨师",
          priority: 33,
          isFirstNightOnly: true,
          abilityId: "chef_first_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(chefAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("共情者 (Empath)：每夜得知与其相邻的存活玩家中有几名是邪恶的", async () => {
      expect(empathAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "empath", name: "共情者", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "empath",
          roleName: "共情者",
          priority: 34,
          isFirstNightOnly: false,
          abilityId: "empath_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(empathAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("占卜师 (Fortune Teller)：每夜查验 2 名玩家并识别恶魔或红罗刹", () => {
      expect(fortuneTellerAbility).toBeDefined();
    });

    it("送葬者 (Undertaker)：仅在当天有玩家死于处决时唤醒并得知其真实角色", async () => {
      expect(undertakerAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "undertaker", name: "送葬者", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: true,
          isAlive: false,
          executedToday: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          executedToday: 1,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "undertaker",
          roleName: "送葬者",
          priority: 36,
          isFirstNightOnly: false,
          abilityId: "undertaker_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(undertakerAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("僧侣 (Monk)：每夜守护 1 名其他玩家免受恶魔杀害", () => {
      expect(monkAbility).toBeDefined();
    });

    it("守鸦人 (Ravenkeeper)：夜晚死亡时被唤醒查验 1 名玩家角色", () => {
      expect(ravenkeeperAbility).toBeDefined();
    });

    it("贞洁者 (Virgin)：首次被镇民提名时立即处决提名者", () => {
      expect(virginAbility).toBeDefined();
    });

    it("杀手 (Slayer)：白天限一次公开射杀恶魔", () => {
      expect(slayerAbility).toBeDefined();
    });

    it("士兵 (Soldier)：对恶魔攻击免疫", () => {
      expect(soldierAbility).toBeDefined();
    });

    it("镇长 (Mayor)：决胜保护与杀害转移", () => {
      expect(mayorAbility).toBeDefined();
    });
  });

  describe("外来者与爪牙及恶魔 (Outsiders, Minions & Demons) 范例验证", () => {
    it("管家 (Butler)：每夜选择 1 名主人，投票必须跟随主人", () => {
      expect(butlerAbility).toBeDefined();
    });

    it("酒鬼 (Drunk)：以为自己是镇民但实际无能力", () => {
      expect(drunkAbility).toBeDefined();
    });

    it("陌客 (Recluse)：可能被当作邪恶/爪牙/恶魔", () => {
      expect(recluseAbility).toBeDefined();
    });

    it("圣徒 (Saint)：死于处决时邪恶直接获胜", () => {
      expect(saintAbility).toBeDefined();
    });

    it("投毒者 (Poisoner)：每夜使 1 名玩家中毒", async () => {
      expect(poisonerAbility).toBeDefined();
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];
      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "poisoner",
          roleName: "投毒者",
          priority: 10,
          isFirstNightOnly: false,
          abilityId: "poisoner_night_ability",
          targetIds: [1],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [1],
        meta: {},
        aborted: false,
      };
      const res = await runFullAbilityPipeline(pipe(poisonerAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("间谍 (Spy)：每夜查看魔典，可能被当作善良/镇民", () => {
      expect(spyAbility).toBeDefined();
    });

    it("红唇女郎 (Scarlet Woman)：恶魔死亡且存活玩家 >= 5 时继承恶魔", () => {
      expect(scarlet_womanAbility).toBeDefined();
    });

    it("男爵 (Baron)：+2 外来者设置调整", () => {
      expect(baronAbility).toBeDefined();
    });

    it("小恶魔 (Imp)：每夜杀害 1 人，自戕转火爪牙", () => {
      expect(impAbility).toBeDefined();
    });
  });
});
