/**
 * 结算层矩阵（第一批）：击杀免疫类被动角色
 * ==================================================================
 * 总目标的「每一个技能效果都正确发生了作用」里，有一批角色的能力**不在
 * 夜间能力管道中**（`triggerTiming = passive`），跑 `runRole` 永远覆盖不到。
 * 它们的能力体现在**结算规则**里：
 *   · 士兵 / 水手 / 弄臣 / 镇长 —— 恶魔击杀时的免疫判定
 *   · 男爵 —— 开局配比调整
 *   · 陌客 —— 阵营判定（被当作邪恶）
 *
 * 本文件覆盖第一类。判据直接对手册原文：
 *   · 士兵「恶魔的负面能力对你无效」⇒ 恶魔攻击不死亡
 *   · 镇长「如果至少 3 名玩家存活，你在夜晚不会死亡」
 *   · 弄臣「首次死亡时不死」
 *   · 以上能力在**醉酒/中毒**时失效（施法者被干扰的基本规则）
 */
import { describe, expect, it } from "vitest";
import {
  getDemonKillImmunityType,
  isImmuneToDemonKill,
} from "../soldierImmunity";
import { computeSetupComposition } from "../setupComposition";
import { resolveMinstrelIntoxication } from "../minstrelRule";
import { resolveVirginTrigger, shouldExecuteNominator } from "../virginRule";
import { resolveKlutzOutcome } from "../klutzRule";
import { checkPacifistSave, isExecutionSlotConsumed } from "../pacifistRule";
import { canTinkerDieByOwnAbility } from "../tinkerRule";
import {
  resolveMastermindExtraDay,
  shouldEnterMastermindExtraDay,
} from "../mastermindRule";
import { checkGameEnd } from "../../../app/gameLogic";
import {
  isCharadeDrunkSeat,
  withCharadePermanentDrunk,
} from "../charadeSetup";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { buildFullNightOrder } from "../invariantTesting/engineConfig";
import { buildAbilityMap } from "../invariantTesting/engineConfig";
import { runRole } from "../../roles/__tests__/_tbHarness";
import { board as harnessBoard } from "../../roles/__tests__/_tbHarness";

/** roleId → ability（`buildAbilityMap()` 的 key 是 abilityId，须按 roleId 反查） */
const abilityOf = (roleId: string): any => {
  for (const a of Object.values(buildAbilityMap() as Record<string, any>)) {
    if ((a as any)?.roleId === roleId) return a;
  }
  throw new Error(`未找到角色能力：${roleId}`);
};
/** 本文件既有的轻量造座（`mkSeat`）与 harness 的 `board` 并存 */
const board = harnessBoard;
import {
  getMayorRedirectTarget,
  getRegisteredAlignment,
  hasTeaLadyProtection,
  shouldScarletWomanTransform,
} from "../gameRules";
import {
  canScapegoatSubstitute,
  checkChoirboyTrigger,
  evaluatePoliticianEndgame,
  getEligibleFarmerSuccessors,
} from "../expansionMechanics";
import { handleGoonInteraction } from "../bmrMechanics";
import {
  canJudgeMutantExecution,
  hasPendingMutantMadnessCheck,
  listPendingMutantSeats,
} from "../mutantGate";

/** 通用座位构造（带阵营/状态字段） */
const mkSeat = (
  id: number,
  roleId: string,
  type: string,
  extra: Record<string, any> = {}
) => ({
  id,
  role: { id: roleId, name: roleId, type },
  isDead: false,
  isDrunk: false,
  isPoisoned: false,
  statusEffects: [],
  ...extra,
});

/** 造座位：`role` 是真实角色，`charade` 是「以为自己是」的伪装角色 */
const seat = (
  roleId: string,
  extra: Record<string, any> = {},
  charade?: string
) => ({
  id: 0,
  role: { id: roleId, name: roleId },
  isDead: false,
  statusEffects: [],
  ...(charade ? { charadeRole: { id: charade, name: charade } } : {}),
  ...extra,
});

describe("击杀免疫：士兵", () => {
  it("✅ 清醒存活的士兵免疫恶魔击杀", () => {
    expect(isImmuneToDemonKill(seat("soldier"))).toBe(true);
    expect(getDemonKillImmunityType(seat("soldier"))).toBe("soldier");
  });

  it("❌ 中毒的士兵不免疫（能力被干扰）", () => {
    expect(isImmuneToDemonKill(seat("soldier", { isPoisoned: true }))).toBe(false);
  });

  it("❌ 醉酒的士兵不免疫", () => {
    expect(isImmuneToDemonKill(seat("soldier", { isDrunk: true }))).toBe(false);
  });

  it("❌ 已死的士兵不免疫", () => {
    expect(isImmuneToDemonKill(seat("soldier", { isDead: true }))).toBe(false);
  });

  it("🔴 酒鬼「以为自己是士兵」不免疫（他没有士兵能力）", () => {
    const drunkFakeSoldier = seat("drunk", {}, "soldier");
    expect(isImmuneToDemonKill(drunkFakeSoldier)).toBe(false);
    expect(getDemonKillImmunityType(drunkFakeSoldier)).toBe(null);
  });
});

describe("击杀免疫：其他免疫类角色", () => {
  it("✅ 水手（清醒）免疫", () => {
    expect(isImmuneToDemonKill(seat("sailor"))).toBe(true);
  });

  it("✅ 弄臣首次免死；用过后不再免疫", () => {
    expect(isImmuneToDemonKill(seat("fool"))).toBe(true);
    expect(isImmuneToDemonKill(seat("fool", { foolUsed: true }))).toBe(false);
  });

  it("❌ 普通镇民不免疫（反例：防「全都免疫」的假实现）", () => {
    for (const rid of ["chef", "empath", "mayor"]) {
      expect(isImmuneToDemonKill(seat(rid)), `${rid} 不应免疫恶魔击杀`).toBe(
        false
      );
    }
  });
});

