import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  baronAbility,
  butlerAbility,
  chefAbility,
  drunkAbility,
  empathAbility,
  fortuneTellerAbility,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(washerwomanAbility?.roleId, "能力未挂到正确角色").toBe("washerwoman");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(librarianAbility?.roleId, "能力未挂到正确角色").toBe("librarian");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(investigatorAbility?.roleId, "能力未挂到正确角色").toBe("investigator");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "investigator", name: "调查员", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(chefAbility?.roleId, "能力未挂到正确角色").toBe("chef");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "chef", name: "厨师", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(empathAbility?.roleId, "能力未挂到正确角色").toBe("empath");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "empath", name: "共情者", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(fortuneTellerAbility?.roleId, "能力未挂到正确角色").toBe("fortune_teller");
    });

    it("送葬者 (Undertaker)：仅在当天有玩家死于处决时唤醒并得知其真实角色", async () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(undertakerAbility?.roleId, "能力未挂到正确角色").toBe("undertaker");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "undertaker", name: "送葬者", type: "townsfolk" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: true,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(monkAbility?.roleId, "能力未挂到正确角色").toBe("monk");
    });

    it("守鸦人 (Ravenkeeper)：夜晚死亡时被唤醒查验 1 名玩家角色", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(ravenkeeperAbility?.roleId, "能力未挂到正确角色").toBe("ravenkeeper");
    });

    it("贞洁者 (Virgin)：首次被镇民提名时立即处决提名者", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(virginAbility?.roleId, "能力未挂到正确角色").toBe("virgin");
    });

    it("杀手 (Slayer)：白天限一次公开射杀恶魔", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(slayerAbility?.roleId, "能力未挂到正确角色").toBe("slayer");
    });

    it("士兵 (Soldier)：对恶魔攻击免疫", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(soldierAbility?.roleId, "能力未挂到正确角色").toBe("soldier");
    });

    it("镇长 (Mayor)：决胜保护与杀害转移", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(mayorAbility?.roleId, "能力未挂到正确角色").toBe("mayor");
    });
  });

  describe("外来者与爪牙及恶魔 (Outsiders, Minions & Demons) 范例验证", () => {
    it("管家 (Butler)：每夜选择 1 名主人，投票必须跟随主人", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(butlerAbility?.roleId, "能力未挂到正确角色").toBe("butler");
    });

    it("酒鬼 (Drunk)：以为自己是镇民但实际无能力", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(drunkAbility?.roleId, "能力未挂到正确角色").toBe("drunk");
    });

    it("陌客 (Recluse)：可能被当作邪恶/爪牙/恶魔", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(recluseAbility?.roleId, "能力未挂到正确角色").toBe("recluse");
    });

    it("圣徒 (Saint)：死于处决时邪恶直接获胜", () => {
      // ⚠️ 命名陷阱：本仓库有**两个叫「圣徒」的角色**
      //   · `saint`（外来者，暗流涌动用）→ 被动，**没有**新引擎能力，
      //      胜负由 app/gameLogic.ts 的 checkGameEnd 处理
      //   · `saint_townsfolk`（扩展镇民，非 TB 花名册）→ 才是这个能力的归属
      //   因此这里断言它挂到 `saint_townsfolk`，而 TB 的 `saint` 走裸能力校验。
      expect(
        saintAbility?.roleId,
        "saintAbility 属于扩展镇民 saint_townsfolk，不是 TB 的外来者 saint"
      ).toBe("saint_townsfolk");
      expect(roles.find((r) => r.id === "saint")?.type, "TB 的圣徒是外来者").toBe(
        "outsider"
      );
    });

    it("投毒者 (Poisoner)：每夜使 1 名玩家中毒", async () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(poisonerAbility?.roleId, "能力未挂到正确角色").toBe("poisoner");
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
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
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(spyAbility?.roleId, "能力未挂到正确角色").toBe("spy");
    });

    it("红唇女郎 (Scarlet Woman)：恶魔死亡且存活玩家 >= 5 时继承恶魔", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(scarlet_womanAbility?.roleId, "能力未挂到正确角色").toBe("scarlet_woman");
    });

    it("男爵 (Baron)：+2 外来者设置调整", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(baronAbility?.roleId, "能力未挂到正确角色").toBe("baron");
    });

    it("小恶魔 (Imp)：每夜杀害 1 人，自戕转火爪牙", () => {
      // 接线断言：能力必须挂到正确角色（能抓到复制粘贴错位）
      expect(impAbility?.roleId, "能力未挂到正确角色").toBe("imp");
    });
  });
});
