import { beforeEach, describe, expect, it } from "vitest";
import {
  TEXT_FAKE_FALLBACK,
  buildCorruptedInfoMask,
  discardDisguisedSideEffects,
  ensureNotTruth,
  isDisguisedIneffectiveActor,
  isPlayerInfoCorrupted,
  resetStorytellerInfoOverrides,
  setStorytellerInfoOverrides,
} from "../corruptedInfo";

/**
 * P0：受干扰（中毒/醉酒/涡流）与伪装身份（酒鬼/提线木偶）的玩家视角假值校验层。
 *
 * 用户实测两个 bug：① 酒鬼厨师结果页给出真值；② 提线木偶伪装赏金猎人拿到正确结果。
 * 根因相同：新引擎链路只打「受干扰」标记、不做假值替换（假值替换只在 legacy
 * utils/nightLogic.ts 里）。本测试守住"绝不允许没假值就显示真值"。
 */

const SEATS = [0, 1, 2, 3, 4, 5, 6];

beforeEach(() => resetStorytellerInfoOverrides());

describe("① 提线木偶伪装赏金猎人：玩家结果 != 真值，且假目标 != 真实被转邪恶的镇民", () => {
  const marionetteSeat = {
    id: 1,
    role: { id: "marionette", name: "提线木偶", type: "minion" },
    charadeRole: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
  };
  const REAL_EVIL_TOWNSFOLK = 4; // 引擎真正转成邪恶的镇民座位

  it("受干扰判定成立（酒鬼/提线木偶一律算受干扰）", () => {
    expect(isDisguisedIneffectiveActor(marionetteSeat)).toBe(true);
    expect(
      isPlayerInfoCorrupted({
        roleId: "bounty_hunter",
        actorSeat: marionetteSeat,
        roleIsInformation: true,
      })
    ).toBe(true);
  });

  it("(a)(b) 玩家视角结果 != 引擎真值，且假目标姓氏与真值不同", () => {
    const truth = `${REAL_EVIL_TOWNSFOLK + 1}号玩家是邪恶的`;
    const mask = buildCorruptedInfoMask({
      roleId: "bounty_hunter",
      roleName: "赏金猎人",
      truthText: truth,
      trueValue: [REAL_EVIL_TOWNSFOLK],
      actorSeatId: 1,
      nightCount: 1,
      candidateSeatIds: SEATS.filter((id) => id !== 1),
      targetCount: 1,
    });
    expect(mask.playerText).not.toBe(truth);
    expect(mask.playerText).not.toContain(`${REAL_EVIL_TOWNSFOLK + 1}号`);
    expect(mask.playerText).toMatch(/[0-9]号玩家是邪恶的/);
    expect(mask.truthText).toBe(truth);
  });

  it("(c) 说书人设定值优先：赏金猎人指向 2号 时玩家看到的就是 2号（但仍是假值）", () => {
    setStorytellerInfoOverrides({ bounty_hunter: [2] });
    const mask = buildCorruptedInfoMask({
      roleId: "bounty_hunter",
      roleName: "赏金猎人",
      truthText: "5号玩家是邪恶的",
      trueValue: [REAL_EVIL_TOWNSFOLK],
      actorSeatId: 1,
      nightCount: 1,
      candidateSeatIds: SEATS,
      targetCount: 1,
    });
    expect(mask.source).toBe("storyteller");
    expect(mask.playerText).toBe("3号玩家是邪恶的");
    expect(mask.playerText).not.toBe("5号玩家是邪恶的");
  });

  it("(d) 结果文案里不出现「提线木偶/伪装/真实身份」等字样", () => {
    const mask = buildCorruptedInfoMask({
      roleId: "bounty_hunter",
      roleName: "赏金猎人",
      truthText: "5号玩家是邪恶的",
      trueValue: [REAL_EVIL_TOWNSFOLK],
      actorSeatId: 1,
      nightCount: 1,
      candidateSeatIds: SEATS,
      targetCount: 1,
    });
    for (const term of ["提线木偶", "marionette", "伪装", "真实身份"]) {
      expect(mask.playerText).not.toContain(term);
    }
  });

  it("② 能力无真实副作用：丢弃管道对座位状态的改动", () => {
    const original = [{ id: 0, isPoisoned: false }];
    const afterPipeline = [{ id: 0, isPoisoned: true }];
    expect(
      discardDisguisedSideEffects(original, afterPipeline, marionetteSeat)
    ).toEqual(original);
    // 非伪装身份不受影响
    expect(
      discardDisguisedSideEffects(original, afterPipeline, {
        role: { id: "poisoner" },
      })
    ).toEqual(afterPipeline);
  });
});

