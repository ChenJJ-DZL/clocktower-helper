/**
 * 国风角色官方规则定向测试（Wave D2：知府/酿酒师/提刑官/引路人/掮客/入殓师/戏子）
 * 对齐来源：钟楼百科 wiki（2026-08-15 爬取）
 * 运行：npx vitest run src/roles/__tests__/gf_roles_d2.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  buildAbilityMap,
  buildFullNightOrder,
  simulateNight,
} from "../../utils/invariantTesting";
import {
  countAliveNonTraveler,
  shouldMorticianTransform,
  transformMorticianToDemon,
} from "../../utils/morticianTransform";
import {
  actorSetupRoles,
  applyActorVictoryFlip,
} from "../../utils/actorVictory";

function mkSeat(id: number, roleId: string, type: string, o: Record<string, any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...o,
  };
}

async function runNight(
  seats: any[],
  night: number,
  extra: Record<string, any> = {},
  storytellerInput?: any,
  pickTargets?: (node: any, snap: any) => number[] | undefined
) {
  const abilityMap = buildAbilityMap();
  const fullNightOrder = buildFullNightOrder();
  const snap: any = {
    nightCount: night,
    gamePhase: night === 1 ? "firstNight" : "night",
    seats: seats.map((s) => ({ ...s })),
    statusEffects: {},
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
    ...extra,
  };
  return simulateNight(snap, {
    nightCount: night,
    fullNightOrder,
    abilityMap,
    seed: 7,
    storytellerInput,
    pickTargets: pickTargets as any,
  });
}

/** 构造"0 号 = 被测角色"的标准 5 人局 */
function seatsFor(roleId: string) {
  return [
    mkSeat(0, roleId, "townsfolk"),
    mkSeat(1, "imp", "demon"),
    mkSeat(2, "poisoner", "minion"),
    mkSeat(3, "butler", "outsider"),
    mkSeat(4, "washerwoman", "townsfolk"),
  ];
}

