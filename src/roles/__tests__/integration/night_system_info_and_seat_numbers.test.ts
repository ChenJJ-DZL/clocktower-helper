import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { parseInfoResult } from "../../../utils/infoResultParser";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

describe("首夜系统步骤与座位号全局映射集成测试", () => {
  const seats: Seat[] = [
    {
      id: 0,
      role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      isDead: false,
    },
    {
      id: 3,
      role: { id: "poisoner", name: "投毒者", type: "minion" },
      isDead: false,
    },
    {
      id: 4,
      role: { id: "chef", name: "厨师", type: "townsfolk" },
      isDead: false,
    },
    {
      id: 6,
      role: { id: "imp", name: "小恶魔", type: "demon" },
      isDead: false,
    },
  ] as unknown as Seat[];

  const script = {
    id: "tb",
    name: "暗流涌动",
    roles: [
      { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      { id: "librarian", name: "图书管理员", type: "townsfolk" },
      { id: "investigator", name: "调查员", type: "townsfolk" },
      { id: "chef", name: "厨师", type: "townsfolk" },
      { id: "empath", name: "共情者", type: "townsfolk" },
      { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
      { id: "poisoner", name: "投毒者", type: "minion" },
      { id: "imp", name: "小恶魔", type: "demon" },
    ],
  } as any;

  it("1. 队列生成与索引隔离：投毒者不被 minion_info 覆盖", () => {
    const order = [
      {
        roleId: "minion_info",
        firstNightPriority: 1.5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "minion_info",
        abilityId: "minion_info",
      },
      {
        roleId: "demon_info",
        firstNightPriority: 2.5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "demon_info",
        abilityId: "demon_info",
      },
      {
        roleId: "poisoner",
        firstNightPriority: 3,
        otherNightPriority: 3,
        firstNightOnly: false,
        wakeMessage: "poisoner",
        abilityId: "poisoner_poison",
      },
      {
        roleId: "washerwoman",
        firstNightPriority: 4,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "washerwoman",
        abilityId: "washerwoman_info",
      },
      {
        roleId: "chef",
        firstNightPriority: 5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "chef",
        abilityId: "chef_info",
      },
    ] as any;

    const snapshot = {
      seats,
      nightCount: 1,
      gamePhase: "firstNight",
      statusEffects: {},
      globalEffects: {},
    } as unknown as GameStateSnapshot;

    const queue = generateDynamicNightQueue(order, snapshot, {
      isFirstNight: true,
    });

    expect(queue.length).toBe(5);
    expect(queue[0].roleId).toBe("minion_info");
    expect(queue[0].seatId).toBe(3); // 关联到投毒者座位
    expect(queue[1].roleId).toBe("demon_info");
    expect(queue[1].seatId).toBe(6); // 关联到小恶魔座位
    expect(queue[2].roleId).toBe("poisoner");
    expect(queue[2].seatId).toBe(3); // 投毒者自己的轮次！

    // 按队列索引构建 stepMap
    const stepMap = new Map<number, string>();
    queue.forEach((node, idx) => {
      if (node.roleId === "minion_info" || node.roleId === "demon_info") {
        stepMap.set(idx, node.roleId);
      }
    });

    // 关键验证：
    // index 0 是 minion_info
    expect(stepMap.get(0)).toBe("minion_info");
    // index 1 是 demon_info
    expect(stepMap.get(1)).toBe("demon_info");
    // index 2 不是系统步骤，而是真实的投毒者技能！
    expect(stepMap.get(2)).toBeUndefined();
  });

  it("2. 系统步骤生成信息：爪牙互认与恶魔互认包含完整名单与伪装", () => {
    // 爪牙互认
    const minionInfo = calculateNightInfoViaNewEngine(
      script,
      seats,
      3,
      "firstNight",
      null,
      1,
      "minion_info"
    );
    expect(minionInfo).not.toBeNull();
    expect(minionInfo?.effectiveRole.id).toBe("minion_info");
    expect(minionInfo?.guide).toContain("恶魔是: 7号");

    // 恶魔互认
    const demonInfo = calculateNightInfoViaNewEngine(
      script,
      seats,
      6,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    expect(demonInfo).not.toBeNull();
    expect(demonInfo?.effectiveRole.id).toBe("demon_info");
    expect(demonInfo?.guide).toContain("爪牙是: 4号");
    expect(demonInfo?.guide).toContain("不在场伪装: 【");
  });

  it("3. 座位号前缀在 parseInfoResult 中完美格式化（无末尾冒号）", () => {
    // 厨师
    const chefRes = parseInfoResult("0", "5号-厨师");
    expect(chefRes.prefix).toBe("5号-厨师获得信息");
    expect(chefRes.result).toBe("【0】");

    // 厨师带原始前缀
    const chefRes2 = parseInfoResult("厨师获得信息：0", "5号-厨师");
    expect(chefRes2.prefix).toBe("5号-厨师获得信息");
    expect(chefRes2.result).toBe("【0】");

    // 占卜师
    const ftRes = parseInfoResult(
      "占卜师查验 1号、2号，得知结果: 是",
      "7号-占卜师"
    );
    expect(ftRes.prefix).toBe("7号-占卜师查验 1号、2号，得知结果");
    expect(ftRes.result).toBe("【是】");

    // 洗衣妇 - 完整语句放在第二行
    const wwRes = parseInfoResult(
      "5号-洗衣妇获得信息：6号和9号其中一位是【占卜师】",
      "5号-洗衣妇"
    );
    expect(wwRes.prefix).toBe("5号-洗衣妇获得信息");
    expect(wwRes.result).toBe("6号和9号其中一位是【占卜师】");

    // 爪牙互认
    const minionRes = parseInfoResult(
      "恶魔是: 7号\n爪牙队友: 无",
      "4号-爪牙互认"
    );
    expect(minionRes.prefix).toBe("4号-爪牙互认");
    expect(minionRes.result).toBe("恶魔是: 7号\n爪牙队友: 无");
  });

  it("4. 男爵(Baron)纯被动无夜间行动，不进入首夜或非首夜队列", () => {
    const seatsWithBaron: Seat[] = [
      {
        id: 0,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
      },
      {
        id: 11,
        role: { id: "baron", name: "男爵", type: "minion" },
        isDead: false,
      },
      {
        id: 14,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
      },
    ] as unknown as Seat[];

    const order = [
      {
        roleId: "minion_info",
        firstNightPriority: 1.5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "minion_info",
        abilityId: "minion_info",
      },
      {
        roleId: "demon_info",
        firstNightPriority: 2.5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "demon_info",
        abilityId: "demon_info",
      },
      {
        roleId: "washerwoman",
        firstNightPriority: 4,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "washerwoman",
        abilityId: "washerwoman_info",
      },
      {
        roleId: "imp",
        firstNightPriority: 0,
        otherNightPriority: 45,
        firstNightOnly: false,
        otherNightOnly: true,
        wakeMessage: "imp",
        abilityId: "imp_kill",
      },
    ] as any;

    const firstNightSnapshot = {
      seats: seatsWithBaron,
      nightCount: 1,
      gamePhase: "firstNight",
      statusEffects: {},
      globalEffects: {},
    } as unknown as GameStateSnapshot;

    const firstNightQueue = generateDynamicNightQueue(
      order,
      firstNightSnapshot,
      {
        isFirstNight: true,
      }
    );

    // 验证：首夜队列中没有 baron 单独行动，也没有 imp 单独杀人行动（只有 minion_info, demon_info, washerwoman）
    expect(firstNightQueue.some((n) => n.roleId === "baron")).toBe(false);
    expect(firstNightQueue.some((n) => n.roleId === "imp")).toBe(false);
    expect(firstNightQueue.map((n) => n.roleId)).toEqual([
      "minion_info",
      "demon_info",
      "washerwoman",
    ]);

    // 非首夜队列验证：男爵不出现，小恶魔出现杀人
    const otherNightSnapshot = {
      seats: seatsWithBaron,
      nightCount: 2,
      gamePhase: "night",
      statusEffects: {},
      globalEffects: {},
    } as unknown as GameStateSnapshot;

    const otherNightQueue = generateDynamicNightQueue(
      order,
      otherNightSnapshot,
      {
        isFirstNight: false,
      }
    );

    expect(otherNightQueue.some((n) => n.roleId === "baron")).toBe(false);
    expect(otherNightQueue.some((n) => n.roleId === "imp")).toBe(true);
  });

  it("5. 占卜师在 preview 模式下即便未预选目标也不跳过，正确弹出选人确认窗", async () => {
    const ftSeats: Seat[] = [
      {
        id: 0,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
      },
      {
        id: 5,
        role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
        isDead: false,
      },
      {
        id: 6,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
      },
    ] as unknown as Seat[];

    const modals: any[] = [];
    const continueCalls: any[] = [];

    const context: any = {
      nightInfo: {
        seat: ftSeats[1],
        effectiveRole: { id: "fortune_teller", name: "占卜师" },
        targetLimit: { min: 2, max: 2 },
      },
      seats: ftSeats,
      selectedTargets: [], // 用户尚未在主界面选人
      gamePhase: "firstNight",
      nightCount: 1,
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: () => {},
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {
        continueCalls.push(true);
      },
      setCurrentModal: (m: any) => {
        modals.push(m);
      },
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: true, // 预览模式
    };

    const { executeViaNewEngine } = await import(
      "../../../hooks/useNightActionHandler"
    );
    const result = await executeViaNewEngine(context, "fortune_teller");

    expect(result).toBe(true);
    // 关键验证：不能直接 continueToNextAction，必须弹出 NIGHT_ACTION_CONFIRM
    expect(continueCalls.length).toBe(0);
    expect(modals.length).toBeGreaterThan(0);
    const confirmModal = modals.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
    expect(confirmModal).toBeDefined();
    expect(confirmModal.data.roleName).toContain("6号-占卜师");
    expect(confirmModal.data.targetLimit).toEqual({ min: 2, max: 2 });
  });

  it("6. 管家在 preview 模式下即便未预选目标也不跳过，正确弹出选主人确认窗", async () => {
    const butlerSeats: Seat[] = [
      {
        id: 0,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
      },
      {
        id: 6,
        role: { id: "butler", name: "管家", type: "outsider" },
        isDead: false,
      },
      {
        id: 7,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
      },
    ] as unknown as Seat[];

    const modals: any[] = [];
    const continueCalls: any[] = [];

    const context: any = {
      nightInfo: {
        seat: butlerSeats[1],
        effectiveRole: { id: "butler", name: "管家" },
        targetLimit: { min: 1, max: 1 },
      },
      seats: butlerSeats,
      selectedTargets: [], // 用户尚未在主界面选主人
      gamePhase: "firstNight",
      nightCount: 1,
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: () => {},
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {
        continueCalls.push(true);
      },
      setCurrentModal: (m: any) => {
        modals.push(m);
      },
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: true, // 预览模式
    };

    const { executeViaNewEngine } = await import(
      "../../../hooks/useNightActionHandler"
    );
    const result = await executeViaNewEngine(context, "butler");

    expect(result).toBe(true);
    // 关键验证：不能直接 continueToNextAction，必须弹出 NIGHT_ACTION_CONFIRM
    expect(continueCalls.length).toBe(0);
    expect(modals.length).toBeGreaterThan(0);
    const confirmModal = modals.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
    expect(confirmModal).toBeDefined();
    expect(confirmModal.data.roleName).toContain("7号-管家");
    expect(confirmModal.data.targetLimit).toEqual({ min: 1, max: 1 });
  });
});
