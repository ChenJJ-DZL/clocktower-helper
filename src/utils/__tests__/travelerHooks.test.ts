/**
 * travelerHooks · 旅行者判据层回归测试（P0 阵营缺陷）
 * ==================================================================
 * ⭐⭐ 背景缺陷（2026-10-16）：
 *   `utils/seatAlignment.ts:66` 把 `traveler` 硬编码进 `GOOD_ROLE_TYPES`
 *   ⇒ 走 `isPlayerGood/isSeatGood` 的判定**永远把旅行者判为善良**
 *   ⇒ 替罪羊代刑对**邪恶玩家永不触发**（官方规则静默失效）。
 *
 * 本测试钉死修复后的正确语义：**旅行者阵营走 `travelerAlignments`**，
 * 与 seat 系判据彻底解耦。若有人把 `travelerScapegoatCanSubstitute`
 * 改回 `canScapegoatSubstitute`（走 isPlayerGood），下列用例会变红。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FABLED_ROLES } from "../../../app/data";
import type { Role, Seat } from "../../../app/data";
import {
  isTravelerEvil,
  travelerExecutedId,
  travelerIndexOfExecutedId,
  travelerScapegoatCanSubstitute,
  isTravelerSlotId,
  travelerSlotId,
  travelerIndexOfSlotId,
  listAliveTravelerSlots,
  hasTravelerRole,
  travelerRoleAtSlotId,
  formatVoterLabel,
  voudonAllowsVoter,
  voudonThreshold,
  voudonSkipsGhostVote,
} from "../travelerHooks";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../contexts/GameContext";
import type { GameState } from "../../contexts/GameContext";
import {
  FABLED_SEAT_ID,
  isFabledSeatId,
  checkSeatIdNamespace,
  STORYTELLER_NOMINATOR_ID,
  isStorytellerNominatorId,
} from "../fabledLock";

/** 组件层的展示标签（与 TableCenterHUD 内定义保持一致） */
const FABLED_SEAT_LABEL = `${FABLED_SEAT_ID}号位(传奇)`;

/** 构造一个最小 Role */
function mkRole(id: string): Role {
  return { id, name: id, type: "traveler" } as unknown as Role;
}

/** 构造一个最小 Seat（仅含判据所需字段） */
function mkSeat(id: number, roleType: string): Seat {
  return {
    id,
    role: { id: "x", name: "x", type: roleType } as unknown as Role,
    isDead: false,
  } as unknown as Seat;
}

const scapegoatRole = mkRole("scapegoat_traveler");
const travelers4 = [scapegoatRole, null, null, null];

describe("travelerHooks · 旅行者阵营判据（P0）", () => {
  it("① isTravelerEvil：未指定 ⇒ 默认善良；显式指定 ⇒ 按指定", () => {
    expect(isTravelerEvil(undefined, 0)).toBe(false);
    expect(isTravelerEvil(null, 0)).toBe(false);
    expect(isTravelerEvil({}, 0)).toBe(false);
    expect(isTravelerEvil({ 0: "good" }, 0)).toBe(false);
    expect(isTravelerEvil({ 0: "evil" }, 0)).toBe(true);
    // 别的槽位不影响
    expect(isTravelerEvil({ 1: "evil" }, 0)).toBe(false);
  });

  it("② ⭐ 邪恶替罪羊 + 邪恶被处决者 ⇒ 可代刑（修复前永不触发）", () => {
    const r = travelerScapegoatCanSubstitute(
      travelers4,
      mkSeat(3, "demon"),
      { 0: "evil" }
    );
    expect(r, "❌ 邪恶替罪羊应可为邪恶玩家代刑").not.toBeNull();
    expect(r?.travelerIndex).toBe(0);
  });

  it("③ 善良替罪羊 + 善良被处决者 ⇒ 可代刑", () => {
    const r = travelerScapegoatCanSubstitute(
      travelers4,
      mkSeat(3, "townsfolk"),
      { 0: "good" }
    );
    expect(r).not.toBeNull();
  });

  it("④ 邪恶替罪羊 + 善良被处决者 ⇒ 不可代刑（不同阵营）", () => {
    const r = travelerScapegoatCanSubstitute(
      travelers4,
      mkSeat(3, "townsfolk"),
      { 0: "evil" }
    );
    expect(r, "❌ 不同阵营不得代刑").toBeNull();
  });

  it("⑤ 善良替罪羊 + 邪恶被处决者 ⇒ 不可代刑（不同阵营）", () => {
    const r = travelerScapegoatCanSubstitute(
      travelers4,
      mkSeat(3, "demon"),
      { 0: "good" }
    );
    expect(r).toBeNull();
  });

  it("⑥ 默认未指定阵营 ⇒ 视为善良，不可为邪恶玩家代刑", () => {
    const r = travelerScapegoatCanSubstitute(travelers4, mkSeat(3, "minion"));
    expect(r, "❌ 默认善良不得为邪恶玩家代刑").toBeNull();
  });

  it("⑦ 无替罪羊 / 被处决者缺失 ⇒ 恒 null", () => {
    expect(travelerScapegoatCanSubstitute([null, null, null, null], mkSeat(1, "townsfolk"), {})).toBeNull();
    expect(travelerScapegoatCanSubstitute(travelers4, null, {})).toBeNull();
    expect(travelerScapegoatCanSubstitute(undefined, mkSeat(1, "townsfolk"), {})).toBeNull();
  });
});

