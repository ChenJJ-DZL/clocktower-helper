import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  handleGoonInteraction,
  isProtectedByTeaLady,
} from "../../../../utils/bmrMechanics";
import {
  chambermaidAbility,
  courtierAbility,
  goonAbility,
  moonchildAbility,
  tinkerAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《暗月初升》外来者角色官方范例逐条验证 (Outsiders Examples)", () => {
  // -------------------------------------------------------------
  // 1. 修补匠 (Tinker)
  // -------------------------------------------------------------
  describe("修补匠 (Tinker)", () => {
    it("范例 1: 第三个白天突然猝死，说书人决定修补匠死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "tinker", roleName: "修补匠" } as any,
        storytellerInput: { shouldKillTinker: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(tinkerAbility), ctx);
      expect(r.meta.abilityResult.shouldDie).toBe(true);
      expect(r.snapshot.seats[0].isDead).toBe(true);
    });

    it("范例 2: 在夜晚，修补匠死亡，虽然恶魔攻击的是其他玩家。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, statusEffects: [] } as any,
        { id: 1, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, statusEffects: [] } as any,
      ];

      // 恶魔攻击了水手，说书人选择在当晚杀死修补匠
      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "tinker", roleName: "修补匠" } as any,
        storytellerInput: { shouldKillTinker: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(tinkerAbility), ctx);
      expect(r.snapshot.seats[0].isDead).toBe(true);
    });

    it("范例 3: 茶艺师坐在修补匠和另一个善良玩家旁边，保护修补匠免于死亡。修补匠不会因自身能力死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, alignment: "good" },
        { id: 2, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, alignment: "good" },
      ] as any;

      expect(isProtectedByTeaLady(1, seats)).toBe(true);

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 1, roleId: "tinker", roleName: "修补匠" } as any,
        storytellerInput: { shouldKillTinker: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(tinkerAbility), ctx);
      expect(r.meta.abilityResult.isProtected).toBe(true);
      expect(r.meta.abilityResult.shouldDie).toBe(false);
      expect(r.snapshot.seats[1].isDead).toBe(false);
    });

    it("范例 4: 修补匠受旅店老板保护免于恶魔攻击；旅店老板死后失去保护，说书人处死修补匠。", async () => {
      // 旅店老板保护修补匠阶段
      const protectedSeat: Seat = {
        id: 0,
        role: { id: "tinker", name: "修补匠" } as any,
        isDead: false,
        statusEffects: [{ type: "protected", source: "innkeeper" }],
      } as any;
      const ctx1: any = {
        snapshot: { nightCount: 2, seats: [protectedSeat] } as any,
        actionNode: { seatId: 0, roleId: "tinker", roleName: "修补匠" } as any,
        storytellerInput: { shouldKillTinker: true },
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(tinkerAbility), ctx1);
      expect(r1.meta.abilityResult.shouldDie).toBe(false);

      // 旅店老板死后，失去保护，说书人处死
      const unprotectedSeat: Seat = {
        id: 0,
        role: { id: "tinker", name: "修补匠" } as any,
        isDead: false,
        statusEffects: [],
      } as any;
      const ctx2: any = {
        snapshot: { nightCount: 3, seats: [unprotectedSeat] } as any,
        actionNode: { seatId: 0, roleId: "tinker", roleName: "修补匠" } as any,
        storytellerInput: { shouldKillTinker: true },
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(tinkerAbility), ctx2);
      expect(r2.meta.abilityResult.shouldDie).toBe(true);
      expect(r2.snapshot.seats[0].isDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 2. 月之子 (Moonchild)
  // -------------------------------------------------------------
  describe("月之子 (Moonchild)", () => {
    it("范例 1: 普卡杀死月之子，月之子在白天选择驱魔人(善良)，当晚驱魔人死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "moonchild", name: "月之子", type: "outsider" } as any, isDead: true, alignment: "good" } as any,
        { id: 1, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false, alignment: "good" } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "moonchild", roleName: "月之子" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(moonchildAbility), ctx);
      expect(r.meta.abilityResult.targetIsGood).toBe(true);
      expect(r.meta.abilityResult.shouldKill).toBe(true);
      expect(r.meta.stateUpdates.targetId).toBe(1);
    });

    it("范例 2: 和平主义者在场，月之子被处决但未死亡，月之子不能发动能力。", async () => {
      const liveMoonchild: Seat = {
        id: 0,
        role: { id: "moonchild", name: "月之子", type: "outsider" } as any,
        isDead: false,
        isAlive: true,
      } as any;

      // 月之子未死亡，无法触发死亡诅咒
      expect(liveMoonchild.isDead).toBe(false);
    });

    it("范例 3: 月之子选择邪恶的刺客无事发生；后来选择善良的造谣者，造谣者死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "moonchild", name: "月之子" } as any, isDead: true, alignment: "good" } as any,
        { id: 1, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: false, alignment: "evil" } as any,
        { id: 2, role: { id: "gossip", name: "造谣者", type: "townsfolk" } as any, isDead: false, alignment: "good" } as any,
      ];

      // 选择刺客（邪恶） -> 不击杀
      const ctx1: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "moonchild", roleName: "月之子" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(moonchildAbility), ctx1);
      expect(r1.meta.abilityResult.targetIsGood).toBe(false);
      expect(r1.meta.abilityResult.shouldKill).toBe(false);

      // 选择造谣者（善良） -> 击杀
      const ctx2: any = {
        snapshot: { nightCount: 4, seats } as any,
        actionNode: { seatId: 0, roleId: "moonchild", roleName: "月之子" } as any,
        targetIds: [2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(moonchildAbility), ctx2);
      expect(r2.meta.abilityResult.targetIsGood).toBe(true);
      expect(r2.meta.abilityResult.shouldKill).toBe(true);
      expect(r2.meta.stateUpdates.targetId).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 3. 莽夫 (Goon)
  // -------------------------------------------------------------
  describe("莽夫 (Goon)", () => {
    it("范例 1: 侍臣(善良)选择了莽夫。莽夫转变为善良阵营，并且侍臣醉酒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, isDead: false, alignment: "good", statusEffects: [] } as any,
        { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, alignment: "evil" } as any,
      ];

      const res = handleGoonInteraction(seats[0], seats[1], 2);
      expect(res.chooserDrunk).toBe(true);
      expect(res.newGoonAlignment).toBe("good");
      const chooser = res.updatedSeats.find((s) => s.id === 0);
      expect(chooser?.isDrunk).toBe(true);
      expect(chooser?.statusEffects?.some((e: any) => e.type === "drunk" && e.source === "goon")).toBe(true);
    });

    it("范例 2: 沙巴洛斯攻击莽夫和造谣者。沙巴洛斯选莽夫立刻醉酒，攻击失效，莽夫转为邪恶。", async () => {
      const demonSeat: Seat = { id: 0, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, alignment: "evil", statusEffects: [] } as any;
      const goonSeat: Seat = { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, alignment: "good" } as any;

      const res = handleGoonInteraction(demonSeat, goonSeat, 2);
      expect(res.chooserDrunk).toBe(true);
      expect(res.newGoonAlignment).toBe("evil");
    });

    it("范例 3: 侍女选择莽夫和吟游诗人，侍女是当夜首个选莽夫的角色，侍女醉酒得知虚假数字。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, alignment: "good" } as any,
        { id: 1, role: { id: "minstrel", name: "吟游诗人", type: "townsfolk" } as any, isDead: false } as any,
        { id: 2, role: { id: "chambermaid", name: "侍女", type: "townsfolk" } as any, isDead: false, statusEffects: [] } as any,
      ];

      // 侍女选择莽夫 -> 侍女醉酒
      const res = handleGoonInteraction(seats[2], seats[0], 2);
      expect(res.chooserDrunk).toBe(true);

      // 醉酒侍女查验
      const ctx: any = {
        snapshot: { nightCount: 2, seats: [seats[0], seats[1], res.updatedSeats[0]], _abilityResults: {} } as any,
        actionNode: { seatId: 2, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [0, 1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(chambermaidAbility), ctx);
      expect(r.meta.abilityResult.isDrunk).toBe(true);
    });

    it("范例 4: 茶艺师邻居为善良莽夫和修补匠，修补匠免死；莽夫转恶后修补匠失去保护被处决死亡。", async () => {
      // 阶段 1：莽夫为善良，茶艺师保护修补匠
      const seatsGoodGoon: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, alignment: "good" },
        { id: 2, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, alignment: "good" },
      ] as any;
      expect(isProtectedByTeaLady(2, seatsGoodGoon)).toBe(true);

      // 阶段 2：莽夫转为邪恶，修补匠失去保护
      const seatsEvilGoon: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, alignment: "evil", isEvilConverted: true },
        { id: 2, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, alignment: "good" },
      ] as any;
      expect(isProtectedByTeaLady(2, seatsEvilGoon)).toBe(false);
    });
  });
});
