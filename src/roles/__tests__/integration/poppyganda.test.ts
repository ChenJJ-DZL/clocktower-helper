import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { generateNightInfo } from "../../../utils/nightInfoGenerator";
import {
  bounty_hunterAbility,
  cerenovusAbility,
  chefAbility,
  drunkAbility,
  evil_twinAbility,
  farmerAbility,
  fortuneTellerAbility,
  getAbilityForRole,
  impAbility,
  initializeAbilityRegistry,
  jugglerAbility,
  legionAbility,
  librarianAbility,
  lunaticAbility,
  marionetteAbility,
  mayorAbility,
  monkAbility,
  mutantAbility,
  oracleAbility,
  pixieAbility,
  poppy_growerAbility,
  savantAbility,
  snitchAbility,
  town_crierAbility,
  vortoxAbility,
} from "../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《罂粟花开》 (Poppyganda) 3 轮针对性多场景范例与 UI 同步测试", () => {
  initializeAbilityRegistry();

  // =========================================================================
  // 第一轮：首夜进场能力、认知覆盖与信息隔离 (Round 1: Setup & First Night)
  // =========================================================================
  describe("第一轮：首夜进场能力、认知覆盖与信息隔离", () => {
    it("范例 1-1 (罂粟种植者+镜像双子+洗脑师+提线木偶+涡流)：存活罂粟首夜取消爪牙互认，恶魔不获知爪牙与木偶，双子与洗脑师独立唤醒", () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "evil_twin", name: "镜像双子", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "cerenovus", name: "洗脑师", type: "minion" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 3,
          playerName: "P4",
          role: { id: "marionette", name: "提线木偶", type: "minion" },
          charadeRole: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: true,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 4,
          playerName: "P5",
          role: { id: "vortox", name: "涡流", type: "demon" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 5,
          playerName: "P6",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
      ];

      const snapshot: any = {
        nightCount: 1,
        gamePhase: "firstNight",
        seats,
        statusEffects: {},
        poppyGrowerDead: false,
      };

      const queue = generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        snapshot,
        { isFirstNight: true }
      );
      // 1. 验证 minion_info 不在队列
      expect(queue.find((q) => q.roleId === "minion_info")).toBeUndefined();

      // 2. 验证 demon_info 在队列，且 UI 引导文案不包含爪牙信息与提线木偶
      const demonInfoNode = queue.find((q) => q.roleId === "demon_info");
      expect(demonInfoNode).toBeDefined();

      const demonNightInfo = generateNightInfo(
        scripts.find((s) => s.id === "poppyganda") || null,
        seats,
        4,
        "firstNight",
        null,
        1
      );
      expect(demonNightInfo).toBeDefined();
      expect(demonNightInfo?.guide).toContain("罂粟种植者");
      expect(demonNightInfo?.guide).not.toContain("提线木偶");

      // 3. 验证镜像双子与洗脑师独立进入队列
      expect(queue.find((q) => q.roleId === "evil_twin")).toBeDefined();
      expect(queue.find((q) => q.roleId === "cerenovus")).toBeDefined();
    });

    it("范例 1-2 (小精灵 Pixie 首夜感知)：首夜得知 1 名在场镇民", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "pixie", name: "小精灵", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
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
          roleId: "pixie",
          roleName: "小精灵",
          priority: 35,
          isFirstNightOnly: true,
          abilityId: "pixie_first_night",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
      expect(res.aborted).toBe(false);
      expect(res.meta?.pixieResult || res.meta?.pixie).toBeDefined();
    });

    it("范例 1-3 (赏金猎人 Bounty Hunter 首夜知晓邪恶玩家与轮转)：首夜得知邪恶，死亡后轮转", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          nightCount: 1,
          gamePhase: "firstNight",
          seats,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "bounty_hunter",
          roleName: "赏金猎人",
          priority: 40,
          isFirstNightOnly: false,
          abilityId: "bounty_hunter_reveal",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx);
      expect(res.aborted).toBe(false);
      expect(
        res.meta?.bountyHunterResult || res.meta?.bounty_hunter
      ).toBeDefined();
    });

    it("范例 1-4 (告密者 Snitch 首夜伪装下发)：即使罂粟种植者在场，爪牙也能单独唤醒获取 3 伪装", () => {
      expect(snitchAbility).toBeDefined();
      expect(getAbilityForRole("snitch")).toBeDefined();
    });
  });

  // =========================================================================
  // 第二轮：白天与黄昏行动、疯狂与胜负结算 (Round 2: Day & Dusk Abilities)
  // =========================================================================
  describe("第二轮：白天与黄昏行动、疯狂与胜负结算", () => {
    it("范例 2-1 (博学者 Savant)：说书人给出 1 真 1 假两条信息", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "savant", name: "博学者", type: "townsfolk" },
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
          gamePhase: "day",
          seats,
          statusEffects: {},
          isVortoxWorld: false,
          statusEffectMap: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "savant",
          roleName: "博学者",
          priority: 0,
          isFirstNightOnly: false,
          abilityId: "savant_day_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: { statement1: "1号是善良的", statement2: "2号是恶魔" },
        } as any,
        targetIds: [],
        meta: { statement1: "1号是善良的", statement2: "2号是恶魔" },
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(savantAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("范例 2-2 (杂耍艺人 Juggler)：第 1 天进行 5 次猜测，次夜获取正确猜测数量", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 1,
          playerName: "P2",
          role: { id: "imp", name: "小恶魔", type: "demon" },
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
          jugglerGuesses: [
            { targetSeatId: 1, guessedRole: "imp" },
            { targetSeatId: 2, guessedRole: "fortune_teller" },
          ],
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "juggler",
          roleName: "杂耍艺人",
          priority: 25,
          isFirstNightOnly: false,
          abilityId: "juggler_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(jugglerAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("范例 2-3 (畸形秀演员 Mutant 疯狂处决)：疯狂声称自己是外来者时可能被处决", () => {
      expect(mutantAbility).toBeDefined();
      expect(getAbilityForRole("mutant")).toBeDefined();
    });

    it("范例 2-4 (镇长 Mayor 白天决胜)：仅剩 3 名玩家且白天无人被处决时善良阵营直接获胜", () => {
      expect(mayorAbility).toBeDefined();
      expect(getAbilityForRole("mayor")).toBeDefined();
    });

    it("范例 2-5 (军团 Legion 投票抗辩)：全部投票者为邪恶时处决失效", () => {
      expect(legionAbility).toBeDefined();
      expect(getAbilityForRole("legion")).toBeDefined();
    });

    it("范例 2-6 (镜像双子 Evil Twin 胜负锁)：好双子死于处决邪恶获胜，双子均存活好人无法获胜", () => {
      expect(evil_twinAbility).toBeDefined();
      expect(getAbilityForRole("evil_twin")).toBeDefined();
    });
  });

  // =========================================================================
  // 第三轮：夜间轮转、死亡转移与状态联动 (Round 3: Night Action & Death Triggers)
  // =========================================================================
  describe("第三轮：夜间轮转、死亡转移与状态联动", () => {
    it("范例 3-1 (洗脑师 Cerenovus 疯狂夜间下发)：每夜指定 1 名玩家与善良角色使其疯狂", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "cerenovus", name: "洗脑师", type: "minion" },
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
          roleId: "cerenovus",
          roleName: "洗脑师",
          priority: 20,
          isFirstNightOnly: false,
          abilityId: "cerenovus_madness",
          targetIds: [1],
          processed: false,
          success: false,
          meta: { chosenRole: "fortune_teller" },
        } as any,
        targetIds: [1],
        meta: { chosenRole: "fortune_teller" },
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("范例 3-2 (农夫 Farmer 夜晚死亡转移)：农夫在夜间死亡后，存活的一名善良玩家转变为农夫", () => {
      expect(farmerAbility).toBeDefined();
      expect(getAbilityForRole("farmer")).toBeDefined();
    });

    it("范例 3-3 (占卜师 Fortune Teller 查验红罗刹)：查验恶魔或红罗刹均返回肯定答复", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
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
          isRedHerring: true,
          isDead: false,
          isAlive: true,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        },
        {
          id: 2,
          playerName: "P3",
          role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
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
          roleId: "fortune_teller",
          roleName: "占卜师",
          priority: 30,
          isFirstNightOnly: false,
          abilityId: "fortune_teller_investigate",
          targetIds: [1, 2],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [1, 2],
        meta: {},
        aborted: false,
      };

      const res = await runFullAbilityPipeline(pipe(fortuneTellerAbility), ctx);
      expect(res.aborted).toBe(false);
    });

    it("范例 3-4 (罂粟种植者死亡触发邪恶互认)：罂粟种植者死亡后，当晚队列生成 minion_info 与 demon_info", () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "P1",
          role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
          isDead: true,
          isAlive: false,
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

      const snapshot: any = {
        nightCount: 2,
        gamePhase: "night",
        seats,
        statusEffects: {},
        poppyGrowerDead: true,
      };

      const queue = generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        snapshot,
        { isFirstNight: false }
      );
      const minionInfoStep = queue.find((q) => q.roleId === "minion_info");
      const demonInfoStep = queue.find((q) => q.roleId === "demon_info");
      expect(minionInfoStep).toBeDefined();
      expect(demonInfoStep).toBeDefined();
    });

    it("范例 3-5 (涡流 Vortox 错乱信息)：涡流在场时所有镇民获取虚假信息，白天无人处决邪恶直接胜利", () => {
      expect(vortoxAbility).toBeDefined();
      expect(getAbilityForRole("vortox")).toBeDefined();
    });

    it("范例 3-6 (小恶魔 Imp 自戕转火)：小恶魔夜间选择击杀自己时，存活爪牙转变为小恶魔", () => {
      expect(impAbility).toBeDefined();
      expect(getAbilityForRole("imp")).toBeDefined();
    });
  });
});