describe("travelerHooks · 负数编码（旅行者无座位 id）", () => {
  it("⑧ 槽位 ↔ 处决记录 id 可逆，且永不与玩家座位 id（≥0）冲突", () => {
    for (let i = 0; i < 4; i++) {
      const eid = travelerExecutedId(i);
      expect(eid).toBeLessThan(0);
      expect(travelerIndexOfExecutedId(eid)).toBe(i);
    }
    // 玩家座位 id（0..14）一律判为非旅行者
    for (let s = 0; s <= 14; s++) {
      expect(travelerIndexOfExecutedId(s)).toBeNull();
    }
    expect(travelerIndexOfExecutedId(null)).toBeNull();
    expect(travelerIndexOfExecutedId(undefined)).toBeNull();
  });

  it("⑨ 插槽 id 三件套自洽：slotId ↔ index 可逆；isTravelerSlotId 只认负整数", () => {
    for (let i = 0; i < 4; i++) {
      expect(travelerIndexOfSlotId(travelerSlotId(i))).toBe(i);
      expect(isTravelerSlotId(travelerSlotId(i))).toBe(true);
    }
    // 座位 id / 非整数 / 0 一律不是旅行者插槽
    expect(isTravelerSlotId(0)).toBe(false);
    expect(isTravelerSlotId(14)).toBe(false);
    expect(isTravelerSlotId(1.5)).toBe(false);
    expect(isTravelerSlotId(-1.5)).toBe(false);
    expect(isTravelerSlotId(null)).toBe(false);
    expect(isTravelerSlotId(undefined)).toBe(false);
    expect(isTravelerSlotId("–1")).toBe(false);
  });

  it("⑩ 遍历在场旅行者：槽位为 null = 已离场，不得被计入", () => {
    const list = [mkRole("beggar"), null, mkRole("gunslinger"), null];
    const slots = listAliveTravelerSlots(list);
    expect(slots.map((t) => t.index)).toEqual([0, 2]);
    expect(slots.map((t) => t.slotId)).toEqual([-1, -3]);
    expect(slots.map((t) => t.role.id)).toEqual(["beggar", "gunslinger"]);
    // 空 / undefined 输入不得抛错
    expect(listAliveTravelerSlots(null)).toEqual([]);
    expect(listAliveTravelerSlots(undefined)).toEqual([]);
  });

  it("⑪ hasTravelerRole / travelerRoleAtSlotId：以槽位为准，不读 seats", () => {
    const list = [null, mkRole("beggar"), null, null];
    expect(hasTravelerRole(list, "beggar")).toBe(true);
    expect(hasTravelerRole(list, "gunslinger")).toBe(false);
    expect(hasTravelerRole(undefined, "beggar")).toBe(false);
    expect(travelerRoleAtSlotId(list, -2)?.id).toBe("beggar");
    expect(travelerRoleAtSlotId(list, -1)).toBeNull(); // 空槽
    expect(travelerRoleAtSlotId(list, 0)).toBeNull(); // 座位 id 不是插槽 id
  });

  it("⑫ formatVoterLabel：座位 → `N号`；旅行者 → `旅行者·角色名`（不得打印 -1号）", () => {
    const seats = [
      { id: 0, playerName: "小明" },
      { id: 1 } as any,
    ] as any[];
    const travelers = [mkRole("beggar"), null, null, null];
    expect(formatVoterLabel(0, seats, travelers)).toBe("1号(小明)");
    expect(formatVoterLabel(1, seats, travelers)).toBe("2号");
    expect(formatVoterLabel(-1, seats, travelers)).toBe("旅行者·beggar");
    // 已离场槽位：不得输出负数号
    expect(formatVoterLabel(-2, seats, travelers)).toBe("旅行者(已离场)");
  });
});

/**
 * 🥣 乞丐（Beggar）投票标记账本 —— 真实 reducer 口径
 * ==================================================================
 * 官方原文：「你只能使用投票标记才能投票。死亡的玩家可以将他的投票标记给你，
 *   如果他这么做，你会得知他的阵营。你不会中毒和醉酒。」
 */
