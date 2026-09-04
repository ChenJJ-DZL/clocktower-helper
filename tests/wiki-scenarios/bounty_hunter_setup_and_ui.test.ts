import { describe, it, expect } from "vitest";
import { getRoleDefinition } from "../../src/roles";
import { bounty_hunterAbility } from "../../src/roles/new_engine/bounty_hunter.ability";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import type { Seat } from "../../src/types";

describe("赏金猎人：设置阶段转邪恶与夜间能力结果展示", () => {
  it("getRoleDefinition 能够正确获取 bounty_hunter 定义，且 onSetup 成功将镇民转为邪恶", () => {
    const def = getRoleDefinition("bounty_hunter");
    expect(def).toBeDefined();
    expect(def?.name).toBe("赏金猎人");
    expect(def?.onSetup).toBeDefined();

    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        roleId: "bounty_hunter",
        roleName: "赏金猎人",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "good",
      } as any,
      {
        id: 1,
        role: { id: "empath", name: "共情者", type: "townsfolk" },
        roleId: "empath",
        roleName: "共情者",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "good",
      } as any,
      {
        id: 2,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        roleId: "imp",
        roleName: "小恶魔",
        roleType: "demon",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "evil",
      } as any,
    ];

    const setupResult = def?.onSetup?.({ seats, selfId: 0 });
    expect(setupResult).toBeDefined();
    expect(setupResult?.updates).toBeDefined();

    const evilTownsfolkUpdate = setupResult?.updates?.find(
      (u: any) => u.id === 1
    );
    expect(evilTownsfolkUpdate).toBeDefined();
    expect(evilTownsfolkUpdate?.isEvilConverted).toBe(true);
    expect(evilTownsfolkUpdate?.alignment).toBe("evil");
    expect(evilTownsfolkUpdate?.statusDetails).toContain("转为邪恶");
  });

  it("能力管道执行后包含 displayInfo，能够被 useNightActionHandler 正常消费弹出 INFO_RESULT", async () => {
    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        roleId: "bounty_hunter",
        roleName: "赏金猎人",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "good",
      } as any,
      {
        id: 1,
        role: { id: "empath", name: "共情者", type: "townsfolk" },
        roleId: "empath",
        roleName: "共情者",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        isEvilConverted: true,
        alignment: "evil",
      } as any,
    ];

    const ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      targetIds: [],
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      meta: {},
    };

    const pipe = {
      preCheck: bounty_hunterAbility.preCheck,
      calculate: bounty_hunterAbility.calculate,
      stateUpdate: bounty_hunterAbility.stateUpdate,
      postProcess: bounty_hunterAbility.postProcess,
    };

    const res = await runFullAbilityPipeline(pipe, ctx);
    expect(res.aborted).toBeFalsy();
    expect(res.meta.displayInfo).toBeDefined();
    expect(res.meta.displayInfo.type).toBe("bounty_hunter_info");
    expect(res.meta.displayInfo.targetId).toBe(1);
    expect(res.meta.displayInfo.log).toContain("赏金猎人得知：2号玩家是邪恶的");
  });

  it("generateNightInfo 能够为 bounty_hunter 正常生成夜间指引而不会抛出 TypeError", async () => {
    const { generateNightInfo } = await import(
      "../../src/utils/nightInfoGenerator"
    );
    const seats: Seat[] = [
      {
        id: 0,
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        roleId: "bounty_hunter",
        roleName: "赏金猎人",
        roleType: "townsfolk",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "good",
      } as any,
      {
        id: 1,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        roleId: "imp",
        roleName: "小恶魔",
        roleType: "demon",
        isDead: false,
        isAlive: true,
        isEvilConverted: false,
        alignment: "evil",
      } as any,
    ];

    const nightInfo = generateNightInfo(null, seats, 0, "firstNight", null, 1);
    expect(nightInfo).toBeDefined();
    expect(nightInfo?.guide).toContain("赏金猎人");
    expect(nightInfo?.guide).toContain("小恶魔");
  });

  it("规则验证：只要有其他邪恶玩家在场，赏金猎人优先得知非恶魔玩家（如转邪恶镇民、爪牙）", async () => {
    // 场上有：0号赏金猎人、1号小恶魔、2号罂粟种植者（转为邪恶）
    const seats: any[] = [
      {
        id: 0,
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        roleId: "bounty_hunter",
        roleType: "townsfolk",
        isAlive: true,
        isDead: false,
      },
      {
        id: 1,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        roleId: "imp",
        roleType: "demon",
        isAlive: true,
        isDead: false,
        alignment: "evil",
      },
      {
        id: 2,
        role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
        roleId: "poppy_grower",
        roleType: "townsfolk",
        isAlive: true,
        isDead: false,
        isEvilConverted: true,
        alignment: "evil",
      },
    ];

    const ctx: any = {
      actionNode: {
        seatId: 0,
        roleId: "bounty_hunter",
        abilityId: "bounty_hunter_reveal",
      },
      snapshot: {
        seats,
        bountyHunterKnownTargets: [],
      },
      meta: {},
    };

    const pipe = {
      preCheck: bounty_hunterAbility.preCheck,
      calculate: bounty_hunterAbility.calculate,
      stateUpdate: bounty_hunterAbility.stateUpdate,
      postProcess: bounty_hunterAbility.postProcess,
    };

    // 运行 20 次，每次都必须选到 2号（非恶魔邪恶玩家），而不是 1号小恶魔
    for (let i = 0; i < 20; i++) {
      const res = await runFullAbilityPipeline(pipe, ctx);
      expect(res.meta.abilityResult.targetId).toBe(2);
      expect(res.meta.displayInfo.log).toBe("赏金猎人得知：3号玩家是邪恶的");
    }
  });
});
