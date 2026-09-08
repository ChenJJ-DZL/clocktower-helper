import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { executeViaNewEngine } from "../../../hooks/useNightActionHandler";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { checkAndUpdatePixieAbility } from "../../../utils/pixieHelper";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";

function makeSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string,
  overrides: Record<string, any> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleName, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as unknown as Seat;
}

describe("小精灵 (Pixie) 全生命周期综合测试", () => {
  it("首夜技能确认页：无需选人目标，确认后展示得知在场镇民信息", async () => {
    let seats: Seat[] = [
      makeSeat(0, "pixie", "小精灵", "townsfolk"),
      makeSeat(1, "chef", "厨师", "townsfolk"),
      makeSeat(2, "imp", "小恶魔", "demon"),
    ];

    const modals: any[] = [];
    let updatedSeatsFromSetSeats: Seat[] = [];

    const context: any = {
      nightInfo: {
        seat: seats[0],
        effectiveRole: { id: "pixie", name: "小精灵" },
        targetLimit: { min: 0, max: 0 },
      },
      seats,
      selectedTargets: [],
      gamePhase: "firstNight",
      nightCount: 1,
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: (s: Seat[]) => {
        updatedSeatsFromSetSeats = s;
      },
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {},
      setCurrentModal: (m: any) => {
        modals.push(m);
      },
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: true, // 预览模式
      actionData: { pixieMadnessRoleId: "chef", pixieMadnessRoleName: "厨师" },
    };

    // 1. 预览模式：弹出确认窗口，无须选人目标
    const previewResult = await executeViaNewEngine(context, "pixie");
    expect(previewResult).toBe(true);
    expect(modals.length).toBeGreaterThan(0);
    const confirmModal = modals.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
    expect(confirmModal).toBeDefined();
    expect(confirmModal.data.targetDescriptions).toContain("（信息获取 - 无目标）");
    expect(confirmModal.data.roleName).toContain("1号-小精灵");

    // 2. 模拟确认执行
    modals.length = 0;
    const realContext = { ...context, preview: false };
    await executeViaNewEngine(realContext, "pixie");

    // 验证结果弹窗
    const infoModal = modals.find((m) => m?.type === "INFO_RESULT");
    expect(infoModal).toBeDefined();
    expect(infoModal.data.resultText).toContain("厨师");

    // 验证状态更新：小精灵记录了 chef，但小精灵的角色依然是 pixie
    expect(updatedSeatsFromSetSeats.length).toBeGreaterThan(0);
    const pixieAfter = updatedSeatsFromSetSeats.find((s) => s.id === 0);
    expect(pixieAfter?.role?.id).toBe("pixie");
    expect((pixieAfter as any).pixieMadnessRoleId).toBe("chef");
    expect(pixieAfter?.statusDetails).toContain("伪装身份:厨师");
  });

  it("临摹镇民死亡后：小精灵角色不变，获得其能力并点亮激活标记", () => {
    const seats: Seat[] = [
      makeSeat(0, "pixie", "小精灵", "townsfolk", {
        pixieMadnessRoleId: "chef",
        pixieMadnessRoleName: "厨师",
        statusDetails: ["伪装身份:厨师"],
      }),
      makeSeat(1, "chef", "厨师", "townsfolk", { isDead: true, isAlive: false }),
      makeSeat(2, "imp", "小恶魔", "demon"),
    ];

    const logs: string[] = [];
    const updated = checkAndUpdatePixieAbility(seats, (msg) => logs.push(msg));

    const pixieSeat = updated.find((s) => s.id === 0);
    // 角色依然是小精灵，绝不改变
    expect(pixieSeat?.role?.id).toBe("pixie");
    expect(pixieSeat?.role?.name).toBe("小精灵");
    // 拥有已死镇民能力
    expect((pixieSeat as any).pixieCopiedRole).toBe("chef");
    expect((pixieSeat as any).pixieHasAbility).toBe(true);
    expect((pixieSeat as any).acquiredAbilities).toContain("chef");
    expect(pixieSeat?.statusDetails).toContain("能力已激活");
    expect(pixieSeat?.statusDetails).toContain("获得死去镇民能力:厨师");
    expect(logs.some((l) => l.includes("小精灵获得其能力"))).toBe(true);
  });

  it("后续夜晚唤醒与执行：小精灵在被继承角色顺位唤醒并触发其能力，且受小精灵状态影响", async () => {
    let seats: Seat[] = [
      makeSeat(0, "pixie", "小精灵", "townsfolk", {
        pixieMadnessRoleId: "fortune_teller",
        pixieMadnessRoleName: "占卜师",
        isPoisoned: true, // 小精灵自身处于中毒状态！
      }),
      makeSeat(1, "fortune_teller", "占卜师", "townsfolk", {
        isDead: true,
        isAlive: false,
      }),
      makeSeat(2, "imp", "小恶魔", "demon"),
      makeSeat(3, "chef", "厨师", "townsfolk"),
    ];

    // 激活小精灵能力
    seats = checkAndUpdatePixieAbility(seats);

    const snapshot: any = {
      seats,
      gamePhase: "night",
      nightCount: 2,
      hasCompletedFirstNight: true,
    };

    // 1. 验证队列：在占卜师顺位唤醒 0 号小精灵
    const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, {
      isFirstNight: false,
    });
    const ftNode = queue.find((n) => n.roleId === "fortune_teller");
    expect(ftNode).toBeDefined();
    expect(ftNode?.seatId).toBe(0); // 小精灵的座位号

    // 2. 验证 nightInfo 生成：以占卜师规则生成配置（目标数 min:2, max:2），座标仍为小精灵
    const nightInfo = calculateNightInfoViaNewEngine(
      null,
      seats,
      0, // 小精灵座位号
      "night",
      null,
      2,
      "fortune_teller" // overrideRoleId 来自 stepMap
    );

    expect(nightInfo).toBeDefined();
    expect(nightInfo?.effectiveRole?.id).toBe("fortune_teller");
    expect(nightInfo?.targetLimit).toEqual({ min: 2, max: 2 });
    expect(nightInfo?.seat?.id).toBe(0);
    expect(nightInfo?.seat?.role?.id).toBe("pixie");
    // 小精灵中毒，故 nightInfo 也正确显示中毒
    expect(nightInfo?.isPoisoned).toBe(true);

    // 3. 执行占卜师技能：选 2 号（恶魔）和 3 号（厨师）
    // 正常占卜师应探查到恶魔（true），但小精灵中毒受干扰，计算应产生假信息（false）
    const modals: any[] = [];
    const context: any = {
      nightInfo,
      seats,
      selectedTargets: [2, 3],
      gamePhase: "night",
      nightCount: 2,
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
      continueToNextAction: () => {},
      setCurrentModal: (m: any) => {
        modals.push(m);
      },
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: false,
    };

    await executeViaNewEngine(context, "fortune_teller");

    const ftResultModal = modals.find(
      (m) => m?.type === "INFO_RESULT" || m?.type === "FORTUNE_TELLER_RESULT"
    );
    expect(ftResultModal).toBeDefined();
    // 小精灵中毒，探查到恶魔却因为中毒判定为“否”
    if (ftResultModal.type === "FORTUNE_TELLER_RESULT") {
      expect(ftResultModal.data.result).toBe(false);
      expect(ftResultModal.data.isCorrupted).toBe(true);
    }
  });
});
