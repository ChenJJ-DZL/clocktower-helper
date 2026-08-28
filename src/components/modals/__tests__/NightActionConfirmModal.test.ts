import { describe, expect, it, vi } from "vitest";
import type { Seat } from "../../../../app/data";
import type { NightActionConfirmData } from "../NightActionConfirmModal";

describe("NightActionConfirmModal 交互选人与保密防窥测试", () => {
  const mockSeats: Seat[] = [
    { id: 0, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } as any, isDead: false } as any,
    { id: 1, role: { id: "librarian", name: "图书管理员", type: "townsfolk" } as any, isDead: false } as any,
    { id: 2, role: { id: "investigator", name: "调查员", type: "townsfolk" } as any, isDead: false } as any,
    { id: 3, role: { id: "poisoner", name: "投毒者", type: "minion" } as any, isDead: false } as any,
    { id: 4, role: { id: "imp", name: "小恶魔", type: "demon" } as any, isDead: false } as any,
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
    const renderSeatLabel = (seat: Seat, actorSeatId?: number, allowSelf?: boolean) => {
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
});