describe("② 酒鬼厨师：玩家结果 != 真值（数值型）", () => {
  const drunkSeat = {
    id: 2,
    role: { id: "drunk", name: "酒鬼", type: "outsider" },
    charadeRole: { id: "chef", name: "厨师", type: "townsfolk" },
  };
  const truth = "厨师获得信息：场上有 2 对相邻的邪恶玩家";

  it("受干扰判定成立", () => {
    expect(
      isPlayerInfoCorrupted({
        roleId: "chef",
        actorSeat: drunkSeat,
        roleIsInformation: true,
      })
    ).toBe(true);
  });

  it("(a)(b) 假值 != 真值，且确定性稳定（同一局多次计算一致）", () => {
    const run = () =>
      buildCorruptedInfoMask({
        roleId: "chef",
        roleName: "厨师",
        truthText: truth,
        trueValue: 2,
        actorSeatId: 2,
        nightCount: 1,
      });
    const a = run();
    const b = run();
    expect(a.playerText).not.toBe(truth);
    expect(a.playerText).not.toContain("2 对");
    expect(a.fakeValue).not.toBe(2);
    expect(b.playerText).toBe(a.playerText);
    expect(a.source).toBe("deterministic");
  });

  it("说书人设定值优先（厨师对数 = 0）", () => {
    setStorytellerInfoOverrides({ chef: 0 });
    const mask = buildCorruptedInfoMask({
      roleId: "chef",
      roleName: "厨师",
      truthText: truth,
      trueValue: 2,
      actorSeatId: 2,
      nightCount: 1,
    });
    expect(mask.source).toBe("storyteller");
    expect(mask.playerText).toContain("0 对");
    expect(mask.playerText).not.toBe(truth);
  });
});

describe("③ 是-否型（占卜师）与文本型（博学者）", () => {
  it("占卜师：真值『没有恶魔』→ 玩家看到『有恶魔』", () => {
    const truth = "占卜师获得信息：没有恶魔";
    const mask = buildCorruptedInfoMask({
      roleId: "fortune_teller",
      roleName: "占卜师",
      truthText: truth,
      trueValue: false,
      actorSeatId: 3,
      nightCount: 2,
    });
    expect(mask.fakeValue).toBe(true);
    expect(mask.playerText).toContain("有恶魔");
    expect(mask.playerText).not.toBe(truth);
  });

  it("文本型（博学者）：绝不复用真值", () => {
    const truth = "博学者获得信息：3号是僧侣。";
    const mask = buildCorruptedInfoMask({
      roleId: "savant",
      roleName: "博学者",
      truthText: truth,
      trueValue: truth,
      actorSeatId: 4,
      nightCount: 2,
    });
    expect(mask.playerText).toBe(TEXT_FAKE_FALLBACK);
    expect(mask.playerText).not.toContain("僧侣");
  });
});

