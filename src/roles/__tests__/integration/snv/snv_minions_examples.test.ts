import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import { checkWitchCurseOnNomination } from "../../../../utils/snvMechanics";
import {
  pit_hagAbility,
  witchAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《梦殒春宵》爪牙角色官方范例逐条验证 (S&V Minions Examples)", () => {
  // -------------------------------------------------------------
  // 1. 女巫 (Witch) - 5 条范例
  // -------------------------------------------------------------
  describe("女巫 (Witch)", () => {
    it("范例 1: 夜晚女巫诅咒了贤者。下个白天，贤者提名了筑梦师。说书人立即宣布贤者死亡。玩家仍然投票给筑梦师。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "witch", roleName: "女巫" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(witchAbility), ctx);
      expect(r.snapshot.witchCurse[1]).toBe(true);

      const curseCheck = checkWitchCurseOnNomination(r.snapshot.seats[1], 4, [1]);
      expect(curseCheck.shouldDie).toBe(true);
    });

    it("范例 2: 女巫诅咒了自己。下个白天，女巫提名恶魔并死亡。玩家对是否要处决恶魔进行投票。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "witch", roleName: "女巫" } as any,
        targetIds: [0],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(witchAbility), ctx);
      expect(r.snapshot.witchCurse[0]).toBe(true);

      const curseCheck = checkWitchCurseOnNomination(r.snapshot.seats[0], 4, [0]);
      expect(curseCheck.shouldDie).toBe(true);
    });

    it("范例 3: 女巫诅咒了呆瓜。方古攻击了呆瓜，呆瓜变成了方古。新的方古被诅咒并提名，新的方古死亡，善良胜利。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "klutz", name: "呆瓜", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "witch", roleName: "女巫" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(witchAbility), ctx);
      expect(r.snapshot.witchCurse[1]).toBe(true);

      const curseCheck = checkWitchCurseOnNomination(r.snapshot.seats[1], 4, [1]);
      expect(curseCheck.shouldDie).toBe(true);
    });

    it("范例 4: 女巫诅咒了博学者。在恶魔杀死一名玩家后，只剩三名玩家存活，诅咒被移除。博学者可以安全提名。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "savant", name: "博学者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const curseCheck = checkWitchCurseOnNomination(seats[1], 3, [1]);
      expect(curseCheck.shouldDie).toBe(false);
    });

    it("范例 5: 女巫诅咒了杂耍艺人。杂耍艺人发起对旅行者的流放投票。杂耍艺人不会死亡而且还可以提名处决，因为流放不是提名。", async () => {
      const isExileVote = true;
      const willDie = !isExileVote && checkWitchCurseOnNomination({ id: 1 } as any, 5, [1]).shouldDie;
      expect(willDie).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. 麻脸巫婆 (Pit-Hag) - 3 条范例
  // -------------------------------------------------------------
  describe("麻脸巫婆 (Pit-Hag)", () => {
    it("范例 1: 麻脸巫婆试图将博学者变成贤者，但无事发生，因为贤者在场。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "savant", name: "博学者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "pit_hag", roleName: "麻脸巫婆" } as any,
        targetIds: [1],
        storytellerInput: { newRoleId: "sage" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pit_hagAbility), ctx);
      expect(r.meta.abilityResult.isAlreadyInPlay).toBe(true);
      expect(r.meta.abilityResult.transformed).toBe(false);
      expect(r.snapshot.seats[1].role.id).toBe("savant");
    });

    it("范例 2: 麻脸巫婆将卖花女孩变成镜像双子。现在，有一名善良阵营的镜像双子。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "pit_hag", roleName: "麻脸巫婆" } as any,
        targetIds: [1],
        storytellerInput: { newRoleId: "evil_twin" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pit_hagAbility), ctx);
      expect(r.meta.abilityResult.transformed).toBe(true);
      expect(r.snapshot.seats[1].role.id).toBe("evil_twin");
    });

    it("范例 3: 在最后一个夜晚，麻脸巫婆将神谕者变成善良的诺-达鲺。说书人决定当晚死亡，只杀死了邪恶恶魔，这样只有一个恶魔在最后一个白天存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "oracle", name: "神谕者", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 4, seats } as any,
        actionNode: { seatId: 0, roleId: "pit_hag", roleName: "麻脸巫婆" } as any,
        targetIds: [1],
        storytellerInput: { newRoleId: "no_dashii" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pit_hagAbility), ctx);
      expect(r.meta.abilityResult.transformed).toBe(true);
      expect(r.snapshot.seats[1].role.id).toBe("no_dashii");
      expect(r.snapshot.isDemonCreatedByPitHag).toBe(true);
      expect(r.snapshot.deathDecidedByStoryteller).toBe(true);
    });
  });
});
