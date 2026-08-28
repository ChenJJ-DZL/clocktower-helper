import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { baronAbility } from "../../new_engine/baron.ability";

function makeSeat(id: number): Seat {
  return {
    id,
    role: { id: "baron", name: "男爵", type: "minion" },
    isDead: false,
    isAlive: true,
  } as unknown as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("男爵：设置调整 -2 镇民 / +2 外来者", () => {
  it("调整配置写入 snapshot.setupConfig", async () => {
    const res = await runFullAbilityPipeline(pipe(baronAbility), {
      actionNode: { seatId: 0, roleId: "baron" },
      targetIds: [],
      snapshot: {
        seats: [makeSeat(0)],
        setupConfig: { townsfolkCount: 5, outsiderCount: 0 },
      },
      meta: {},
    } as any);
    const config = (res.snapshot as any).setupConfig;
    expect(config.townsfolkCount).toBe(3);
    expect(config.outsiderCount).toBe(2);
    expect(config.baronAdjusted).toBe(true);
  });

  it("数量下限保护：镇民不足 2 时归零而不是负数", async () => {
    const res = await runFullAbilityPipeline(pipe(baronAbility), {
      actionNode: { seatId: 0, roleId: "baron" },
      targetIds: [],
      snapshot: {
        seats: [makeSeat(0)],
        setupConfig: { townsfolkCount: 1, outsiderCount: 0 },
      },
      meta: {},
    } as any);
    const config = (res.snapshot as any).setupConfig;
    expect(config.townsfolkCount).toBe(0);
    expect(config.outsiderCount).toBe(2);
  });
});