describe("④ 三种干扰来源（中毒 / 醉酒 / 涡流）都算受干扰", () => {
  it("中毒（nightInfo.isPoisoned）", () => {
    expect(
      isPlayerInfoCorrupted({
        roleId: "empath",
        nightInfoIsPoisoned: true,
        roleIsInformation: true,
      })
    ).toBe(true);
  });
  it("醉酒（Seat.isDrunk）", () => {
    expect(
      isPlayerInfoCorrupted({
        roleId: "investigator",
        actorSeat: { role: { id: "investigator" }, isDrunk: true },
        roleIsInformation: true,
      })
    ).toBe(true);
  });
  it("涡流世界（信息类镇民）", () => {
    expect(
      isPlayerInfoCorrupted({
        roleId: "librarian",
        isVortoxWorld: true,
        roleIsInformation: true,
      })
    ).toBe(true);
  });
  it("未受干扰 → false（不会无谓地造假）", () => {
    expect(
      isPlayerInfoCorrupted({
        roleId: "chef",
        roleIsInformation: true,
      })
    ).toBe(false);
  });
});

describe("⑤ 最终兜底：玩家文案永远不得等于真值", () => {
  it("说书人设定值恰好等于真值 → 兜底改写", () => {
    const truth = "厨师获得信息：场上有 2 对相邻的邪恶玩家";
    setStorytellerInfoOverrides({ chef: 2 });
    const mask = buildCorruptedInfoMask({
      roleId: "chef",
      roleName: "厨师",
      truthText: truth,
      trueValue: 2,
      actorSeatId: 2,
      nightCount: 1,
    });
    // 说书人给的假值 == 真值 → 假值文案仍等于真值，兜底必须改写
    const finalText = ensureNotTruth(
      mask.playerText,
      truth,
      "chef",
      2,
      1
    );
    expect(finalText).not.toBe(truth);
  });
});