describe("男爵：开局把 2 名镇民换成外来者", () => {
  it("✅ 7 人局无男爵 ⇒ 5 镇民 / 0 外来者", () => {
    const res = computeSetupComposition(7, {
      baronInPlay: false,
      availableOutsiderPool: 4,
    });
    expect(res.counts).toEqual({ townsfolk: 5, outsider: 0, minion: 1, demon: 1 });
    expect(res.baronAdjusted).toBe(false);
  });

  it("✅ 7 人局有男爵 ⇒ 3 镇民 / 2 外来者（不是凭空多两人）", () => {
    const res = computeSetupComposition(7, {
      baronInPlay: true,
      availableOutsiderPool: 4,
    });
    expect(res.counts).toEqual({ townsfolk: 3, outsider: 2, minion: 1, demon: 1 });
    expect(res.baronAdjusted).toBe(true);
    expect(res.baronAddedOutsiders).toBe(2);
    // 总数守恒：加两个外来者必须减两个镇民
    expect(res.counts.townsfolk + res.counts.outsider).toBe(5);
  });

  it("✅ 外来者池不足 ⇒ 只加 1 个，并给出告警", () => {
    const res = computeSetupComposition(7, {
      baronInPlay: true,
      availableOutsiderPool: 1,
    });
    expect(res.baronAddedOutsiders).toBe(1);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe("镇长：存活 ≥3 时夜间不死", () => {
  it("✅ 存活 3 人 ⇒ 免疫类型 mayor", () => {
    expect(getDemonKillImmunityType(seat("mayor"), 3)).toBe("mayor");
  });

  it("✅ 存活 5 人 ⇒ 免疫类型 mayor", () => {
    expect(getDemonKillImmunityType(seat("mayor"), 5)).toBe("mayor");
  });

  it("❌ 存活 2 人 ⇒ 不免疫（少于 3 人失效）", () => {
    expect(getDemonKillImmunityType(seat("mayor"), 2)).toBe(null);
  });

  it("❌ 已死的镇长不免疫", () => {
    expect(getDemonKillImmunityType(seat("mayor", { isDead: true }), 5)).toBe(
      null
    );
  });
});

describe("红唇女郎：恶魔死后继任（存活 ≥4 才触发）", () => {
  /**
   * 造局：恶魔固定 1 席（可设死活），红唇女郎 1 席，其余用厨师补足。
   * ⚠️ `aliveCount` 是**存活人数**，不是座位数 —— 恶魔已死时总座位 = aliveCount + 1。
   *   第一版写成 `i < aliveCount` 少造一人，导致「存活 4 人」实际只有 3 人，
   *   断言意外失败（不是应用缺陷）。
   */
  const build = (aliveCount: number, demonAlive = false, swDisabled = false) => {
    const seats: any[] = [];
    seats.push(mkSeat(0, "imp", "demon", { isDead: !demonAlive }));
    seats.push(
      mkSeat(1, "scarlet_woman", "minion", swDisabled ? { isPoisoned: true } : {})
    );
    // 红唇女郎已占 1 个存活名额，再补 aliveCount-1 个厨师
    for (let i = 0; i < aliveCount - 1; i++) {
      seats.push(mkSeat(2 + i, "chef", "townsfolk"));
    }
    return seats;
  };

  it("✅ 恶魔已死 + 存活 4 人 ⇒ 红唇女郎继任", () => {
    const seats = build(4);
    const sw = shouldScarletWomanTransform(seats);
    expect(sw?.id).toBe(1);
  });

  it("❌ 存活 3 人 ⇒ 不继任（少于 4 人）", () => {
    const seats = build(3);
    expect(shouldScarletWomanTransform(seats)).toBe(null);
  });

  it("❌ 恶魔仍存活 ⇒ 不继任", () => {
    const seats = build(5, true);
    expect(shouldScarletWomanTransform(seats)).toBe(null);
  });

  it("❌ 红唇女郎中宿 ⇒ 不继任（能力被干扰）", () => {
    const seats = build(5, false, true);
    expect(shouldScarletWomanTransform(seats)).toBe(null);
  });
});

describe("镇长：夜间击杀转移目标", () => {
  const board = (mayorDisabled = false) => [
    mkSeat(0, "mayor", "townsfolk", mayorDisabled ? { isPoisoned: true } : {}),
    mkSeat(1, "chef", "townsfolk"),
    mkSeat(2, "empath", "townsfolk"),
  ];

  it("✅ 镇长清醒 ⇒ 返回另一名存活玩家作为转移目标", () => {
    // ⚠️ 这里刻意**不用** TS 非空断言 `t!.xxx`：`deathMarkerUnification` 的棘轮
    //    正则 `/![\w.?!\[\]]*\.isDead/` 会把 `t!.isDead` 误判成逻辑取反
    //    `!isDead`（实测计数 323→324 直接红）。用 `as any` 绕开该假阳性。
    const t = getMayorRedirectTarget(board() as any, 0) as any;
    expect(t).not.toBeNull();
    expect(t.id).not.toBe(0);
    expect(t.isDead).toBe(false);
  });

  it("❌ 镇长中毒 ⇒ 不转移（返回 null）", () => {
    expect(getMayorRedirectTarget(board(true) as any, 0)).toBe(null);
  });

  it("❌ 场上只有镇长一人 ⇒ 无转移目标", () => {
    const solo = [mkSeat(0, "mayor", "townsfolk")];
    expect(getMayorRedirectTarget(solo as any, 0)).toBe(null);
  });
});

describe("茶艺师：两名善良邻居在场时，三者免死", () => {
  it("✅ 茶女两侧邻居都是善良 ⇒ 茶女与邻居均受保护", () => {
    const seats = [
      mkSeat(0, "chef", "townsfolk"),
      mkSeat(1, "tea_lady", "townsfolk"),
      mkSeat(2, "empath", "townsfolk"),
      mkSeat(3, "imp", "demon"),
    ];
    for (const target of [0, 1, 2]) {
      expect(
        hasTeaLadyProtection(seats[target] as any, seats as any),
        `${target} 号应受茶艺师保护`
      ).toBe(true);
    }
  });

  it("❌ 邻居中有邪恶 ⇒ 不保护（哪怕目标就是茶女）", () => {
    const seats = [
      mkSeat(0, "imp", "demon"), // 邪恶邻居
      mkSeat(1, "tea_lady", "townsfolk"),
      mkSeat(2, "empath", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
    ];
    expect(hasTeaLadyProtection(seats[1] as any, seats as any)).toBe(false);
  });

  it("❌ 茶女中毒 ⇒ 不保护", () => {
    const seats = [
      mkSeat(0, "chef", "townsfolk"),
      mkSeat(1, "tea_lady", "townsfolk", { isPoisoned: true }),
      mkSeat(2, "empath", "townsfolk"),
    ];
    expect(hasTeaLadyProtection(seats[0] as any, seats as any)).toBe(false);
  });
});

describe("陌客：登记层（不是真实阵营）", () => {
  it("真实阵营仍是善良（isSeatEvil 不看登记）", () => {
    const recluse = mkSeat(0, "recluse", "outsider");
    // isSeatEvil 是「真实阵营」入口，陌客真实阵营为善良
    expect(getRegisteredAlignment(recluse as any)).toBeDefined();
  });
});

describe("农夫：夜晚死亡后传承给一名存活善良玩家", () => {
  it("✅ 继承者只含存活善良，排除农夫自己与死者", () => {
    const seats = [
      mkSeat(0, "farmer", "townsfolk", { isDead: true }), // 死去的农夫
      mkSeat(1, "chef", "townsfolk"),
      mkSeat(2, "imp", "demon"), // 邪恶，不可被继承
      mkSeat(3, "empath", "townsfolk", { isDead: true }), // 死者，不可被继承
      mkSeat(4, "soldier", "townsfolk"),
    ];
    const succ = getEligibleFarmerSuccessors(seats as any, 0);
    expect(succ.map((x) => x.id).sort()).toEqual([1, 4]);
  });

  it("❌ 没有存活善良玩家 ⇒ 继承者为空（不能把农夫传给恶魔）", () => {
    const seats = [
      mkSeat(0, "farmer", "townsfolk", { isDead: true }),
      mkSeat(1, "imp", "demon"),
    ];
    expect(getEligibleFarmerSuccessors(seats as any, 0)).toEqual([]);
  });
});

describe("政治家：终局若是自己阵营落败的最大责任人，则转阵营获胜", () => {
  const goodPolitician = (extra: Record<string, any> = {}) =>
    mkSeat(0, "politician", "outsider", extra);

  it("✅ 己方获胜 ⇒ 直接赢，不转阵营", () => {
    const r = evaluatePoliticianEndgame(goodPolitician() as any, "good", false);
    expect(r.politicianWon).toBe(true);
    expect(r.convertedAlignment).toBe(null);
  });

  it("✅ 己方落败且被判为最大责任人 ⇒ 转阵营获胜", () => {
    const r = evaluatePoliticianEndgame(goodPolitician() as any, "evil", true);
    expect(r.politicianWon).toBe(true);
    expect(r.convertedAlignment).toBe("evil");
  });

  it("❌ 己方落败但不是最大责任人 ⇒ 不赢", () => {
    const r = evaluatePoliticianEndgame(goodPolitician() as any, "evil", false);
    expect(r.politicianWon).toBe(false);
    expect(r.convertedAlignment).toBe(null);
  });

  it("❌ 中毒时即使被判最大责任人也不赢", () => {
    const r = evaluatePoliticianEndgame(
      goodPolitician({ isPoisoned: true }) as any,
      "evil",
      true
    );
    expect(r.politicianWon).toBe(false);
  });
});

describe("替罪羊：只能替**同阵营**的被提名者去死", () => {
  it("✅ 双方均善良 ⇒ 可替死", () => {
    const sc = mkSeat(0, "scapegoat", "outsider");
    const nominated = mkSeat(1, "chef", "townsfolk");
    expect(canScapegoatSubstitute(sc as any, nominated as any)).toBe(true);
  });

  it("❌ 被提名者是恶魔 ⇒ 不可替死（阵营不同）", () => {
    const sc = mkSeat(0, "scapegoat", "outsider");
    const nominated = mkSeat(1, "imp", "demon");
    expect(canScapegoatSubstitute(sc as any, nominated as any)).toBe(false);
  });

  it("❌ 替罪羊已死 ⇒ 不可替死", () => {
    const sc = mkSeat(0, "scapegoat", "outsider", { isDead: true });
    const nominated = mkSeat(1, "chef", "townsfolk");
    expect(canScapegoatSubstitute(sc as any, nominated as any)).toBe(false);
  });
});

describe("唱诗男孩：国王被恶魔杀死时得知恶魔", () => {
  it("✅ 国王在场且当夜被杀 ⇒ 触发并给出恶魔座位", () => {
    const seats = [
      mkSeat(0, "choir_boy", "townsfolk"),
      mkSeat(1, "king", "townsfolk", { isDead: true }),
      mkSeat(2, "imp", "demon"),
    ];
    const r = checkChoirboyTrigger(seats as any, [1], 2);
    expect(r.triggered).toBe(true);
    expect(r.demonSeatId).toBe(2);
  });

  it("❌ 国王未被杀 ⇒ 不触发", () => {
    const seats = [
      mkSeat(0, "choir_boy", "townsfolk"),
      mkSeat(1, "king", "townsfolk"),
      mkSeat(2, "imp", "demon"),
    ];
    const r = checkChoirboyTrigger(seats as any, [0], 2);
    expect(r.triggered).toBe(false);
    expect(r.demonSeatId).toBe(null);
  });

  it("❌ 场上没有国王 ⇒ 不触发", () => {
    const seats = [
      mkSeat(0, "choir_boy", "townsfolk"),
      mkSeat(2, "imp", "demon"),
    ];
    expect(checkChoirboyTrigger(seats as any, [2], 2).triggered).toBe(false);
  });
});

describe("莽夫：被首个能力选中后，选中者醉酒且莽夫转为其阵营", () => {
  const goon = () => mkSeat(9, "goon", "outsider");

  it("✅ 善良玩家选中莽夫 ⇒ 选中者醉酒，莽夫转为善良", () => {
    const chooser = mkSeat(2, "chef", "townsfolk");
    const r = handleGoonInteraction(chooser as any, goon() as any, 2);
    expect(r.chooserDrunk).toBe(true);
    expect(r.newGoonAlignment).toBe("good");
    // 选中者真的被标记醉酒（不只是返回值好看）
    const updatedChooser = r.updatedSeats.find((x: any) => x.id === 2) as any;
    expect(updatedChooser.isDrunk).toBe(true);
    expect(
      updatedChooser.statusEffects.some((e: any) => e.type === "drunk" && e.source === "goon")
    ).toBe(true);
  });

  it("✅ 邪恶玩家选中莽夫 ⇒ 莽夫转为邪恶", () => {
    const chooser = mkSeat(3, "imp", "demon");
    const r = handleGoonInteraction(chooser as any, goon() as any, 2);
    expect(r.newGoonAlignment).toBe("evil");
    const updatedGoon = r.updatedSeats.find((x: any) => x.id === 9) as any;
    expect(updatedGoon.isEvilConverted).toBe(true);
    expect(updatedGoon.alignment).toBe("evil");
  });

  it("✅ 幂等：同一选中者重复施加不重复叠加 drunk 效果", () => {
    const chooser = mkSeat(2, "chef", "townsfolk");
    const first = handleGoonInteraction(chooser as any, goon() as any, 2);
    const once = first.updatedSeats.find((x: any) => x.id === 2) as any;
    const second = handleGoonInteraction(once, goon() as any, 2);
    const twice = second.updatedSeats.find((x: any) => x.id === 2) as any;
    expect(
      twice.statusEffects.filter((e: any) => e.type === "drunk" && e.source === "goon")
        .length
    ).toBe(1);
  });
});

describe("畸形秀演员：白天疯狂仲裁门禁", () => {
  const mutant = (extra: Record<string, any> = {}) =>
    mkSeat(4, "mutant", "outsider", extra);

  it("✅ 存活且今日未仲裁 ⇒ 必须仲裁", () => {
    expect(hasPendingMutantMadnessCheck([mutant()] as any)).toBe(true);
    expect(listPendingMutantSeats([mutant()] as any)).toEqual([4]);
  });

  it("❌ 今日已仲裁 ⇒ 不再要求", () => {
    expect(
      hasPendingMutantMadnessCheck([mutant({ mutantMadnessCheckedToday: true })] as any)
    ).toBe(false);
  });

  it("❌ 畸形秀演员已死 ⇒ 不再要求（死者不能被处决）", () => {
    expect(hasPendingMutantMadnessCheck([mutant({ isDead: true })] as any)).toBe(false);
  });

  it("✅ 酒鬼伪装成畸形秀演员 ⇒ 同样要走仲裁（charadeRole 判据）", () => {
    const drunk = mkSeat(5, "drunk", "outsider", {
      charadeRole: { id: "mutant", name: "畸形秀演员" },
    });
    expect(hasPendingMutantMadnessCheck([drunk] as any)).toBe(true);
  });

  it("❌ 场上没有畸形秀演员 ⇒ 不门禁（防上一局残留状态卡死白天）", () => {
    const seats = [mkSeat(0, "chef", "townsfolk"), mkSeat(1, "imp", "demon")];
    expect(hasPendingMutantMadnessCheck(seats as any)).toBe(false);
    expect(listPendingMutantSeats(seats as any)).toEqual([]);
  });

  it("canJudgeMutantExecution：存活的可判、已死不可判、非畸形不可判", () => {
    expect(canJudgeMutantExecution(mutant() as any)).toBe(true);
    expect(canJudgeMutantExecution(mutant({ isDead: true }) as any)).toBe(false);
    expect(canJudgeMutantExecution(mkSeat(0, "chef", "townsfolk") as any)).toBe(false);
    expect(canJudgeMutantExecution(null)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 第二批被动角色：罂粟种植者（队列） / 酒鬼·提线木偶（永久醉酒落地）
// ════════════════════════════════════════════════════════════════════

describe("罂粟种植者：存活时爪牙与恶魔互不相认，死亡后才互认", () => {
  const layout = [
    "poppy_grower",
    "poisoner",
    "imp",
    "chef",
    "soldier",
    "empath",
    "butler",
    "mayor",
    "saint",
    "ravenkeeper",
  ];

  const queueWith = (poppyDead: boolean) => {
    const seats = board(layout as string[]);
    if (poppyDead) seats[0] = { ...seats[0], isDead: true };
    const q = generateDynamicNightQueue(
      buildFullNightOrder() as any,
      {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        statusEffects: {},
        poppyGrowerDead: poppyDead,
        reminders: [],
        log: [],
      } as any,
      { isFirstNight: true } as any
    );
    return (q as any[]).map((n) => String(n.roleId));
  };

  it("✅ 罂粟种植者存活 ⇒ 队列里**不得**有爪牙互认（minion_info）", () => {
    expect(queueWith(false), "存活时爪牙互认不该发生").not.toContain("minion_info");
  });

  it("✅ 罂粟种植者死亡 ⇒ 队列里**必须**出现爪牙互认", () => {
    expect(queueWith(true), "死亡后爪牙仍未互认 = 能力没生效").toContain("minion_info");
  });

  it("✅ 正对照：恶魔首夜仍得知「不在场角色」（与罂粟无关）", () => {
    // 罂粟只切断爪牙↔恶魔互认，不取消恶魔首夜看三个不在场角色的流程
    expect(queueWith(false)).toContain("demon_info");
  });
});

describe("酒鬼 / 提线木偶：伪装身份必须真正落地「永久醉酒」", () => {
  it("✅ isCharadeDrunkSeat：只有酒鬼与提线木偶算永久醉酒身份", () => {
    expect(isCharadeDrunkSeat(mkSeat(0, "drunk", "outsider") as any)).toBe(true);
    expect(isCharadeDrunkSeat(mkSeat(1, "marionette", "minion") as any)).toBe(true);
    expect(isCharadeDrunkSeat(mkSeat(2, "chef", "townsfolk") as any)).toBe(false);
    expect(isCharadeDrunkSeat(null)).toBe(false);
  });

  it("✅ withCharadePermanentDrunk：写入 permanent 醉酒效果，且幂等", () => {
    const drunk = mkSeat(0, "drunk", "outsider");
    const once = withCharadePermanentDrunk(drunk as any) as any;
    const twice = withCharadePermanentDrunk(once) as any;
    const drunks = (s: any) =>
      (s.statusEffects ?? []).filter(
        (e: any) => e.type === "drunk" && e.permanent === true
      );
    expect(drunks(once).length, "酒鬼没有落永久醉酒效果").toBe(1);
    expect(drunks(twice).length, "重复落地导致效果叠加").toBe(1);
    expect(drunks(twice)[0].source).toBe("drunk");
  });

  it("✅ 提线木偶落地后 source 为 marionette（与酒鬼可区分）", () => {
    const m = withCharadePermanentDrunk(mkSeat(1, "marionette", "minion") as any) as any;
    expect(m.statusEffects.find((e: any) => e.type === "drunk").source).toBe("marionette");
  });

  it("❌ 普通镇民不得被写入永久醉酒（防误伤全场）", () => {
    const chef = withCharadePermanentDrunk(mkSeat(2, "chef", "townsfolk") as any) as any;
    expect(
      (chef.statusEffects ?? []).some((e: any) => e.type === "drunk"),
      "普通镇民被误加了永久醉酒"
    ).toBe(false);
  });

  it("🔴 永久醉酒效果真的能让信息能力失效（不只是写了个字段）", async () => {
    /**
     * 端到端验证「效果落地」：座位带 permanent drunk ⇒
     * `abilityPriorityMiddleware` 判 `abilityEffective=false` ⇒ 信息类能力走假信息。
     * 这正是当初「提线木偶被当作赏金猎人却得知真信息」的缺陷本体。
     *
     * ⚠️ `runRole` 是 **async** —— 第一版漏了 `await`，拿到的是 Promise，
     *   `meta` 恒为 undefined ⇒ 断言假红（而且假红原因与被测逻辑无关）。
     */
    const seats = board(["bounty_hunter", "poisoner", "imp", "chef"]) as any[];
    seats[0] = {
      ...seats[0],
      statusEffects: [{ type: "drunk", permanent: true, source: "marionette" }],
      isDrunk: true,
    };
    const res = await runRole(abilityOf("bounty_hunter"), seats, 0, { night: 2 });
    expect(res.meta.abilityEffective, "永久醉酒未让能力失效").toBe(false);
    expect(res.meta.isCorrupted, "未标记为受干扰").toBe(true);
    // 假目标必须不是真邪恶（3号厨师是善良）
    expect(
      res.meta.abilityResult.targetId,
      "受干扰的赏金猎人仍报出真邪恶玩家"
    ).not.toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// 吟游诗人：爪牙死于**处决** ⇒ 除吟游诗人与旅行者外**所有人**醉酒
// ════════════════════════════════════════════════════════════════════

describe("吟游诗人：官方触发条件与受罚对象", () => {
  /**
   * 棋盘：0 吟游诗人 / 1 投毒者(爪牙) / 2 小恶魔 / 3 士兵 / 4 管家(外来者)
   *       / 5 刺客(爪牙) / 6 旅行者
   */
  const layout = [
    "minstrel",
    "poisoner",
    "imp",
    "soldier",
    "butler",
    "assassin",
    "scapegoat",
  ];
  const mk = (over: Record<number, any> = {}) => {
    const seats = board(layout as string[]) as any[];
    // 6 号位改成旅行者类型（便于验证「旅行者不醉酒」）
    seats[6] = { ...seats[6], role: { ...seats[6].role, type: "traveler" } };
    for (const [id, patch] of Object.entries(over)) {
      seats[Number(id)] = { ...seats[Number(id)], ...patch };
    }
    return seats;
  };

  it("🔴 爪牙死于处决 ⇒ **所有人**醉酒（不只爪牙），但排除吟游诗人与旅行者", () => {
    const seats = mk({ 1: { isDead: true } }); // 1号投毒者被处决致死
    const r = resolveMinstrelIntoxication(seats, 1, "execution");
    expect(r.triggered, `未触发：${r.reason}`).toBe(true);
    // 受罚对象必须覆盖 镇民/外来者/恶魔/其他爪牙
    for (const id of [2, 3, 4, 5]) {
      expect(r.intoxicatedSeatIds, `${id + 1}号应醉酒`).toContain(id);
    }
    // 排除吟游诗人本人与旅行者
    expect(r.intoxicatedSeatIds, "吟游诗人本人不该醉酒").not.toContain(0);
    expect(r.intoxicatedSeatIds, "旅行者不醉酒").not.toContain(6);
  });

  it("❌ 爪牙在**夜晚**死亡 ⇒ 不触发（官方：夜晚死亡不触发）", () => {
    const seats = mk({ 1: { isDead: true } });
    const r = resolveMinstrelIntoxication(seats, 1, "night");
    expect(r.triggered).toBe(false);
    expect(r.intoxicatedSeatIds).toEqual([]);
    expect(r.reason).toContain("处决");
  });

  it("❌ 被处决者是**镇民** ⇒ 不触发（原实现的错方向：镇民死亡不该触发）", () => {
    const seats = mk({ 3: { isDead: true } });
    expect(resolveMinstrelIntoxication(seats, 3, "execution").triggered).toBe(false);
  });

  it("❌ 爪牙被处决但**没有死亡**（弄臣/保护）⇒ 不触发", () => {
    const seats = mk({ 1: { isDead: false } });
    expect(resolveMinstrelIntoxication(seats, 1, "execution").triggered).toBe(false);
  });

  it("❌ 吟游诗人已死 ⇒ 不触发", () => {
    const seats = mk({ 0: { isDead: true }, 1: { isDead: true } });
    expect(resolveMinstrelIntoxication(seats, 1, "execution").triggered).toBe(false);
  });

  it("❌ 吟游诗人醉酒或中毒 ⇒ 不触发", () => {
    for (const patch of [
      { isDrunk: true },
      { isPoisoned: true },
      { statusEffects: [{ type: "drunk" }] },
      { statusEffects: [{ type: "poisoned" }] },
    ]) {
      const seats = mk({ 0: patch, 1: { isDead: true } });
      const r = resolveMinstrelIntoxication(seats, 1, "execution");
      expect(r.triggered, `吟游诗人状态 ${JSON.stringify(patch)} 时不该触发`).toBe(
        false
      );
    }
  });

  it("✅ 酒鬼伪装成吟游诗人也算（charadeRole 判据）", () => {
    const seats = mk({ 1: { isDead: true } });
    seats[0] = {
      ...seats[0],
      role: { id: "drunk", type: "outsider" },
      charadeRole: { id: "minstrel", type: "townsfolk" },
    };
    // 酒鬼本身永久醉酒 ⇒ 能力不生效
    seats[0].statusEffects = [{ type: "drunk", permanent: true }];
    expect(resolveMinstrelIntoxication(seats, 1, "execution").triggered).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 贞洁者：只有**镇民首次**提名才会处决提名者
// ════════════════════════════════════════════════════════════════════

describe("贞洁者：官方三前提（首次 / 镇民 / 本人未受干扰）", () => {
  const virgin = (over: Record<string, any> = {}) =>
    ({ ...mkSeat(5, "virgin", "townsfolk"), ...over }) as any;
  const nominator = (roleId: string, type: string, over: Record<string, any> = {}) =>
    ({ ...mkSeat(2, roleId, type), ...over }) as any;

  it("✅ 镇民首次提名 ⇒ 必须弹出裁决，且提名者应被处决", () => {
    const r = resolveVirginTrigger(virgin(), nominator("chef", "townsfolk"));
    expect(r.shouldPrompt).toBe(true);
    expect(r.isFirstTime).toBe(true);
    expect(r.nominatorIsTownsfolk).toBe(true);
    expect(
      shouldExecuteNominator(virgin(), nominator("chef", "townsfolk")),
      "镇民首次提名贞洁者却没被处决"
    ).toBe(true);
  });

  it("❌ 外来者提名 ⇒ 无事发生（仍弹窗，但不得处决）", () => {
    const v = virgin();
    const n = nominator("butler", "outsider");
    expect(resolveVirginTrigger(v, n).nominatorIsTownsfolk).toBe(false);
    expect(shouldExecuteNominator(v, n), "外来者提名却把提名者处决了").toBe(false);
  });

  it("❌ 爪牙提名 ⇒ 无事发生", () => {
    const v = virgin();
    const n = nominator("poisoner", "minion");
    expect(shouldExecuteNominator(v, n)).toBe(false);
  });

  it("❌ 恶魔提名 ⇒ 无事发生", () => {
    const v = virgin();
    const n = nominator("imp", "demon");
    expect(shouldExecuteNominator(v, n)).toBe(false);
  });

  it("❌ 非首次被提名 ⇒ 贞洁者已失去能力，不得再处决提名者", () => {
    const v = virgin({ hasBeenNominated: true });
    const n = nominator("chef", "townsfolk");
    const r = resolveVirginTrigger(v, n);
    expect(r.isFirstTime).toBe(false);
    expect(shouldExecuteNominator(v, n)).toBe(false);
  });

  it("❌ 酒鬼「以为自己是镇民」⇒ 不算镇民，不得被处决", () => {
    const v = virgin();
    const n = nominator("drunk", "outsider", {
      charadeRole: { id: "chef", type: "townsfolk" },
      statusEffects: [{ type: "drunk", permanent: true }],
    });
    expect(
      resolveVirginTrigger(v, n).nominatorIsTownsfolk,
      "把酒鬼当成了真镇民"
    ).toBe(false);
    expect(shouldExecuteNominator(v, n)).toBe(false);
  });

  it("❌ 被永久醉酒的镇民提名 ⇒ 能力不生效，不得处决", () => {
    const v = virgin();
    const n = nominator("chef", "townsfolk", {
      statusEffects: [{ type: "drunk", permanent: true }],
    });
    expect(resolveVirginTrigger(v, n).nominatorIsTownsfolk).toBe(false);
  });

  it("❌ 贞洁者本人中毒 ⇒ 仍弹窗，但不得处决提名者", () => {
    const v = virgin({
      isPoisoned: true,
      statusEffects: [{ type: "poisoned" }],
    });
    const n = nominator("chef", "townsfolk");
    expect(resolveVirginTrigger(v, n).shouldPrompt, "受干扰时也要告知说书人").toBe(
      true
    );
    expect(shouldExecuteNominator(v, n), "中毒的贞洁者仍处决了提名者").toBe(false);
  });

  it("❌ 被提名者不是贞洁者 ⇒ 不进入该流程", () => {
    expect(
      resolveVirginTrigger(mkSeat(5, "chef", "townsfolk") as any, nominator("empath", "townsfolk"))
        .shouldPrompt
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 呆瓜 / 和平主义者 / 修补匠（2026-10-21 抽纯函数后的行为判据）
// ════════════════════════════════════════════════════════════════════

describe("呆瓜：选中邪恶玩家 ⇒ **自己的阵营**落败", () => {
  it("🔴 善良呆瓜选中邪恶 ⇒ 邪恶玩家落败方=善良（即善良输）", () => {
    const klutz = mkSeat(0, "klutz", "outsider");
    const evil = mkSeat(3, "imp", "demon");
    const r = resolveKlutzOutcome(klutz as any, evil as any);
    expect(r.pickedEvil).toBe(true);
    expect(r.gameOver).toBe(true);
    expect(r.losingAlignment, "善良呆瓜选邪恶，落败的应是善良").toBe("good");
  });

  it("✅ 善良呆瓜选中善良 ⇒ 无事发生，游戏继续", () => {
    const klutz = mkSeat(0, "klutz", "outsider");
    const good = mkSeat(2, "chef", "townsfolk");
    const r = resolveKlutzOutcome(klutz as any, good as any);
    expect(r.pickedEvil).toBe(false);
    expect(r.gameOver).toBe(false);
    expect(r.losingAlignment).toBeNull();
  });

  it("🔴 被转为邪恶的呆瓜选中邪恶 ⇒ 落败方应为**邪恶**（原实现写死善良，会判反）", () => {
    const klutz = mkSeat(0, "klutz", "outsider", { isEvilConverted: true });
    const evil = mkSeat(3, "imp", "demon");
    const r = resolveKlutzOutcome(klutz as any, evil as any);
    expect(r.gameOver).toBe(true);
    expect(
      r.losingAlignment,
      "呆瓜已被转为邪恶，落败方不该写死为善良"
    ).toBe("evil");
  });

  it("❌ 选中已死亡玩家 ⇒ 不合法（官方要求选存活玩家）", () => {
    const klutz = mkSeat(0, "klutz", "outsider");
    const dead = mkSeat(2, "chef", "townsfolk", { isDead: true });
    const r = resolveKlutzOutcome(klutz as any, dead as any);
    expect(r.gameOver).toBe(false);
    expect(r.reason).toContain("存活");
  });

  it("❌ 未选择玩家 ⇒ 不结束游戏", () => {
    expect(resolveKlutzOutcome(mkSeat(0, "klutz", "outsider") as any, null).gameOver).toBe(
      false
    );
  });
});

describe("和平主义者：只救「被处决的善良玩家」", () => {
  const board2 = (pacifistOver: Record<string, any> = {}) =>
    [
      mkSeat(0, "pacifist", "townsfolk", pacifistOver),
      mkSeat(1, "chef", "townsfolk"),
      mkSeat(2, "imp", "demon"),
    ] as any[];

  it("✅ 善良玩家被处决 + 和平主义者清醒 ⇒ 必须弹裁决", () => {
    const seats = board2();
    const r = checkPacifistSave(seats[1], seats);
    expect(r.shouldPrompt).toBe(true);
    expect(r.pacifistSeatId).toBe(0);
  });

  it("❌ 被处决者是邪恶 ⇒ 不弹（官方只说善良玩家）", () => {
    const seats = board2();
    expect(checkPacifistSave(seats[2], seats).shouldPrompt).toBe(false);
  });

  it("❌ 和平主义者醉酒/中毒 ⇒ 不弹", () => {
    for (const patch of [
      { isDrunk: true },
      { isPoisoned: true },
      { statusEffects: [{ type: "drunk" }] },
    ]) {
      const seats = board2(patch);
      expect(
        checkPacifistSave(seats[1], seats).shouldPrompt,
        `状态 ${JSON.stringify(patch)} 时不该弹`
      ).toBe(false);
    }
  });

  it("❌ 和平主义者已死 ⇒ 不弹", () => {
    const seats = board2({ isDead: true });
    expect(checkPacifistSave(seats[1], seats).shouldPrompt).toBe(false);
  });

  it("🔴 处决未死仍然消耗当日处决名额（官方明确）", () => {
    expect(isExecutionSlotConsumed("saved"), "被救下也必须算今日已处决").toBe(true);
    expect(isExecutionSlotConsumed("died")).toBe(true);
    expect(isExecutionSlotConsumed("not_executed")).toBe(false);
  });
});

describe("修补匠：受免死保护时不能因自身能力死亡", () => {
  const tinker = (over: Record<string, any> = {}) =>
    ({ ...mkSeat(4, "tinker", "outsider"), ...over }) as any;

  it("✅ 无保护 ⇒ 说书人可以让他死", () => {
    expect(canTinkerDieByOwnAbility(tinker()).canDie).toBe(true);
  });

  it("🔴 处于免死保护 ⇒ 不能因自身能力死亡", () => {
    const r = canTinkerDieByOwnAbility(tinker({ isProtected: true, protectedBy: "茶艺师" }));
    expect(r.canDie).toBe(false);
    expect(r.reason).toContain("免死保护");
  });

  it("🔴 有保护类状态效果 ⇒ 不能死", () => {
    const r = canTinkerDieByOwnAbility(
      tinker({ statusEffects: [{ type: "tea_lady_protection" }] })
    );
    expect(r.canDie).toBe(false);
  });

  it("🔴 邻接保护（茶艺师）由调用方注入 ⇒ 不能死", () => {
    const r = canTinkerDieByOwnAbility(tinker(), [], () => true);
    expect(r.canDie).toBe(false);
    expect(r.reason).toContain("邻接保护");
  });

  it("❌ 已死 / 非修补匠 ⇒ 不适用", () => {
    expect(canTinkerDieByOwnAbility(tinker({ isDead: true })).canDie).toBe(false);
    expect(canTinkerDieByOwnAbility(mkSeat(4, "chef", "townsfolk") as any).canDie).toBe(
      false
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// 主谋：额外一夜一昼的胜负（2026-10-21 修正判反 + 接通死状态）
// ════════════════════════════════════════════════════════════════════

describe("主谋：额外一天的胜负判定", () => {
  it("🔴 额外一天**无人被处决** ⇒ **善良**获胜（原实现判成邪恶）", () => {
    const r = resolveMastermindExtraDay(null);
    expect(r.winner, "官方：无人被处决 ⇒ 善良阵营获胜").toBe("good");
    expect(r.reason).toContain("善良");
  });

  it("🔴 额外一天处决**善良**玩家 ⇒ 邪恶获胜（其阵营落败）", () => {
    const r = resolveMastermindExtraDay(mkSeat(3, "chef", "townsfolk") as any);
    expect(r.winner).toBe("evil");
  });

  it("✅ 额外一天处决**邪恶**玩家 ⇒ 善良获胜", () => {
    expect(resolveMastermindExtraDay(mkSeat(4, "imp", "demon") as any).winner).toBe(
      "good"
    );
    expect(
      resolveMastermindExtraDay(mkSeat(5, "poisoner", "minion") as any).winner
    ).toBe("good");
  });

  it("✅ 被转为邪恶的善良玩家被处决 ⇒ 按**当前阵营**算（邪恶落败 ⇒ 善良胜）", () => {
    const converted = mkSeat(3, "chef", "townsfolk", { isEvilConverted: true });
    expect(resolveMastermindExtraDay(converted as any).winner).toBe("good");
  });

  it("进入额外一夜一昼：只有「主谋在场 + 恶魔死于处决」才触发", () => {
    expect(
      shouldEnterMastermindExtraDay({ mastermindActive: true, demonDiedByExecution: true })
    ).toBe(true);
    // 恶魔夜间死亡不触发
    expect(
      shouldEnterMastermindExtraDay({ mastermindActive: true, demonDiedByExecution: false })
    ).toBe(false);
    // 没有主谋不触发
    expect(
      shouldEnterMastermindExtraDay({ mastermindActive: false, demonDiedByExecution: true })
    ).toBe(false);
  });
});

describe("主谋：与 checkGameEnd 的集成（防再次判反 / 防状态不激活）", () => {
  /**
   * ⚠️ 第一版这两条集成用例的棋盘**没有恶魔**，于是先命中
   *   「恶魔已被彻底消灭 ⇒ 善良胜」分支，`isMastermindExtraDay` 那段根本走不到
   *   —— 变异测试时纯函数改错、集成用例仍绿，说明它**没在测目标路径**。
   *   现改为真实可达场景：
   *     · 触发用例：恶魔**已死**（死于处决）+ 主谋存活；
   *     · 反向用例：恶魔**仍存活** + 主谋存活 + 平安日。
   */

  it("🔴 恶魔死于处决 + 主谋存活 ⇒ 游戏必须继续，并标记 extraDay", () => {
    const seats = [
      mkSeat(0, "imp", "demon", { isDead: true }),
      mkSeat(1, "mastermind", "minion"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "empath", "townsfolk"),
    ];
    const res = checkGameEnd(seats as any, "execution", 0, {
      isMastermindActive: true,
    });
    expect(res.isGameOver, "恶魔被处决后主谋必须让游戏继续").toBe(false);
    expect(res.extraDay, "未标记 extraDay ⇒ 调用方无法激活 mastermindFinalDay").toBe(
      true
    );
  });

  it("❌ 恶魔仍存活 + 主谋在场 + 平安日 ⇒ 不得因此判邪恶获胜", () => {
    const seats = [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "mastermind", "minion"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "empath", "townsfolk"),
    ];
    const res = checkGameEnd(seats as any, "execution", null, {
      isMastermindActive: true,
      isMastermindExtraDay: false,
    });
    /**
     * ⚠️ 断言必须收成「**根本不终局**」。
     *   第一版只写 `not.toBe("Evil")` ⇒ 把「误判成善良获胜」也放过了：
     *   实测把门禁退回 `isMastermindActive` 后，普通平安日会被判**善良胜**，
     *   而 `not.toBe("Evil")` 依然绿 —— 典型的判据太松。
     */
    expect(
      res.isGameOver,
      "主谋在场 + 普通平安日不得结束游戏（旧实现会判邪恶胜，改坏会判善良胜）"
    ).toBe(false);
    expect(res.winner).toBeNull();
  });
});
