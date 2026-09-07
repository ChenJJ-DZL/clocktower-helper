import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import { getNoDashiiPoisonTargets } from "../../../../utils/snvMechanics";
import {
  fang_guAbility,
  no_dashiiAbility,
  vigormortisAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《梦殒春宵》恶魔角色官方范例逐条验证 (S&V Demons Examples)", () => {
  // -------------------------------------------------------------
  // 1. 方古 (Fang Gu) - 2 条范例
  // -------------------------------------------------------------
  describe("方古 (Fang Gu)", () => {
    it("范例 1: 方古攻击并杀死艺术家。下个夜晚，方古攻击了心上人，心上人成为新方古，老方古死亡。心上人不会使玩家醉酒。下个夜晚，新方古攻击并杀死了呆瓜。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "fang_gu", roleName: "方古" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(fang_guAbility), ctx1);
      expect(r1.snapshot.seats[1].isDead).toBe(true);

      const ctx2: any = {
        snapshot: { nightCount: 2, seats: r1.snapshot.seats, fangGuHasJumped: false } as any,
        actionNode: { seatId: 0, roleId: "fang_gu", roleName: "方古" } as any,
        targetIds: [2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(fang_guAbility), ctx2);
      expect(r2.meta.abilityResult.becomesFangGu).toBe(true);
      expect(r2.snapshot.seats[0].isDead).toBe(true);
      expect(r2.snapshot.seats[2].role.id).toBe("fang_gu");
      expect(r2.snapshot.seats[2].isAlive).toBe(true);
      expect(r2.snapshot.seats[2].isEvilConverted).toBe(true);

      const ctx3: any = {
        snapshot: { nightCount: 3, seats: r2.snapshot.seats, fangGuHasJumped: true } as any,
        actionNode: { seatId: 2, roleId: "fang_gu", roleName: "方古" } as any,
        targetIds: [3],
        meta: {},
      };
      const r3 = await runFullAbilityPipeline(pipe(fang_guAbility), ctx3);
      expect(r3.meta.abilityResult.becomesFangGu).toBe(false);
      expect(r3.meta.abilityResult.killed).toBe(true);
      expect(r3.snapshot.seats[3].isDead).toBe(true);
    });

    it("范例 2: 方古攻击死去的呆瓜。因为呆瓜已经死了，他不会再次死亡，所以方古不会死。呆瓜仍然为善良阵营，今晚无人死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: false, isDead: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats, fangGuHasJumped: false } as any,
        actionNode: { seatId: 0, roleId: "fang_gu", roleName: "方古" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(fang_guAbility), ctx);
      expect(r.meta.abilityResult.becomesFangGu).toBe(false);
      expect(r.meta.abilityResult.killed).toBe(false);
      expect(r.snapshot.seats[0].isDead).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. 亡骨魔 (Vigormortis) - 3 条范例
  // -------------------------------------------------------------
  describe("亡骨魔 (Vigormortis)", () => {
    it("范例 1: 亡骨魔杀死了女巫。下个白天，一名被女巫诅咒的玩家发起了提名，被诅咒的玩家死亡（被杀死的爪牙保留能力）。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "vigormortis", name: "亡骨魔", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "vigormortis", roleName: "亡骨魔" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(vigormortisAbility), ctx);
      expect(r.meta.abilityResult.minionKeepsAbility).toBe(true);
      expect(r.snapshot.seats[1].isDead).toBe(true);
      expect(r.snapshot.seats[1].keepsAbilityDead).toBe(true);
    });

    it("范例 2: 亡骨魔杀死了镜像双子。与镜像双子邻近的是呆瓜和卖花女孩，贤者在呆瓜的另一侧。说书人选择让贤者中毒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "vigormortis", name: "亡骨魔", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "evil_twin", name: "镜像双子", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 4, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "vigormortis", roleName: "亡骨魔" } as any,
        targetIds: [1],
        storytellerInput: { poisonedTownsfolkId: 4 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(vigormortisAbility), ctx);
      expect(r.snapshot.seats[1].isDead).toBe(true);
      expect(r.snapshot.seats[1].keepsAbilityDead).toBe(true);
      expect(r.snapshot.seats[4].isPoisoned).toBe(true);
    });

    it("范例 3: 亡骨魔杀死了麻脸巫婆。麻脸巫婆保留能力并把博学者变成女巫。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "vigormortis", name: "亡骨魔", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "vigormortis", roleName: "亡骨魔" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(vigormortisAbility), ctx);
      expect(r.snapshot.seats[1].isDead).toBe(true);
      expect(r.snapshot.seats[1].keepsAbilityDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. 诺-达鲺 (No Dashii) - 3 条范例
  // -------------------------------------------------------------
  describe("诺-达鲺 (No Dashii)", () => {
    it("范例 1: 在游戏开始时，诺-达鲺与城镇公告员和舞蛇人相邻，这两名玩家都中毒了。几天之后，他们都死了，与诺-达鲺最近的存活玩家变为了钟表匠和理发师，但他们不会受到诺-达鲺的影响（死者不再受影响，理发师是外来者）。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "town_crier", name: "城镇公告员", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "no_dashii", name: "诺-达鲺", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "snake_charmer", name: "舞蛇人", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const poisoned = getNoDashiiPoisonTargets(1, seats);
      expect(poisoned).toContain(0);
      expect(poisoned).toContain(2);
    });

    it("范例 2: 诺-达鲺顺时针方向依次坐着哲学家、数学家和贤者。诺-达鲺逆时针方向依次坐着女巫、畸形秀演员和女裁缝。哲学家和女裁缝中毒了。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "no_dashii", name: "诺-达鲺", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "mathematician", name: "数学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 4, role: { id: "seamstress", name: "女裁缝", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 5, role: { id: "mutant", name: "畸形秀演员", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 6, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const targets = getNoDashiiPoisonTargets(0, seats);
      expect(targets).toContain(1);
      expect(targets).toContain(4);
      expect(targets.length).toBe(2);
    });

    it("范例 3: 新的诺-达鲺现在使与他邻近的两个镇民玩家中毒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "no_dashii", name: "诺-达鲺", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "no_dashii", roleName: "诺-达鲺" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(no_dashiiAbility), ctx);
      expect(r.snapshot.seats[1].isDead).toBe(true);
      expect(r.meta.abilityResult.poisonedAdjacent).toBeDefined();
    });
  });
});