describe("🥣 乞丐 · 投票标记账本（真实 reducer）", () => {
  const mkSeatFull = (
    id: number,
    overrides: Partial<Seat> = {}
  ): Seat =>
    ({
      id,
      role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
      isDead: false,
      hasGhostVote: false,
      ...overrides,
    }) as Seat;

  const withBeggar = (): GameState => ({
    ...getInitialState(),
    seats: [
      mkSeatFull(0, { isDead: true, hasGhostVote: true }),
      mkSeatFull(1, { isDead: true, hasGhostVote: true }),
      mkSeatFull(2, { isDead: false }),
      mkSeatFull(3, { isDead: false }),
    ],
    travelers: [mkRole("beggar"), null, null, null],
  });

  it("⑬ 初始 0 枚标记（乞丐自带 0 ⇒ 默认无法举手）", () => {
    const s = withBeggar();
    expect(s.beggarState.tokens).toBe(0);
    expect(s.beggarState.donations).toEqual([]);
  });

  it("⑭ 死亡玩家赠标记 ⇒ tokens+1 且乞丐得知其阵营（善良/邪恶各一例）", () => {
    let s = withBeggar();
    s = gameReducer(s, gameActions.giveBeggarToken(0)); // 镇民 ⇒ 善良
    expect(s.beggarState.tokens).toBe(1);
    expect(s.beggarState.donations).toEqual([
      { donorSeatId: 0, knownAlignment: "good" },
    ]);
    // 捐赠消耗捐赠者的幽灵票（单向锁存：true → false）
    expect(s.seats.find((x) => x.id === 0)!.hasGhostVote).toBe(false);

    // 换一位邪恶捐赠者
    s = { ...s, seats: s.seats.map((x) => (x.id === 1 ? { ...x, role: { id: "imp", name: "小恶魔", type: "demon" } as any } : x)) };
    s = gameReducer(s, gameActions.giveBeggarToken(1));
    expect(s.beggarState.tokens).toBe(2);
    expect(s.beggarState.donations[1]).toEqual({
      donorSeatId: 1,
      knownAlignment: "evil",
    });
  });

  it("⑮ 拒绝非法捐赠：场上无乞丐 / 捐赠者未死 / 幽灵票已用尽 / 重复捐赠", () => {
    // ① 无乞丐 ⇒ 不动
    let s: GameState = { ...withBeggar(), travelers: [null, null, null, null] };
    expect(gameReducer(s, gameActions.giveBeggarToken(0)).beggarState.tokens).toBe(0);

    // ② 捐赠者未死亡 ⇒ 不动
    s = withBeggar();
    expect(gameReducer(s, gameActions.giveBeggarToken(2)).beggarState.tokens).toBe(0);

    // ③ 捐赠者幽灵票已用尽 ⇒ 不动
    s = withBeggar();
    s = { ...s, seats: s.seats.map((x) => (x.id === 0 ? { ...x, hasGhostVote: false } : x)) };
    expect(gameReducer(s, gameActions.giveBeggarToken(0)).beggarState.tokens).toBe(0);

    // ④ 同一座位重复捐赠 ⇒ 不动（一人一枚）
    s = withBeggar();
    s = gameReducer(s, gameActions.giveBeggarToken(0));
    const again = gameReducer(s, gameActions.giveBeggarToken(0));
    expect(again.beggarState.tokens).toBe(1);
    expect(again.beggarState.donations.length).toBe(1);

    // ⑤ 座位不存在 ⇒ 不动
    s = withBeggar();
    expect(gameReducer(s, gameActions.giveBeggarToken(99)).beggarState.tokens).toBe(0);
  });

  it("⑯ 投票消耗：每次 CONSUME 减 1，且不得为负（无标记时 reduce 为 no-op）", () => {
    let s = withBeggar();
    s = gameReducer(s, gameActions.giveBeggarToken(0));
    s = gameReducer(s, gameActions.giveBeggarToken(1));
    expect(s.beggarState.tokens).toBe(2);
    s = gameReducer(s, gameActions.consumeBeggarToken());
    expect(s.beggarState.tokens).toBe(1);
    s = gameReducer(s, gameActions.consumeBeggarToken());
    expect(s.beggarState.tokens).toBe(0);
    s = gameReducer(s, gameActions.consumeBeggarToken());
    expect(s.beggarState.tokens, "不得为负").toBe(0);
    // 消耗不影响捐赠记录（乞丐"已得知的阵营"是永久信息）
    expect(s.beggarState.donations.length).toBe(2);
  });

  it("⑰ 免疫中毒醉酒：旅行者不占 seats ⇒ 毒/醉播撒路径天然无法命中", () => {
    // ① 毒一定写在**座位对象**上（抽查真实实现文件）
    for (const f of [
      "../../hooks/roleActionHandlers.ts",
      "../../roles/new_engine/pukka.ability.ts",
      "../../roles/new_engine/snake_charmer.ability.ts",
      "../../roles/new_engine/vigormortis.ability.ts",
      "../../roles/new_engine/no_dashii.ability.ts",
    ]) {
      const src = readFileSync(resolve(__dirname, f), "utf-8");
      expect(
        /isPoisoned:\s*true/.test(src),
        `${f} 应含毒播撒（若实现方式变更请同步本断言）`
      ).toBe(true);
    }
    // ② 反向：状态写入咽喉（GameContext）里，**没有任何**对 travelers 元素
    //    写 isPoisoned / isDrunk 的代码 ⇒ 乞丐（旅行者）结构性免疫
    const GC = readFileSync(
      resolve(__dirname, "../../contexts/GameContext.tsx"),
      "utf-8"
    );
    expect(GC).not.toMatch(/travelers[\s\S]{0,160}isPoisoned/);
    expect(GC).not.toMatch(/travelers[\s\S]{0,160}isDrunk/);
  });
});

/**
 * 🧙 巫毒师（Voudon）投票规则改写
 * ==================================================================
 * 官方原文：「只有你和死亡的玩家可以投票，且投票不需要使用投票标记。
 *   忽略票数需要过半的要求。」
 */