describe("⑥ 每个信息角色：受干扰下的玩家文案必须【与真值同形】", () => {
  const SEAT_POOL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const bareDigits = /^\s*[（(【\[]?\s*\d+\s*[）)】\]]?\s*$/;

  interface Case {
    roleId: string;
    roleName: string;
    truth: string;
    trueValue: unknown;
    shape: RegExp;
  }

  const CASES: Case[] = [
    { roleId: "washerwoman", roleName: "洗衣妇", truth: "唤醒6号【洗衣妇】，告诉他12号和3号其中一位是【隐士】", trueValue: [11, 2], shape: /\d+号和\d+号其中一位是【.+】/ },
    { roleId: "librarian", roleName: "图书管理员", truth: "唤醒6号【图书管理员】，告诉他12号和3号其中一位是【隐士】", trueValue: [11, 2], shape: /\d+号和\d+号其中一位是【.+】/ },
    { roleId: "investigator", roleName: "调查员", truth: "唤醒6号【调查员】，告诉他12号和3号其中一位是【投毒者】", trueValue: [11, 2], shape: /\d+号和\d+号其中一位是【.+】/ },
    { roleId: "undertaker", roleName: "送葬者", truth: "送葬者获得信息：5号玩家的角色是【男爵】", trueValue: [4], shape: /\d+号玩家的角色是【.+】/ },
    { roleId: "ravenkeeper", roleName: "守鸦人", truth: "守鸦人获得信息：3号玩家的角色是【僧侣】", trueValue: [2], shape: /\d+号玩家的角色是【.+】/ },
    { roleId: "dreamer", roleName: "筑梦师", truth: "筑梦师获得信息：3号与5号之中有一个是【僧侣】", trueValue: [2, 4], shape: /\d+号与\d+号之中有一个是【.+】/ },
    { roleId: "grandmother", roleName: "祖母", truth: "祖母获得信息：5号是【僧侣】", trueValue: [4], shape: /\d+号是【.+】/ },
    { roleId: "bounty_hunter", roleName: "赏金猎人", truth: "5号玩家是邪恶的", trueValue: [4], shape: /\d+号玩家是邪恶的/ },
    { roleId: "fortune_teller", roleName: "占卜师", truth: "占卜师获得信息：没有恶魔", trueValue: false, shape: /占卜师获得信息：(有|没有)恶魔/ },
    { roleId: "chef", roleName: "厨师", truth: "厨师获得信息：场上有 2 对相邻的邪恶玩家", trueValue: 2, shape: /厨师获得信息：场上有 \d+ 对相邻的邪恶玩家/ },
    { roleId: "empath", roleName: "共情者", truth: "共情者获得信息：你两侧有 1 名邪恶玩家", trueValue: 1, shape: /共情者获得信息：你两侧有 \d+ 名邪恶玩家/ },
    { roleId: "juggler", roleName: "杂耍艺人", truth: "杂耍艺人获得信息：得知的数字为3", trueValue: 3, shape: /杂耍艺人获得信息：得知的数字为\d+/ },
    { roleId: "savant", roleName: "博学者", truth: "博学者获得信息：3号是僧侣。", trueValue: "3号是僧侣", shape: /.+/ },
    { roleId: "artist", roleName: "艺术家", truth: "艺术家获得信息：是。", trueValue: "是", shape: /.+/ },
  ];

  const maskOf = (c: Case, passTrueValue = true) =>
    buildCorruptedInfoMask({
      roleId: c.roleId,
      roleName: c.roleName,
      truthText: c.truth,
      trueValue: passTrueValue ? c.trueValue : undefined,
      actorSeatId: 5,
      nightCount: 1,
      candidateSeatIds: SEAT_POOL.filter((id) => id !== 5),
      targetCount: Array.isArray(c.trueValue) ? c.trueValue.length : 1,
    });

  for (const c of CASES) {
    it(c.roleName + "：假值与真值同形、不等于真值、且不是裸数字", () => {
      const mask = maskOf(c);
      const finalText = ensureNotTruth(mask.playerText, c.truth, c.roleId, 5, 1, SEAT_POOL);
      expect(finalText).not.toBe(c.truth);
      expect(finalText).toMatch(c.shape);
      expect(finalText).not.toMatch(bareDigits);
      expect(finalText.length).toBeGreaterThan(2);
      expect(mask.truthText).toBe(c.truth);
    });

    if (Array.isArray(c.trueValue)) {
      it(c.roleName + "：真值座位数组缺失时（bug 路径）仍然与真值同形", () => {
        const mask = maskOf(c, false);
        const finalText = ensureNotTruth(mask.playerText, c.truth, c.roleId, 5, 1, SEAT_POOL);
        expect(finalText).not.toBe(c.truth);
        expect(finalText).toMatch(c.shape);
        expect(finalText).not.toMatch(bareDigits);
      });
    }
  }

  it("全局断言：ensureNotTruth 在任何输入下都不会输出裸数字/空值", () => {
    const samples = [
      "唤醒6号【图书管理员】，告诉他12号和3号其中一位是【隐士】",
      "5号玩家是邪恶的",
      "厨师获得信息：场上有 2 对相邻的邪恶玩家",
      "没有恶魔",
      "",
    ];
    for (const s of samples) {
      const out = ensureNotTruth("", s, "librarian", 5, 1, SEAT_POOL);
      expect(out).not.toMatch(bareDigits);
      expect(out.length).toBeGreaterThan(2);
    }
  });

  it("⑦ 用户实测场景：图书管理员受干扰时，结果页必须是一句完整的话", () => {
    const truth = "唤醒6号【图书管理员】，告诉他12号和3号其中一位是【隐士】";
    const mask = buildCorruptedInfoMask({
      roleId: "librarian",
      roleName: "图书管理员",
      truthText: truth,
      trueValue: [],
      actorSeatId: 5,
      nightCount: 1,
      candidateSeatIds: SEAT_POOL.filter((id) => id !== 5),
      targetCount: 1,
    });
    const finalText = ensureNotTruth(mask.playerText, truth, "librarian", 5, 1, SEAT_POOL);
    expect(finalText).not.toMatch(/^你获得的信息[：:]\s*\d+$/);
    expect(finalText).toContain("其中一位是【");
    expect(finalText).not.toBe(truth);
  });
});
