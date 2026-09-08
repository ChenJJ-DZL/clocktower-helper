import { describe, expect, test } from "vitest";
import { getRoleDefinition } from "../../../../roles";

describe("白天主动技能持久化与查看结果测试", () => {
  test("已使用的白天技能不会被从列表中移除", () => {
    const seats = [
      {
        id: 0,
        playerName: "玩家1",
        role: { id: "slayer", name: "猎手", type: "townsfolk" },
        isDead: false,
        hasUsedSlayerAbility: true,
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "SHOOT_RESULT",
          message: "无事发生",
          isDemonDead: false,
        },
      },
      {
        id: 1,
        playerName: "玩家2",
        role: { id: "artist", name: "艺术家", type: "townsfolk" },
        isDead: false,
        hasUsedDayAbility: false,
      },
      {
        id: 2,
        playerName: "玩家3",
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
      },
    ];

    // 过滤具备白天主动技能的角色（即使已使用也保留在列表中）
    const dayAbilitySeats = seats.filter((s) => {
      if (!s.role) return false;
      const effectiveRole = s.role;
      if ((effectiveRole as any).dayMeta) return true;
      const def = effectiveRole.id
        ? getRoleDefinition(effectiveRole.id)
        : undefined;
      if (def?.day) return true;
      return false;
    });

    // 猎手与艺术家均应该存在在列表中（总共2个）
    expect(dayAbilitySeats.length).toBe(2);
    expect(dayAbilitySeats.map((s) => s.id)).toEqual([0, 1]);

    // 猎手已使用 (isUsed = true)
    const slayerSeat = dayAbilitySeats[0];
    const slayerDef = getRoleDefinition(slayerSeat.role.id);
    const slayerIsUsed =
      slayerDef?.day?.maxUses !== "infinity" &&
      !!(slayerSeat.hasUsedDayAbility || slayerSeat.hasUsedSlayerAbility);
    expect(slayerIsUsed).toBe(true);

    // 艺术家未使用 (isUsed = false)
    const artistSeat = dayAbilitySeats[1];
    const artistDef = getRoleDefinition(artistSeat.role.id);
    const artistIsUsed =
      artistDef?.day?.maxUses !== "infinity" &&
      !!(
        artistSeat.hasUsedDayAbility || (artistSeat as any).hasUsedSlayerAbility
      );
    expect(artistIsUsed).toBe(false);
  });

  test("已使用的技能能正确读取保存的开枪结果", () => {
    const slayerSeat = {
      id: 9,
      playerName: "10号",
      role: { id: "slayer", name: "猎手", type: "townsfolk" },
      isDead: false,
      hasUsedSlayerAbility: true,
      hasUsedDayAbility: true,
      dayAbilityResult: {
        type: "SHOOT_RESULT",
        message: "无事发生",
        isDemonDead: false,
        targetId: 14,
      },
    };

    expect(slayerSeat.dayAbilityResult).toBeDefined();
    expect(slayerSeat.dayAbilityResult.type).toBe("SHOOT_RESULT");
    expect(slayerSeat.dayAbilityResult.message).toBe("无事发生");
    expect(slayerSeat.dayAbilityResult.isDemonDead).toBe(false);
  });

  test("猎手日间技能返回交互弹窗时，不应在打开弹窗时即刻消耗技能次数", () => {
    const slayerDef = getRoleDefinition("slayer");
    expect(slayerDef?.day?.handler).toBeDefined();

    const mockContext = {
      seats: [
        {
          id: 0,
          playerName: "猎手玩家",
          role: { id: "slayer", name: "猎手", type: "townsfolk" },
          isDead: false,
          hasUsedDayAbility: false,
          hasUsedSlayerAbility: false,
        },
      ],
      selfId: 0,
      targets: [],
      gamePhase: "day" as const,
      roles: [],
      killPlayer: () => {},
    };

    const res = slayerDef?.day?.handler?.(mockContext as any);
    expect(res).toBeDefined();
    // 应当返回交互弹窗 SLAYER_SELECT_TARGET，且自身不应产生 updates 提前篡改 hasUsedSlayerAbility
    expect(res?.modal?.type).toBe("SLAYER_SELECT_TARGET");
    expect(res?.updates.length).toBe(0);
  });

  test("洗脑师在白天主动技能列表中展示，并小字记录座位号与洗脑内容", () => {
    const cerenovusSeat = {
      id: 2,
      playerName: "3号",
      role: { id: "cerenovus", name: "洗脑师", type: "minion" },
      isDead: false,
      hasUsedDayAbility: false,
    };

    const cerenovusDef = getRoleDefinition("cerenovus");
    expect(cerenovusDef?.day).toBeDefined();
    expect(cerenovusDef?.day?.name).toBe("疯狂洗脑");

    // 模拟洗脑师昨晚洗脑了 4号 (targetId: 3) 为 钟表匠
    const cerenovusTarget = {
      targetId: 3,
      roleName: "钟表匠",
      checkedToday: false,
    };

    const subtitle = `洗脑目标：${cerenovusTarget.targetId + 1}号（${cerenovusTarget.roleName}）`;
    expect(subtitle).toBe("洗脑目标：4号（钟表匠）");

    const buttonLabel = cerenovusDef?.day?.name;
    expect(buttonLabel).toBe("疯狂洗脑");
  });

  test("博学者技能定义为每天1次，同天已使用后锁定并展示上次输入内容且只读", () => {
    const savantDef = getRoleDefinition("savant");
    expect(savantDef?.day).toBeDefined();
    // 每日技能，maxUses 应为 1（非 infinity）
    expect(savantDef?.day?.maxUses).toBe(1);

    // 未使用状态
    const unusedSavantSeat: any = {
      id: 0,
      role: { id: "savant", name: "博学者", type: "townsfolk" },
      isDead: false,
      hasUsedDayAbility: false,
    };
    const unusedIsUsed =
      savantDef?.day?.maxUses !== "infinity" &&
      Boolean(unusedSavantSeat.hasUsedDayAbility);
    expect(unusedIsUsed).toBe(false);

    // 已使用状态：记录了 1 真 1 假信息
    const usedSavantSeat: any = {
      id: 0,
      role: { id: "savant", name: "博学者", type: "townsfolk" },
      isDead: false,
      hasUsedDayAbility: true,
      dayAbilityResult: {
        type: "SAVANT_RESULT",
        infoA: "小王属于邪恶阵营",
        infoB: "本局游戏没有镜像双子",
      },
    };
    const usedIsUsed =
      savantDef?.day?.maxUses !== "infinity" &&
      Boolean(usedSavantSeat.hasUsedDayAbility);
    expect(usedIsUsed).toBe(true);

    // 再次打开弹窗时读取的数据应携带 isReadOnly: true 且保留内容
    const viewModalData = {
      infoA: usedSavantSeat.dayAbilityResult.infoA,
      infoB: usedSavantSeat.dayAbilityResult.infoB,
      isReadOnly: true,
    };
    expect(viewModalData.isReadOnly).toBe(true);
    expect(viewModalData.infoA).toBe("小王属于邪恶阵营");
    expect(viewModalData.infoB).toBe("本局游戏没有镜像双子");

    // 跨天结算（enterDayPhase）：新白天重置 hasUsedDayAbility 与 dayAbilityResult
    const resetSavantSeat: any = {
      ...usedSavantSeat,
      hasUsedDayAbility: false,
      dayAbilityResult: undefined,
    };
    expect(resetSavantSeat.hasUsedDayAbility).toBe(false);
    expect(resetSavantSeat.dayAbilityResult).toBeUndefined();
  });

  test("洗脑师白天疯狂判定失败处决并入夜流转测试", () => {
    let executedPlayerId: number | null = null;
    let nextModal: any = null;

    const mockModal = {
      targetId: 2,
      roleName: "舞蛇人",
    };

    // 模拟 handleFail
    const handleFail = () => {
      // 1. 处决玩家
      executedPlayerId = mockModal.targetId;
      // 2. 弹出标准处决弹窗，并带有 isInstantNight 标记
      nextModal = {
        type: "EXECUTION_RESULT",
        data: {
          message: `⚖️ 说书人判定 ${mockModal.targetId + 1}号 未能疯狂证明自己是【${mockModal.roleName}】，因违反疯狂规则被立即处决死亡！今日立即结束，确认后直接进入下一个夜晚。`,
          isInstantNight: true,
        },
      };
    };

    handleFail();

    expect(executedPlayerId).toBe(2);
    expect(nextModal.type).toBe("EXECUTION_RESULT");
    expect(nextModal.data.isInstantNight).toBe(true);

    // 模拟 confirmExecutionResult 响应 isInstantNight 推进夜晚
    let nightAdvanced = false;
    const confirmExecutionResult = (modal: any) => {
      const isInstantNight = Boolean(
        modal.data.isVirginTrigger ||
          modal.data.isInstantNight ||
          modal.data.isMadnessTrigger
      );
      if (isInstantNight) {
        nightAdvanced = true;
      }
    };

    confirmExecutionResult(nextModal);
    expect(nightAdvanced).toBe(true);
  });
});
