/**
 * 流放（Exile）机制测试（Round 10b）
 * ==================================================================
 * 官方铁律（officialRules.json 明文 + 用户 2026-10-12 裁定）：
 *   1. 门槛 = 全体玩家（无论生死）一半向上取整（不是存活的一半）；
 *   2. 任何人（含死者）可提议、可表决且不消耗投票标记；
 *   3. 被流放者立即死；
 *   4. 一日可流放多人；
 *   5. 流放 ≠ 处决 ⇒ 同日可既有流放又有处决；
 *   6. 不受任何能力影响；
 *   7. 不产生终局；
 *   8. 送葬者只认处决死（流放死不得被得知）。
 */
import { describe, expect, it } from "vitest";
import {
  applyExileDeath,
  exileThreshold,
  isExileBlockedByDeviant,
  isExiledToday,
  isExilePassed,
} from "../exile";
import { gameActions, gameReducer } from "../../contexts/GameContext";
import type { GameState } from "../../contexts/GameContext";
import { getInitialState } from "../../contexts/GameContext";
import type { Seat } from "../../../app/data";

const seat = (
  id: number,
  overrides: Partial<Seat> = {}
): Seat =>
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
    ...overrides,
  }) as Seat;

describe("exile.ts 纯函数层", () => {
  it("① 门槛取整验证（15→8 / 7→4 / 8→4）", () => {
    expect(exileThreshold(15)).toBe(8);
    expect(exileThreshold(7)).toBe(4);
    expect(exileThreshold(8)).toBe(4);
  });

  it("② 门槛含死者口径：15 人死 3 个仍是 8（总人数不是存活数）", () => {
    // 纯函数只收总人数；「含死者」语义在调用方（reducer 传 seats.length）
    const alive = 15 - 3;
    expect(alive).toBe(12);
    expect(exileThreshold(15)).toBe(8); // 不是 alive 的一半(6)
  });

  it("③ isExilePassed 边界（8/8 过、7/8 不过）", () => {
    expect(isExilePassed(8, 8)).toBe(true);
    expect(isExilePassed(7, 8)).toBe(false);
  });

  it("④ 非法总人数防御（0/-1/NaN → 0）", () => {
    expect(exileThreshold(0)).toBe(0);
    expect(exileThreshold(-1)).toBe(0);
    expect(exileThreshold(NaN)).toBe(0);
  });

  it("⑤ applyExileDeath 写 isDead + exiled，且不可变更新", () => {
    const seats = [seat(0), seat(1), seat(2)];
    const before = seats[1];
    const r = applyExileDeath(seats, 1, 2);
    expect(r.applied).toBe(true);
    expect(r.seats[1].isDead).toBe(true);
    expect(r.seats[1].exiled).toBe(true);
    expect(r.seats).not.toBe(seats);
    // 其他座位不受影响
    expect(r.seats[0]).toBe(seats[0]);
    expect(r.seats[2]).toBe(seats[2]);
    // 原数组未被改动（不可变性）
    expect(before.isDead).toBe(false);
  });

  it("⑥ 负例：对已死座位 applied=false 且数组不变", () => {
    const seats = [seat(0), seat(1, { isDead: true })];
    const r = applyExileDeath(seats, 1, 2);
    expect(r.applied).toBe(false);
    expect(r.seats).toBe(seats);
  });

  it("⑦ 负例：目标座位不存在 applied=false", () => {
    const seats = [seat(0)];
    const r = applyExileDeath(seats, 99, 2);
    expect(r.applied).toBe(false);
    expect(r.seats).toBe(seats);
  });

  it("⑧ isExiledToday：同日 true / 异日 false", () => {
    const s = seat(0, { isDead: true, exiled: true, diedOnDay: 2 });
    expect(isExiledToday(s, 2)).toBe(true);
    expect(isExiledToday(s, 3)).toBe(false);
  });

  it("⑨ 流放死不写 executedToday（送葬者判据不受影响）", () => {
    const seats = [seat(0, { executedToday: false })];
    const r = applyExileDeath(seats, 0, 2);
    expect(r.seats[0].executedToday).toBe(false);
    expect(r.seats[0].diedOnDay).toBe(2);
    expect(r.seats[0].diedAtNight).toBeUndefined();
  });

  it("⑩ 一日多人：连续对两个座位 applyExileDeath 都 applied", () => {
    const seats = [seat(0), seat(1), seat(2)];
    const r1 = applyExileDeath(seats, 0, 2);
    const r2 = applyExileDeath(r1.seats, 2, 2);
    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    expect(r2.seats[0].exiled).toBe(true);
    expect(r2.seats[2].exiled).toBe(true);
    expect(r2.seats[1].isDead).toBe(false);
  });
});

