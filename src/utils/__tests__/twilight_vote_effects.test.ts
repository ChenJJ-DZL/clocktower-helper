/**
 * 官员 / 窃贼 暮色投票效果（Round 11 · 方案 B 效果落地）
 * ==================================================================
 * 官方原文（json/wiki_crawl/parsed_roles.json）：
 *   · 官员：「每个夜晚，你要选择除你以外的一名玩家：**明天白天，他的投票算作三票**。」
 *   · 窃贼：「每个夜晚，你要选择除你以外的一名玩家：**明天白天他的投票会被算作负数**。」
 *
 * 结算点：`useExecutionHandlers.ts` 的 `submitVotes`（票仓咽喉），
 * 判据为 `state.twilightVoteTargets`（**独立 state，不进 seats**）。
 *
 * 🔴 本文件同时锁死一段**假规则的删除**：旧代码曾在同一位置写
 *    「乞丐选择某玩家 ⇒ 该玩家投票计 2 票（+1）」，官方原文里**没有这条**，
 *    且乞丐是 traveler ⇒ `seats.find(role.id==="beggar")` 永远 undefined ⇒ 永不执行。
 *
 * 口径（与仓库既有 `exile_mechanic.test.ts` 一致）：用**真实 reducer**，
 * 禁 mock 状态。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../contexts/GameContext";
import type { GameState } from "../../contexts/GameContext";
import type { Seat } from "../../../app/data";

const seat = (id: number, overrides: Partial<Seat> = {}): Seat =>
  ({
    id,
    role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isCandidate: false,
    voteCount: 0,
    hasGhostVote: false,
    statusDetails: [],
    ...overrides,
  }) as Seat;

const base = (): GameState => {
  const s = getInitialState();
  return {
    ...s,
    seats: [seat(0), seat(1), seat(2), seat(3), seat(4), seat(5), seat(6)],
    nightCount: 1,
  };
};

describe("暮色投票目标 state（真实 reducer）", () => {
  it("① 初始为空目标（无官员/窃贼 ⇒ 投票不受影响）", () => {
    const s = base();
    expect(s.twilightVoteTargets.bureaucratTargetId).toBeNull();
    expect(s.twilightVoteTargets.thiefTargetId).toBeNull();
  });

  it("② 可分别设置官员与窃贼的目标，互不干扰", () => {
    let s = base();
    s = gameReducer(s, gameActions.setTwilightVoteTarget("bureaucrat", 3));
    s = gameReducer(s, gameActions.setTwilightVoteTarget("thief", 5));
    expect(s.twilightVoteTargets.bureaucratTargetId).toBe(3);
    expect(s.twilightVoteTargets.thiefTargetId).toBe(5);
  });

  it("③ 传 null = 取消选择（该角色当晚不发动）", () => {
    let s = base();
    s = gameReducer(s, gameActions.setTwilightVoteTarget("bureaucrat", 3));
    s = gameReducer(s, gameActions.setTwilightVoteTarget("bureaucrat", null));
    expect(s.twilightVoteTargets.bureaucratTargetId).toBeNull();
  });
});

/**
 * 票仓结算口径
 * ==================================================================
 * `submitVotes` 的输入是「投票者数组 effectiveVoters」与「当前票数 v」。
 * 官方语义（可执行谓词）：
 *   · 官员：目标在投票者中 ⇒ 该玩家这一票从 1 变 3 ⇒ v += 2
 *   · 窃贼：目标在投票者中 ⇒ 该玩家这一票从 1 变 -1 ⇒ v -= 2
 *   · 目标不在投票者中 ⇒ 两个效果都不生效（v 不变）
 *
 * ⚠️ 这里直接测**纯函数口径**而不是整个 hook：hook 依赖 React 与大量
 *    外部函数，纯函数断言才能稳定判真伪。接线位置由下面的源码级断言钉死。
 */
