/**
 * 终局原因码 · 覆盖棘轮矩阵（2026-11-01 P0 防线）
 * ======================================================================
 * 目的：`utils/winConditions/winReasonCodes.ts::ALL_WIN_REASON_CODES` 的**每个** code
 *       都必须有：
 *         · 至少 1 个**正例** —— 真实经由 `checkGameEnd` 返回该 code；
 *         · 至少 1 个**近似反例** —— 构造差一点的条件，断言不返回该 code。
 *       注册表新增 code 却不补场景 ⇒ 本文件立刻变红（覆盖棘轮）。
 *
 * 全部正/反例都真实调用 `app/gameLogic.ts::checkGameEnd`；
 * `Record<WinReasonCode, …>` 类型同时保证「注册表新增 code 必须在这里登记」。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { checkGameEnd, type GameEndResult } from "../../../app/gameLogic";
import {
  ALL_WIN_REASON_CODES,
  findMissingWinEvidence,
  WIN_REASON_META,
  type WinReasonCode,
} from "../winConditions/winReasonCodes";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(
  id: number,
  roleId: string,
  over: Record<string, unknown> = {}
): any {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

/** 手工角色（goblin 不在 app/data 的角色注册表内，但 checkGameEnd 按 role.id 判定） */
const GOBLIN = { id: "goblin", name: "地精", type: "minion" } as any;
function goblinSeat(id: number, over: Record<string, unknown> = {}): any {
  return { ...seat(id, "chef"), ...over, role: GOBLIN };
}

const dead = (s: any) => ({ ...s, isDead: true });

/** 通用 5 人盘（1 恶魔 + 4 好人，人数远离 2 人阈值 / 无镇长） */
function baseBoard(): any[] {
  return [
    seat(0, "imp"),
    seat(1, "chef"),
    seat(2, "soldier"),
    seat(3, "pixie"),
    seat(4, "drunk"),
  ];
}

interface CodeCase {
  label: string;
  /** 正例：必须返回对应 code */
  positive: () => GameEndResult;
  /** 近似反例：条件差一点，不得返回对应 code */
  negative: () => GameEndResult;
}

