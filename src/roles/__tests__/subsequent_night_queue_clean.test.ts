import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../utils/nightInfoAdapter";

function makeSeat(
  id: number,
  rid: string,
  rname: string,
  rtype: "townsfolk" | "outsider" | "minion" | "demon",
  dead = false
): Seat {
  return {
    id,
    playerName: `${id + 1}号`,
    isDead: dead,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    grandchildId: null,
    isGrandchild: false,
    isMad: false,
    hasUsedDayAbility: false,
    role: { id: rid, name: rname, type: rtype },
    effectiveRole: null,
    charadeRole: null,
    statusDetails: [],
    statusEffects: [],
  };
}

describe("后续夜晚队列与系统信息隔离测试（防止首夜 minion_info 泄露至第2夜导致误判为罂粟种植者）", () => {
  const seats: Seat[] = [
    makeSeat(0, "soldier", "士兵", "townsfolk"),
    makeSeat(1, "saint", "圣徒", "outsider"),
    makeSeat(2, "slayer", "猎手", "townsfolk"),
    makeSeat(3, "baron", "男爵", "minion"),
    makeSeat(4, "investigator", "调查员", "townsfolk", true), // 白天被处决死亡的调查员
    makeSeat(5, "butler", "管家", "outsider"),
    makeSeat(6, "imp", "小恶魔", "demon"),
    makeSeat(7, "recluse", "陌客", "outsider"),
    makeSeat(8, "undertaker", "送葬者", "townsfolk"),
  ];

  const nightOrderEntries: NightOrderEntry[] = [
    {
      roleId: "minion_info",
      roleName: "爪牙信息",
      firstNightPriority: 10,
      otherNightPriority: 0,
      firstNightOnly: true,
      otherNightOnly: false,
      wakeMessage: "minion_info",
      abilityId: "minion_info",
    },
    {
      roleId: "demon_info",
      roleName: "恶魔信息",
      firstNightPriority: 20,
      otherNightPriority: 0,
      firstNightOnly: true,
      otherNightOnly: false,
      wakeMessage: "demon_info",
      abilityId: "demon_info",
    },
    {
      roleId: "imp",
      roleName: "小恶魔",
      firstNightPriority: 0,
      otherNightPriority: 30,
      firstNightOnly: false,
      otherNightOnly: true,
      wakeMessage: "imp_wake",
      abilityId: "imp_kill",
    },
  ];

  it("在暗流涌动剧本第2夜，唤醒队列不应包含首夜系统步骤 minion_info 或 demon_info", () => {
    const snapshot = {
      seats,
      nightCount: 2,
      isFirstNight: false,
      hasCompletedFirstNight: true,
      poppyGrowerDead: false,
    };

    const queue = generateDynamicNightQueue(
      nightOrderEntries,
      snapshot as any,
      { isFirstNight: false }
    );

    const hasMinionInfo = queue.some(
      (node: any) => node.roleId === "minion_info"
    );
    const hasDemonInfo = queue.some(
      (node: any) => node.roleId === "demon_info"
    );
    expect(hasMinionInfo).toBe(false);
    expect(hasDemonInfo).toBe(false);

    // 第2夜第一个唤醒的应当是存活的恶魔（小恶魔），绝非 minion_info
    const firstRole = queue[0];
    expect(firstRole?.roleId).toBe("imp");
  });

  it("第2夜小恶魔行动时，计算得出的 nightInfo 应当是恶魔杀人行动而非 minion_info", () => {
    const nightInfo = calculateNightInfoViaNewEngine(
      null,
      seats,
      6, // 7号小恶魔 seatId
      "night" as any,
      4, // 5号调查员被处决
      2, // 第2夜
      undefined // systemRoleId 应为 undefined，绝不能从第1夜泄露 minion_info
    );

    expect(nightInfo?.effectiveRole?.id).toBe("imp");
    expect(nightInfo?.effectiveRole?.name).toBe("小恶魔");
    expect(nightInfo?.effectiveRole?.id).not.toBe("minion_info");
    expect(nightInfo?.effectiveRole?.id).not.toBe("poppy_grower");
  });
});
