import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import {
  checkGameEnd,
  isPlayerDemon,
  isPlayerEvil,
  isPlayerMinion,
} from "../../../../app/gameLogic";
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
        makeSeat(0, { id: "legion", name: "军团", type: "demon" }, { isDead: true }),
        makeSeat(1, { id: "legion", name: "军团", type: "demon" }, { isDead: true }),
        makeSeat(2, { id: "legion", name: "军团", type: "demon" }, { isDead: true }),
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
        makeSeat(4, { id: "chef", name: "厨师", type: "townsfolk" }, { isDead: true }),
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
        makeSeat(2, { id: "chef", name: "厨师", type: "townsfolk" }, { isDead: true }),
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
      const isAllEvil = hasLegionInPlay && votingSeats.length > 0 && votingSeats.every((s) => isPlayerEvil(s));

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
      const isAllEvil = hasLegionInPlay && votingSeats.length > 0 && votingSeats.every((s) => isPlayerEvil(s));

      expect(isAllEvil).toBe(false);
      const effectiveVotes = isAllEvil ? 0 : voters.length;
      expect(effectiveVotes).toBe(3);
    });
  });

  // ─── 规则 5: 双重注册（恶魔 + 爪牙） ───
  describe("【规则 5】军团双重注册（恶魔 + 爪牙）", () => {
    it("范例 7 (角色属性判定)：军团同时判定为恶魔、爪牙与邪恶阵营", () => {
      const legionSeat = makeSeat(0, { id: "legion", name: "军团", type: "demon" });

      expect(isPlayerDemon(legionSeat)).toBe(true);
      expect(isPlayerMinion(legionSeat)).toBe(true);
      expect(isPlayerEvil(legionSeat)).toBe(true);
    });

    it("范例 8 (技能查验注册)：调查员查验军团时注册为爪牙，常规注册为恶魔与爪牙", () => {
      const legionSeat = makeSeat(0, { id: "legion", name: "军团", type: "demon" });
      const investigatorSeat = makeSeat(1, { id: "investigator", name: "调查员", type: "townsfolk" });

      const regForInvestigator = getRegistration(legionSeat, investigatorSeat.role);
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
      };

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
      };

      const ctx = await runFullAbilityPipeline(pipe(legionAbility), context);

      expect(ctx.meta.abilityResult.isBlocked).toBe(true);
      expect(ctx.snapshot.seats[1].markedForDeath).toBeFalsy();
    });
  });
});