describe("🧙 巫毒师 · 投票规则改写判据", () => {
  it("⑱ voudonAllowsVoter：无巫毒师 ⇒ 人人可投；有 ⇒ 仅死亡玩家与巫毒师本人", () => {
    // 无巫毒师：常规规则，不影响既有对局
    expect(voudonAllowsVoter(false, false, false)).toBe(true);
    expect(voudonAllowsVoter(false, true, false)).toBe(true);
    // 有巫毒师
    expect(voudonAllowsVoter(true, false, false), "存活玩家不可投").toBe(false);
    expect(voudonAllowsVoter(true, true, false), "死亡玩家可投").toBe(true);
    expect(voudonAllowsVoter(true, false, true), "巫毒师本人可投").toBe(true);
    expect(voudonAllowsVoter(true, true, true)).toBe(true);
  });

  it("⑲ voudonThreshold：无巫毒师 ⇒ 常规过半；有 ⇒ 忽略过半（阈值 1）", () => {
    expect(voudonThreshold(false, 5)).toBe(5);
    expect(voudonThreshold(true, 5), "官方：忽略票数需要过半的要求").toBe(1);
    // 常规阈值本身为 1 时也不受影响
    expect(voudonThreshold(true, 1)).toBe(1);
  });

  it("⑳ voudonSkipsGhostVote：仅巫毒师在场时跳过幽灵票消耗", () => {
    expect(voudonSkipsGhostVote(false)).toBe(false);
    expect(voudonSkipsGhostVote(true), "死者投票不需要投票标记").toBe(true);
  });

  it("㉑ 源码级：三处消费点真的接了判据（防只加函数不接线）", () => {
    const MODAL = readFileSync(
      resolve(__dirname, "../../components/modals/VoteInputModal.tsx"),
      "utf-8"
    );
    // 投票名单过滤 + 门槛
    expect(MODAL).toMatch(/voudonAllowsVoter\s*\(/);
    expect(MODAL).toMatch(/voudonThreshold\s*\(/);
    const HANDLERS = readFileSync(
      resolve(__dirname, "../../hooks/useExecutionHandlers.ts"),
      "utf-8"
    );
    // 幽灵票过滤 / 消耗 / 门槛
    expect(HANDLERS).toMatch(/voudonSkipsGhostVote\s*\(/);
    expect(HANDLERS).toMatch(/voudonThreshold\s*\(/);
    expect(HANDLERS).toMatch(/hasTravelerRole\s*\(/);
  });
});

/**
 * ⚖️ 法官（Judge）每局限一次改写提名结局
 * ==================================================================
 * 官方原文：「每局游戏限一次，如果其他玩家发起了提名，你可以选择让本次提名
 *   直接执行处决或让投票无效。」
 */
describe("⚖️ 法官 · 提名介入（真实 reducer + 源码级接线）", () => {
  const base = (travelers: (Role | null)[]): GameState => ({
    ...getInitialState(),
    seats: [mkSeat(0, "townsfolk"), mkSeat(1, "townsfolk")],
    travelers,
  });

  it("㉒ MARK_JUDGE_USED：法官在场 ⇒ 整局闩锁置位；无/已离场 ⇒ no-op", () => {
    // 无法官 ⇒ no-op（不得凭空置位）
    expect(
      gameReducer(
        base([null, null, null, null]),
        gameActions.markJudgeUsed("execute")
      ).travelerHookChoices.judgeUsedThisGame
    ).toBe(false);
    // 有法官 ⇒ 置位
    let s = base([mkRole("judge"), null, null, null]);
    s = gameReducer(s, gameActions.markJudgeUsed("void"));
    expect(s.travelerHookChoices.judgeUsedThisGame).toBe(true);
    // 幂等：重复使用仍为 true，且不产生其它副作用
    const again = gameReducer(s, gameActions.markJudgeUsed("execute"));
    expect(again.travelerHookChoices.judgeUsedThisGame).toBe(true);
    expect(again.travelerHookChoices.scapegoatSubstituteForId).toBeNull();
  });

  it("㉓ 官方口径：每局限一次 —— 说书人「不使用」不置位（后续提名仍会再问）", () => {
    // 「不使用」在 UI 层直接进入投票、不派发任何 action ⇒ 状态保持未使用
    const s = base([mkRole("judge"), null, null, null]);
    expect(s.travelerHookChoices.judgeUsedThisGame).toBe(false);
  });

  it("㉔ 源码级接线：GameStage 提名后弹窗 + GameModals 裁决 + GameContext 闩锁", () => {
    const STAGE = readFileSync(
      resolve(__dirname, "../../components/game/GameStage.tsx"),
      "utf-8"
    );
    expect(STAGE, "提名后应判断法官窗口").toMatch(/TRAVELER_JUDGE_CHOICE/);
    expect(STAGE).toMatch(/judgeUsedThisGame/);
    expect(STAGE).toMatch(/listAliveTravelerSlots\s*\(/);

    const MODALS = readFileSync(
      resolve(__dirname, "../../components/game/GameModals.tsx"),
      "utf-8"
    );
    expect(MODALS).toMatch(/TRAVELER_JUDGE_CHOICE/);
    expect(MODALS).toMatch(/markJudgeUsed\s*\(/);
    expect(MODALS, "法官处决需打投票结算闩锁").toMatch(/markVoteSettled\s*\(/);

    const GC = readFileSync(
      resolve(__dirname, "../../contexts/GameContext.tsx"),
      "utf-8"
    );
    expect(GC).toMatch(/MARK_JUDGE_USED/);
  });
});

/**
 * 🥩 屠夫（Butcher）「首次处决后可再次提名」
 * ==================================================================
 * 官方原文：「每个白天，首次处决后，你可以再次发起提名。」
 * 仓库的硬门控 = `executeJudgment` 开头的「今天已经有过处决」。
 */
describe("🥩 屠夫 · 当日第二次处决（真实 reducer + 源码级接线）", () => {
  const base = (travelers: (Role | null)[]): GameState => ({
    ...getInitialState(),
    seats: [mkSeat(0, "townsfolk"), mkSeat(1, "townsfolk")],
    travelers,
  });

  it("㉕ MARK_BUTCHER_EXTRA_EXECUTION：屠夫在场 ⇒ 记录当日；不在场 ⇒ no-op；同日幂等", () => {
    // 无屠夫 ⇒ no-op
    expect(
      gameReducer(
        base([null, null, null, null]),
        gameActions.markButcherExtraExecution(2)
      ).travelerHookChoices.butcherExtraExecutionDay
    ).toBeNull();

    // 有屠夫 ⇒ 记录当前的 nightCount
    let s = base([null, mkRole("butcher"), null, null]);
    s = gameReducer(s, gameActions.markButcherExtraExecution(2));
    expect(s.travelerHookChoices.butcherExtraExecutionDay).toBe(2);
    // 同一白天再次派发 ⇒ 幂等
    const same = gameReducer(s, gameActions.markButcherExtraExecution(2));
    expect(same.travelerHookChoices.butcherExtraExecutionDay).toBe(2);
    // 新白天 ⇒ 可再次使用（每个白天各一次）
    const next = gameReducer(s, gameActions.markButcherExtraExecution(3));
    expect(next.travelerHookChoices.butcherExtraExecutionDay).toBe(3);
  });

  it("㉖ 源码级接线：executeJudgment 的「今日已处决」门控已被屠夫判据解除", () => {
    const HANDLERS = readFileSync(
      resolve(__dirname, "../../hooks/useExecutionHandlers.ts"),
      "utf-8"
    );
    // 门控仍在（无屠夫时行为不变 ⇒ 零回归）
    expect(HANDLERS).toMatch(/今天已经有过处决，不能再进行处决/);
    // 屠夫分支：在场 + 当日未用 ⇒ 放行并打标记
    expect(HANDLERS).toMatch(/hasTravelerRole\(travelers,\s*"butcher"\)/);
    expect(HANDLERS).toMatch(/MARK_BUTCHER_EXTRA_EXECUTION|markButcherExtraExecution/);
  });
});

/**
 * 🪑 三套座位号命名空间（玩家 / 旅行者 / 传奇 77）
 * ==================================================================
 * 用户裁定（2026-10-16）：传奇角色的虚拟座位号 = **77**
 *   · 玩家座位   `0 ~ 14`
 *   · 旅行者插槽 `-1 ~ -4`
 *   · 传奇角色   `77`
 * 三者永不互撞，任何"以数字 id 为键"的流程都不会串味。
 */
describe("🪑 三套座位号命名空间", () => {
  it("㉗ FABLED_SEAT_ID = 77，与玩家 0~14 与旅行者 -1~-4 两两不相等", () => {
    expect(FABLED_SEAT_ID).toBe(77);
    expect(isFabledSeatId(77)).toBe(true);
    expect(isFabledSeatId(0)).toBe(false);
    expect(isFabledSeatId(-1)).toBe(false);
    expect(FABLED_SEAT_LABEL).toContain("77");
    // 玩家 0..14 一律不是传奇位
    for (let i = 0; i < 15; i++) expect(isFabledSeatId(i)).toBe(false);
    // 三类 id 并集无重复
    const all = [
      ...Array.from({ length: 15 }, (_, i) => i),
      ...Array.from({ length: 4 }, (_, i) => travelerSlotId(i)),
      FABLED_SEAT_ID,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("㉘ checkSeatIdNamespace：冲突检查纯函数（新增虚拟 id 的守门人）", () => {
    const players = [0, 1, 2];
    const tSlots = [-1, -2];
    // 77 不落在玩家/旅行者空间 ⇒ 但它是"传奇位本身"，故 clashWithFabled 命中
    const ok = checkSeatIdNamespace([77], players, tSlots);
    expect(ok.clashWithPlayers).toEqual([]);
    expect(ok.clashWithTravelers).toEqual([]);
    expect(ok.clashWithFabled).toEqual([77]);
    // 撞玩家 id
    const p = checkSeatIdNamespace([1], players, tSlots);
    expect(p.ok).toBe(false);
    expect(p.clashWithPlayers).toEqual([1]);
    // 撞旅行者插槽
    const t = checkSeatIdNamespace([-2], players, tSlots);
    expect(t.clashWithTravelers).toEqual([-2]);
    // 完全不冲突的中间值（如新增第 4 个命名空间）
    const clean = checkSeatIdNamespace([100], players, tSlots);
    expect(clean.ok).toBe(true);
  });

  it("㉙ 源码级：传奇座位号有真实消费点（不只声明常量）", () => {
    const HUD = readFileSync(
      resolve(__dirname, "../../components/game/board/TableCenterHUD.tsx"),
      "utf-8"
    );
    expect(HUD, "传奇按钮应显示 77 号位标签").toMatch(/FABLED_SEAT_LABEL/);
    // 选/清传奇都要落日志（FABLED_SEAT_LABEL 参与日志文案）
    expect(HUD).toMatch(/虚拟座位 \$\{FABLED_SEAT_LABEL\}/);
  });
});

/**
 * 🕊️ 主教（Bishop）提名权限模型
 * ==================================================================
 * 官方原文：「**只有说书人可以发起提名**。每个白天说书人至少要提名一名
 *   你对立阵营的玩家。」
 */
describe("🕊️ 主教 · 说书人提名（第 4 个命名空间 + 源码级接线）", () => {
  it("㉚ STORYTELLER_NOMINATOR_ID = -100，且不与玩家/旅行者/传奇号冲突", () => {
    expect(STORYTELLER_NOMINATOR_ID).toBe(-100);
    expect(isStorytellerNominatorId(-100)).toBe(true);
    expect(isStorytellerNominatorId(0)).toBe(false);
    expect(isStorytellerNominatorId(-1)).toBe(false);
    expect(isStorytellerNominatorId(77)).toBe(false);
    // 四套命名空间两两不冲突
    const players = Array.from({ length: 15 }, (_, i) => i);
    const tSlots = Array.from({ length: 4 }, (_, i) => travelerSlotId(i));
    const all = [...players, ...tSlots, FABLED_SEAT_ID, STORYTELLER_NOMINATOR_ID];
    expect(new Set(all).size).toBe(all.length);
    // 说书人提名者 id 既不撞玩家、也不撞旅行者（只与自身相等）
    const r = checkSeatIdNamespace([STORYTELLER_NOMINATOR_ID], players, tSlots);
    expect(r.clashWithPlayers).toEqual([]);
    expect(r.clashWithTravelers).toEqual([]);
  });

  it("㉛ 源码级接线：提名校验（useDayActions）+ 说书人提名交互（GameStage）", () => {
    const DAY = readFileSync(
      resolve(__dirname, "../../hooks/useDayActions.ts"),
      "utf-8"
    );
    expect(DAY, "主教在场时玩家提名必须被拒").toMatch(
      /hasTravelerRole\(travelers,\s*"bishop"\)/
    );
    expect(DAY).toMatch(/isStorytellerNominatorId\s*\(/);
    expect(DAY, "非主教时不得允许说书人提名").toMatch(
      /说书人只有在主教/
    );

    const STAGE = readFileSync(
      resolve(__dirname, "../../components/game/GameStage.tsx"),
      "utf-8"
    );
    expect(STAGE).toMatch(/STORYTELLER_NOMINATOR_ID/);
    expect(STAGE, "说书人提名不得打印 -99号").toMatch(
      /isStorytellerNominatorId\(nominatorId\)/
    );
  });
});

/**
 * 🦴 集骨者（Bone Collector）暮色祝福
 * ==================================================================
 * 官方原文：「每局游戏限一次，在夜晚时*，你可以选择一名死亡的玩家：
 *   他重新获得能力直到下个黄昏。」
 */
describe("🦴 集骨者 · 死者重新获得能力（真实 reducer + 源码级接线）", () => {
  const mkDead = (id: number, dead: boolean): Seat =>
    ({
      id,
      role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
      isDead: dead,
      hasAbilityEvenDead: false,
    }) as Seat;

  const base = (travelers: (Role | null)[]): GameState => ({
    ...getInitialState(),
    seats: [mkDead(0, true), mkDead(1, false), mkDead(2, true)],
    travelers,
  });

  it("㉜ BONE_COLLECTOR_BLESS：祝福死者 ⇒ hasAbilityEvenDead=true 且整局闩锁置位", () => {
    let s = base([mkRole("bone_collector"), null, null, null]);
    s = gameReducer(s, gameActions.boneCollectorBless(0));
    expect((s.seats.find((x) => x.id === 0) as any).hasAbilityEvenDead).toBe(
      true
    );
    expect(s.travelerHookChoices.boneCollectorUsed).toBe(true);
    expect(s.travelerHookChoices.boneCollectorTargetId).toBe(0);
  });

  it("㉝ 拒绝非法祝福：无集骨者 / 目标存活 / 目标不存在 / 已用过（每局限一次）", () => {
    // ① 无集骨者 ⇒ no-op
    let s = base([null, null, null, null]);
    expect(
      gameReducer(s, gameActions.boneCollectorBless(0)).travelerHookChoices
        .boneCollectorUsed
    ).toBe(false);

    // ② 目标存活 ⇒ no-op（官方：选择一名**死亡的**玩家）
    s = base([mkRole("bone_collector"), null, null, null]);
    const alive = gameReducer(s, gameActions.boneCollectorBless(1));
    expect(alive.travelerHookChoices.boneCollectorTargetId).toBeNull();
    expect((alive.seats.find((x) => x.id === 1) as any).hasAbilityEvenDead).toBe(
      false
    );

    // ③ 目标不存在 ⇒ no-op
    expect(
      gameReducer(s, gameActions.boneCollectorBless(99)).travelerHookChoices
        .boneCollectorTargetId
    ).toBeNull();

    // ④ 已用过 ⇒ 第二次祝福无效（每局游戏限一次）
    s = gameReducer(s, gameActions.boneCollectorBless(0));
    const second = gameReducer(s, gameActions.boneCollectorBless(2));
    expect(second.travelerHookChoices.boneCollectorTargetId, "不得改目标").toBe(0);
    expect((second.seats.find((x) => x.id === 2) as any).hasAbilityEvenDead).toBe(
      false
    );
  });

  it("㉞ CLEAR_BONE_COLLECTOR_BLESSING：只撤销临时效果，不解除每局限一次", () => {
    let s = base([mkRole("bone_collector"), null, null, null]);
    s = gameReducer(s, gameActions.boneCollectorBless(2));
    s = gameReducer(s, gameActions.clearBoneCollectorBlessing());
    expect((s.seats.find((x) => x.id === 2) as any).hasAbilityEvenDead).toBe(
      false
    );
    expect(s.travelerHookChoices.boneCollectorTargetId).toBeNull();
    expect(s.travelerHookChoices.boneCollectorUsed, "每局限一次仍生效").toBe(
      true
    );
    // 空祝福时清理 = no-op
    const again = gameReducer(s, gameActions.clearBoneCollectorBlessing());
    expect(again.travelerHookChoices.boneCollectorUsed).toBe(true);
  });

  it("㉟ 源码级接线：暮色面板可选死者 + 下个暮色撤销", () => {
    const PANEL = readFileSync(
      resolve(__dirname, "../../components/game/TwilightPanel.tsx"),
      "utf-8"
    );
    expect(PANEL).toMatch(/BONE_COLLECTOR_BLESS/);
    expect(PANEL).toMatch(/boneCollectorUsed/);
    const FLOW = readFileSync(
      resolve(__dirname, "../../hooks/useGameFlow.ts"),
      "utf-8"
    );
    expect(FLOW, "进入暮色必须撤销上一轮祝福").toMatch(
      /clearBoneCollectorBlessing\s*\(/
    );
  });
});

/**
 * ☕ 咖啡师（Barista）—— 解除并免疫毒醉 / 能力两次
 * ==================================================================
 * 官方原文：「每个夜晚，直至下个黄昏，由说书人二选一：1）一名玩家解除并免受
 *   醉酒和中毒影响，且会得知正确信息；2）一名玩家的能力可以生效两次。」
 */
describe("☕ 咖啡师 + 🌙 流莺（真实 reducer + 源码级接线）", () => {
  const mk = (id: number, over: Partial<Seat> = {}): Seat =>
    ({
      id,
      role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
      isDead: false,
      isPoisoned: false,
      isDrunk: false,
      ...over,
    }) as Seat;

  const base = (travelers: (Role | null)[]): GameState => ({
    ...getInitialState(),
    seats: [mk(0, { isPoisoned: true, isDrunk: true }), mk(1), mk(2)],
    travelers,
  });

  it("㊱ SET_BARISTA_EFFECT('clear')：解除毒醉 + 打免疫标记（信息正确的真实来源）", () => {
    let s = base([mkRole("barista"), null, null, null]);
    s = gameReducer(s, gameActions.setBaristaEffect(0, "clear"));
    const t = s.seats.find((x) => x.id === 0) as any;
    expect(t.isPoisoned).toBe(false);
    expect(t.isDrunk).toBe(false);
    expect(t.baristaCleared).toBe(true);
    expect(s.travelerHookChoices.baristaTargetId).toBe(0);
    expect(s.travelerHookChoices.baristaEffect).toBe("clear");
  });

  it("㊲ SET_BARISTA_EFFECT('double')：打双次标记；无咖啡师 ⇒ 全部 no-op", () => {
    let s = base([mkRole("barista"), null, null, null]);
    s = gameReducer(s, gameActions.setBaristaEffect(1, "double"));
    expect((s.seats.find((x) => x.id === 1) as any).baristaDouble).toBe(true);
    expect(s.travelerHookChoices.baristaEffect).toBe("double");

    // 无咖啡师 ⇒ no-op
    const noB = gameReducer(
      base([null, null, null, null]),
      gameActions.setBaristaEffect(0, "clear")
    );
    expect(noB.travelerHookChoices.baristaTargetId).toBeNull();
    expect((noB.seats.find((x) => x.id === 0) as any).baristaCleared).toBe(
      undefined
    );
  });

  it("㊳ CLEAR_BARISTA_EFFECT：撤销两个标记（官方「直至下个黄昏」）", () => {
    let s = base([mkRole("barista"), null, null, null]);
    s = gameReducer(s, gameActions.setBaristaEffect(0, "clear"));
    s = gameReducer(s, gameActions.clearBaristaEffect());
    const t = s.seats.find((x) => x.id === 0) as any;
    expect(t.baristaCleared).toBe(false);
    expect(t.baristaDouble).toBe(false);
    expect(s.travelerHookChoices.baristaTargetId).toBeNull();
    expect(s.travelerHookChoices.baristaEffect).toBeNull();
  });

  it("㊴ SET_HARLOT_OUTCOME：记录目标/同意/双死；无流莺 ⇒ no-op", () => {
    let s = base([mkRole("harlot"), null, null, null]);
    s = gameReducer(s, gameActions.setHarlotOutcome(1, { agreed: true }));
    expect(s.travelerHookChoices.harlotTargetId).toBe(1);
    expect(s.travelerHookChoices.harlotAgreed).toBe(true);
    expect(s.travelerHookChoices.harlotDoomed).toBe(false);
    s = gameReducer(s, gameActions.setHarlotOutcome(1, { doomed: true }));
    expect(s.travelerHookChoices.harlotDoomed).toBe(true);

    const noH = gameReducer(
      base([null, null, null, null]),
      gameActions.setHarlotOutcome(1, { agreed: true })
    );
    expect(noH.travelerHookChoices.harlotTargetId).toBeNull();
  });

  it("㊵ 源码级接线：免疫判据双读点 + 面板接线 + 下个暮色撤销", () => {
    const RULES = readFileSync(
      resolve(__dirname, "../gameRules.ts"),
      "utf-8"
    );
    // isBaristaCleared 定义 1 处 + 被两个权威判据各调用 1 次
    expect(RULES.match(/isBaristaCleared\s*\(/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3
    );
    const PANEL = readFileSync(
      resolve(__dirname, "../../components/game/TwilightPanel.tsx"),
      "utf-8"
    );
    expect(PANEL).toMatch(/SET_BARISTA_EFFECT/);
    expect(PANEL).toMatch(/SET_HARLOT_OUTCOME/);
    expect(PANEL, "流莺双死必须走 killPlayer").toMatch(/killPlayer/);
    const FLOW = readFileSync(
      resolve(__dirname, "../../hooks/useGameFlow.ts"),
      "utf-8"
    );
    expect(FLOW).toMatch(/clearBaristaEffect\s*\(/);
  });

  it("㊶ SET_APPRENTICE_ROLE：记录首夜获得的能力；再点同角色 = 取消；无学徒 ⇒ no-op", () => {
    const mkT = (tv: (Role | null)[]): GameState => ({
      ...getInitialState(),
      seats: [mk(0), mk(1)],
      travelers: tv,
    });
    let s = mkT([mkRole("apprentice"), null, null, null]);
    s = gameReducer(s, gameActions.setApprenticeGrantedRole("chef"));
    expect(s.travelerHookChoices.apprenticeGrantedRoleId).toBe("chef");
    // 再点同一角色 ⇒ 取消（可反悔）
    s = gameReducer(s, gameActions.setApprenticeGrantedRole("chef"));
    expect(s.travelerHookChoices.apprenticeGrantedRoleId).toBeNull();
    // 换一个角色 ⇒ 替换
    s = gameReducer(s, gameActions.setApprenticeGrantedRole("empath"));
    expect(s.travelerHookChoices.apprenticeGrantedRoleId).toBe("empath");
    // 无学徒 ⇒ no-op
    const noA = gameReducer(
      mkT([null, null, null, null]),
      gameActions.setApprenticeGrantedRole("chef")
    );
    expect(noA.travelerHookChoices.apprenticeGrantedRoleId).toBeNull();
  });
});

/**
 * 🪑 女舍监（Matron）座位交换
 * ==================================================================
 * 官方原文：「每个白天，你可以选择至多三对玩家交换座位。玩家不能离开座位私聊。」
 */
describe("🪑 女舍监 · 座位交换（真实 reducer + 源码级接线）", () => {
  const mkP = (id: number, name: string, roleId: string): Seat =>
    ({
      id,
      playerName: name,
      role: { id: roleId, name: roleId, type: "townsfolk" } as any,
      isDead: false,
    }) as Seat;

  const base = (travelers: (Role | null)[]): GameState => ({
    ...getInitialState(),
    seats: [mkP(0, "甲", "chef"), mkP(1, "乙", "empath"), mkP(2, "丙", "soldier")],
    travelers,
  });

  it("㊷ MATRON_SWAP：内容互换但 id 保留（= 两人换了物理座位）", () => {
    let s = base([mkRole("matron"), null, null, null]);
    s = gameReducer(s, gameActions.matronSwap(0, 2));
    const s0 = s.seats.find((x) => x.id === 0)!;
    const s2 = s.seats.find((x) => x.id === 2)!;
    // 座位 0 现在坐着「丙 / soldier」，座位 2 坐着「甲 / chef」
    expect(s0.id).toBe(0);
    expect(s0.playerName).toBe("丙");
    expect((s0.role as any).id).toBe("soldier");
    expect(s2.id).toBe(2);
    expect(s2.playerName).toBe("甲");
    expect((s2.role as any).id).toBe("chef");
    expect(s.travelerHookChoices.matronSwaps).toEqual([{ a: 0, b: 2 }]);
  });

  it("㊸ 拒绝非法换座：无女舍监 / 同一座位 / 座位不存在 / 超出三对", () => {
    // ① 无女舍监 ⇒ no-op
    let s = base([null, null, null, null]);
    const noM = gameReducer(s, gameActions.matronSwap(0, 1));
    expect(noM.travelerHookChoices.matronSwaps).toEqual([]);
    expect(noM.seats.find((x) => x.id === 0)!.playerName).toBe("甲");

    // ② 同一座位 ⇒ no-op
    s = base([mkRole("matron"), null, null, null]);
    expect(
      gameReducer(s, gameActions.matronSwap(1, 1)).travelerHookChoices.matronSwaps
    ).toEqual([]);

    // ③ 座位不存在 ⇒ no-op
    expect(
      gameReducer(s, gameActions.matronSwap(0, 99)).travelerHookChoices
        .matronSwaps
    ).toEqual([]);

    // ④ 官方「至多三对」：第 4 对必须被拒
    s = gameReducer(s, gameActions.matronSwap(0, 1));
    s = gameReducer(s, gameActions.matronSwap(0, 2));
    s = gameReducer(s, gameActions.matronSwap(1, 2));
    expect(s.travelerHookChoices.matronSwaps.length).toBe(3);
    const fourth = gameReducer(s, gameActions.matronSwap(0, 1));
    expect(fourth.travelerHookChoices.matronSwaps.length, "第 4 对应被拒").toBe(3);
  });

  it("㊹ CLEAR_MATRON_SWAPS：新白天清空额度", () => {
    let s = base([mkRole("matron"), null, null, null]);
    s = gameReducer(s, gameActions.matronSwap(0, 1));
    s = gameReducer(s, gameActions.clearMatronSwaps());
    expect(s.travelerHookChoices.matronSwaps).toEqual([]);
    // 清空后可以再用三对
    s = gameReducer(s, gameActions.matronSwap(0, 1));
    expect(s.travelerHookChoices.matronSwaps.length).toBe(1);
  });

  it("㊺ 源码级接线：HUD 换座面板 + 新白天重置额度", () => {
    const HUD = readFileSync(
      resolve(__dirname, "../../components/game/board/TableCenterHUD.tsx"),
      "utf-8"
    );
    expect(HUD).toMatch(/matronSwap\s*\(/);
    expect(HUD).toMatch(/matronSwaps/);
    const FLOW = readFileSync(
      resolve(__dirname, "../../hooks/useGameFlow.ts"),
      "utf-8"
    );
    expect(FLOW, "新白天必须重置换座额度").toMatch(/clearMatronSwaps\s*\(/);
  });
});

/**
 * 🎴 传奇角色（Fabled）说书人状态
 * ==================================================================
 * 官方 legendary 全量 14 个（`FABLED_ROLES`）。传奇**不占座位、不入夜序**，
 * 裁定权在说书人 ⇒ 统一走 `state.fabledState` + `FabledPanel`。
 * 其中**摆渡人是唯一有真实状态效果**的（最后一天重置死者幽灵票）。
 */
describe("🎴 传奇角色 · 说书人状态与摆渡人真实效果", () => {
  const mkDeadSeat = (id: number, dead: boolean, ghost: boolean): Seat =>
    ({
      id,
      role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
      isDead: dead,
      hasGhostVote: ghost,
    }) as Seat;

  const withFabled = (
    fabledId: string | null,
    seats: Seat[]
  ): GameState => ({
    ...getInitialState(),
    seats,
    activeFabled: fabledId
      ? ([{ id: fabledId, name: fabledId, type: "fabled" }] as any)
      : [],
  });

  it("㊻ FERRYMAN_LAST_DAY：无摆渡人 no-op；有 ⇒ 所有死者重获投票标记（幂等）", () => {
    const seats = [
      mkDeadSeat(0, true, false),
      mkDeadSeat(1, true, true),
      mkDeadSeat(2, false, false),
    ];
    // ① 无摆渡人 ⇒ 死者票不回补
    const noF = gameReducer(
      withFabled(null, seats),
      gameActions.ferrymanLastDay()
    );
    expect(noF.seats.find((x) => x.id === 0)!.hasGhostVote).toBe(false);

    // ② 有摆渡人 ⇒ 所有死者 hasGhostVote = true（官方对单向锁存的合法豁免）
    let s = gameReducer(withFabled("ferryman", seats), gameActions.ferrymanLastDay());
    expect(s.seats.find((x) => x.id === 0)!.hasGhostVote).toBe(true);
    expect(s.seats.find((x) => x.id === 1)!.hasGhostVote).toBe(true);
    // 活人不被改动
    expect(s.seats.find((x) => x.id === 2)!.hasGhostVote).toBe(false);
    expect(s.fabledState.ferrymanLastDayResolved).toBe(true);

    // ③ 幂等：已结算 ⇒ no-op
    const again = gameReducer(s, gameActions.ferrymanLastDay());
    expect(again.fabledState.ferrymanLastDayResolved).toBe(true);
  });

  it("㊼ SET_FABLED_STATE：部分更新（只改传入字段，其余保持）", () => {
    let s = withFabled("fibbin", [mkDeadSeat(0, false, false)]);
    expect(s.fabledState.fibbinUsed).toBe(false);
    s = gameReducer(
      s,
      gameActions.setFabledState({ fibbinUsed: true, fibbinTargetId: 0 })
    );
    expect(s.fabledState.fibbinUsed).toBe(true);
    expect(s.fabledState.fibbinTargetId).toBe(0);
    // 未传字段不受影响
    expect(s.fabledState.toymakerAttackSkipped).toBe(false);
    expect(s.fabledState.sentinelOutsiderDelta).toBe(0);
  });

  it("㊽ 官方 legendary 全量 14 个，且新增 4 个（toymaker/fiddler/duchess/djinn）已登记", () => {
    expect(FABLED_ROLES).toHaveLength(14);
    for (const id of ["toymaker", "fiddler", "duchess", "djinn"]) {
      expect(
        FABLED_ROLES.some((r) => r.id === id),
        `${id} 应在 FABLED_ROLES`
      ).toBe(true);
    }
    // 全部 type === fabled（传奇不占座位）
    expect(FABLED_ROLES.every((r) => r.type === "fabled")).toBe(true);
  });

  it("㊾ 源码级接线：FabledPanel 覆盖全部传奇角色分支 + 挂载在 HUD", () => {
    const PANEL = readFileSync(
      resolve(__dirname, "../../components/game/FabledPanel.tsx"),
      "utf-8"
    );
    for (const id of [
      "ferryman",
      "toymaker",
      "fibbin",
      "angel",
      "revolutionary",
      "sentinel",
      "spirit_of_ivory",
      "buddhist",
      "fiddler",
      "duchess",
      "djinn",
    ]) {
      expect(PANEL, `FabledPanel 应有 ${id} 分支`).toContain(`"${id}"`);
    }
    expect(PANEL).toMatch(/FERRYMAN_LAST_DAY|ferrymanLastDay/);
    const HUD = readFileSync(
      resolve(__dirname, "../../components/game/board/TableCenterHUD.tsx"),
      "utf-8"
    );
    expect(HUD).toMatch(/FabledPanel/);
  });
});
