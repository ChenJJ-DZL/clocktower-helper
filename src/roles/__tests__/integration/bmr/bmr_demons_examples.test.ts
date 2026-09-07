import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  isProtectedByTeaLady,
} from "../../../../utils/bmrMechanics";
import {
  poAbility,
  pukkaAbility,
  shabalothAbility,
  zombuulAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《暗月初升》恶魔角色官方范例逐条验证 (Demons Examples)", () => {
  // -------------------------------------------------------------
  // 1. 僵怖 (Zombuul)
  // -------------------------------------------------------------
  describe("僵怖 (Zombuul)", () => {
    it("范例 1: 僵怖首次被处决伪死，当天白天有死亡，当晚不攻击；虽登记为死者，仍保有能力可继续游戏。", async () => {
      // 僵怖处于首次死亡状态（伪死，生命标记翻面，但在场仍存活有能力）
      const fakeDeadZombuul: Seat = {
        id: 0,
        role: { id: "zombuul", name: "僵怖", type: "demon" } as any,
        isDead: true, // 登记为已死亡
        isAlive: false,
        zombuulTrulyDead: false, // 并非真正彻底死亡
      } as any;
      const villager: Seat = {
        id: 1,
        role: { id: "sailor", name: "水手", type: "townsfolk" } as any,
        isDead: false,
        isAlive: true,
      } as any;

      // 白天有人死亡（处决僵怖） -> lastDuskExecution 不为 null，僵怖当晚不发动攻击
      const ctxNight1: any = {
        snapshot: {
          nightCount: 1,
          lastDuskExecution: 0,
          seats: [fakeDeadZombuul, villager],
        } as any,
        actionNode: { seatId: 0, roleId: "zombuul", roleName: "僵怖" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(zombuulAbility), ctxNight1);
      expect(r1.aborted).toBe(true);
      expect(r1.abortReason).toBe("今天白天有人死亡，僵怖不会被唤醒");
    });

    it("范例 2: 白天无人死亡，僵怖夜间发动攻击；次日白天修补匠死亡，当晚僵怖不攻击。", async () => {
      const liveZombuul: Seat = {
        id: 0,
        role: { id: "zombuul", name: "僵怖", type: "demon" } as any,
        isDead: false,
        isAlive: true,
      } as any;
      const target: Seat = {
        id: 1,
        role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any,
        isDead: false,
        isAlive: true,
      } as any;

      // 白天无人死亡 -> 僵怖成功杀人
      const ctxNoDeath: any = {
        snapshot: {
          nightCount: 2,
          lastDuskExecution: null,
          dayDeathsToday: 0,
          seats: [liveZombuul, target],
        } as any,
        actionNode: { seatId: 0, roleId: "zombuul", roleName: "僵怖" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(zombuulAbility), ctxNoDeath);
      expect(r1.snapshot.seats[1].isDead).toBe(true);

      // 次日白天修补匠死亡 -> dayDeathsToday = 1，僵怖当晚不攻击
      const ctxWithDayDeath: any = {
        snapshot: {
          nightCount: 3,
          lastDuskExecution: null,
          dayDeathsToday: 1,
          seats: [liveZombuul, target],
        } as any,
        actionNode: { seatId: 0, roleId: "zombuul", roleName: "僵怖" } as any,
        targetIds: [1],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(zombuulAbility), ctxWithDayDeath);
      expect(r2.aborted).toBe(true);
      expect(r2.abortReason).toBe("今天白天有人死亡，僵怖不会被唤醒");
    });
  });

  // -------------------------------------------------------------
  // 2. 普卡 (Pukka)
  // -------------------------------------------------------------
  describe("普卡 (Pukka)", () => {
    it("范例 1: 普卡使侍女中毒，侍女得到错误信息，下一夜侍女死亡。", async () => {
      const pukka: Seat = { id: 0, role: { id: "pukka", name: "普卡", type: "demon" } as any, isDead: false, isAlive: true } as any;
      const chambermaid: Seat = { id: 1, role: { id: "chambermaid", name: "侍女", type: "townsfolk" } as any, isDead: false, isAlive: true, statusDetails: [] } as any;
      const bystander: Seat = { id: 2, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, isAlive: true, statusDetails: [] } as any;

      // 第一晚：普卡使侍女中毒
      const ctx1: any = {
        snapshot: { nightCount: 1, seats: [pukka, chambermaid, bystander] } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(pukkaAbility), ctx1);
      const poisonedChambermaid = r1.snapshot.seats.find((s: any) => s.id === 1);
      expect(poisonedChambermaid?.isPoisoned).toBe(true);
      expect(poisonedChambermaid?.isDead).toBe(false);

      // 第二晚：普卡选择下毒旁观者，此前中毒的侍女死亡
      const ctx2: any = {
        snapshot: { nightCount: 2, seats: r1.snapshot.seats } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(pukkaAbility), ctx2);
      const deadChambermaid = r2.snapshot.seats.find((s: any) => s.id === 1);
      expect(deadChambermaid?.isDead).toBe(true);
      const nextPoisoned = r2.snapshot.seats.find((s: any) => s.id === 2);
      expect(nextPoisoned?.isPoisoned).toBe(true);
    });

    it("范例 2: 普卡选择受旅店老板保护的玩家，该玩家中毒(旅店老板只防死不防毒)；下夜该玩家死亡。", async () => {
      const pukka: Seat = { id: 0, role: { id: "pukka", name: "普卡", type: "demon" } as any, isDead: false, isAlive: true } as any;
      const protectedPlayer: Seat = {
        id: 1,
        role: { id: "gossip", name: "造谣者", type: "townsfolk" } as any,
        isDead: false,
        isAlive: true,
        statusEffects: [{ type: "protected", source: "innkeeper" }],
        statusDetails: [],
      } as any;
      const target2: Seat = { id: 2, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, isAlive: true, statusDetails: [] } as any;

      // 第一晚：下毒受旅店老板保护的玩家，成功中毒
      const ctx1: any = {
        snapshot: { nightCount: 1, seats: [pukka, protectedPlayer, target2] } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(pukkaAbility), ctx1);
      const p = r1.snapshot.seats.find((s: any) => s.id === 1);
      expect(p?.isPoisoned).toBe(true);

      // 第二晚：普卡下毒2号，1号毒发身亡
      const ctx2: any = {
        snapshot: { nightCount: 2, seats: r1.snapshot.seats } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(pukkaAbility), ctx2);
      expect(r2.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
    });

    it("范例 3: 普卡下毒和平主义者；下个夜晚驱魔人驱逐普卡，普卡不唤醒，但和平主义者仍毒发身亡。", async () => {
      const poisonedPacifist: Seat = {
        id: 1,
        role: { id: "pacifist", name: "和平主义者", type: "townsfolk" } as any,
        isDead: false,
        isAlive: true,
        isPoisoned: true,
        statusDetails: [{ type: "poison", source: "pukka" }, "普卡中毒（永久）"],
      } as any;

      // 驱魔人阻止普卡本晚发动新攻击，但旧中毒目标依然在普卡毒杀逻辑中结算死亡
      const seats = [
        { id: 0, role: { id: "pukka", name: "普卡", type: "demon" } as any, isDead: false, isAlive: true } as any,
        poisonedPacifist,
      ];
      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [0], // 普卡自身（被驱魔或任意目标）
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pukkaAbility), ctx);
      expect(r.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
    });

    it("范例 4: 普卡醉酒时尝试下毒新目标失败。", async () => {
      const pukka: Seat = { id: 0, role: { id: "pukka", name: "普卡", type: "demon" } as any, isDead: false, isAlive: true, isDrunk: true } as any;
      const target: Seat = { id: 1, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, isDead: false, isAlive: true, statusDetails: [] } as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats: [pukka, target] } as any,
        actionNode: { seatId: 0, roleId: "pukka", roleName: "普卡" } as any,
        targetIds: [1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(pukkaAbility), ctx);
      expect(r.snapshot.seats.find((s: any) => s.id === 1)?.isPoisoned).toBeFalsy();
    });
  });

  // -------------------------------------------------------------
  // 3. 沙巴洛斯 (Shabaloth)
  // -------------------------------------------------------------
  describe("沙巴洛斯 (Shabaloth)", () => {
    it("范例 1: 沙巴洛斯攻击造谣者和赌徒，造谣者死亡，受旅店老板保护的赌徒存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "gossip", name: "造谣者", type: "townsfolk" } as any, isDead: false, isAlive: true, statusEffects: [] },
        { id: 2, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, isAlive: true, statusEffects: [{ type: "protected", source: "innkeeper" }] },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "shabaloth", roleName: "沙巴洛斯" } as any,
        targetIds: [1, 2],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(shabalothAbility), ctx);
      expect(r.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
      expect(r.snapshot.seats.find((s: any) => s.id === 2)?.isDead).toBe(false);
    });

    it("范例 2: 沙巴洛斯攻击已死亡的驱魔人和存活的侍臣。侍臣死亡，下一夜说书人反刍复活驱魔人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, isDead: false, isAlive: true, statusEffects: [] },
        { id: 2, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: true, isAlive: false, statusEffects: [] },
      ] as any;

      // 沙巴洛斯可选择已死玩家与存活玩家
      const ctx1: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "shabaloth", roleName: "沙巴洛斯" } as any,
        targetIds: [1, 2],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(shabalothAbility), ctx1);
      expect(r1.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);

      // 下一夜：说书人反刍复活 2 号驱魔人
      const ctx2: any = {
        snapshot: { nightCount: 3, seats: r1.snapshot.seats } as any,
        actionNode: { seatId: 0, roleId: "shabaloth", roleName: "沙巴洛斯" } as any,
        targetIds: [1, 2],
        storytellerInput: { regurgitatedSeatId: 2 },
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(shabalothAbility), ctx2);
      const revived = r2.snapshot.seats.find((s: any) => s.id === 2);
      expect(revived?.isDead).toBe(false);
      expect(revived?.isAlive).toBe(true);
    });

    it("范例 3: 沙巴洛斯攻击茶艺师的邻近玩家，然后是茶艺师。邻近玩家受保护免死，随后茶艺师死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 2, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 3, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, isAlive: true },
      ] as any;

      // 0号受茶艺师保护
      expect(isProtectedByTeaLady(0, seats)).toBe(true);

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 3, roleId: "shabaloth", roleName: "沙巴洛斯" } as any,
        targetIds: [0, 1], // 攻击邻居0号和茶艺师1号
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(shabalothAbility), ctx);
      expect(r.snapshot.seats.find((s: any) => s.id === 0)?.isDead).toBe(false);
      expect(r.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. 珀 (Po)
  // -------------------------------------------------------------
  describe("珀 (Po)", () => {
    it("范例 1: 第二夜杀1人，第三夜选0人不攻击，第四夜攻击3人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "po", name: "珀", type: "demon" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 2, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 3, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 4, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false, isAlive: true },
      ] as any;

      // 第三夜：选择不杀任何人（蓄力）
      const ctxCharge: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "po", roleName: "珀" } as any,
        targetIds: [],
        meta: {},
      };
      const rCharge = await runFullAbilityPipeline(pipe(poAbility), ctxCharge);
      expect(rCharge.snapshot.poCharged).toBe(true);

      // 第四夜：蓄力后攻击3名玩家(1号, 3号, 4号)
      const ctxTripleKill: any = {
        snapshot: { nightCount: 4, seats: rCharge.snapshot.seats } as any,
        actionNode: { seatId: 0, roleId: "po", roleName: "珀" } as any,
        targetIds: [1, 3, 4],
        meta: {},
      };
      const rTriple = await runFullAbilityPipeline(pipe(poAbility), ctxTripleKill);
      expect(rTriple.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
      expect(rTriple.snapshot.seats.find((s: any) => s.id === 3)?.isDead).toBe(true);
      expect(rTriple.snapshot.seats.find((s: any) => s.id === 4)?.isDead).toBe(true);
    });

    it("范例 2: 珀蓄力时醉酒，次夜中毒选择3人无一人死亡；恢复清醒后攻击1人死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "po", name: "珀", type: "demon" } as any, isDead: false, isAlive: true, isPoisoned: true },
        { id: 1, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 2, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, isDead: false, isAlive: true },
        { id: 3, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false, isAlive: true },
      ] as any;

      // 中毒期间选择3人，无事发生
      const ctxPoisoned: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "po", roleName: "珀" } as any,
        targetIds: [1, 2, 3],
        meta: { abilityEffective: false },
      };
      const r1 = await runFullAbilityPipeline(pipe(poAbility), ctxPoisoned);
      expect(r1.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(false);
      expect(r1.snapshot.seats.find((s: any) => s.id === 2)?.isDead).toBe(false);
      expect(r1.snapshot.seats.find((s: any) => s.id === 3)?.isDead).toBe(false);

      // 恢复清醒后攻击1名玩家，该玩家死亡
      const soberSeats = r1.snapshot.seats.map((s: any) =>
        s.id === 0 ? { ...s, isPoisoned: false, isDrunk: false } : s
      );
      const ctxSober: any = {
        snapshot: { nightCount: 4, seats: soberSeats } as any,
        actionNode: { seatId: 0, roleId: "po", roleName: "珀" } as any,
        targetIds: [1],
        meta: { abilityEffective: true },
      };
      const r2 = await runFullAbilityPipeline(pipe(poAbility), ctxSober);
      expect(r2.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
    });

    it("范例 3: 珀攻击月之子，然后是莽夫，最后是祖母。只有月之子死亡，因为攻击莽夫时珀醉酒了。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "po", name: "珀", type: "demon" } as any, isDead: false, isAlive: true },
        { id: 1, role: { id: "moonchild", name: "月之子", type: "outsider" } as any, isDead: false, isAlive: true },
        { id: 2, role: { id: "goon", name: "莽夫", type: "outsider" } as any, isDead: false, isAlive: true },
        { id: 3, role: { id: "grandmother", name: "祖母", type: "townsfolk" } as any, isDead: false, isAlive: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "po", roleName: "珀" } as any,
        targetIds: [1, 2, 3], // 顺次攻击1号月之子，2号莽夫，3号祖母
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(poAbility), ctx);
      // 1号月之子死亡
      expect(r.snapshot.seats.find((s: any) => s.id === 1)?.isDead).toBe(true);
      // 2号莽夫存活（攻击瞬间让珀醉酒）
      expect(r.snapshot.seats.find((s: any) => s.id === 2)?.isDead).toBe(false);
      // 3号祖母存活（因为珀在攻击莽夫后已处于醉酒状态）
      expect(r.snapshot.seats.find((s: any) => s.id === 3)?.isDead).toBe(false);
    });
  });
});
