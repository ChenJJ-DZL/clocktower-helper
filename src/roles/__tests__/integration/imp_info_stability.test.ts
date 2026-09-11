import { describe, expect, it } from "vitest";
import { impAbility } from "../../new_engine/imp.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 小恶魔：calculate 只做「杀死目标 / 自杀传刀」的判定（无随机），
 * 因此 preview 与结算必然一致；随机只出现在 stateUpdate 的继任者选择上，
 * 那是一次性状态改写，preview 阶段（只跑 preCheck + calculate）永远不会重算它。
 * 本测试锁住这个契约：谁把随机挪进 calculate，测试就会红。
 */

function makeSeat(
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  isDead = false
) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead,
    isAlive: !isDead,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
    statusDetails: [],
  };
}

// 最小座位集：0号小恶魔 + 2/3号存活爪牙 + 善良玩家 + 一名已死亡玩家
const seats = () => [
  makeSeat(0, "imp", "小恶魔", "demon"),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "scarlet_woman", "红唇女郎", "minion"),
  makeSeat(3, "poisoner", "投毒者", "minion"),
  makeSeat(4, "soldier", "士兵", "townsfolk", true),
];

function makeContext(opts: {
  preview: boolean;
  targetIds: number[];
  seatList: any[];
  nightCount?: number;
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount ?? 2,
      gamePhase: "night",
      seats: opts.seatList,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "imp",
      roleName: "小恶魔",
      priority: 147,
      isFirstNightOnly: false,
      abilityId: "imp_night_ability",
      wakeMessage: "小恶魔",
      firstNightPriority: null,
      otherNightPriority: 147,
      targetIds: opts.targetIds,
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: opts.targetIds,
    meta: {},
    aborted: false,
    preview: opts.preview,
  };
}

async function run(opts: {
  preview: boolean;
  targetIds: number[];
  seatList?: any[];
  nightCount?: number;
}) {
  return runFullAbilityPipeline(
    {
      preCheck: impAbility.preCheck,
      calculate: impAbility.calculate,
      stateUpdate: impAbility.stateUpdate,
      postProcess: impAbility.postProcess,
    },
    makeContext({
      preview: opts.preview,
      targetIds: opts.targetIds,
      seatList: opts.seatList ?? seats(),
      nightCount: opts.nightCount,
    })
  );
}

describe("小恶魔：预演与执行的判定必须一致（回归）", () => {
  it("正常击杀：preview 与结算得到同一个 targetId，结算才标记死亡", async () => {
    const previewResult = await run({ preview: true, targetIds: [1] });
    const execResult = await run({ preview: false, targetIds: [1] });

    const previewInfo = previewResult.meta.abilityResult as any;
    const execInfo = execResult.meta.abilityResult as any;

    expect(execInfo.targetId).toBe(previewInfo.targetId);
    expect(previewInfo.targetId).toBe(1);
    expect(previewInfo.isSuicide).toBe(false);
    // preview 不写状态：1号在预演后仍是活的
    const previewTarget = (previewResult.snapshot.seats as any[])[1];
    expect(previewTarget.markedForDeath).toBeFalsy();
    // 结算后 1号被标记死亡
    const execTarget = (execResult.snapshot.seats as any[])[1];
    expect(execTarget.markedForDeath).toBe(true);
  });

  it("自杀传刀：preview 同样判定为自杀，但不改写身份；结算后恰好一名存活爪牙继任", async () => {
    const previewResult = await run({ preview: true, targetIds: [0] });
    const execResult = await run({ preview: false, targetIds: [0] });

    expect((previewResult.meta.abilityResult as any).isSuicide).toBe(true);
    expect((execResult.meta.abilityResult as any).isSuicide).toBe(true);

    // preview 不改状态：没有人成为新小恶魔，原小恶魔也还活着
    const previewSuccessors = (previewResult.snapshot.seats as any[]).filter(
      (s) => s.isDemonSuccessor === true
    );
    expect(previewSuccessors.length).toBe(0);
    expect((previewResult.snapshot.seats as any[])[0].isDead).toBe(false);

    // 结算：原小恶魔死亡，恰好一名存活爪牙继任
    const execSeats = execResult.snapshot.seats as any[];
    expect(execSeats[0].isDead).toBe(true);
    const execSuccessors = execSeats.filter((s) => s.isDemonSuccessor === true);
    expect(execSuccessors.length).toBe(1);
    expect([2, 3]).toContain(execSuccessors[0].id);
    expect(execSuccessors[0].role.id).toBe("imp");
  });

  it("继任者永远只会在存活爪牙中产生（重复执行 5 次均成立）", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await run({ preview: false, targetIds: [0] });
      const successors = (result.snapshot.seats as any[]).filter(
        (s) => s.isDemonSuccessor === true
      );
      expect(successors.length).toBe(1);
      expect(successors[0].role.type).toBe("demon");
      expect(successors[0].isDead).toBe(false);
    }
  });

  it("说书人手动指定继任者时优先使用指定座位", async () => {
    const result = await runFullAbilityPipeline(
      {
        preCheck: impAbility.preCheck,
        calculate: impAbility.calculate,
        stateUpdate: impAbility.stateUpdate,
      },
      {
        ...makeContext({ preview: false, targetIds: [0], seatList: seats() }),
        storytellerInput: { successorSeatId: 3 },
      }
    );
    const successors = (result.snapshot.seats as any[]).filter(
      (s) => s.isDemonSuccessor === true
    );
    expect(successors.length).toBe(1);
    expect(successors[0].id).toBe(3);
  });
});