const CASES: Record<WinReasonCode, CodeCase> = {
  DAMSEL_GUESSED: {
    label: "落难少女被猜中",
    positive: () =>
      checkGameEnd(baseBoard(), "check_phase", null, { damselGuessed: true }),
    negative: () => checkGameEnd(baseBoard(), "check_phase", null, {}),
  },
  KLUTZ_GUESSED_EVIL: {
    label: "呆瓜猜测邪恶",
    positive: () =>
      checkGameEnd(baseBoard(), "check_phase", null, {
        klutzGuessedEvil: true,
      }),
    negative: () => checkGameEnd(baseBoard(), "check_phase", null, {}),
  },
  SCRIPT_AUTO_EVIL_WIN: {
    label: "剧本级固定天数自动获胜",
    positive: () =>
      checkGameEnd(baseBoard(), "check_phase", null, {
        scriptSpecialRules: { evilAutoWinOnEnteringNight: 3 },
        nightCount: 4, // 进入第 N+1 夜 = 触发
      }),
    negative: () =>
      checkGameEnd(baseBoard(), "check_phase", null, {
        scriptSpecialRules: { evilAutoWinOnEnteringNight: 3 },
        nightCount: 3, // 还差一夜
      }),
  },
  LEGION_ALL_DEAD: {
    label: "军团全灭",
    positive: () =>
      checkGameEnd(
        [
          dead(seat(0, "legion")),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "legion"), // 军团仍存活 ⇒ 未全灭
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        {}
      ),
  },
  DEMON_ALL_DEAD: {
    label: "恶魔全灭",
    positive: () =>
      checkGameEnd(
        [
          dead(seat(0, "imp")),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () => checkGameEnd(baseBoard(), "check_phase", null, {}),
  },
  SAINT_EXECUTED: {
    label: "圣徒被处决",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(seat(1, "saint")),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(seat(1, "saint", { isDrunk: true })), // 圣徒醉酒 ⇒ 能力失效
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
  },
  SAINT_CONVERTED_EXECUTED: {
    label: "被转为邪恶的圣徒被处决 ⇒ 其阵营落败（善良胜）",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(seat(1, "saint", { isEvilConverted: true })), // 圣徒已被转为邪恶
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
    negative: () =>
      // 差一点：圣徒未被转化 ⇒ 返回 SAINT_EXECUTED（邪恶胜），不是本 code
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(seat(1, "saint")),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
  },
  GOBLIN_EXECUTED: {
    label: "地精被处决",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(goblinSeat(1)),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          dead(goblinSeat(1, { isPoisoned: true })), // 地精中毒 ⇒ 能力失效
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        1,
        {}
      ),
  },
  GOOD_TWIN_EXECUTED: {
    label: "善良双子被处决（权威配对）",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "evil_twin"),
          seat(1, "imp"),
          dead(seat(2, "librarian")), // 善良双子
          seat(3, "chef"),
          seat(4, "soldier"),
        ],
        "execution",
        2,
        { evilTwinPair: { evilId: 0, goodId: 2 } }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "evil_twin", { isPoisoned: true }), // 双子中毒 ⇒ 能力失效
          seat(1, "imp"),
          dead(seat(2, "librarian")),
          seat(3, "chef"),
          seat(4, "soldier"),
        ],
        "execution",
        2,
        { evilTwinPair: { evilId: 0, goodId: 2 } }
      ),
  },
  MAYOR_PEACEFUL_WIN: {
    label: "镇长和平获胜（恰好 3 人存活 + 无人被处决）",
    positive: () =>
      checkGameEnd(
        [seat(0, "mayor"), seat(1, "soldier"), seat(2, "imp")],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      // 差一点：本白天发生了处决（有人死亡）⇒ 镇长条件不成立
      checkGameEnd(
        [seat(0, "mayor"), dead(seat(1, "soldier")), seat(2, "imp")],
        "execution",
        1,
        {}
      ),
  },
  MAYOR_CONVERTED_PEACEFUL_WIN: {
    label: "被转为邪恶的镇长触发和平获胜 ⇒ 邪恶胜",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "mayor", { isEvilConverted: true }),
          seat(1, "soldier"),
          seat(2, "imp"),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      // 差一点：镇长未被转化 ⇒ 返回 MAYOR_PEACEFUL_WIN（善良胜），不是本 code
      checkGameEnd(
        [seat(0, "mayor"), seat(1, "soldier"), seat(2, "imp")],
        "check_phase",
        null,
        {}
      ),
  },
  LEGION_THRESHOLD: {
    label: "军团人数阈值",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "legion"),
          seat(1, "soldier"), // 存活善良仅 1 人
          dead(seat(2, "chef")),
          dead(seat(3, "pixie")),
          dead(seat(4, "drunk")),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "legion"),
          seat(1, "soldier"),
          seat(2, "chef"), // 存活善良 4 人 ⇒ 未到阈值
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        {}
      ),
  },
  ONLY_EVIL_ALIVE: {
    label: "存活者全为邪恶",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "cerenovus"),
          seat(2, "baron"),
          dead(seat(3, "soldier")),
          dead(seat(4, "chef")),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "cerenovus"),
          seat(2, "baron"),
          seat(3, "soldier"), // 还有 1 名善良存活 ⇒ 不属于「全邪恶」
          dead(seat(4, "chef")),
        ],
        "check_phase",
        null,
        {}
      ),
  },
  TWO_ALIVE: {
    label: "仅剩 2 人存活",
    positive: () =>
      checkGameEnd(
        [seat(0, "soldier"), seat(1, "imp")],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      checkGameEnd(
        [seat(0, "soldier"), seat(1, "chef"), seat(2, "imp")],
        "check_phase",
        null,
        {}
      ),
  },
  VORTOX_NO_EXECUTION: {
    label: "涡流：白天无人被处决",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "vortox"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        {}
      ),
    negative: () =>
      // 差一点：本白天已有人被处决
      checkGameEnd(
        [
          seat(0, "vortox"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        { todayHasExecution: true }
      ),
  },
  MASTERMIND_EXTRA_DAY_NO_EXECUTION: {
    label: "主谋额外一天：无人被处决 ⇒ 善良胜",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "mastermind"),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        null,
        { isMastermindExtraDay: true }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "mastermind"),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
        ],
        "execution",
        null,
        { isMastermindExtraDay: false } // 不是额外那个白天
      ),
  },
  MASTERMIND_EXECUTION_GOOD_WINS: {
    label: "主谋额外一天：处决邪恶玩家 ⇒ 善良胜",
    positive: () =>
      checkGameEnd(
        [
          dead(seat(0, "po")),
          seat(1, "mastermind"),
          dead(seat(2, "godfather")),
          seat(3, "chef"),
          seat(4, "soldier"),
        ],
        "execution",
        2,
        { isMastermindExtraDay: true }
      ),
    negative: () =>
      checkGameEnd(
        [
          dead(seat(0, "po")),
          seat(1, "mastermind"),
          dead(seat(2, "godfather")),
          seat(3, "chef"),
          seat(4, "soldier"),
        ],
        "execution",
        2,
        { isMastermindExtraDay: false }
      ),
  },
  MASTERMIND_EXECUTION_EVIL_WINS: {
    label: "主谋额外一天：处决善良玩家 ⇒ 邪恶胜",
    positive: () =>
      checkGameEnd(
        [
          dead(seat(0, "po")),
          seat(1, "mastermind"),
          seat(2, "godfather"),
          dead(seat(3, "chef")),
          seat(4, "soldier"),
        ],
        "execution",
        3,
        { isMastermindExtraDay: true }
      ),
    negative: () =>
      checkGameEnd(
        [
          dead(seat(0, "po")),
          seat(1, "mastermind"),
          seat(2, "godfather"),
          dead(seat(3, "chef")),
          seat(4, "soldier"),
        ],
        "execution",
        3,
        { isMastermindExtraDay: false }
      ),
  },
  LEVIATHAN_EXECUTIONS: {
    label: "利维坦：多于一名善良玩家被处决",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "leviathan"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        { goodExecutionsCount: 2 }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "leviathan"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        { goodExecutionsCount: 1 } // 恰好一名 ⇒ 未触发
      ),
  },
  LEVIATHAN_DAY5: {
    label: "利维坦：第五个白天结束仍存活",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "leviathan"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        { leviathanDay: 5 }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "leviathan"),
          seat(1, "chef"),
          seat(2, "soldier"),
          seat(3, "pixie"),
          seat(4, "drunk"),
        ],
        "check_phase",
        null,
        { leviathanDay: 4 } // 差一个白天
      ),
  },
  FEARMONGER_TARGET_EXECUTED: {
    label: "恐惧之灵选定目标被处决",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "fearmonger"),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
          dead(seat(5, "butler")), // 被选定的目标
        ],
        "execution",
        5,
        { fearmongerTargetId: 5, fearmongerNominated: true }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "fearmonger"),
          seat(2, "chef"),
          seat(3, "soldier"),
          seat(4, "pixie"),
          dead(seat(5, "butler")),
        ],
        "execution",
        5,
        { fearmongerTargetId: 5, fearmongerNominated: false } // 差一点：未被提名
      ),
  },
  ATHEIST_STORYTELLER_EXECUTED: {
    label: "无神论者：说书人被处决且无神论者不在场",
    positive: () =>
      checkGameEnd(baseBoard(), "check_phase", null, {
        storytellerExecuted: true,
        atheistPresent: false,
      }),
    negative: () =>
      checkGameEnd(baseBoard(), "check_phase", null, {
        storytellerExecuted: true,
        atheistPresent: true, // 无神论者在场 ⇒ 条件不成立
      }),
  },
  GRANDMOTHER_GRANDCHILD_EXECUTED: {
    label: "祖母的孙子被处决（利维坦剧本特殊判据）",
    positive: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "leviathan"),
          seat(2, "grandmother"),
          dead(seat(3, "butler")), // 孙子
          seat(4, "chef"),
          seat(5, "soldier"),
        ],
        "execution",
        3,
        { grandmotherGrandchildId: 3 }
      ),
    negative: () =>
      checkGameEnd(
        [
          seat(0, "imp"),
          seat(1, "leviathan"),
          seat(2, "grandmother"),
          dead(seat(3, "butler")),
          seat(4, "chef"),
          seat(5, "soldier"),
        ],
        "execution",
        3,
        { grandmotherGrandchildId: null } // 差一点：未记录孙子
      ),
  },
};