describe("Wave D2 国风角色官方规则", () => {
  describe("知府（每晚得知是否有非镇民且非旅行者死亡）", () => {
    it("当晚有爪牙死亡 → 得知'是'", async () => {
      const seats = seatsFor("prefect");
      seats[2] = { ...seats[2], isAlive: false, isDead: true, diedAtNight: 2 };
      const r = await runNight(seats, 2);
      const act = r.actions.find((a) => a.node.roleId === "prefect")!;
      expect(act.context.meta.abilityResult.hasNonTownsfolkDeath).toBe(true);
      expect(act.context.meta.displayInfo.message).toBe("是");
    });
    it("当晚无死亡 → 得知'否'且仍被唤醒", async () => {
      const seats = seatsFor("prefect").map((s) => ({ ...s, diedAtNight: undefined }));
      const r = await runNight(seats, 2);
      const act = r.actions.find((a) => a.node.roleId === "prefect")!;
      expect(act.aborted).toBe(false);
      expect(act.context.meta.abilityResult.hasNonTownsfolkDeath).toBe(false);
    });
  });

  describe("酿酒师（选镇民角色给信息，替换其下次信息获取）", () => {
    it("设置效果：记录 targetRoleId + message", async () => {
      const r = await runNight(seatsFor("brewer"), 2, {}, {
        targetRoleId: "washerwoman",
        message: "酿酒师的假信息",
      });
      const act = r.actions.find((a) => a.node.roleId === "brewer")!;
      expect(act.aborted).toBe(false);
      expect(act.context.snapshot.brewerEffect.roleId).toBe("washerwoman");
      expect(act.context.meta.displayInfo.targetRoleId).toBe("washerwoman");
    });
    it("目标角色信息被替换（全局钩子）+ 效果消耗", async () => {
      const seats = [
        mkSeat(0, "fortune_teller", "townsfolk"),
        mkSeat(1, "imp", "demon"),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "monk", "townsfolk"),
      ];
      const r = await runNight(seats, 2, {
        brewerEffect: { roleId: "fortune_teller", message: "替换后的信息" },
      });
      const ft = r.actions.find((a) => a.node.roleId === "fortune_teller")!;
      expect(ft.context.meta.brewerOverride).toBe("替换后的信息");
      expect(r.finalSnapshot.brewerEffect).toBeUndefined();
    });
  });

  describe("提刑官（首次提名后当晚得知角色，恶魔伪装善良）", () => {
    it("首次提名恶魔 → 得知伪装后的善良角色并失去能力", async () => {
      const r = await runNight(seatsFor("inspector"), 2, {
        inspectorNomination: { targetId: 1 },
      });
      const act = r.actions.find((a) => a.node.roleId === "inspector")!;
      const res = act.context.meta.abilityResult;
      expect(act.aborted).toBe(false);
      expect(res.isDemon).toBe(true);
      expect(res.revealedRoleId).not.toBe("imp");
      expect(act.context.snapshot.inspectorUsed).toBe(true);
    });
    it("未提名 → 当晚不唤醒", async () => {
      const r = await runNight(seatsFor("inspector"), 2);
      const act = r.actions.find((a) => a.node.roleId === "inspector")!;
      expect(act.aborted).toBe(true);
      expect(act.abortReason).toContain("未发起提名");
    });
  });

  describe("引路人（选至多3人，得知是否有邪恶能力命中）", () => {
    it("所选玩家被邪恶能力命中 → '是'", async () => {
      const r = await runNight(seatsFor("guide"), 2, { nightEvilTargets: [1, 3] }, undefined, (node) =>
        node.roleId === "guide" ? [1, 4] : undefined
      );
      const act = r.actions.find((a) => a.node.roleId === "guide")!;
      expect(act.context.meta.abilityResult.isYes).toBe(true);
    });
    it("所选玩家未被命中 → '否'", async () => {
      const r = await runNight(seatsFor("guide"), 2, { nightEvilTargets: [2] }, undefined, (node) =>
        node.roleId === "guide" ? [4] : undefined
      );
      const act = r.actions.find((a) => a.node.roleId === "guide")!;
      expect(act.context.meta.abilityResult.isYes).toBe(false);
    });
  });

  describe("掮客（选两名同阵营玩家，目标转移）", () => {
    it("同阵营 → 恶魔选 4 号实际结算 3 号", async () => {
      const r = await runNight(seatsFor("broker"), 2, {}, undefined, (node) => {
        if (node.roleId === "broker") return [3, 4];
        if (node.roleId === "imp") return [4];
        return undefined;
      });
      const brokerAct = r.actions.find((a) => a.node.roleId === "broker")!;
      const impAct = r.actions.find((a) => a.node.roleId === "imp")!;
      expect(brokerAct.context.meta.abilityResult.swapActive).toBe(true);
      // 重定向在能力结算前生效：imp 计算目标变为 3
      expect(impAct.context.meta.abilityResult.targetId).toBe(3);
    });
  });

  describe("舞蛇人（选中恶魔 → 交换角色和阵营 + 恶魔中毒）", () => {
    it("选中恶魔 → 双方角色交换 + 原恶魔中毒", async () => {
      const seats = [
        mkSeat(0, "snake_charmer", "townsfolk"),
        mkSeat(1, "imp", "demon"),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "washerwoman", "townsfolk"),
      ];
      const r = await runNight(seats, 2, {}, undefined, (node) =>
        node.roleId === "snake_charmer" ? [1] : undefined
      );
      const act = r.actions.find((a) => a.node.roleId === "snake_charmer")!;
      const after = r.finalSnapshot.seats;
      const self = after.find((s: any) => s.id === 0);
      const demon = after.find((s: any) => s.id === 1);
      // 舞蛇人变成恶魔
      expect(act.context.meta.abilityResult.swapTriggered).toBe(true);
      expect(self.role.id).toBe("imp");
      expect(self.role.type).toBe("demon");
      // 原恶魔变成舞蛇人且中毒
      expect(demon.role.id).toBe("snake_charmer");
      expect(demon.isPoisoned).toBe(true);
      expect(demon.statusEffects.some((e: any) => e.type === "poisoned")).toBe(true);
    });
    it("未选中恶魔 → 无交换", async () => {
      const seats = [
        mkSeat(0, "snake_charmer", "townsfolk"),
        mkSeat(1, "imp", "demon"),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "washerwoman", "townsfolk"),
      ];
      const r = await runNight(seats, 2, {}, undefined, (node) =>
        node.roleId === "snake_charmer" ? [3] : undefined
      );
      const act = r.actions.find((a) => a.node.roleId === "snake_charmer")!;
      expect(act.context.meta.abilityResult.swapTriggered).toBe(false);
      expect(r.finalSnapshot.seats.find((s: any) => s.id === 0).role.id).toBe("snake_charmer");
      expect(r.finalSnapshot.seats.find((s: any) => s.id === 1).role.id).toBe("imp");
    });
  });

  describe("入殓师（提名恶魔处决死变恶魔；存活≤4失能）", () => {
    it("处决后存活(旅行者除外)≥4 → 入殓师变恶魔", () => {
      const seats = [
        mkSeat(0, "mortician", "townsfolk"),
        mkSeat(1, "imp", "demon", { isDead: true }),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "washerwoman", "townsfolk"),
        mkSeat(5, "monk", "townsfolk"),
      ];
      const r = shouldMorticianTransform(seats, 1, 0);
      expect(r.transformed).toBe(true);
      const after = transformMorticianToDemon(seats, 0, "imp");
      expect(after.find((s) => s.id === 0)?.role?.id).toBe("imp");
      expect(after.find((s) => s.id === 0)?.role?.type).toBe("demon");
    });
    it("处决后存活(旅行者除外)<4 → 失去能力不转化", () => {
      const seats = [
        mkSeat(0, "mortician", "townsfolk"),
        mkSeat(1, "imp", "demon", { isDead: true }),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "washerwoman", "townsfolk", { isDead: true }),
      ];
      const r = shouldMorticianTransform(seats, 1, 0);
      expect(r.transformed).toBe(false);
      expect(r.reason).toContain("失去能力");
    });
    it("被处决者非恶魔 → 不转化", () => {
      const seats = [
        mkSeat(0, "mortician", "townsfolk"),
        mkSeat(1, "washerwoman", "townsfolk", { isDead: true }),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "monk", "townsfolk"),
      ];
      const r = shouldMorticianTransform(seats, 1, 0);
      expect(r.transformed).toBe(false);
      expect(r.reason).toContain("不是恶魔");
    });
    it("旅行者不计入存活数", () => {
      const seats = [
        mkSeat(0, "mortician", "townsfolk"),
        mkSeat(1, "imp", "demon", { isDead: true }),
        mkSeat(2, "t1", "traveler"),
        mkSeat(3, "t2", "traveler"),
        mkSeat(4, "t3", "traveler"),
      ];
      expect(countAliveNonTraveler(seats)).toBe(1);
    });
  });

  describe("戏子（首夜互认 + 胜负对调 + 全善良变戏子）", () => {
    it("首夜互认：列出戏子与邪恶玩家", async () => {
      const seats = [
        mkSeat(0, "actor", "townsfolk"),
        mkSeat(1, "imp", "demon"),
        mkSeat(2, "poisoner", "minion"),
        mkSeat(3, "butler", "outsider"),
        mkSeat(4, "washerwoman", "townsfolk"),
      ];
      const r = await runNight(seats, 1);
      const act = r.actions.find((a) => a.node.roleId === "actor")!;
      const res = act.context.meta.abilityResult;
      expect(act.aborted).toBe(false);
      expect(Array.isArray(res.actors)).toBe(true);
      expect(res.evilPlayers).toContain(1);
      expect(res.evilPlayers).toContain(2);
    });
    it("胜负对调：有戏子 → 善良胜变邪恶胜", () => {
      const seats = seatsFor("actor").map((s) => ({ ...s, role: { ...s.role, id: "actor" } }));
      expect(applyActorVictoryFlip("good", seats)).toBe("evil");
      expect(applyActorVictoryFlip("evil", seats)).toBe("good");
    });
    it("初始设置：所有善良角色变戏子，恶魔/爪牙不变", () => {
      const after = actorSetupRoles(seatsFor("actor"));
      expect(after.filter((s) => s.role?.id === "actor").length).toBe(3); // 0/3/4 号
      expect(after.find((s) => s.id === 1)?.role?.id).toBe("imp");
      expect(after.find((s) => s.id === 2)?.role?.id).toBe("poisoner");
    });
  });
});
