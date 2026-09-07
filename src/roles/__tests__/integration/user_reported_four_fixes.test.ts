import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { checkGameEnd } from "../../../../app/gameLogic";
import { abilityPriorityCalculation } from "../../../utils/abilityPriorityMiddleware";
import { runAbilityPipeline } from "../../../utils/middlewarePipeline";
import { vortoxAbility } from "../../new_engine/vortox.ability";
import { evil_twinAbility } from "../../new_engine/evil_twin.ability";
import { chefAbility } from "../../new_engine/chef.ability";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "../../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";

/**
 * 用户实测反馈 4 大核心机制综合验证：
 * 1. 涡流 (Vortox)：非信息类镇民技能正常，信息类反相且恶魔杀受保护目标被阻断
 * 2. 镜像双子 (Evil Twin)：首夜夜视告知与无夜间能力善良双子自动注入唤醒、善良双子被处决判负、双子存活恶魔全灭阻断善良胜利
 * 3. 告密者 (Snitch)：纯被动角色不唤醒，爪牙互认步骤独立分发 3 个伪装
 * 4. 赏金猎人 (Bounty Hunter)：转邪恶角色技能效果绝不受阵营改变干扰
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type },
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

describe("用户实测反馈四大核心机制综合测试", () => {
  describe("1. 涡流 (Vortox) 机制测试", () => {
    it("涡流在场时，非信息类镇民（如僧侣）abilityEffective 为 true，保护 100% 正常生效", async () => {
      const seats = [
        makeSeat(0, "vortox", "demon"),
        makeSeat(1, "monk", "townsfolk"),
        makeSeat(2, "washerwoman", "townsfolk"),
      ];

      // 僧侣执行能力计算
      const monkCtx = {
        actionNode: { seatId: 1, roleId: "monk", abilityId: "monk_protect" },
        snapshot: {
          seats: seats.map((s) => ({ ...s, isAlive: true })),
          isVortoxWorld: true,
          vortoxWorld: true,
        },
        meta: {},
      } as any;

      const monkPriorityResult = await abilityPriorityCalculation(monkCtx);
      expect(monkPriorityResult.meta.abilityEffective).toBe(true);

      // 洗衣妇为信息类镇民
      const washerCtx = {
        actionNode: { seatId: 2, roleId: "washerwoman", abilityId: "washerwoman_info" },
        snapshot: {
          seats: seats.map((s) => ({ ...s, isAlive: true })),
          isVortoxWorld: true,
          vortoxWorld: true,
        },
        meta: {},
      } as any;

      const washerPriorityResult = await abilityPriorityCalculation(washerCtx);
      expect(washerPriorityResult.meta.abilityEffective).toBe(false);
      expect(washerPriorityResult.meta.vortoxAffected).toBe(true);
    });

    it("涡流夜杀被僧侣保护的目标时，受保护玩家存活", async () => {
      const snapshot = {
        seats: [
          makeSeat(0, "vortox", "demon", { isAlive: true } as any),
          makeSeat(1, "washerwoman", "townsfolk", {
            isAlive: true,
            isProtected: true,
            statusEffects: [{ type: "protected", source: "monk" }],
          } as any),
        ],
        nightCount: 2,
        isVortoxWorld: true,
      };

      const result = await runAbilityPipeline(vortoxAbility, {
        actionNode: { seatId: 0, roleId: "vortox", abilityId: "vortox_kill" },
        targetIds: [1],
        snapshot: snapshot as any,
        meta: {},
        aborted: false,
      } as any);

      const targetSeat = result.snapshot.seats.find((s: any) => s.id === 1);
      expect(targetSeat?.isDead).toBeFalsy();
    });
  });

  describe("2. 镜像双子 (Evil Twin) 机制测试", () => {
    it("双子首夜产生 displayInfo 并包含对立双子角色", async () => {
      const snapshot = {
        seats: [
          makeSeat(0, "evil_twin", "minion", { isAlive: true } as any),
          makeSeat(1, "oracle", "townsfolk", { isAlive: true } as any),
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      };

      const result = await runAbilityPipeline(evil_twinAbility, {
        actionNode: { seatId: 0, roleId: "evil_twin", abilityId: "evil_twin_recognize" },
        snapshot: snapshot as any,
        targetIds: [],
        meta: {},
        aborted: false,
      } as any);

      expect(result.meta.displayInfo).toBeDefined();
      expect(result.meta.displayInfo?.type).toBe("evil_twin_info");
      expect(result.meta.displayInfo?.log).toContain("对立双子");
    });

    it("首夜无唤醒技能的善良双子（如士兵）被自动注入 good_twin_info 唤醒节点", () => {
      const snapshot = {
        seats: [
          makeSeat(0, "evil_twin", "minion"),
          makeSeat(1, "soldier", "townsfolk"),
          makeSeat(2, "imp", "demon"),
        ],
        evilTwinPair: { evilId: 0, goodId: 1 },
      };
      const order: NightOrderEntry[] = [
        {
          roleId: "evil_twin",
          roleName: "镜像双子",
          firstNightPriority: 38,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "evil_twin",
          abilityId: "evil_twin_recognize",
        },
      ];

      const queue = generateDynamicNightQueue(order, snapshot as any, {
        isFirstNight: true,
      });
      const goodTwinNode = queue.find((n) => n.roleId === "good_twin_info");
      expect(goodTwinNode).toBeDefined();
      expect(goodTwinNode?.seatId).toBe(1);
      expect(goodTwinNode?.wakeMessage).toContain("镜像双子");
    });

    it("处决善良双子且镜像双子存活 → 邪恶阵营直接获胜", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion"),
        makeSeat(1, "oracle", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon"),
        makeSeat(3, "monk", "townsfolk"),
      ];

      const result = checkGameEnd(seats, "execution", 1, {
        evilTwinPair: { evilId: 0, goodId: 1 },
      });

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("Evil");
      expect(result.reason).toContain("双子");
    });

    it("恶魔全灭但双子均存活 → 阻断善良胜利，游戏继续", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion"),
        makeSeat(1, "oracle", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon", { isDead: true }),
        makeSeat(3, "monk", "townsfolk"),
        makeSeat(4, "chef", "townsfolk"),
      ];

      const result = checkGameEnd(seats, "execution", 2, {
        evilTwinPair: { evilId: 0, goodId: 1 },
      });

      expect(result.winner).toBeNull();
      expect(result.isGameOver).toBe(false);
    });

    it("邪恶双子死亡（善良双子存活）→ 恶魔全灭后，阻断解除，善良获胜", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion", { isDead: true }),
        makeSeat(1, "oracle", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon", { isDead: true }),
        makeSeat(3, "monk", "townsfolk"),
        makeSeat(4, "chef", "townsfolk"),
      ];

      const result = checkGameEnd(seats, "execution", 2, {
        evilTwinPair: { evilId: 0, goodId: 1 },
      });

      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("Good");
    });

    it("情况 1（无夜间行动角色如士兵）：首夜自动注入 good_twin_info 且适配器生成双子告知引导", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion"),
        makeSeat(1, "soldier", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon"),
      ];
      const info = calculateNightInfoViaNewEngine(
        null,
        seats,
        1,
        "firstNight",
        null,
        1,
        "good_twin_info"
      );
      expect(info).toBeDefined();
      expect(info?.guide).toContain("1号是镜像双子");
      expect(info?.displayInfo?.log).toContain("1号是镜像双子");
    });

    it("情况 2（被动信息角色如厨师）：首夜引导词合并显示【双子告知】先告知该玩家：X号是镜像双子", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion"),
        makeSeat(1, "chef", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon"),
      ];
      const script = {
        id: "snv",
        name: "SNV",
        roleIds: ["evil_twin", "chef", "imp"],
      } as any;
      const info = calculateNightInfoViaNewEngine(
        script,
        seats,
        1,
        "firstNight",
        null,
        1
      );
      expect(info).toBeDefined();
      expect(info?.guide).toContain("【双子告知】请先告知该玩家：1号是镜像双子！");
      expect(info?.guide).toContain("告诉他相邻邪恶玩家有");
    });

    it("情况 3（主动技能角色如占卜师）：首夜引导词明确提示先告知镜像双子随后再进行技能操作", () => {
      const seats = [
        makeSeat(0, "evil_twin", "minion"),
        makeSeat(1, "fortune_teller", "townsfolk", { isGoodTwin: true }),
        makeSeat(2, "imp", "demon"),
      ];
      const script = {
        id: "tb",
        name: "TB",
        roleIds: ["evil_twin", "fortune_teller", "imp"],
      } as any;
      const info = calculateNightInfoViaNewEngine(
        script,
        seats,
        1,
        "firstNight",
        null,
        1
      );
      expect(info).toBeDefined();
      expect(info?.guide).toContain("【双子告知】请先告知该玩家：1号是镜像双子！随后再进行角色技能操作。");
    });
  });

  describe("2.1 厨师 (Chef) 信息文案测试", () => {
    it("厨师获得信息文案中绝对不包含'（共X个座位）'字样", async () => {
      const seats = [
        makeSeat(0, "chef", "townsfolk"),
        makeSeat(1, "imp", "demon"),
        makeSeat(2, "poisoner", "minion"),
        makeSeat(3, "monk", "townsfolk"),
        makeSeat(4, "empath", "townsfolk"),
        makeSeat(5, "slayer", "townsfolk"),
        makeSeat(6, "soldier", "townsfolk"),
      ];

      const chefCtx = {
        actionNode: { seatId: 0, roleId: "chef", abilityId: "chef_first_night_ability" },
        snapshot: {
          nightCount: 1,
          gamePhase: "firstNight",
          seats: seats.map((s) => ({ ...s, isAlive: true })),
        },
        meta: {},
        aborted: false,
      } as any;

      const result = await runAbilityPipeline(chefAbility, chefCtx);
      expect(result.meta.abilityLog).toBeDefined();
      expect(result.meta.abilityLog).toContain("场上有 1 对相邻的邪恶玩家");
      expect(result.meta.abilityLog).not.toContain("共 7 个座位");
      expect(result.meta.abilityLog).not.toContain("个座位");
      expect(result.meta.displayInfo?.log).not.toContain("个座位");
    });
  });

  describe("3. 告密者 (Snitch) 机制测试", () => {
    it("告密者为纯被动角色，被排除在夜间唤醒队列之外", () => {
      const snapshot = {
        seats: [
          makeSeat(0, "snitch", "outsider"),
          makeSeat(1, "imp", "demon"),
        ],
      };
      const order: NightOrderEntry[] = [
        {
          roleId: "snitch",
          roleName: "告密者",
          firstNightPriority: 10,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "snitch",
          abilityId: "snitch_ability",
        },
      ];

      const queue = generateDynamicNightQueue(order, snapshot as any, {
        isFirstNight: true,
      });
      expect(queue.some((n) => n.roleId === "snitch")).toBe(false);
    });

    it("首夜爪牙互认 minion_info 为不同爪牙生成独立 3 个伪装角色", () => {
      const seats = [
        makeSeat(0, "snitch", "outsider"),
        makeSeat(1, "poisoner", "minion"),
        makeSeat(2, "baron", "minion"),
        makeSeat(3, "imp", "demon"),
        makeSeat(4, "monk", "townsfolk"),
      ];

      const script = {
        id: "tb",
        name: "TB",
        roleIds: [
          "snitch",
          "poisoner",
          "baron",
          "imp",
          "monk",
          "chef",
          "empath",
          "virgin",
          "slayer",
          "soldier",
        ],
      } as any;

      const info1 = calculateNightInfoViaNewEngine(
        script,
        seats,
        1,
        "firstNight",
        null,
        1,
        "minion_info"
      );
      const info2 = calculateNightInfoViaNewEngine(
        script,
        seats,
        2,
        "firstNight",
        null,
        1,
        "minion_info"
      );

      expect(info1?.guide).toContain("告密者伪装");
      expect(info2?.guide).toContain("告密者伪装");
      expect(info1?.guide).not.toEqual(info2?.guide);
    });
  });

  describe("4. 赏金猎人 (Bounty Hunter) 机制测试", () => {
    it("转邪恶角色（如僧侣）技能效果 100% 正常执行，不受阵营改变干扰", async () => {
      const seats = [
        makeSeat(0, "bounty_hunter", "townsfolk"),
        makeSeat(1, "monk", "townsfolk", { isEvilConverted: true, alignment: "evil" } as any),
        makeSeat(2, "washerwoman", "townsfolk"),
        makeSeat(3, "imp", "demon"),
      ];

      // 转邪恶的僧侣执行能力检查
      const monkCtx = {
        actionNode: { seatId: 1, roleId: "monk", abilityId: "monk_protect" },
        snapshot: {
          seats: seats.map((s) => ({ ...s, isAlive: true })),
        },
        meta: {},
      } as any;

      const monkPriorityResult = await abilityPriorityCalculation(monkCtx);
      // 转邪恶绝不影响其作为镇民的保护能力有效性
      expect(monkPriorityResult.meta.abilityEffective).toBe(true);
    });
  });
});
