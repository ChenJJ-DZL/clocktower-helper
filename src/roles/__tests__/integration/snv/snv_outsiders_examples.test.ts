import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  checkKlutzSelection,
  executeBarberSwap,
} from "../../../../utils/snvMechanics";
import {
  barberAbility,
  klutzAbility,
  sweetheartAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《梦殒春宵》外来者角色官方范例逐条验证 (S&V Outsiders Examples)", () => {
  // -------------------------------------------------------------
  // 1. 心上人 (Sweetheart) - 3 条范例
  // -------------------------------------------------------------
  describe("心上人 (Sweetheart)", () => {
    it("范例 1: 心上人死了。数学家现在醉酒了，并可能在夜晚获得错误信息。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "mathematician", name: "数学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "sweetheart", roleName: "心上人" } as any,
        storytellerInput: { drunkTarget: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(sweetheartAbility), ctx);
      expect(r.meta.abilityResult.drunkTarget).toBe(1);
      const mathSeat = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(mathSeat.isDrunk).toBe(true);
      expect(mathSeat.statusEffects.some((e: any) => e.type === "drunk" && e.source === "sweetheart")).toBe(true);
    });

    it("范例 2: 心上人死了。畸形秀演员现在醉酒了。畸形秀演员现在可以安全地透露自己的角色，然而他不知道这一点。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "mutant", name: "畸形秀演员", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "sweetheart", roleName: "心上人" } as any,
        storytellerInput: { drunkTarget: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(sweetheartAbility), ctx);
      const mutantSeat = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(mutantSeat.isDrunk).toBe(true);
    });

    it("范例 3: 心上人死了。恶魔现在醉酒了，所以他的攻击无法杀死任何人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "sweetheart", roleName: "心上人" } as any,
        storytellerInput: { drunkTarget: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(sweetheartAbility), ctx);
      const demonSeat = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(demonSeat.isDrunk).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 2. 理发师 (Barber) - 4 条范例
  // -------------------------------------------------------------
  describe("理发师 (Barber)", () => {
    it("范例 1: 理发师死了。恶魔本来想要交换钟表匠和杂耍艺人，但随后决定什么都不做。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "barber", name: "理发师", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "barber", roleName: "理发师" } as any,
        storytellerInput: { swapA: null, swapB: null },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(barberAbility), ctx);
      expect(r.meta.abilityResult.swapped).toBe(false);
      expect(r.snapshot.seats[1].role.id).toBe("clockmaker");
      expect(r.snapshot.seats[2].role.id).toBe("juggler");
    });

    it("范例 2: 理发师死了。恶魔交换了存活的神谕者和死亡的理发师。现在，有一名存活的理发师和一名死亡的神谕者。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "barber", name: "理发师", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "oracle", name: "神谕者", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "barber", roleName: "理发师" } as any,
        storytellerInput: { swapA: 0, swapB: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(barberAbility), ctx);
      expect(r.meta.abilityResult.swapped).toBe(true);

      const seat0 = r.snapshot.seats.find((s: any) => s.id === 0);
      const seat1 = r.snapshot.seats.find((s: any) => s.id === 1);

      expect(seat0.role.id).toBe("oracle");
      expect(seat0.isDead).toBe(true);

      expect(seat1.role.id).toBe("barber");
      expect(seat1.isAlive).toBe(true);
    });

    it("范例 3: 理发师死了。涡流与一名存活的女巫交换角色。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "barber", name: "理发师", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "barber", roleName: "理发师" } as any,
        storytellerInput: { swapA: 1, swapB: 2 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(barberAbility), ctx);
      expect(r.meta.abilityResult.swapped).toBe(true);

      const seat1 = r.snapshot.seats.find((s: any) => s.id === 1);
      const seat2 = r.snapshot.seats.find((s: any) => s.id === 2);

      expect(seat1.role.id).toBe("witch");
      expect(seat2.role.id).toBe("vortox");
    });

    it("范例 4: 理发师死了。亡骨魔与死去的心上人交换角色。曾经的亡骨魔现在是邪恶的心上人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "barber", name: "理发师", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "vigormortis", name: "亡骨魔", type: "demon" } as any, isAlive: true, isDead: false, alignment: "evil" },
        { id: 2, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: false, isDead: true, alignment: "good" },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "barber", roleName: "理发师" } as any,
        storytellerInput: { swapA: 1, swapB: 2 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(barberAbility), ctx);
      expect(r.meta.abilityResult.swapped).toBe(true);

      const seat1 = r.snapshot.seats.find((s: any) => s.id === 1);
      const seat2 = r.snapshot.seats.find((s: any) => s.id === 2);

      expect(seat1.role.id).toBe("sweetheart");
      expect(seat2.role.id).toBe("vigormortis");
    });
  });

  // -------------------------------------------------------------
  // 3. 呆瓜 (Klutz) - 2 条范例
  // -------------------------------------------------------------
  describe("呆瓜 (Klutz)", () => {
    it("范例 1: 呆瓜死于处决。经过一番争吵，呆瓜选择了一名玩家，而该玩家是善良的女裁缝。夜幕降临，游戏继续。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "seamstress", name: "女裁缝", type: "townsfolk" } as any, isAlive: true, isDead: false, alignment: "good" },
      ] as any;

      const check = checkKlutzSelection(seats[1]);
      expect(check.evilChosen).toBe(false);
      expect(check.goodWins).toBe(true);

      const ctx: any = {
        snapshot: { nightCount: 2, seats, gameOver: false } as any,
        actionNode: { seatId: 0, roleId: "klutz", roleName: "呆瓜" } as any,
        storytellerInput: { chosenSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(klutzAbility), ctx);
      expect(r.meta.abilityResult.evilWins).toBe(false);
      expect(r.snapshot.gameOver).toBe(false);
    });

    it("范例 2: 恶魔杀死了呆瓜玩家小莱。小莱公开选择了一名玩家，而该玩家是邪恶的恶魔，游戏立即结束，邪恶方获胜。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false, alignment: "evil" },
      ] as any;

      const check = checkKlutzSelection(seats[1]);
      expect(check.evilChosen).toBe(true);
      expect(check.goodWins).toBe(false);

      const ctx: any = {
        snapshot: { nightCount: 2, seats, gameOver: false } as any,
        actionNode: { seatId: 0, roleId: "klutz", roleName: "呆瓜" } as any,
        storytellerInput: { chosenSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(klutzAbility), ctx);
      expect(r.meta.abilityResult.evilWins).toBe(true);
      expect(r.snapshot.gameOver).toBe(true);
      expect(r.snapshot.winner).toBe("evil");
    });
  });
});
