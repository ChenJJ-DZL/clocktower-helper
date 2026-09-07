import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  calculateClockmakerDistance,
  isGoodAlignment,
} from "../../../../utils/snvMechanics";
import {
  artistAbility,
  clockmakerAbility,
  dreamerAbility,
  flowergirlAbility,
  mathematicianAbility,
  philosopherAbility,
  sageAbility,
  seamstressAbility,
  snake_charmerAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《梦殒春宵》镇民角色官方范例逐条验证 (S&V Townsfolk Examples)", () => {
  // -------------------------------------------------------------
  // 1. 钟表匠 (Clockmaker) - 3 条范例
  // -------------------------------------------------------------
  describe("钟表匠 (Clockmaker)", () => {
    it("范例 1: 方古坐在麻脸巫婆旁边。钟表匠得知了“1”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 4, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      expect(calculateClockmakerDistance(seats)).toBe(1);

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 2, roleId: "clockmaker", roleName: "钟表匠" } as any,
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(clockmakerAbility), ctx);
      expect(r.meta.abilityResult).toBe(1);
    });

    it("范例 2: 诺-达鲺顺时针方向依次坐着筑梦师、舞蛇人，然后是镜像双子。诺-达鲺逆时针方依次坐着畸形秀演员、心上人、哲学家、贤者，然后是女巫。因为女巫与恶魔的距离为五，而镜像双子与恶魔的距离为三，所以钟表匠得知了“3”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "no_dashii", name: "诺-达鲺", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "snake_charmer", name: "舞蛇人", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "evil_twin", name: "镜像双子", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 4, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 5, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 6, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 7, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 8, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 9, role: { id: "mutant", name: "畸形秀演员", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      expect(calculateClockmakerDistance(seats)).toBe(3);

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 4, roleId: "clockmaker", roleName: "钟表匠" } as any,
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(clockmakerAbility), ctx);
      expect(r.meta.abilityResult).toBe(3);
    });

    it("范例 3: 方古与两名旅行者相邻，一善一恶。洗脑师与其中一名旅行者相邻。在第一个晚上，钟表匠得知了“2”，因为邪恶的旅行者不是爪牙。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "gunslinger", name: "枪手", type: "traveler" } as any, isAlive: true, isDead: false, alignment: "evil" },
        { id: 2, role: { id: "cerenovus", name: "洗脑师", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "beggar", name: "乞丐", type: "traveler" } as any, isAlive: true, isDead: false, alignment: "good" },
        { id: 4, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      expect(calculateClockmakerDistance(seats)).toBe(2);

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 4, roleId: "clockmaker", roleName: "钟表匠" } as any,
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(clockmakerAbility), ctx);
      expect(r.meta.abilityResult).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 2. 筑梦师 (Dreamer) - 4 条范例
  // -------------------------------------------------------------
  describe("筑梦师 (Dreamer)", () => {
    it("范例 1: 筑梦师选择一名玩家，该玩家是畸形秀演员。筑梦师得知该玩家是畸形秀演员或洗脑师。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "mutant", name: "畸形秀演员", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      const mutantRole = { id: "mutant", name: "畸形秀演员", type: "outsider" };
      const cerenovusRole = { id: "cerenovus", name: "洗脑师", type: "minion" };

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "dreamer", roleName: "筑梦师" } as any,
        targetIds: [1],
        storytellerInput: { roleA: mutantRole, roleB: cerenovusRole },
        meta: {},
      };

      const r = await runFullAbilityPipeline(pipe(dreamerAbility), ctx);
      const res = r.meta.abilityResult;
      expect(res.targetId).toBe(1);
      const learnedRoleIds = [res.roleA.id, res.roleB.id];
      expect(learnedRoleIds).toContain("mutant");
      expect(learnedRoleIds).toContain("cerenovus");
    });

    it("范例 2: 筑梦师选择了一名获得了卖花女孩能力的哲学家。筑梦师得知该玩家要么是哲学家，要么是亡骨魔。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const philRole = { id: "philosopher", name: "哲学家", type: "townsfolk" };
      const vigorRole = { id: "vigormortis", name: "亡骨魔", type: "demon" };

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "dreamer", roleName: "筑梦师" } as any,
        targetIds: [1],
        storytellerInput: { roleA: philRole, roleB: vigorRole },
        meta: {},
      };

      const r = await runFullAbilityPipeline(pipe(dreamerAbility), ctx);
      const res = r.meta.abilityResult;
      expect(res.targetId).toBe(1);
      const learnedRoleIds = [res.roleA.id, res.roleB.id];
      expect(learnedRoleIds).toContain("philosopher");
      expect(learnedRoleIds).toContain("vigormortis");
    });

    it("范例 3: 在白天，镜像双子和艺术家都声称自己是艺术家。那天晚上，筑梦师选择了镜像双子。说书人展示镜像双子和心上人，或镜像双子和艺术家。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "evil_twin", name: "镜像双子", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const twinRole = { id: "evil_twin", name: "镜像双子", type: "minion" };
      const sweetheartRole = { id: "sweetheart", name: "心上人", type: "outsider" };

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "dreamer", roleName: "筑梦师" } as any,
        targetIds: [1],
        storytellerInput: { roleA: twinRole, roleB: sweetheartRole },
        meta: {},
      };

      const r = await runFullAbilityPipeline(pipe(dreamerAbility), ctx);
      const res = r.meta.abilityResult;
      expect(res.targetId).toBe(1);
      const learned = [res.roleA.id, res.roleB.id];
      expect(learned).toContain("evil_twin");
      expect(learned).toContain("sweetheart");
    });

    it("范例 4: 筑梦师选择了一名玩家，他的真实角色是涡流。因为涡流，信息必须错误：得知神谕者或诺-达鲺。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "dreamer", name: "筑梦师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const oracleRole = { id: "oracle", name: "神谕者", type: "townsfolk" };
      const noDashiiRole = { id: "no_dashii", name: "诺-达鲺", type: "demon" };

      const ctx: any = {
        snapshot: { nightCount: 1, seats, isVortoxWorld: true } as any,
        actionNode: { seatId: 0, roleId: "dreamer", roleName: "筑梦师" } as any,
        targetIds: [1],
        storytellerInput: { roleA: oracleRole, roleB: noDashiiRole },
        meta: {},
      };

      const r = await runFullAbilityPipeline(pipe(dreamerAbility), ctx);
      const res = r.meta.abilityResult;
      expect(res.targetId).toBe(1);
      expect(res.roleA.id).not.toBe("vortox");
      expect(res.roleB.id).not.toBe("vortox");
    });
  });

  // -------------------------------------------------------------
  // 3. 舞蛇人 (Snake Charmer) - 3 条范例
  // -------------------------------------------------------------
  describe("舞蛇人 (Snake Charmer)", () => {
    it("范例 1: 舞蛇人选择的玩家是麻脸巫婆，无事发生。下个夜晚，舞蛇人选择他自己，依旧无事发生。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "snake_charmer", name: "舞蛇人", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "pit_hag", name: "麻脸巫婆", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "snake_charmer", roleName: "舞蛇人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(snake_charmerAbility), ctx1);
      expect(r1.meta.abilityResult.swapTriggered).toBe(false);
      expect(r1.snapshot.seats[0].role.id).toBe("snake_charmer");

      const ctx2: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "snake_charmer", roleName: "舞蛇人" } as any,
        targetIds: [0],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(snake_charmerAbility), ctx2);
      expect(r2.meta.abilityResult.swapTriggered).toBe(false);
      expect(r2.snapshot.seats[0].role.id).toBe("snake_charmer");
    });

    it("范例 2: 舞蛇人选择的玩家是亡骨魔。舞蛇人立即变成邪恶的亡骨魔，曾经是亡骨魔的玩家变成善良的舞蛇人并中毒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "snake_charmer", name: "舞蛇人", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "vigormortis", name: "亡骨魔", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "snake_charmer", roleName: "舞蛇人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(snake_charmerAbility), ctx);
      expect(r.meta.abilityResult.swapTriggered).toBe(true);

      const newDemon = r.snapshot.seats.find((s: any) => s.id === 0);
      const newSC = r.snapshot.seats.find((s: any) => s.id === 1);

      expect(newDemon.role.id).toBe("vigormortis");
      expect(newDemon.isEvilConverted).toBe(true);

      expect(newSC.role.id).toBe("snake_charmer");
      expect(newSC.isGoodConverted).toBe(true);
      expect(newSC.isPoisoned).toBe(true);
    });

    it("范例 3: 麻脸巫婆把自己变成了舞蛇人。然后舞蛇人选择了方古玩家。舞蛇人变成了方古，方古变成了中毒的舞蛇人。但两者仍然邪恶。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "snake_charmer", name: "舞蛇人", type: "townsfolk" } as any, isAlive: true, isDead: false, alignment: "evil", isEvilConverted: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false, alignment: "evil" },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "snake_charmer", roleName: "舞蛇人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(snake_charmerAbility), ctx);
      expect(r.meta.abilityResult.swapTriggered).toBe(true);

      const seat0 = r.snapshot.seats.find((s: any) => s.id === 0);
      const seat1 = r.snapshot.seats.find((s: any) => s.id === 1);

      expect(seat0.role.id).toBe("fang_gu");
      expect(!isGoodAlignment(seat0)).toBe(true);

      expect(seat1.role.id).toBe("snake_charmer");
      expect(seat1.isPoisoned).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. 数学家 (Mathematician) - 3 条范例
  // -------------------------------------------------------------
  describe("数学家 (Mathematician)", () => {
    it("范例 1: 中毒的神谕者得知有两名死亡玩家是邪恶的，但是事实上有三名死亡玩家是邪恶的。所有其他能力正常生效。数学家得知了“1”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "mathematician", name: "数学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "oracle", name: "神谕者", type: "townsfolk" } as any, isAlive: true, isDead: false, isPoisoned: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats, abnormalAbilityCount: 1 } as any,
        actionNode: { seatId: 0, roleId: "mathematician", roleName: "数学家" } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(mathematicianAbility), ctx);
      expect(r.meta.abilityResult.abnormalCount).toBe(1);
    });

    it("范例 2: 中毒的舞蛇人选择了镇民玩家并且无事发生。醉酒的杂耍艺人得知了正确信息。中毒的博学者得知了两条正确信息。当晚，数学家得知了“1”，因为舞蛇人和杂耍艺人的能力没有出现异常，但博学者得知的其中一条信息原本应该是错误的。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "mathematician", name: "数学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats, abnormalAbilityCount: 1 } as any,
        actionNode: { seatId: 0, roleId: "mathematician", roleName: "数学家" } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(mathematicianAbility), ctx);
      expect(r.meta.abilityResult.abnormalCount).toBe(1);
    });

    it("范例 3: 涡流在游戏中。五名善良玩家得知了错误信息。女巫醉酒了，当被女巫诅咒的玩家发起提名时，该玩家没有死亡。虽然有六名玩家的角色能力都没有正常生效，但是数学家由于涡流的能力，得知了“3”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "mathematician", name: "数学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: {
          nightCount: 1,
          seats,
          abnormalAbilityCount: 6,
          isVortoxWorld: true,
          globalEffects: { vortoxWorld: true },
        } as any,
        actionNode: { seatId: 0, roleId: "mathematician", roleName: "数学家" } as any,
        storytellerInput: { fakeResult: 3 },
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(mathematicianAbility), ctx);
      expect(r.meta.abilityResult.abnormalCount).toBe(3);
    });
  });

  // -------------------------------------------------------------
  // 5. 卖花女孩 (Flowergirl) - 3 条范例
  // -------------------------------------------------------------
  describe("卖花女孩 (Flowergirl)", () => {
    it("范例 1: 今天白天有一项提名。很多玩家投票，被提名的玩家被处决。但恶魔没有参与投票。那天晚上，卖花女孩得知了“否”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats, demonVotedToday: false } as any,
        actionNode: { seatId: 0, roleId: "flowergirl", roleName: "卖花女孩" } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(flowergirlAbility), ctx);
      expect(r.meta.abilityResult.hasVoted).toBe(false);
    });

    it("范例 2: 今天白天共有三项提名。恶魔在第二次提名投票，没有人被处决。那天晚上，卖花女孩得知了“是”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats, demonVotedToday: true } as any,
        actionNode: { seatId: 0, roleId: "flowergirl", roleName: "卖花女孩" } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(flowergirlAbility), ctx);
      expect(r.meta.abilityResult.hasVoted).toBe(true);
    });

    it("范例 3: 今天白天没有提名。白天有一名旅行者被流放了，流放时所有玩家都举手表示赞成。卖花女孩得知的信息是“否”，因为赞成流放不是投票。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats, demonVotedToday: false } as any,
        actionNode: { seatId: 0, roleId: "flowergirl", roleName: "卖花女孩" } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(flowergirlAbility), ctx);
      expect(r.meta.abilityResult.hasVoted).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 6. 女裁缝 (Seamstress) - 3 条范例
  // -------------------------------------------------------------
  describe("女裁缝 (Seamstress)", () => {
    it("范例 1: 在第一个夜晚，女裁缝选择了两名玩家，他们是理发师和钟表匠。因为他俩都是善良的，女裁缝得知“是”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "seamstress", name: "女裁缝", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "barber", name: "理发师", type: "outsider" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "seamstress", roleName: "女裁缝" } as any,
        targetIds: [1, 2],
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(seamstressAbility), ctx);
      expect(r.meta.abilityResult.sameAlignment).toBe(true);
    });

    it("范例 2: 在第四个夜晚，她选择了两名玩家，他们分别是方古和心上人，女裁缝得知“否”。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "seamstress", name: "女裁缝", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "sweetheart", name: "心上人", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 4, seats } as any,
        actionNode: { seatId: 0, roleId: "seamstress", roleName: "女裁缝" } as any,
        targetIds: [1, 2],
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(seamstressAbility), ctx);
      expect(r.meta.abilityResult.sameAlignment).toBe(false);
    });

    it("范例 3: 麻脸巫婆把数学家变成了女巫，女巫仍然是善良的。当晚，女裁缝选择了两名玩家，他们是女巫和城镇公告员。女裁缝得知“是”，因为他们是善良的。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "seamstress", name: "女裁缝", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false, alignment: "good", isGoodConverted: true },
        { id: 2, role: { id: "town_crier", name: "城镇公告员", type: "townsfolk" } as any, isAlive: true, isDead: false, alignment: "good" },
      ] as any;

      expect(isGoodAlignment(seats[1])).toBe(true);
      expect(isGoodAlignment(seats[2])).toBe(true);

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "seamstress", roleName: "女裁缝" } as any,
        targetIds: [1, 2],
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(seamstressAbility), ctx);
      expect(r.meta.abilityResult.sameAlignment).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 7. 哲学家 (Philosopher) - 3 条范例
  // -------------------------------------------------------------
  describe("哲学家 (Philosopher)", () => {
    it("范例 1: 哲学家选择获得筑梦师能力。从现在起，他将在筑梦师应该行动时进行行动。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "philosopher", roleName: "哲学家" } as any,
        storytellerInput: { chosenRoleId: "dreamer" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(philosopherAbility), ctx);
      expect(r.meta.abilityResult.chosenRoleId).toBe("dreamer");
      expect(r.snapshot.philosopherGainedRole).toBe("dreamer");
    });

    it("范例 2: 在第三个夜晚，哲学家选择获得钟表匠的能力。当晚，他得知了恶魔与爪牙之间的最近的距离。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "philosopher", roleName: "哲学家" } as any,
        storytellerInput: { chosenRoleId: "clockmaker" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(philosopherAbility), ctx);
      expect(r.meta.abilityResult.chosenRoleId).toBe("clockmaker");
      expect(calculateClockmakerDistance(seats)).toBe(1);
    });

    it("范例 3: 哲学家选择获得艺术家的能力，但场上已经有一名艺术家。那名艺术家玩家醉酒。在那之后，哲学家死亡，艺术家玩家恢复清醒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "philosopher", name: "哲学家", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "philosopher", roleName: "哲学家" } as any,
        storytellerInput: { chosenRoleId: "artist" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(philosopherAbility), ctx);
      expect(r.meta.abilityResult.roleInPlay).toBe(true);
      const artistSeat = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(artistSeat.isDrunk).toBe(true);
      expect(artistSeat.statusEffects.some((e: any) => e.type === "drunk" && e.source === "philosopher")).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 8. 艺术家 (Artist) - 4 条范例
  // -------------------------------------------------------------
  describe("艺术家 (Artist)", () => {
    it("范例 1: 艺术家问：“恶魔坐在棕色椅子上吗？”说书人回答：“不是”，因为此时恶魔坐在黑色椅子上。", async () => {
      const ctx: any = {
        snapshot: { nightCount: 1, seats: [{ id: 0, role: { id: "artist" }, isAlive: true }] } as any,
        actionNode: { seatId: 0, roleId: "artist", roleName: "艺术家" } as any,
        storytellerInput: { question: "恶魔坐在棕色椅子上吗？", answer: "不是" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(artistAbility), ctx);
      expect(r.meta.abilityResult.question).toBe("恶魔坐在棕色椅子上吗？");
      expect(r.meta.abilityResult.answer).toBe("不是");
    });

    it("范例 2: 艺术家问：“大壮是镜像双子吗？”说书人回答，“是的”，因为此时大壮是镜像双子。", async () => {
      const ctx: any = {
        snapshot: { nightCount: 1, seats: [{ id: 0, role: { id: "artist" }, isAlive: true }] } as any,
        actionNode: { seatId: 0, roleId: "artist", roleName: "艺术家" } as any,
        storytellerInput: { question: "大壮是镜像双子吗？", answer: "是的" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(artistAbility), ctx);
      expect(r.meta.abilityResult.answer).toBe("是的");
    });

    it("范例 3: 艺术家问：“有多少爪牙活着？”说书人回答：“我无法用’是，不是，或者我不知道’来回答。请再问一个问题。”", async () => {
      const ctx: any = {
        snapshot: { nightCount: 1, seats: [{ id: 0, role: { id: "artist" }, isAlive: true }] } as any,
        actionNode: { seatId: 0, roleId: "artist", roleName: "艺术家" } as any,
        storytellerInput: {
          question: "有多少爪牙活着？",
          answer: "我无法用’是，不是，或者我不知道’来回答。请再问一个问题。",
        },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(artistAbility), ctx);
      expect(r.meta.abilityResult.answer).toContain("请再问一个问题");
    });

    it("范例 4: 艺术家问：“我们快要赢了吗？”说书人回答：“我不知道。”因为此时即使所有爪牙都死了，还是有很多善良的玩家相信恶魔是好人。", async () => {
      const ctx: any = {
        snapshot: { nightCount: 1, seats: [{ id: 0, role: { id: "artist" }, isAlive: true }] } as any,
        actionNode: { seatId: 0, roleId: "artist", roleName: "艺术家" } as any,
        storytellerInput: { question: "我们快要赢了吗？", answer: "我不知道" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(artistAbility), ctx);
      expect(r.meta.abilityResult.answer).toBe("我不知道");
    });
  });

  // -------------------------------------------------------------
  // 9. 贤者 (Sage) - 3 条范例
  // -------------------------------------------------------------
  describe("贤者 (Sage)", () => {
    it("范例 1: 第二个夜晚，恶魔杀死了贤者。说书人为贤者指出了两名玩家，其中一名是恶魔。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "sage", roleName: "贤者" } as any,
        storytellerInput: { killedByDemon: true },
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(sageAbility), ctx);
      expect(r.meta.abilityResult.killedByDemon).toBe(true);
      expect(r.meta.abilityResult.targetIds).toContain(1);
      expect(r.meta.abilityResult.targetIds.length).toBe(2);
    });

    it("范例 2: 在最后一夜，恶魔杀死了醉酒的贤者。说书人为贤者指出了一名死亡玩家和剩下的一名存活善良玩家，没有给他正确信息。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: false, isDead: true, isDrunk: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "clockmaker", name: "钟表匠", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "artist", name: "艺术家", type: "townsfolk" } as any, isAlive: false, isDead: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 4, seats } as any,
        actionNode: { seatId: 0, roleId: "sage", roleName: "贤者" } as any,
        storytellerInput: { killedByDemon: true, targetIds: [2, 3] },
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(sageAbility), ctx);
      expect(r.meta.abilityResult.isCorrupted).toBe(true);
      expect(r.meta.abilityResult.targetIds).not.toContain(1);
      expect(r.meta.abilityResult.targetIds).toEqual([2, 3]);
    });

    it("范例 3: 麻脸巫婆创造了一名恶魔。因为麻脸巫婆的能力，当晚由说书人来选择杀死谁。说书人决定旧恶魔死亡，贤者也死亡，且当晚这些恶魔选择攻击的目标中没有贤者。因为贤者死于麻脸巫婆而非恶魔，贤者不会得知任何信息。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sage", name: "贤者", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "fang_gu", name: "方古", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "sage", roleName: "贤者" } as any,
        storytellerInput: { killedByDemon: false },
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(sageAbility), ctx);
      expect(r.meta.abilityResult.killedByDemon).toBe(false);
      expect(r.meta.abilityResult.targetIds).toEqual([]);
    });
  });
});
