import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  inspectorAbility,
  pickFakeGoodRoleId,
} from "../../new_engine/inspector.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 提刑官：提名的若是恶魔，会被当作某个善良角色（随机挑一个）。
 * 夜间行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，预演说的伪装角色与结算弹窗/日志会不一致。
 */

function makeSeat(id: number, roleId: string, roleName: string, roleType: string) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead: false,
    isAlive: true,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
  };
}

// 最小座位集：0号提刑官 + 数名善良 + 4号小恶魔（被提名）
const seats = () => [
  makeSeat(0, "inspector", "提刑官", "townsfolk"),
  makeSeat(1, "chef", "厨师", "townsfolk"),
  makeSeat(2, "empath", "共情者", "townsfolk"),
  makeSeat(3, "soldier", "士兵", "townsfolk"),
  makeSeat(4, "imp", "小恶魔", "demon"),
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("inspector", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  seatList: any[];
  targetId: number;
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: "night",
      seats: opts.seatList,
      statusEffects: {},
      // 白天首次提名被记录在快照里
      inspectorNomination: { targetId: opts.targetId },
    },
    actionNode: {
      seatId: 0,
      roleId: "inspector",
      roleName: "提刑官",
      priority: 20,
      isFirstNightOnly: false,
      abilityId: "inspector_nomination_info",
      wakeMessage: "提刑官",
      firstNightPriority: 20,
      otherNightPriority: 20,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
    preview: opts.preview,
  };
}

async function run(opts: {
  preview: boolean;
  nightCount: number;
  targetId: number;
}) {
  return runFullAbilityPipeline(
    {
      preCheck: inspectorAbility.preCheck,
      calculate: inspectorAbility.calculate,
      stateUpdate: inspectorAbility.stateUpdate,
      postProcess: inspectorAbility.postProcess,
    },
    makeContext({
      nightCount: opts.nightCount,
      preview: opts.preview,
      seatList: seats(),
      targetId: opts.targetId,
    })
  );
}

describe("提刑官：提示预演与实际执行必须给出同一个伪装角色（回归）", () => {
  it("同一夜、同一种子 → 同一个伪装角色", () => {
    const a = pickFakeGoodRoleId(createDeterministicRandom(seedFor(0, 1)));
    const b = pickFakeGoodRoleId(createDeterministicRandom(seedFor(0, 1)));
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe("imp");
    expect(b).toBe(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一个伪装角色）", () => {
    const sequence = (night: number) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 8 }, () => pickFakeGoodRoleId(rng));
    };
    expect(sequence(1)).not.toEqual(sequence(2));
  });

  it("管道级：恶魔被当作善良角色时，preview 与结算给出同一个角色 id", async () => {
    const previewResult = await run({ preview: true, nightCount: 1, targetId: 4 });
    const execResult = await run({ preview: false, nightCount: 1, targetId: 4 });

    const previewInfo = previewResult.meta.abilityResult as any;
    const execInfo = execResult.meta.abilityResult as any;

    expect(previewInfo.isDemon).toBe(true);
    expect(execInfo.revealedRoleId).toBe(previewInfo.revealedRoleId);
    // 与纯函数在相同种子下的输出交叉验证（证明 calculate 真的注入了种子 rng）
    expect(previewInfo.revealedRoleId).toBe(
      pickFakeGoodRoleId(createDeterministicRandom(seedFor(0, 1)))
    );
  });

  it("管道级：提名非恶魔时直接告知其真实角色，不受随机影响", async () => {
    const execResult = await run({ preview: false, nightCount: 3, targetId: 1 });
    const info = execResult.meta.abilityResult as any;
    expect(info.isDemon).toBe(false);
    expect(info.revealedRoleId).toBe("chef");
    expect(info.revealedRoleName).toBe("厨师");
  });
});