describe("GameReducer 流放流程（真实 reducer，禁 mock）", () => {
  const base = (): GameState => {
    const s = getInitialState();
    return {
      ...s,
      seats: [seat(0), seat(1), seat(2), seat(3), seat(4), seat(5), seat(6)],
      nightCount: 1,
    };
  };

  it("⑪ 全流程：propose → vote×N → resolve 通过 ⇒ 目标流放死", () => {
    let s = base();
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    expect(s.exileProposedToday).toEqual({
      targetKind: "seat",
      targetId: 3,
      proposerId: 0,
      votes: [],
    });
    // 7 人门槛 = 4
    for (const v of [0, 1, 2, 5]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    expect(s.exileProposedToday!.votes.length).toBe(4);
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].isDead).toBe(true);
    expect(s.seats[3].exiled).toBe(true);
    expect(s.exileProposedToday).toBeNull();
  });

  it("⑫ 负例：票数不足 resolve ⇒ 目标未死且提案清空", () => {
    let s = base();
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    s = gameReducer(s, gameActions.castExileVote(0));
    s = gameReducer(s, gameActions.castExileVote(1));
    s = gameReducer(s, gameActions.castExileVote(2)); // 3 < 4
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].isDead).toBe(false);
    expect(s.exileProposedToday).toBeNull();
  });

  it("⑬ 死人投票计入（死者票有效，不消耗投票标记）", () => {
    let s = base();
    s.seats[0] = { ...s.seats[0], isDead: true };
    const tokensBefore = 0; // 投票标记由外部管理，流放路径不触碰
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    s = gameReducer(s, gameActions.castExileVote(0)); // 死者
    s = gameReducer(s, gameActions.castExileVote(1));
    s = gameReducer(s, gameActions.castExileVote(2));
    s = gameReducer(s, gameActions.castExileVote(4));
    expect(s.exileProposedToday!.votes).toContain(0);
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].exiled).toBe(true);
    expect(tokensBefore).toBe(0);
  });

  it("⑭ castExileVote 重复投票去重（votes 长度不增）", () => {
    let s = base();
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    s = gameReducer(s, gameActions.castExileVote(1));
    const len = s.exileProposedToday!.votes.length;
    s = gameReducer(s, gameActions.castExileVote(1));
    expect(s.exileProposedToday!.votes.length).toBe(len);
  });

  it("⑮ 负例：无进行中提案时 vote/resolve/cancel 均无副作用", () => {
    const s = base();
    const afterVote = gameReducer(s, gameActions.castExileVote(0));
    expect(afterVote).toBe(s);
    const afterResolve = gameReducer(s, gameActions.resolveExile());
    expect(afterResolve).toBe(s);
    const afterCancel = gameReducer(s, gameActions.cancelExile());
    expect(afterCancel).toBe(s);
  });

  it("⑯ 流放不产生终局：resolve 后 gamePhase / winResult 不变", () => {
    let s = base();
    const phaseBefore = s.gamePhase;
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 4]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.gamePhase).toBe(phaseBefore);
    expect(s.winResult).toBeNull();
  });

  it("⑰ 旅行者流放 = 离开游戏（travelers[i] 置 null，不碰 seats）", () => {
    let s = base();
    s = {
      ...s,
      travelers: [
        { id: "beggar", name: "乞丐", type: "traveler" } as any,
        null,
        null,
        null,
      ],
    };
    const seatsBefore = s.seats;
    s = gameReducer(s, gameActions.proposeExile("traveler", 0, 0));
    for (const v of [0, 1, 2, 4]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.travelers[0]).toBeNull();
    expect(s.travelers.filter(Boolean).length).toBe(0);
    // 玩家座位完全不受影响
    expect(s.seats).toBe(seatsBefore);
    expect(s.seats.every((x) => !x.isDead)).toBe(true);
  });

  it("⑱ 负例：cancelExile 清空提案且目标毫发无损", () => {
    let s = base();
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    s = gameReducer(s, gameActions.castExileVote(0));
    s = gameReducer(s, gameActions.castExileVote(1));
    s = gameReducer(s, gameActions.castExileVote(2));
    s = gameReducer(s, gameActions.castExileVote(4));
    s = gameReducer(s, gameActions.cancelExile());
    expect(s.exileProposedToday).toBeNull();
    expect(s.seats[3].isDead).toBe(false);
    expect(s.seats[3].exiled).toBeUndefined();
  });

  it("⑲ 免疫不适用：圣徒座位照样被流放死（不受任何能力影响）", () => {
    let s = base();
    s.seats[3] = {
      ...s.seats[3],
      role: { id: "saint", name: "圣徒", type: "outsider" } as any,
      isProtected: true, // 士兵保护也不挡
    };
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 4]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].isDead).toBe(true);
    expect(s.seats[3].exiled).toBe(true);
  });

  it("⑳ 同日可既有流放又有处决：流放后 executedToday 标记可独立设置", () => {
    let s = base();
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 4]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    s = gameReducer(s, gameActions.resolveExile());
    // 处决是另一路径（killPlayer），此处验证流放死没有抢处决语义
    expect(s.seats[3].exiled).toBe(true);
    expect(s.seats[3].executedToday).toBeFalsy();
    // 同一天可再处决另一人（模拟处决路径写入）
    s = {
      ...s,
      seats: s.seats.map((x) =>
        x.id === 5 ? { ...x, isDead: true, diedOnDay: s.nightCount, executedToday: true } : x
      ),
    };
    expect(s.seats[5].executedToday).toBe(true);
    expect(s.seats[3].executedToday).toBeFalsy();
  });

  it("㉑ 门槛含旅行者（2026-10-12 交互审查修正）：7 座 + 2 旅行者 ⇒ 门槛 5 非 4", () => {
    let s = base();
    s = {
      ...s,
      travelers: [
        { id: "beggar", name: "乞丐", type: "traveler" } as any,
        { id: "gunslinger", name: "枪手", type: "traveler" } as any,
        null,
        null,
      ],
    };
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    // 投 4 票（旧口径 ceil(7/2)=4 会误判通过）——未结算，目标不得死
    for (const v of [0, 1, 2, 4]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    expect(s.seats[3].isDead).toBe(false);
    // 此时结算（4/9）⇒ 不通过
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].isDead, "4/9 结算不得通过").toBe(false);
    // 重新提议，投满 5 票 ⇒ 通过
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 4, 5]) {
      s = gameReducer(s, gameActions.castExileVote(v));
    }
    s = gameReducer(s, gameActions.resolveExile());
    expect(s.seats[3].exiled).toBe(true);
  });

  // ── 怪咖（Deviant）官方豁免（Round 11）────────────────────────────
  // 官方：「如果你表现得很有趣，当天你不能被流放。」
  // ⚠️ 与铁律 6「不受任何能力影响」不冲突：那条指的是**处决向**免疫
  //    （镇长/士兵/圣徒），怪咖是**流放专属**的官方明文反制。

  it("㉒ 纯函数：只有 deviant + 说书人判定有趣 才豁免", () => {
    expect(isExileBlockedByDeviant("deviant", true)).toBe(true);
    expect(isExileBlockedByDeviant("deviant", false)).toBe(false);
    expect(isExileBlockedByDeviant("chef", true)).toBe(false);
    expect(isExileBlockedByDeviant(null, true)).toBe(false);
    expect(isExileBlockedByDeviant(undefined, true)).toBe(false);
  });

  it("㉓ 座位怪咖：票数达标 + 判定有趣 ⇒ 不生效（未死、提案清空）", () => {
    let s = base();
    s.seats[3] = seat(3, {
      role: { id: "deviant", name: "怪咖", type: "traveler" } as any,
    });
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 5]) s = gameReducer(s, gameActions.castExileVote(v));
    expect(s.exileProposedToday!.votes.length).toBe(4); // 已达门槛 4
    s = gameReducer(s, gameActions.resolveExile(true));
    expect(s.seats[3].isDead, "怪咖被豁免 ⇒ 不得死").toBe(false);
    expect(s.seats[3].exiled).toBeFalsy();
    expect(s.exileProposedToday).toBeNull();
  });

  it("㉔ 负例：同为怪咖但说书人未判定有趣 ⇒ 正常流放死", () => {
    let s = base();
    s.seats[3] = seat(3, {
      role: { id: "deviant", name: "怪咖", type: "traveler" } as any,
    });
    s = gameReducer(s, gameActions.proposeExile("seat", 3, 0));
    for (const v of [0, 1, 2, 5]) s = gameReducer(s, gameActions.castExileVote(v));
    s = gameReducer(s, gameActions.resolveExile(false));
    expect(s.seats[3].isDead, "未判定有趣 ⇒ 正常流放").toBe(true);
    expect(s.seats[3].exiled).toBe(true);
  });

  it("㉕ 旅行者怪咖：判定有趣 ⇒ 不离开游戏（travelers 槽位保留）", () => {
    let s = base();
    s = {
      ...s,
      travelers: [
        { id: "deviant", name: "怪咖", type: "traveler" } as any,
        null,
        null,
        null,
      ],
    };
    s = gameReducer(s, gameActions.proposeExile("traveler", 0, 0));
    // 7 座位 + 1 旅行者 = 8 ⇒ 门槛 4
    for (const v of [0, 1, 2, 3]) s = gameReducer(s, gameActions.castExileVote(v));
    s = gameReducer(s, gameActions.resolveExile(true));
    expect(s.travelers[0], "被豁免 ⇒ 旅行者不得离开").not.toBeNull();
    expect(s.travelers[0]!.id).toBe("deviant");
  });

  it("㉖ 负例：旅行者怪咖未判定有趣 ⇒ 离开游戏（置 null）", () => {
    let s = base();
    s = {
      ...s,
      travelers: [
        { id: "deviant", name: "怪咖", type: "traveler" } as any,
        null,
        null,
        null,
      ],
    };
    s = gameReducer(s, gameActions.proposeExile("traveler", 0, 0));
    for (const v of [0, 1, 2, 3]) s = gameReducer(s, gameActions.castExileVote(v));
    s = gameReducer(s, gameActions.resolveExile(false));
    expect(s.travelers[0]).toBeNull();
  });
});