describe("🏁 终局原因码覆盖矩阵（正例 + 近似反例）", () => {
  it("注册表自检：ALL_WIN_REASON_CODES 与 WIN_REASON_META 键完全一致且无重复", () => {
    expect(ALL_WIN_REASON_CODES).toEqual(
      Object.keys(WIN_REASON_META) as WinReasonCode[]
    );
    expect(new Set(ALL_WIN_REASON_CODES).size).toBe(
      ALL_WIN_REASON_CODES.length
    );
    expect(ALL_WIN_REASON_CODES.length).toBeGreaterThan(0);
  });

  it.each(
    ALL_WIN_REASON_CODES
  )("正例 · %s：checkGameEnd 必须真实返回该 code（胜方/证据齐全）", (code) => {
    const c = CASES[code];
    const res = c.positive();

    expect(res.isGameOver, `${code}（${c.label}）正例未判终局`).toBe(true);
    expect(
      res.reasonCode,
      `${code}（${c.label}）正例返回了其它 code：${res.reasonCode} / ${res.reason}`
    ).toBe(code);
    expect(
      res.winner,
      `${code} 的 winner 必须等于注册表 side=${WIN_REASON_META[code].side}`
    ).toBe(WIN_REASON_META[code].side);
    expect(
      findMissingWinEvidence(code, res.evidence),
      `${code} 正例的证据缺少注册表 requiredEvidence 字段`
    ).toEqual([]);
  });

  it.each(
    ALL_WIN_REASON_CODES
  )("近似反例 · %s：差一点的条件不得返回该 code", (code) => {
    const c = CASES[code];
    const res = c.negative();
    expect(
      res.reasonCode,
      `${code}（${c.label}）近似反例不该返回该 code，实际：${res.reasonCode} / ${res.reason}`
    ).not.toBe(code);
  });

  it("⭐ 覆盖棘轮：注册表里每个 code 都出现在「正例集合」中（新增 code 不补场景即红）", () => {
    const positives = new Set<WinReasonCode>();
    const actual: string[] = [];
    for (const code of ALL_WIN_REASON_CODES) {
      const res = CASES[code].positive();
      if (res.reasonCode) positives.add(res.reasonCode);
      actual.push(`${code} → ${res.reasonCode ?? "(null)"}`);
    }

    const missing = ALL_WIN_REASON_CODES.filter((c) => !positives.has(c));
    expect(
      missing,
      "以下 reasonCode 没有可真实触发的正例（可能是死代码或场景缺失）：\n" +
        `  缺失：${missing.join(", ")}\n` +
        `  正例实际返回：\n    ${actual.join("\n    ")}`
    ).toEqual([]);

    // 反向检查：正例集合不得出现注册表之外/重复的 code（Record 类型已锁定，
    // 这里再断言运行时集合与注册表等势，防「两个 code 共用一个正例」漏覆盖）。
    expect([...positives].sort()).toEqual([...ALL_WIN_REASON_CODES].sort());
  });
});
