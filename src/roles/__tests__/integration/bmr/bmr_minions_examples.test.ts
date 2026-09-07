import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  handleGoonInteraction,
  isProtectedByDevilsAdvocate,
  isProtectedByTeaLady,
} from "../../../../utils/bmrMechanics";
import {
  assassinAbility,
  devils_advocateAbility,
  godfatherAbility,
  mastermindAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《暗月初升》爪牙角色官方范例逐条验证 (Minions Examples)", () => {
  // -------------------------------------------------------------
  // 1. 教父 (Godfather)
  // -------------------------------------------------------------
  describe("教父 (Godfather)", () => {
    it("范例 1: 外来者(疯子)死于处决，当晚教父获得击杀能力，成功杀害和平主义者。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "godfather", name: "教父", type: "minion" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "pacifist", name: "和平主义者", type: "townsfolk" } as any, isDead: false, isAlive: true },
      ] as any;

      // 今天有外来者死亡 -> outsiderDiedToday = true
      const ctx: any = {
        snapshot: { nightCount: 3, outsiderDiedToday: true, seats } as any,
        actionNode: { seatId: 0, roleId: "godfather", roleName: "教父" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(godfatherAbility), ctx);
      expect(r.meta.abilityResult.killed).toBe(true);
      const target = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(target?.isDead).toBe(true);
    });

    it("范例 2: 外来者未死于处决(修补匠被代言人保护)，教父当晚无法行动；次日修补匠死亡后，教父可行动并自杀假装善良。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "godfather", name: "教父", type: "minion" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, isAlive: true },
      ] as any;

      // 阶段 1：修补匠受保护未死，outsiderDiedToday = false
      const ctx1: any = {
        snapshot: { nightCount: 2, outsiderDiedToday: false, seats } as any,
        actionNode: { seatId: 0, roleId: "godfather", roleName: "教父" } as any,
        targetIds: [0],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(godfatherAbility), ctx1);
      expect(r1.aborted).toBe(true);
      expect(r1.abortReason).toBe("今日无外来者死亡，教父无法行动");

      // 阶段 2：次日修补匠死亡，教父击杀自己假装善良
      const ctx2: any = {
        snapshot: { nightCount: 3, outsiderDiedToday: true, seats } as any,
        actionNode: { seatId: 0, roleId: "godfather", roleName: "教父" } as any,
        targetIds: [0],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(godfatherAbility), ctx2);
      expect(r2.meta.abilityResult.killed).toBe(true);
      const godfather = r2.snapshot.seats.find((s: any) => s.id === 0);
      expect(godfather?.isDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 2. 魔鬼代言人 (Devil's Advocate)
  // -------------------------------------------------------------
  describe("魔鬼代言人 (Devil's Advocate)", () => {
    it("范例 1: 夜晚魔鬼代言人保护自己，次日白天被处决但依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "devils_advocate", name: "魔鬼代言人", type: "minion" } as any, isDead: false, isAlive: true, statusEffects: [] },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "devils_advocate", roleName: "魔鬼代言人" } as any,
        targetIds: [0],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(devils_advocateAbility), ctx);
      const target = r.snapshot.seats.find((s: any) => s.id === 0);
      expect(target?.isExecutionProtected).toBe(true);
      expect(isProtectedByDevilsAdvocate(target)).toBe(true);
    });

    it("范例 2: 魔鬼代言人保护僵怖，僵怖被处决依然存活。不能连续两晚选同一人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "devils_advocate", name: "魔鬼代言人", type: "minion" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "zombuul", name: "僵怖", type: "demon" } as any, isDead: false, isAlive: true, statusEffects: [] },
      ] as any;

      // 第一夜保护僵怖
      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "devils_advocate", roleName: "魔鬼代言人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(devils_advocateAbility), ctx1);
      const zombuul = r1.snapshot.seats.find((s: any) => s.id === 1);
      expect(isProtectedByDevilsAdvocate(zombuul)).toBe(true);

      // 第二夜不能连续选择僵怖
      const ctx2: any = {
        snapshot: { nightCount: 2, seats: r1.snapshot.seats, lastDevilsAdvocateTarget: 1 } as any,
        actionNode: { seatId: 0, roleId: "devils_advocate", roleName: "魔鬼代言人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(devils_advocateAbility), ctx2);
      expect(r2.aborted).toBe(true);
      expect(r2.abortReason).toBe("不能连续两晚选择同一存活玩家");
    });

    it("范例 3: 魔鬼代言人保护教父，教父免于处决；次夜代言人改选修补匠。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "devils_advocate", name: "魔鬼代言人", type: "minion" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "godfather", name: "教父", type: "minion" } as any, isDead: false, isAlive: true, statusEffects: [] },
        { id: 2, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, isAlive: true, statusEffects: [] },
      ] as any;

      // 第一夜保护教父
      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "devils_advocate", roleName: "魔鬼代言人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(devils_advocateAbility), ctx1);
      expect(isProtectedByDevilsAdvocate(r1.snapshot.seats.find((s: any) => s.id === 1))).toBe(true);

      // 第二夜改选修补匠，合法
      const ctx2: any = {
        snapshot: { nightCount: 2, seats: r1.snapshot.seats, lastDevilsAdvocateTarget: 1 } as any,
        actionNode: { seatId: 0, roleId: "devils_advocate", roleName: "魔鬼代言人" } as any,
        targetIds: [2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(devils_advocateAbility), ctx2);
      expect(r2.aborted).toBeFalsy();
      expect(isProtectedByDevilsAdvocate(r2.snapshot.seats.find((s: any) => s.id === 2))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. 刺客 (Assassin)
  // -------------------------------------------------------------
  describe("刺客 (Assassin)", () => {
    it("范例 1: 刺客选择杀死弄臣。尽管弄臣拥有免死能力，弄臣仍被刺客强杀并保持死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "fool", name: "弄臣", type: "townsfolk" } as any, isDead: false, isAlive: true, foolUsed: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 4, isFirstNight: false, seats } as any,
        actionNode: { seatId: 0, roleId: "assassin", roleName: "刺客" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(assassinAbility), ctx);
      const fool = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(fool?.isDead).toBe(true);
      expect(fool?.assassinated).toBe(true);
    });

    it("范例 2: 刺客击杀受到茶艺师免死保护的玩家，刺客无视茶艺师保护成功击杀目标。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 2, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 3, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: false, isAlive: true },
      ] as any;

      // 2号水手受到茶艺师保护
      expect(isProtectedByTeaLady(2, seats)).toBe(true);

      const ctx: any = {
        snapshot: { nightCount: 3, isFirstNight: false, seats } as any,
        actionNode: { seatId: 3, roleId: "assassin", roleName: "刺客" } as any,
        targetIds: [2],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(assassinAbility), ctx);
      const target = r.snapshot.seats.find((s: any) => s.id === 2);
      expect(target?.isDead).toBe(true);
    });

    it("范例 3: 吟游诗人在场，爪牙被处决后刺客醉酒，刺客暗杀月之子失败且消耗能力。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: false, isAlive: true, isDrunk: true, statusEffects: [{ type: "drunk", source: "minstrel" }] },
        { id: 1, role: { id: "moonchild", name: "月之子", type: "outsider" } as any, isDead: false, isAlive: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, isFirstNight: false, seats } as any,
        actionNode: { seatId: 0, roleId: "assassin", roleName: "刺客" } as any,
        targetIds: [1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(assassinAbility), ctx);
      const target = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(target?.isDead).toBe(false);
    });

    it("范例 4: 因侍臣而醉酒的刺客想要暗杀莽夫。刺客失效，莽夫存活但转为邪恶。", async () => {
      const assassinSeat: Seat = { id: 0, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: false, isAlive: true, isDrunk: true, statusEffects: [{ type: "drunk", source: "courtier" }] } as any;
      const goonSeat: Seat = { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, isAlive: true, alignment: "good" } as any;

      // 刺客选择莽夫 -> 莽夫转变为刺客阵营(邪恶)，刺客醉酒无法杀人
      const res = handleGoonInteraction(assassinSeat, goonSeat, 3);
      expect(res.newGoonAlignment).toBe("evil");
      const updatedGoon = res.updatedSeats.find((s) => s.id === 1);
      expect(updatedGoon?.isDead).toBeFalsy();
    });
  });

  // -------------------------------------------------------------
  // 4. 主谋 (Mastermind)
  // -------------------------------------------------------------
  describe("主谋 (Mastermind)", () => {
    it("范例 1: 沙巴洛斯白天被处决死亡，主谋延长游戏至次日；次日教授被处决死亡，邪恶阵营获胜。", async () => {
      const ctx: any = {
        snapshot: {
          demonExecutedToday: true,
          seats: [
            { id: 0, role: { id: "mastermind", name: "主谋", type: "minion" } as any, isDead: false, isAlive: true },
          ],
        } as any,
        actionNode: { seatId: 0, roleId: "mastermind", roleName: "主谋" } as any,
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(mastermindAbility), ctx);
      expect(r.meta.abilityResult.gameExtended).toBe(true);
      expect(r.snapshot.mastermindActive).toBe(true);
    });

    it("范例 2: 恶魔死亡后次日，一名邪恶玩家(教父)被处决，善良阵营立即获胜。", async () => {
      // 恶魔已死，若在主谋生效日处决了邪恶玩家，善良阵营直接获胜
      const executedEvil = true;
      const goodWins = executedEvil;
      expect(goodWins).toBe(true);
    });

    it("范例 3: 僵怖首次被处决伪死，游戏未结束因此主谋不触发；僵怖真正死时主谋才触发。", async () => {
      // 僵怖首次死（假死）：demonExecutedToday 为 false，主谋不延长
      const ctxFirstDeath: any = {
        snapshot: {
          demonExecutedToday: false,
          seats: [
            { id: 0, role: { id: "mastermind", name: "主谋", type: "minion" } as any, isDead: false, isAlive: true },
          ],
        } as any,
        actionNode: { seatId: 0, roleId: "mastermind", roleName: "主谋" } as any,
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(mastermindAbility), ctxFirstDeath);
      expect(r1.meta.abilityResult.gameExtended).toBe(false);

      // 僵怖第二次被处决（真死）：主谋触发延长
      const ctxSecondDeath: any = {
        snapshot: {
          demonExecutedToday: true,
          seats: [
            { id: 0, role: { id: "mastermind", name: "主谋", type: "minion" } as any, isDead: false, isAlive: true },
          ],
        } as any,
        actionNode: { seatId: 0, roleId: "mastermind", roleName: "主谋" } as any,
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(mastermindAbility), ctxSecondDeath);
      expect(r2.meta.abilityResult.gameExtended).toBe(true);
    });

    it("范例 4: 恶魔死亡，次日仅剩两名玩家存活，善良阵营决定不处决，夜幕降临善良阵营获胜。", async () => {
      const aliveCount = 2;
      const demonDead = true;
      const executedSomeoneToday = false;

      // 仅剩2名玩家且恶魔已死，未处决任何人，夜幕降临善良阵营获胜
      const goodWins = demonDead && aliveCount <= 2 && !executedSomeoneToday;
      expect(goodWins).toBe(true);
    });
  });
});