describe("官员 / 窃贼结算口径（纯函数）", () => {
  /** 复刻 useExecutionHandlers 中的官方语义（与生产代码逐字同源） */
  const applyTravelerVoteEffects = (
    v: number,
    voters: number[],
    targets: { bureaucratTargetId: number | null; thiefTargetId: number | null }
  ): { v: number; logs: string[] } => {
    const logs: string[] = [];
    let next = v;
    if (
      targets.bureaucratTargetId != null &&
      voters.includes(targets.bureaucratTargetId)
    ) {
      next = next + 2;
      logs.push(`官员:${targets.bureaucratTargetId}+2`);
    }
    if (
      targets.thiefTargetId != null &&
      voters.includes(targets.thiefTargetId)
    ) {
      next = next - 2;
      logs.push(`窃贼:${targets.thiefTargetId}-2`);
    }
    return { v: next, logs };
  };

  it("④ 官员：目标投票 ⇒ 该票算作三票（+2）", () => {
    // 3 人投票，其中 2 号是官员目标 ⇒ 2 号那票算 3 票，总票 3+2=5
    const r = applyTravelerVoteEffects(3, [0, 2, 3], {
      bureaucratTargetId: 2,
      thiefTargetId: null,
    });
    expect(r.v).toBe(5);
    expect(r.logs).toEqual(["官员:2+2"]);
  });

  it("⑤ 窃贼：目标投票 ⇒ 该票算作负数（-2，净 -1）", () => {
    // 3 人投票，其中 1 号是窃贼目标 ⇒ 1 号那票算 -1，总票 3-2=1
    const r = applyTravelerVoteEffects(3, [0, 1, 3], {
      bureaucratTargetId: null,
      thiefTargetId: 1,
    });
    expect(r.v).toBe(1);
    expect(r.logs).toEqual(["窃贼:1-2"]);
  });

  it("⑥ 官员与窃贼同时命中 ⇒ 效果叠加（+2 与 -2 抵消为 0）", () => {
    const r = applyTravelerVoteEffects(4, [0, 1, 2, 5], {
      bureaucratTargetId: 1,
      thiefTargetId: 2,
    });
    expect(r.v).toBe(4);
    expect(r.logs).toEqual(["官员:1+2", "窃贼:2-2"]);
  });

  it("⑦ 负向：目标未参与本次投票 ⇒ 效果不生效（v 不变、无日志）", () => {
    const r = applyTravelerVoteEffects(3, [0, 3, 4], {
      bureaucratTargetId: 2,
      thiefTargetId: 5,
    });
    expect(r.v).toBe(3);
    expect(r.logs).toEqual([]);
  });

  it("⑧ 负向：目标为空 ⇒ 绝不改动票数（防止 null 被当成 id 0 命中）", () => {
    const r = applyTravelerVoteEffects(2, [0, 1], {
      bureaucratTargetId: null,
      thiefTargetId: null,
    });
    expect(r.v).toBe(2);
    expect(r.logs).toEqual([]);
  });
});

/**
 * 源码级防漂移
 * ==================================================================
 * 上面的纯函数是**口径的复刻**，真正保证"生产代码没被改坏"的是这一节：
 * 一旦 `useExecutionHandlers.ts` 里的官员/窃贼结算被删/改名/改判据，
 * 这里立刻变红。
 */
describe("官员 / 窃贼结算接线（源码级）", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../../hooks/useExecutionHandlers.ts"),
    "utf-8"
  );

  it("⑨ submitVotes 里真的读取了 twilightVoteTargets", () => {
    expect(SRC).toContain("twilightVoteTargets");
  });

  it("⑩ 官员判据 = 目标在投票者中 ⇒ +2（三票）", () => {
    expect(SRC).toMatch(/bureaucratTargetId[\s\S]{0,200}v\s*=\s*v\s*\+\s*2/);
  });

  it("⑪ 窃贼判据 = 目标在投票者中 ⇒ -2（净 -1）", () => {
    expect(SRC).toMatch(/thiefTargetId[\s\S]{0,200}v\s*=\s*v\s*-\s*2/);
  });

  it("⑫ 假规则不得复活：源码里不得再出现「乞丐计 2 票」", () => {
    expect(SRC).not.toContain("乞丐效果生效");
    expect(SRC).not.toMatch(/beggarTargetId[\s\S]{0,120}v\s*=\s*v\s*\+\s*1/);
  });

  it("⑬ 进入暮色必须清零上一夜目标（防残留加成）", () => {
    const FLOW = readFileSync(
      resolve(__dirname, "../../hooks/useGameFlow.ts"),
      "utf-8"
    );
    expect(FLOW).toContain("clearTwilightVoteTargets()");
  });
});
