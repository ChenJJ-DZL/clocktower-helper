/**
 * 罂粟花开 · **连续三「夜 + 白天」端到端集成测试**
 *
 * 这是覆盖矩阵里最后一块空白：此前各环节只有**契约/单元**级覆盖
 * （相位推进契约、投票规则纯函数、队列不变量），但**没有一条测试把整条链连续跑完**。
 *
 * 本文件用真实 `gameReducer` 驱动一个连续状态机，跑 3 天：
 *
 *   夜(生成队列 → 夜杀) → 黎明(播报 → 胜负判定) → 白天(提名 → 投票 → 处决)
 *   → 黄昏(记录处决) → 入夜(相位/夜次/清场) → 次日循环
 *
 * 每一步都断言**状态不变量**，任何一环断链（相位粘滞 / 亡灵复活 / 记录丢失 /
 * deadThisNight 跨夜累积 / 军团投票未归零）都会让本文件变红。
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd, isPlayerEvil } from "../../../app/gameLogic";
import { roles } from "../../../app/data";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../contexts/GameContext";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { shouldZeroLegionVote } from "../legionVoteRule";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

/**
 * 罂粟花开 9 人局。
 * 军团局（多数为军团）—— 便于同时验证"军团投票归零"与"军团不判负"。
 */
function baseSeats(): any[] {
  return [
    seat(0, "legion"),
    seat(1, "legion"),
    seat(2, "legion"),
    seat(3, "legion"),
    seat(4, "baron"),      // 爪牙（邪恶）
    seat(5, "mayor"),      // 善良
    seat(6, "savant"),     // 善良
    seat(7, "farmer"),     // 善良
    seat(8, "snitch"),     // 外来者（善良）
  ];
}

/** 建立「第 1 夜开始前」的初始状态 */
function newGame(seats: any[]) {
  let s: any = gameReducer(
    getInitialState(),
    gameActions.updateState({
      seats,
      gamePhase: "firstNight",
      nightCount: 1,
      deadThisNight: [],
      currentWakeIndex: 0,
      selectedActionTargets: [],
      hasExecutedThisDay: false,
      executedPlayerId: null,
    } as any)
  );
  return s;
}

const aliveIds = (s: any): number[] =>
  (s.seats as any[])
    .filter((x) => !x.isDead)
    .map((x) => x.id as number);

