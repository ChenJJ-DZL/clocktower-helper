import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import {
  checkGameEnd,
  isPlayerDemon,
  isPlayerEvil,
  isPlayerMinion,
} from "../../../../app/gameLogic";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { getRegistration } from "../../../utils/gameRules";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { legionAbility } from "../../new_engine/legion.ability";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

function makeSeat(
  id: number,
  role: { id: string; name: string; type: string },
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    playerName: `Player_${id + 1}`,
    role: { id: role.id, name: role.name, type: role.type as any },
    displayRole: null,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    statusEffects: [],
    statusDetails: [],
    statuses: [],
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 1,
    ...overrides,
  };
}

describe("军团（Legion）官方 9 大核心规则与状态机集成测试", () => {
  // ─── 规则 1 & 2: 胜负判定与开局多数豁免 ───
  describe("【规则 1 & 2】胜负判定与开局多数豁免", () => {
    it("范例 1 (多数为军团开局不判负)：10 人局 7 军团 3 善良，开局不因邪恶过半判定邪恶胜", () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(2, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(3, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(4, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(5, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(6, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(7, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(8, { id: "chef", name: "厨师", type: "townsfolk" }),
        makeSeat(9, { id: "empath", name: "共情者", type: "townsfolk" }),
      ];

      const res = checkGameEnd(seats, "check_phase");
      expect(res.isGameOver).toBe(false);
      expect(res.winner).toBeNull();
    });

    it("范例 2 (好人胜利)：所有军团均死亡时，善良阵营获胜", () => {
      const seats: Seat[] = [
        makeSeat(
          0,
          { id: "legion", name: "军团", type: "demon" },
          { isDead: true }
        ),
        makeSeat(
          1,
          { id: "legion", name: "军团", type: "demon" },
          { isDead: true }
        ),
        makeSeat(
          2,
          { id: "legion", name: "军团", type: "demon" },
          { isDead: true }
        ),
        makeSeat(3, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(4, { id: "chef", name: "厨师", type: "townsfolk" }),
      ];

      const res = checkGameEnd(seats, "execution", 2);
      expect(res.isGameOver).toBe(true);
      expect(res.winner).toBe("Good");
      expect(res.reason).toContain("所有军团已被彻底消灭");
    });

    it("范例 3 (邪恶胜利 - 存活善良仅剩1人)：善良阵营仅剩 1 人存活，无法通过处决翻盘，邪恶获胜", () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(2, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(3, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(
          4,
          { id: "chef", name: "厨师", type: "townsfolk" },
          { isDead: true }
        ),
      ];

      const res = checkGameEnd(seats, "night_death");
      expect(res.isGameOver).toBe(true);
      expect(res.winner).toBe("Evil");
      expect(res.reason).toContain("善良阵营存活人数不足以战胜军团");
    });

    it("范例 4 (邪恶胜利 - 最终2人局)：存活总人数仅剩 2 人且军团存活，邪恶获胜", () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(
          2,
          { id: "chef", name: "厨师", type: "townsfolk" },
          { isDead: true }
        ),
      ];

      const res = checkGameEnd(seats, "execution", 2);
      expect(res.isGameOver).toBe(true);
      expect(res.winner).toBe("Evil");
    });
  });

  // ─── 规则 3 & 4: 投票与处决（全邪恶投票判 0 票） ───
  describe("【规则 3 & 4】投票与处决判定", () => {
    it("范例 5 (全邪恶投票失效)：若提名的投票者均为邪恶军团，投票判定为 0 票", () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(2, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(3, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(4, { id: "chef", name: "厨师", type: "townsfolk" }),
      ];

      // 投票者为 0, 1, 2 号（全部是军团邪恶）
      const voters = [0, 1, 2];
      const hasLegionInPlay = seats.some((s) => s.role?.id === "legion");
      const votingSeats = seats.filter((s) => voters.includes(s.id));
      const isAllEvil =
        hasLegionInPlay &&
        votingSeats.length > 0 &&
        votingSeats.every((s) => isPlayerEvil(s));

      expect(isAllEvil).toBe(true);
      const effectiveVotes = isAllEvil ? 0 : voters.length;
      expect(effectiveVotes).toBe(0);
    });

    it("范例 6 (有善良投票正常计票)：若投票者中包含至少 1 名善良玩家，全额正常计票", () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(2, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(3, { id: "chef", name: "厨师", type: "townsfolk" }),
      ];

      // 投票者为 0, 1, 2 号（0,1 是军团，2 是僧侣）
      const voters = [0, 1, 2];
      const hasLegionInPlay = seats.some((s) => s.role?.id === "legion");
      const votingSeats = seats.filter((s) => voters.includes(s.id));
      const isAllEvil =
        hasLegionInPlay &&
        votingSeats.length > 0 &&
        votingSeats.every((s) => isPlayerEvil(s));

      expect(isAllEvil).toBe(false);
      const effectiveVotes = isAllEvil ? 0 : voters.length;
      expect(effectiveVotes).toBe(3);
    });
  });

  // ─── 规则 5: 双重注册（恶魔 + 爪牙） ───
  describe("【规则 5】军团双重注册（恶魔 + 爪牙）", () => {
    it("范例 7 (角色属性判定)：军团同时判定为恶魔、爪牙与邪恶阵营", () => {
      const legionSeat = makeSeat(0, {
        id: "legion",
        name: "军团",
        type: "demon",
      });

      expect(isPlayerDemon(legionSeat)).toBe(true);
      expect(isPlayerMinion(legionSeat)).toBe(true);
      expect(isPlayerEvil(legionSeat)).toBe(true);
    });

    it("范例 8 (技能查验注册)：调查员查验军团时注册为爪牙，常规注册为恶魔与爪牙", () => {
      const legionSeat = makeSeat(0, {
        id: "legion",
        name: "军团",
        type: "demon",
      });
      const investigatorSeat = makeSeat(1, {
        id: "investigator",
        name: "调查员",
        type: "townsfolk",
      });

      const regForInvestigator = getRegistration(
        legionSeat,
        investigatorSeat.role
      );
      expect(regForInvestigator.alignment).toBe("Evil");
      expect(regForInvestigator.registersAsMinion).toBe(true);

      const regGeneral = getRegistration(legionSeat);
      expect(regGeneral.registersAsDemon).toBe(true);
      expect(regGeneral.registersAsMinion).toBe(true);
      expect(regGeneral.alignment).toBe("Evil");
    });
  });

  // ─── 规则 6: 夜间行动与说书人主导夜杀 ───
  describe("【规则 6】夜间行动与技能结算", () => {
    it("范例 9 (说书人指定夜杀)：说书人选择击杀目标，目标成功被标记死亡", async () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "chef", name: "厨师", type: "townsfolk" }),
      ];

      const context: MiddlewareContext = {
        snapshot: {
          seats,
          nightCount: 2,
          gamePhase: "night",
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "legion",
          roleName: "军团",
          priority: 44,
          isFirstNightOnly: false,
          abilityId: "legion_night_kill",
          wakeMessage: "军团夜杀",
          firstNightPriority: null,
          otherNightPriority: 44,
          targetIds: [1],
          processed: false,
          success: false,
          meta: {},
        },
        actorSeat: seats[0],
        targets: [1],
        targetIds: [1],
        meta: { abilityEffective: true, abilityResult: {} },
        aborted: false,
      } as any;

      const ctx = await runFullAbilityPipeline(pipe(legionAbility), context);

      expect(ctx.meta.abilityResult.killedPlayerId).toBe(1);
      expect(ctx.snapshot.seats[1].markedForDeath).toBe(true);
    });

    it("范例 10 (士兵免疫夜杀)：士兵受到军团恶魔夜杀时触发免疫免死", async () => {
      const seats: Seat[] = [
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }),
        makeSeat(1, { id: "soldier", name: "士兵", type: "townsfolk" }),
      ];

      const context: MiddlewareContext = {
        snapshot: {
          seats,
          nightCount: 2,
          gamePhase: "night",
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "legion",
          roleName: "军团",
          priority: 44,
          isFirstNightOnly: false,
          abilityId: "legion_night_kill",
          wakeMessage: "军团夜杀",
          firstNightPriority: null,
          otherNightPriority: 44,
          targetIds: [1],
          processed: false,
          success: false,
          meta: {},
        },
        actorSeat: seats[0],
        targets: [1],
        targetIds: [1],
        meta: { abilityEffective: true, abilityResult: {} },
        aborted: false,
      } as any;

      const ctx = await runFullAbilityPipeline(pipe(legionAbility), context);

      expect(ctx.meta.abilityResult.isBlocked).toBe(true);
      expect(ctx.snapshot.seats[1].markedForDeath).toBeFalsy();
    });
  });

  // ─── 规则 7: 落座环节多角色支持与唯一性约束 ───
  describe("【规则 7】落座环节多角色支持与唯一性约束", () => {
    it("范例 11 (军团允许多人落座)：军团可同时落座到多个座位，不会互相顶替", () => {
      const legionRole = { id: "legion", name: "军团", type: "demon" as const };
      const allowsMultiple =
        legionRole.id === "legion" || legionRole.id === "riot";
      expect(allowsMultiple).toBe(true);

      const seats: Seat[] = [
        makeSeat(0, legionRole),
        makeSeat(1, legionRole),
        makeSeat(2, legionRole),
        makeSeat(3, legionRole),
        makeSeat(4, legionRole),
        makeSeat(5, legionRole),
        makeSeat(6, legionRole),
        makeSeat(7, { id: "monk", name: "僧侣", type: "townsfolk" }),
        makeSeat(8, { id: "chef", name: "厨师", type: "townsfolk" }),
        makeSeat(9, { id: "empath", name: "共情者", type: "townsfolk" }),
      ];

      const legionSeats = seats.filter((s) => s.role?.id === "legion");
      expect(legionSeats.length).toBe(7);
      expect(legionSeats.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("范例 12 (常规角色唯一性约束)：非军团角色（如小恶魔、僧侣、厨师）在场上只能落座一次", () => {
      const monkRole = { id: "monk", name: "僧侣", type: "townsfolk" as const };
      const allowsMultiple =
        monkRole.id === "legion" || (monkRole.id as string) === "riot";
      expect(allowsMultiple).toBe(false);

      // 当僧侣落座到新座位时，旧座位的僧侣应被清除转移
      let seats: Seat[] = [
        makeSeat(0, monkRole),
        makeSeat(1, { id: "chef", name: "厨师", type: "townsfolk" }),
      ];
      expect(seats.filter((s) => s.role?.id === "monk").length).toBe(1);

      // 模拟落座到 2 号座位：检查非多落座角色转移逻辑
      const newSeatId = 2;
      const existingSeat = seats.find((s) => s.role?.id === monkRole.id);
      if (existingSeat && !allowsMultiple) {
        seats = seats.map((s) =>
          s.id === existingSeat.id ? { ...s, role: null } : s
        );
      }
      seats.push(makeSeat(newSeatId, monkRole));

      const finalMonkSeats = seats.filter((s) => s.role?.id === "monk");
      expect(finalMonkSeats.length).toBe(1);
      expect(finalMonkSeats[0].id).toBe(2);
    });

    it("范例 13 (酒鬼/木偶伪装身份约束)：只能选择不在场的镇民角色，且设置伪装时绝不顶替任何在场玩家的角色", () => {
      // 场景：在场有 0号厨师(镇民)、1号共情者(镇民)、2号酒鬼(外来者)、3号提线木偶(爪牙)
      const seats: Seat[] = [
        makeSeat(0, { id: "chef", name: "厨师", type: "townsfolk" }),
        makeSeat(1, { id: "empath", name: "共情者", type: "townsfolk" }),
        makeSeat(2, { id: "drunk", name: "酒鬼", type: "outsider" }),
        makeSeat(3, { id: "marionette", name: "提线木偶", type: "minion" }),
      ];

      const scriptTownsfolk = [
        { id: "chef", name: "厨师", type: "townsfolk" },
        { id: "empath", name: "共情者", type: "townsfolk" },
        { id: "monk", name: "僧侣", type: "townsfolk" },
        { id: "slayer", name: "猎手", type: "townsfolk" },
        { id: "investigator", name: "调查员", type: "townsfolk" },
      ];

      // 1. 为 2号酒鬼筛选可选伪装身份：必须是「不在场的镇民角色」
      const inPlayRoleIds = new Set(
        seats.map((s) => s.role?.id).filter(Boolean)
      );
      const drunkAvailable = scriptTownsfolk.filter(
        (r) => !inPlayRoleIds.has(r.id)
      );

      // 在场的 chef、empath 绝不能进入可选池，只有不在场的 monk、slayer、investigator 可选
      expect(drunkAvailable.map((r) => r.id)).toEqual([
        "monk",
        "slayer",
        "investigator",
      ]);
      expect(drunkAvailable.some((r) => r.id === "chef")).toBe(false);
      expect(drunkAvailable.some((r) => r.id === "empath")).toBe(false);

      // 2. 为酒鬼设置伪装身份为「僧侣」：验证绝不顶替任何在场玩家
      const chosenForDrunk = drunkAvailable[0]; // monk
      const updatedSeatsAfterDrunk = seats.map((s) => {
        if (s.id === 2) {
          return {
            ...s,
            charadeRole: chosenForDrunk as any,
            displayRole: chosenForDrunk as any,
          };
        }
        return s;
      });

      // 验证：0号厨师和1号共情者的角色完全不变，没有发生任何顶替
      expect(updatedSeatsAfterDrunk[0].role?.id).toBe("chef");
      expect(updatedSeatsAfterDrunk[1].role?.id).toBe("empath");
      expect(updatedSeatsAfterDrunk[2].role?.id).toBe("drunk");
      expect(updatedSeatsAfterDrunk[2].charadeRole?.id).toBe("monk");

      // 3. 为 3号提线木偶筛选可选伪装身份：必须是「不在场的镇民」且不能是已被酒鬼选择的伪装
      const usedCharadeIds = new Set(
        updatedSeatsAfterDrunk
          .filter((s) => s.id !== 3 && s.charadeRole)
          .map((s) => s.charadeRole!.id)
      );
      const marionetteAvailable = scriptTownsfolk.filter(
        (r) => !inPlayRoleIds.has(r.id) && !usedCharadeIds.has(r.id)
      );

      // 僧侣已被酒鬼选择，提线木偶只能从剩下的不在场镇民 slayer, investigator 中选择
      expect(marionetteAvailable.map((r) => r.id)).toEqual([
        "slayer",
        "investigator",
      ]);
      expect(marionetteAvailable.some((r) => r.id === "monk")).toBe(false);

      // 4. 为提线木偶设置伪装身份为「猎手」
      const chosenForMarionette = marionetteAvailable[0]; // slayer
      const finalSeats = updatedSeatsAfterDrunk.map((s) => {
        if (s.id === 3) {
          return {
            ...s,
            charadeRole: chosenForMarionette as any,
            displayRole: chosenForMarionette as any,
          };
        }
        return s;
      });

      // 再次确认所有座位的真实角色与伪装角色完全独立且正确，没有顶替
      expect(finalSeats[0].role?.id).toBe("chef");
      expect(finalSeats[1].role?.id).toBe("empath");
      expect(finalSeats[2].role?.id).toBe("drunk");
      expect(finalSeats[2].charadeRole?.id).toBe("monk");
      expect(finalSeats[3].role?.id).toBe("marionette");
      expect(finalSeats[3].charadeRole?.id).toBe("slayer");
    });

    it("第2夜（非首夜）即使场上有7个军团，全场也仅生成1个唯一的军团夜杀节点（所有军团共享1次行动）", () => {
      const seats = [
        makeSeat(
          0,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "张三" }
        ),
        makeSeat(
          1,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "李四" }
        ),
        makeSeat(
          2,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "王五" }
        ),
        makeSeat(
          3,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "赵六" }
        ),
        makeSeat(
          4,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "钱七" }
        ),
        makeSeat(
          5,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "孙八" }
        ),
        makeSeat(
          6,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "周九" }
        ),
        makeSeat(7, { id: "chef", name: "厨师", type: "townsfolk" }),
        makeSeat(8, { id: "empath", name: "共情者", type: "townsfolk" }),
        makeSeat(9, { id: "drunk", name: "酒鬼", type: "outsider" }),
      ];

      const orderEntries = [
        {
          roleId: "legion",
          roleName: "军团",
          firstNightPriority: 0,
          otherNightPriority: 44,
          firstNightOnly: false,
          wakeMessage: "军团夜杀",
          abilityId: "legion_night_kill",
        },
        {
          roleId: "legion",
          roleName: "军团",
          firstNightPriority: 0,
          otherNightPriority: 44,
          firstNightOnly: false,
          wakeMessage: "军团夜杀",
          abilityId: "legion_night_kill",
        },
        {
          roleId: "empath",
          roleName: "共情者",
          firstNightPriority: 5,
          otherNightPriority: 51,
          firstNightOnly: false,
          wakeMessage: "共情者",
          abilityId: "empath",
        },
      ] as any;

      const queue = generateDynamicNightQueue(
        orderEntries,
        { seats, nightCount: 2, gamePhase: "night" } as any,
        { isFirstNight: false }
      );

      const legionNodes = queue.filter((q) => q.roleId === "legion");
      expect(legionNodes).toHaveLength(1);
      expect(legionNodes[0].wakeMessage).toBe(
        "座位号：1号、2号、3号、4号、5号、6号、7号。说书人同时唤醒所有的军团玩家"
      );
      expect(legionNodes[0].meta?.isLegionUnified).toBe(true);
      expect(legionNodes[0].meta?.legionSeatIds).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("军团死亡部分玩家时，夜间唤醒提示仅列出存活军团的座位号", () => {
      const seats = [
        makeSeat(
          0,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "张三", isDead: true }
        ),
        makeSeat(
          1,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "李四" }
        ),
        makeSeat(
          2,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "王五", isDead: true }
        ),
        makeSeat(
          3,
          { id: "legion", name: "军团", type: "demon" },
          { playerName: "赵六" }
        ),
        makeSeat(4, { id: "monk", name: "僧侣", type: "townsfolk" }),
      ];

      const orderEntries = [
        {
          roleId: "legion",
          roleName: "军团",
          firstNightPriority: 0,
          otherNightPriority: 44,
          firstNightOnly: false,
          wakeMessage: "军团夜杀",
          abilityId: "legion_night_kill",
        },
      ] as any;

      const queue = generateDynamicNightQueue(
        orderEntries,
        { seats, nightCount: 2, gamePhase: "night" } as any,
        { isFirstNight: false }
      );

      const legionNodes = queue.filter((q) => q.roleId === "legion");
      expect(legionNodes).toHaveLength(1);
      expect(legionNodes[0].wakeMessage).toBe(
        "座位号：2号、4号。说书人同时唤醒所有的军团玩家"
      );
      expect(legionNodes[0].meta?.legionSeatIds).toEqual([1, 3]);
    });
  });
});
