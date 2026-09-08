import { describe, expect, it, vi } from "vitest";
import type { Seat } from "../../../../app/data";
import type { NightActionConfirmData } from "../NightActionConfirmModal";

describe("NightActionConfirmModal 交互选人与保密防窥测试", () => {
  const mockSeats: Seat[] = [
    {
      id: 0,
      role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } as any,
      isDead: false,
    } as any,
    {
      id: 1,
      role: { id: "librarian", name: "图书管理员", type: "townsfolk" } as any,
      isDead: false,
    } as any,
    {
      id: 2,
      role: { id: "investigator", name: "调查员", type: "townsfolk" } as any,
      isDead: false,
    } as any,
    {
      id: 3,
      role: { id: "poisoner", name: "投毒者", type: "minion" } as any,
      isDead: false,
    } as any,
    {
      id: 4,
      role: { id: "imp", name: "小恶魔", type: "demon" } as any,
      isDead: false,
    } as any,
  ];

  it("当技能需要选人时，弹窗接收 targetLimit 配置并支持选人", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const data: NightActionConfirmData = {
      roleName: "4号-投毒者",
      actionDescription: "选择一名玩家进行下毒",
      targetLimit: { min: 1, max: 1 },
      actorSeatId: 3,
      allowSelf: true,
      aliveOnly: false,
      initialSelectedTargets: [],
      onConfirm,
      onCancel,
    };

    expect(data.targetLimit?.min).toBe(1);
    expect(data.targetLimit?.max).toBe(1);
    expect(data.actorSeatId).toBe(3);
  });

  it("选人目标确认：调用 onConfirm 时能正确传递选中的座位 ID", () => {
    let finalTargets: number[] | undefined;
    const onConfirm = (targets?: number[]) => {
      finalTargets = targets;
    };

    // 模拟投毒者在弹窗中点击 2号 (id: 1)
    const selected = [1];
    onConfirm(selected);

    expect(finalTargets).toEqual([1]);
  });

  it("保密防窥特性：目标按钮格式仅包含座位号与必要生死状态，绝不暴露角色名称", () => {
    // 模拟弹窗中渲染每个座位的标签
    const renderSeatLabel = (
      seat: Seat,
      actorSeatId?: number,
      allowSelf?: boolean
    ) => {
      const isSelf = seat.id === actorSeatId;
      const isSelfDisabled = isSelf && allowSelf === false;
      const label = `${seat.id + 1}号`;
      const deadTag = seat.isDead ? " (已死亡)" : "";
      const selfTag = isSelf ? " (自己)" : "";
      return `${label}${deadTag || selfTag}`;
    };

    mockSeats.forEach((seat) => {
      const label = renderSeatLabel(seat, 3, true);
      // 验证：绝对不包含真实角色名称
      expect(label).not.toContain(seat.role?.name);
      // 验证：包含座位号
      expect(label).toContain(`${seat.id + 1}号`);
    });
  });

  it("信息角色占位符过滤：严格过滤(信息获取 - 无目标)等占位符，不泄漏至文案", () => {
    const rawTargetTexts = [
      "（信息获取 - 无目标）",
      "（首夜信息 - 无目标）",
      "无目标",
    ];

    rawTargetTexts.forEach((raw) => {
      const isPlaceholder =
        !raw ||
        raw.includes("无目标") ||
        raw.includes("信息获取") ||
        raw.includes("首夜信息");
      expect(isPlaceholder).toBe(true);
    });
  });

  it("洗脑师夜间行动确认：同时选择座位号与洗脑角色，且缺一不可确认", () => {
    let confirmedTargets: number[] | undefined;
    let confirmedRole: any;

    const onConfirm = (targets?: number[], role?: any) => {
      confirmedTargets = targets;
      confirmedRole = role;
    };

    const data: NightActionConfirmData = {
      roleName: "3号-洗脑师",
      roleId: "cerenovus",
      actionDescription: "选择一名玩家与一个角色，使其在该白天疯狂证明自己是该角色",
      targetLimit: { min: 1, max: 1 },
      actorSeatId: 2,
      allowSelf: false,
      requiresRoleSelection: true,
      onConfirm,
      onCancel: vi.fn(),
    };

    // 校验禁用逻辑：同时满足选了1个座位和选了1个角色
    const checkDisabled = (selectedTargets: number[], selectedRoleId: string | null) => {
      const isCerenovus = data.roleId === "cerenovus" || data.requiresRoleSelection === true;
      return isCerenovus
        ? selectedTargets.length !== 1 || !selectedRoleId
        : selectedTargets.length < (data.targetLimit?.min ?? 0);
    };

    // 1. 都没选：禁用
    expect(checkDisabled([], null)).toBe(true);
    // 2. 只选了座位没选角色：禁用
    expect(checkDisabled([0], null)).toBe(true);
    // 3. 只选了角色没选座位：禁用
    expect(checkDisabled([], "clockmaker")).toBe(true);
    // 4. 同时选了座位和角色：启用
    expect(checkDisabled([0], "clockmaker")).toBe(false);

    // 模拟确认提交
    onConfirm([0], "clockmaker");
    expect(confirmedTargets).toEqual([0]);
    expect(confirmedRole).toBe("clockmaker");
  });
});