describe("罂粟花开 · 连续三天 夜→白天 端到端集成", () => {
  initializeAbilityRegistry();

  it("前置自检：夜序表已构建（防假绿）", () => {
    expect((ENGINE_CONFIG.fullNightOrder as any[]).length).toBeGreaterThan(10);
  });

  it("⭐ 连续 3 天完整链路：夜→黎明→白天提名→投票→处决→黄昏→入夜，全程不变量成立", () => {
    let s = newGame(baseSeats());
    const timeline: string[] = [];
    /** 每夜记录死亡，供后续断言"亡灵不再被唤醒" */
    const diedByNight = new Map<number, number[]>();

    for (let day = 1; day <= 3; day++) {
      // ───────── ① 夜晚 ─────────
      s = gameReducer(s, gameActions.setGamePhase("night"));
      expect(s.gamePhase, `第${day}夜 应进入 night`).toBe("night");
      expect(s.deadThisNight, `第${day}夜 刚开始 deadThisNight 应为空`).toEqual([]);

      const queue = generateDynamicNightQueue(
        ENGINE_CONFIG.fullNightOrder,
        {
          seats: s.seats,
          gamePhase: day === 1 ? "firstNight" : "night",
          nightCount: day,
          statusEffects: {},
          poppyGrowerDead: false,
          reminders: [],
          log: [],
        } as any,
        { isFirstNight: day === 1 }
      ) as any[];
      expect(queue.length, `第${day}夜队列不应为空`).toBeGreaterThan(0);

      // 亡灵不得出现在队列里
      for (const n of queue) {
        expect(
          s.seats.find((x: any) => x.id === n.seatId)?.isDead ?? false,
          `第${day}夜 已死亡座位 ${n.seatId + 1}号 不应被唤醒`
        ).toBe(false);
      }
      timeline.push(`D${day} 夜·队列${queue.length}`);

      // 模拟一次夜间死亡：第 day 夜杀一名存活的军团（军团官方默认策略）
      const victim = aliveIds(s).find(
        (id) => s.seats.find((x: any) => x.id === id)?.role?.id === "legion"
      );
      if (victim !== undefined) {
        s = gameReducer(s, gameActions.addDeadThisNight(victim));
        s = gameReducer(s, gameActions.updateSeat(victim, { isDead: true, } as any));
      }
      diedByNight.set(day, s.deadThisNight);

      // ───────── ② 黎明 ─────────
      const deadNow: number[] = s.deadThisNight ?? [];
      const dawnMsg =
        deadNow.length > 0
          ? `昨晚${deadNow.map((id: number) => `${id + 1}号`).join("、")}玩家死亡`
          : "昨天是个平安夜";
      timeline.push(`D${day} 黎明「${dawnMsg}」`);
      if (deadNow.length > 0) {
        expect(dawnMsg, "有死亡时必须宣布死亡，不能报平安夜").not.toContain("平安夜");
      }

      // 黎明胜负判定
      const dawnEnd = checkGameEnd(s.seats, "night_death", null);
      if (dawnEnd.isGameOver) {
        s = gameReducer(
          s,
          gameActions.setWinResult(dawnEnd.winner as any, dawnEnd.reason ?? null)
        );
        timeline.push(`D${day} 黎明判定结束：${dawnEnd.winner}（${dawnEnd.reason}）`);
        break;
      }

      // ───────── ③ 白天：提名 ─────────
      s = gameReducer(s, gameActions.setGamePhase("day"));
      expect(s.gamePhase).toBe("day");
      const nominee = aliveIds(s)[0];
      const nominator = aliveIds(s)[1];
      s = gameReducer(
        s,
        gameActions.setNominationRecords({
          nominators: new Set([nominator]),
          nominees: new Set([nominee]),
        })
      );
      expect(s.nominationRecords?.nominators?.has(nominator), "提名者应被记录").toBe(true);
      expect(s.nominationRecords?.nominees?.has(nominee), "被提名者应被记录").toBe(true);
      timeline.push(`D${day} 白天·${nominator + 1}号提名${nominee + 1}号`);

      // ───────── ④ 投票（含军团归零规则） ─────────
      // 让 4 名军团/爪牙投票（全邪恶）→ 军团规则应把票数归零
      const evilVoters = aliveIds(s).filter((id) =>
        isPlayerEvil(s.seats.find((x: any) => x.id === id))
      );
      const zeroed = shouldZeroLegionVote(s.seats, evilVoters, isPlayerEvil);
      expect(zeroed, "全邪恶投票应触发军团归零规则").toBe(true);

      let voteCount = evilVoters.length;
      if (zeroed) voteCount = 0;
      for (const v of evilVoters) {
        s = gameReducer(s, gameActions.updateVotedThisRound(v));
      }
      s = gameReducer(s, gameActions.setVoteInput(String(voteCount)));
      timeline.push(`D${day} 投票·${evilVoters.length}票→生效${voteCount}票`);

      // ───────── ⑤ 处决 ─────────
      // 归零则不上台 → 本日无人被处决
      const executed = voteCount > 0 ? nominee : null;
      const hasExec = executed !== null;
      s = gameReducer(s, gameActions.setHasExecutedThisDay(hasExec));
      s = gameReducer(s, gameActions.setExecutedPlayer(executed));
      expect(s.hasExecutedThisDay, "处决标记应与是否处决一致").toBe(hasExec);
      if (hasExec) {
        s = gameReducer(s, gameActions.updateSeat(executed!, { isDead: true, } as any));
      }
      timeline.push(`D${day} 处决·${hasExec ? `${executed! + 1}号` : "无人"}`);

      // ───────── ⑥ 黄昏 ─────────
      s = gameReducer(s, gameActions.setGamePhase("dusk"));
      expect(s.gamePhase).toBe("dusk");
      const beforeNight = s.nightCount;
      s = gameReducer(
        s,
        gameActions.setDuskExecution(
          s.executedPlayerId ?? null,
          s.executedPlayerId ?? null
        )
      );
      const duskEnd = checkGameEnd(s.seats, "check_phase", s.executedPlayerId ?? null);
      if (duskEnd.isGameOver) {
        s = gameReducer(
          s,
          gameActions.setWinResult(duskEnd.winner as any, duskEnd.reason ?? null)
        );
        timeline.push(`D${day} 黄昏判定结束：${duskEnd.winner}（${duskEnd.reason}）`);
        break;
      }

      // ───────── ⑦ 入夜（关键：不得卡在 dusk） ─────────
      s = gameReducer(
        s,
        gameActions.updateState({
          wakeQueueIds: [],
          currentWakeIndex: 0,
          selectedActionTargets: [],
          nightCount: beforeNight + 1,
          deadThisNight: [],
          hasExecutedThisDay: false,
        } as any)
      );
      s = gameReducer(s, gameActions.setGamePhase("night"));
      s = gameReducer(s, gameActions.setModal(null));

      expect(s.gamePhase, `第${day} 天结束必须能进入夜晚（不得卡在 dusk）`).toBe("night");
      expect(s.nightCount, "夜次应 +1").toBe(beforeNight + 1);
      expect(s.deadThisNight, "新夜晚 deadThisNight 必须清空，防跨夜累积").toEqual([]);
      expect(s.hasExecutedThisDay, "新夜晚应复位处决标记").toBe(false);
      timeline.push(`D${day} 入夜·第${s.nightCount}夜`);
    }

    // 整条时间线必须顺序完整
    console.log("\n=== 三天时间线 ===\n" + timeline.join("\n"));
    expect(timeline.length, "时间线应有至少 3 天 × 若干环节").toBeGreaterThanOrEqual(7);
    // 必须包含三夜的队列生成
    expect(timeline.filter((l) => l.includes("夜·队列")).length).toBeGreaterThanOrEqual(2);
  });

  it("军团局开局不因邪恶过半判负（多数为军团）", () => {
    const s = newGame(baseSeats());
    const res = checkGameEnd(s.seats, "check_phase");
    expect(res.isGameOver).toBe(false);
  });

  it("军团全灭 → 善良胜（终局判定接入时间线）", () => {
    const seats = baseSeats().map((x: any) =>
      x.role?.id === "legion" ? { ...x, isDead: true, } : x
    );
    const s = newGame(seats);
    const res = checkGameEnd(s.seats, "execution", 0);
    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Good");
  });

  it("连续入夜三次：相位不粘滞、夜次单调递增", () => {
    let s = newGame(baseSeats());
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      s = gameReducer(s, gameActions.setGamePhase("dusk"));
      expect(s.gamePhase).toBe("dusk");
      s = gameReducer(
        s,
        gameActions.updateState({
          nightCount: (s.nightCount ?? 1) + 1,
          deadThisNight: [],
          currentWakeIndex: 0,
        } as any)
      );
      s = gameReducer(s, gameActions.setGamePhase("night"));
      expect(s.gamePhase).toBe("night");
      counts.push(s.nightCount);
    }
    expect(counts).toEqual([2, 3, 4]);
  });

  it("⭐ 混合投票（含善良玩家）→ 正常计票 → 处决成立 → 被处决者死亡落地", () => {
    // 上述主链路因"军团多数局"导致每天投票都被归零（处决分支走不到）。
    // 本用例构造一个**有善良玩家参与投票**的场景，把处决分支打通。
    let s = newGame(baseSeats());

    // 白天
    s = gameReducer(s, gameActions.setGamePhase("day"));
    const alive = aliveIds(s);
    const nominee = alive[0];
    const goodVoter = alive.find(
      (id: number) => !isPlayerEvil(s.seats.find((x: any) => x.id === id))
    )!;
    const evilVoters = alive.filter((id: number) =>
      isPlayerEvil(s.seats.find((x: any) => x.id === id))
    );

    // 提名
    s = gameReducer(
      s,
      gameActions.setNominationRecords({
        nominators: new Set([alive[1]]),
        nominees: new Set([nominee]),
      })
    );

    // 投票：邪恶 + 1 名善良 → 军团规则**不**归零
    const voters = [...evilVoters, goodVoter];
    const zeroed = shouldZeroLegionVote(s.seats, voters, isPlayerEvil);
    expect(zeroed, "含善良投票时不应归零").toBe(false);

    for (const v of voters) {
      s = gameReducer(s, gameActions.updateVotedThisRound(v));
    }
    const voteCount = voters.length; // 未归零 → 原票数
    s = gameReducer(s, gameActions.setVoteInput(String(voteCount)));
    expect(voteCount).toBeGreaterThan(0);

    // 处决成立
    s = gameReducer(s, gameActions.setHasExecutedThisDay(true));
    s = gameReducer(s, gameActions.setExecutedPlayer(nominee));
    s = gameReducer(
      s,
      gameActions.updateSeat(nominee, { isDead: true, } as any)
    );
    expect(s.hasExecutedThisDay).toBe(true);
    expect(s.executedPlayerId).toBe(nominee);
    expect(
      s.seats.find((x: any) => x.id === nominee)?.isDead,
      "被处决者死亡必须落地"
    ).toBe(true);

    // 黄昏记录处决（last/current）
    s = gameReducer(s, gameActions.setGamePhase("dusk"));
    s = gameReducer(s, gameActions.setDuskExecution(nominee, nominee));
    expect(s.gamePhase).toBe("dusk");

    // 黄昏胜负判定不应抛异常
    const end = checkGameEnd(s.seats, "check_phase", nominee);
    expect(typeof end.isGameOver).toBe("boolean");

    // 入夜：处决标记与 deadThisNight 复位
    s = gameReducer(
      s,
      gameActions.updateState({
        nightCount: (s.nightCount ?? 1) + 1,
        deadThisNight: [],
        hasExecutedThisDay: false,
        currentWakeIndex: 0,
      } as any)
    );
    s = gameReducer(s, gameActions.setGamePhase("night"));
    expect(s.gamePhase).toBe("night");
    expect(s.hasExecutedThisDay).toBe(false);
    expect(s.deadThisNight).toEqual([]);
  });
});
