// @vitest-environment jsdom
/**
 * 官方范例可执行夹具 · 暗流涌动 · 白天的提名/投票规则（生产 Hook 路径）
 * ======================================================================
 * 覆盖：贞洁者 #2（死者提名 ⇒ 提名无效，贞洁者不失去能力）。
 *
 * 为什么这个夹具要挂真 Hook：`贞洁者#2` 的判据不是纯函数能覆盖的 ——
 *   官方范例的失效点在**提名是否成立**（已死亡玩家无法发起提名），
 *   该守卫写在生产 `useDayActions.executeNomination` 的执行层
 *   （`src/hooks/useDayActions.ts`：「只有存活的玩家可以发起提名」）。
 *   ⇒ 用 `renderHook` 直接驱动生产 Hook，断言：
 *      ① `executeNomination(死者, 贞洁者)` 返回 false（提名被拒）；
 *      ② 贞洁者的「首次被提名」状态未被消耗（不会 `markAbilityUsed`）；
 *      ③ 不会写入任何提名记录。
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDayActions } from "../../../src/hooks/useDayActions";
import { seat } from "./_harness";

/**
 * 造一份最小可用 Hook 依赖：只关心提名执行路径，其余全部为记录型桩。
 * ⚠️ 每个桩都记录调用，用来证明「被拒的提名没有副作用」。
 */
function makeHarness() {
  const logs: string[] = [];
  const usedAbilityCalls: Array<[string, number]> = [];
  const nominationRecordWrites: any[] = [];
  const nominationMapWrites: any[] = [];

  let allSeats: any[] = [
    seat(0, "virgin"),
    // 已死亡的镇民（洗衣妇）作为提名者 —— 官方范例 #2 的「已死亡玩家」
    seat(1, "washerwoman", { isDead: true }),
    seat(2, "imp"),
    seat(3, "chef"),
    seat(4, "soldier"),
  ];

  const deps: any = {
    seats: allSeats,
    roles: [],
    currentModal: null,
    gamePhase: "day",
    nightCount: 2,
    nominationMap: {},
    nominationRecords: {
      nominators: new Set<number>(),
      nominees: new Set<number>(),
    },
    witchActive: false,
    witchCursedId: null,
    travelers: [],
    virginGuideInfo: null,
    dayAbilityForm: {},
    cerenovusTarget: null,
    setCerenovusTarget: () => {},
    setCurrentModal: () => {},
    setSeats: (updater: any) => {
      allSeats =
        typeof updater === "function" ? updater(allSeats) : updater;
    },
    setNominationMap: (updater: any) => {
      nominationMapWrites.push(updater);
    },
    setNominationRecords: (updater: any) => {
      nominationRecordWrites.push(updater);
    },
    setTodayMinionNominated: () => {},
    setVirginGuideInfo: () => {},
    setWitchCursedId: () => {},
    setWitchActive: () => {},
    setVoteInputValue: () => {},
    setShowVoteErrorToast: () => {},
    setExecutedPlayerId: () => {},
    setTodayExecutedId: () => {},
    setHasExecutedThisDay: () => {},
    setCurrentDuskExecution: () => {},
    setVfxTrigger: () => {},
    setWinResult: () => {},
    setWinReason: () => {},
    setGamePhase: () => {},
    setDayAbilityForm: () => {},
    setVotedThisRound: () => {},
    addLog: (message: any) => {
      logs.push(typeof message === "string" ? message : message?.message ?? "");
    },
    killPlayer: () => {},
    checkGameOver: () => {},
    isActorDisabledByPoisonOrDrunk: () => false,
    getRegistrationCached: () => null,
    saveHistory: () => {},
    hasUsedAbility: () => false,
    hasUsedDailyAbility: () => false,
    markAbilityUsed: (roleId: string, seatId: number) => {
      usedAbilityCalls.push([roleId, seatId]);
    },
    markDailyAbilityUsed: () => {},
    continueToNextAction: () => {},
    proceedToFirstNight: () => {},
    changeRole: () => {},
    dispatch: () => {},
  };

  return {
    deps,
    logs,
    usedAbilityCalls,
    nominationRecordWrites,
    nominationMapWrites,
    seats: () => allSeats,
  };
}

describe("暗流涌动 · 白天提名/投票官方范例（生产 Hook 路径）", () => {
  // 官方范例: 贞洁者 #2
  it("贞洁者#2：已死亡玩家提名贞洁者 ⇒ 提名无效，贞洁者不会因此失去能力", () => {
    const harness = makeHarness();
    const { result } = renderHook(() => useDayActions(harness.deps));

    let returned: any;
    act(() => {
      // 1 号（已死亡洗衣妇）提名 0 号贞洁者
      returned = result.current.executeNomination(1, 0);
    });

    // 官方：已死亡玩家无法发起提名 ⇒ 本次提名无效（执行层必须拒绝）
    expect(returned, "死者提名必须被拒绝").toBe(false);
    expect(
      harness.logs.some((line) => line.includes("只有存活的玩家可以发起提名")),
      "应留下「只有存活的玩家可以发起提名」日志"
    ).toBe(true);

    // 提名被拒 ⇒ 无任何副作用：贞洁者能力未被消耗、没有提名记录写入
    expect(harness.usedAbilityCalls, "贞洁者能力不得被消耗").toEqual([]);
    expect(harness.nominationRecordWrites, "不得写入提名记录").toEqual([]);
    expect(harness.nominationMapWrites, "不得写入提名映射").toEqual([]);

    // 贞洁者与死者状态均不变
    const after = harness.seats();
    expect(after[0].hasBeenNominated ?? false, "贞洁者未进入「已被提名」状态").toBe(
      false
    );
    expect(after[1].isDead, "死者状态不变").toBe(true);
  });
});
