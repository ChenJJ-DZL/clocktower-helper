import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeInfo,
  generateRealInfo,
  investigatorAbility,
} from "../../new_engine/investigator.ability";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 调查员：首夜信息由「随机挑一名爪牙 + 随机挑一名干扰项 + 随机决定顺序」生成。
 * 首夜行动会被计算两次（生成「当前的行动」预演 + 真正执行），
 * 若两处各自调用 Math.random()，说书人照预演念的内容会与魔典标记对不上。
 */

/** 兼容 snapshot.seats 的最小座位结构（含 role.type） */
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

// 最小座位集：0号调查员 + 2 名爪牙 + 2 名善良 + 1 名恶魔
const seats = () => [
  makeSeat(0, "investigator", "调查员", "townsfolk"),
  makeSeat(1, "poisoner", "投毒者", "minion"),
  makeSeat(2, "baron", "男爵", "minion"),
  makeSeat(3, "chef", "厨师", "townsfolk"),
  makeSeat(4, "saint", "圣徒", "outsider"),
  makeSeat(5, "imp", "小恶魔", "demon"),
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("investigator", actorId, night);

function makeContext(opts: {
  nightCount: number;
  preview: boolean;
  seatList: any[];
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: "firstNight",
      seats: opts.seatList,
      statusEffects: {},
      _abilityResults: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "investigator",
      roleName: "调查员",
      priority: 54,
      isFirstNightOnly: true,
      abilityId: "investigator_first_night_ability",
      wakeMessage: "调查员",
      firstNightPriority: 54,
      otherNightPriority: null,
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
  seatList?: any[];
}) {
  return runFullAbilityPipeline(
    {
      preCheck: investigatorAbility.preCheck,
      calculate: investigatorAbility.calculate,
      stateUpdate: investigatorAbility.stateUpdate,
      postProcess: investigatorAbility.postProcess,
    },
    makeContext({
      nightCount: opts.nightCount,
      preview: opts.preview,
      seatList: opts.seatList ?? seats(),
    })
  );
}

describe("调查员：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("真实信息在同种子下完全一致，且两名玩家不同", () => {
    const a = generateRealInfo(
      seats(),
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = generateRealInfo(
      seats(),
      0,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    expect(a.roleName).toBeTruthy();
    expect(a.seat1).not.toBe(a.seat2);
  });

  it("醉酒/中毒的假信息在同种子下完全一致", () => {
    const a = generateFakeInfo(
      seats(),
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = generateFakeInfo(
      seats(),
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    expect(typeof a.roleName).toBe("string");
  });

  it("不同夜次会重新随机（不会整局锁死同一份信息）", () => {
    const sequence = (night: number, fn: any) => {
      const rng = createDeterministicRandom(seedFor(0, night));
      return Array.from({ length: 6 }, () => JSON.stringify(fn(seats(), 0, rng)));
    };
    expect(sequence(1, generateRealInfo)).not.toEqual(
      sequence(2, generateRealInfo)
    );
    expect(sequence(1, generateFakeInfo)).not.toEqual(
      sequence(2, generateFakeInfo)
    );
  });

  it("管道级：preview 与结算得到完全相同的 abilityResult", async () => {
    const previewResult = await run({ preview: true, nightCount: 1 });
    const execResult = await run({ preview: false, nightCount: 1 });

    const previewInfo = previewResult.meta.abilityResult as any;
    const execInfo = execResult.meta.abilityResult as any;

    expect(execInfo).toEqual(previewInfo);
    expect(previewInfo.roleName).toBeTruthy();
    // 真实信息中的爪牙角色必须真的在场
    expect(["投毒者", "男爵"]).toContain(previewInfo.roleName);
  });
});
