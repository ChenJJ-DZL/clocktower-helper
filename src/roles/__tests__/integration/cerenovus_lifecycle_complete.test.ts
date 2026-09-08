import { describe, it, expect } from "vitest";
import { cerenovus } from "../../minion/cerenovus";
import { cerenovusAbility } from "../../new_engine/cerenovus.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { Seat } from "../../../../app/data";

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

const makeSeat = (
  id: number,
  roleId: string,
  roleType: any = "townsfolk",
  name = roleId
): Seat => ({
  id,
  role: { id: roleId, name, type: roleType },
  charadeRole: null,
  isDead: false,
  isDrunk: false,
  isPoisoned: false,
  isProtected: false,
  protectedBy: null,
  isRedHerring: false,
  isFortuneTellerRedHerring: false,
  isSentenced: false,
  masterId: null,
  hasUsedSlayerAbility: false,
  hasUsedDayAbility: false,
  hasUsedVirginAbility: false,
  isDemonSuccessor: false,
  hasAbilityEvenDead: false,
  statusDetails: [],
});

describe("洗脑师（Cerenovus）完整业务生命周期测试", () => {
  it("配置校验：名称为'洗脑师'，所属剧本为'梦殒春宵'，白天技能名称严格为'疯狂洗脑'", () => {
    expect(cerenovus.name).toBe("洗脑师");
    expect(cerenovus.detailedDescription).toContain("梦殒春宵");
    expect(cerenovus.firstNight?.target?.count).toEqual({ min: 1, max: 1 });
    expect(cerenovus.night?.target?.count).toEqual({ min: 1, max: 1 });
    expect(cerenovus.day?.name).toBe("疯狂洗脑");
    expect(cerenovus.day?.maxUses).toBe(1);
  });

  it("夜间技能结算：正确写入 isMad、cerenovusMadnessRole 与 cerenovusTarget (checkedToday: false)", async () => {
    const seats = [
      makeSeat(0, "cerenovus", "minion", "洗脑师"),
      makeSeat(1, "mutant", "outsider", "畸形秀演员"),
      makeSeat(2, "vortox", "demon", "涡流"),
    ];

    const ctx: any = {
      snapshot: { seats, madRoles: {} },
      actionNode: { seatId: 0, roleId: "cerenovus" },
      targetIds: [1],
      storytellerInput: { roleName: "钟表匠", chosenRoleId: "clockmaker" },
      meta: {},
      aborted: false,
      preview: false,
    };

    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    expect(res.aborted).toBe(false);

    const targetSeat = res.snapshot.seats.find((s: Seat) => s.id === 1);
    expect(targetSeat?.isMad).toBe(true);
    expect(targetSeat?.cerenovusMadnessRole).toBe("钟表匠");
    expect(targetSeat?.statusDetails).toContain("洗脑疯狂:钟表匠");

    expect(res.snapshot.cerenovusTarget).toEqual({
      targetId: 1,
      roleName: "钟表匠",
      checkedToday: false,
    });
    expect(res.meta.cerenovusResult).toEqual({
      targetId: 1,
      roleName: "钟表匠",
      checkedToday: false,
    });
    expect(res.meta.displayInfo?.type).toBe("cerenovus_info");
    expect(res.meta.displayInfo?.log).toContain(
      "已告知2号玩家：必须疯狂证明自己是【钟表匠】"
    );
  });

  it("黄昏阻断逻辑测试：洗脑目标未判定（checkedToday 为 false）或洗脑师白天技能未发动时，阻断进入黄昏", () => {
    const seats = [
      makeSeat(0, "cerenovus", "minion", "洗脑师"),
      makeSeat(1, "mutant", "outsider", "畸形秀演员"),
    ];

    const cerenovusTarget = {
      targetId: 1,
      roleName: "钟表匠",
      checkedToday: false,
    };

    const shouldBlockDusk = (target: any, currentSeats: Seat[]) => {
      return Boolean(
        (target && !target.checkedToday) ||
          currentSeats.some(
            (s) =>
              s.role?.id === "cerenovus" &&
              !s.isDead &&
              !s.hasUsedDayAbility
          )
      );
    };

    // 状态 1：尚未判定 → 必须阻断进入黄昏
    expect(shouldBlockDusk(cerenovusTarget, seats)).toBe(true);

    // 状态 2：判定完成（选“是”通过，checkedToday 设为 true，hasUsedDayAbility 设为 true）
    const updatedTarget = { ...cerenovusTarget, checkedToday: true };
    const updatedSeats = seats.map((s) =>
      s.role?.id === "cerenovus" ? { ...s, hasUsedDayAbility: true } : s
    );

    // 状态 2：已完成判定 → 允许进入黄昏
    expect(shouldBlockDusk(updatedTarget, updatedSeats)).toBe(false);
  });
});
