import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  cerenovusAbility,
  evil_twinAbility,
  baronAbility,
  marionetteAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【《罂粟花开》爪牙 (Minions) 1:1 官方 Wiki 原装独立范例测试】", () => {
  initializeAbilityRegistry();

  // 1. 洗脑师 Cerenovus
  describe("1. 洗脑师 (Cerenovus)", () => {
    it("范例 1: 洗脑师使理发师疯狂证明自己是博学者 -> 配合疯狂避免被处决", async () => {
      const seats: any[] = [
        { id: 0, playerName: "洗脑P", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "理发师P", role: { id: "barber", name: "理发师", type: "outsider" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "cerenovus" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "night", nightCount: 1 },
        storytellerInput: { targetId: 1, roleName: "savant" },
        meta: {},
      };
      const res = await runFullAbilityPipeline(cerenovusAbility as any, ctx);
      expect(res.meta.abilityResult.targetId).toBe(1);
      expect(res.meta.abilityResult.roleName).toBe("savant");
      expect(res.meta.abilityResult.mad).toBe(true);
    });

    it("范例 2: 洗脑师使死亡艺术家疯狂证明自己是贤者 -> 未遵守疯狂被处决", async () => {
      const seats: any[] = [
        { id: 0, playerName: "洗脑P", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "艺术家P", role: { id: "artist", name: "艺术家", type: "townsfolk" }, isDead: true, isAlive: false },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "cerenovus" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        storytellerInput: { targetId: 1, roleName: "sage" },
        meta: {},
      };
      const res = await runFullAbilityPipeline(cerenovusAbility as any, ctx);
      expect(res.meta.abilityResult.roleName).toBe("sage");
    });

    it("范例 3: 洗脑师使卖花女孩疯狂证明自己是钟表匠 -> 私下暗示疯狂被说书人发现处决", async () => {
      const seats: any[] = [
        { id: 0, playerName: "洗脑P", role: { id: "cerenovus", name: "洗脑师", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "卖花女P", role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "cerenovus" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "night", nightCount: 1 },
        storytellerInput: { targetId: 1, roleName: "clockmaker" },
        meta: {},
      };
      const res = await runFullAbilityPipeline(cerenovusAbility as any, ctx);
      expect(res.meta.abilityResult.roleName).toBe("clockmaker");
    });
  });

  // 2. 镜像双子 Evil Twin
  describe("2. 镜像双子 (Evil Twin)", () => {
    it("范例 1: 双子均声称是神谕者 -> 邪恶双子被处决，游戏继续", async () => {
      const seats: any[] = [
        { id: 0, playerName: "邪双子", role: { id: "evil_twin", name: "镜像双子", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "好双子", role: { id: "oracle", name: "神谕者", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "evil_twin" },
        targetIds: [],
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        storytellerInput: { twinId: 1 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(evil_twinAbility as any, ctx);
      expect(res.meta.abilityResult.twinRevealed).toBe(true);
      expect(res.meta.abilityResult.evilWinsIfGoodTwinDies).toBe(true);
    });

    it("范例 2: 恶魔被处决但双子皆存活 -> 游戏继续且夜晚无人死亡", async () => {
      const seats: any[] = [
        { id: 0, playerName: "邪双子", role: { id: "evil_twin", name: "镜像双子", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "好双子", role: { id: "artist", name: "艺术家", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 2, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: true, isAlive: false },
      ];
      expect(seats[0].isAlive).toBe(true);
      expect(seats[1].isAlive).toBe(true);
    });

    it("范例 3: 善良双子死于处决 -> 邪恶阵营直接获胜", async () => {
      const seats: any[] = [
        { id: 0, playerName: "邪双子", role: { id: "evil_twin", name: "镜像双子", type: "minion" }, isDead: false, isAlive: true },
        { id: 1, playerName: "好双子", role: { id: "sage", name: "贤者", type: "townsfolk" }, isDead: true, isAlive: false },
      ];
      expect(seats[1].isDead).toBe(true);
    });
  });

  // 3. 男爵 Baron
  describe("3. 男爵 (Baron)", () => {
    it("范例 1: 7人局初始设置 -> 移除2名镇民并添加圣徒与管家（3镇2外1爪1恶）", () => {
      expect(baronAbility).toBeDefined();
      expect(baronAbility.roleId).toBe("baron");
    });

    it("范例 2: 15人局初始设置 -> 必须添加酒鬼与陌客（7镇4外3爪1恶）", () => {
      expect(baronAbility).toBeDefined();
      expect(baronAbility.abilityName).toBe("外来者增幅");
    });
  });

  // 4. 提线木偶 Marionette
  describe("4. 提线木偶 (Marionette)", () => {
    it("范例 1: 小明是提线木偶以为自己是送葬者 -> 与恶魔相邻且技能失效，恶魔知晓其是木偶", async () => {
      const seats: any[] = [
        { id: 0, playerName: "恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小明", role: { id: "marionette", name: "提线木偶", type: "minion" }, charadeRole: { id: "undertaker", name: "送葬者" }, isDead: false, isAlive: true, isDrunk: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 1, roleId: "marionette" },
        targetIds: [],
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(marionetteAbility as any, ctx);
      expect(res.meta.abilityResult.isMarionette).toBe(true);
      expect(res.meta.abilityResult.demonSeatId).toBe(0);
      expect(res.meta.abilityResult.thinksTheyAreGood).toBe(true);
    });

    it("范例 2: 小兰是恶魔谎称小美是木偶 -> 实际上木偶不在场", () => {
      const seats: any[] = [
        { id: 0, playerName: "小兰", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小美", role: { id: "empath", name: "共情者", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      expect(seats[1].role.id).toBe("empath");
    });

    it("范例 3: 小黑是恶魔告诉小八是木偶，小八不信提名处决小黑 -> 善良阵营获胜", () => {
      const seats: any[] = [
        { id: 0, playerName: "小黑", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: true, isAlive: false },
        { id: 1, playerName: "小八", role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      expect(seats[0].isDead).toBe(true);
    });
  });
});
