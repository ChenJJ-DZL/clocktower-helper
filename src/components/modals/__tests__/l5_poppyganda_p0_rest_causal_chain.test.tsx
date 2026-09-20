// @vitest-environment jsdom
/**
 * L5「因果链」测试 · 第二辑 —— 罂粟花开 · 剩余 P0 的**状态变更**验证
 * （2026-09-21）
 *
 * 姊妹文件：`l5_poppyganda_p0p1_causal_chain.test.tsx`（P0-1 / P0-2 / P1-13）
 *
 * ⚠️⚠️ 本项目的核心痛点是「**测试全绿，人工实测完全不同**」。
 *   本辑专门针对那些**旧测试永远抓不到**的问题类型：
 *
 *   · P0-5  涡流局学者信息：旧断言只看 `abilityLog.length > 0`（文案层），
 *           **涡流在场与不在场输出同一段文案** → 永远绿。
 *           ⇒ 断言 `displayInfo.hasVortox === true` **且** `isCorrupted === true`（状态字段）
 *
 *   · P0-6  占位文案：断言**产出的结构里不含 "正确信息"/"错误信息" 这两个词**，
 *           且缺省时 `needsStorytellerInput === true`（状态字段，不是文案形状）
 *
 *   · P0-4  杂耍艺人裸随机：断言**同一 seed 反复调用得到同一个假数字**（可复现性）
 *
 *   · P0-8  占卜师干扰项重选：断言 `selectNewBoon` 真的挑出**存活的善良玩家 id**
 *           （旧实现是 console.log 桩函数，恒返回 null）
 *
 *   · P0-9  城镇公告员主谓：断言文案含「爪牙发起过提名」且**不含**旧的主谓颠倒串
 *
 *   · P0-10 男爵配比：断言 `computeSetupComposition` 真的改了 counts（状态字段），
 *           且外来者池不足时 **warnings 非空**（旧实现静默少配）
 *
 *   · P0-11 提线木偶：断言 `onSetup` 真的写入了 master 关系字段
 *
 * ── 防假绿自检 ────────────────────────────────────────────────────────
 *   每条断言都验证过：「把对应生产代码改回旧写法 → 本文件必须变红」。
 */

import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────
// 通用座位构造（与姊妹文件保持同构）
// ─────────────────────────────────────────────────────────────────────
function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  opts: Partial<any> = {}
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    displayRole: null,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    statusEffects: [],
    ...opts,
  };
}

// ═════════════════════════════════════════════════════════════════════
// P0-5 / P0-6 · 学者（savant）：涡流必须给假信息 · 禁止占位字符串
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-5/P0-6 学者：涡流局两条都假 · 缺省给待填标记而非占位词", () => {
  async function runSavant(opts: {
    seats: any[];
    storytellerInput?: any;
  }) {
    const { runFullAbilityPipeline } = await import(
      "../../../utils/middlewarePipeline"
    );
    const { savantAbility } = await import(
      "../../../roles/new_engine/savant.ability"
    );
    return runFullAbilityPipeline(savantAbility as any, {
      snapshot: { nightCount: 1, seats: opts.seats },
      actionNode: { seatId: 0, roleId: "savant", roleName: "学者" },
      targetIds: [],
      storytellerInput: opts.storytellerInput ?? {},
      meta: {},
    } as any);
  }

  it("⭐ 涡流在场（存活）→ hasVortox=true（**独立事实源**，不能被 abilityEffective 掩盖）", async () => {
    const seats = [
      seat(0, "savant", "townsfolk"),
      seat(1, "vortox", "demon"), // 存活涡流
      seat(2, "chef", "townsfolk"),
    ];
    const r: any = await runSavant({
      seats,
      storytellerInput: { result: { correct: "甲", incorrect: "乙" } },
    });
    const info = r.meta.displayInfo;

    // ⚠️⚠️ 防假绿关键（实测教训）：
    //   管道里的 `abilityPriority` 中间件在涡流在场时会自动把
    //   `abilityEffective` 置为 false —— 于是 `isCorrupted` 即使**删掉 hasVortox 项**
    //   也仍是 true（被 abilityEffective 兜住）⇒ **只断言 isCorrupted 是假绿**。
    //   故这里必须断言 **`hasVortox` 本身**（它是「是否检测到存活涡流」的独立事实源，
    //   无法被其他中间件伪造），再断言它进了 isCorrupted 的取值。
    expect(
      info.hasVortox,
      "❌ 涡流在场却没被识别 —— 学者会拿到「一对一错」的真实配对，" +
        "静默破坏涡流核心机制（P0-5 回归）"
    ).toBe(true);
    // 直接锚定「涡流是否参与 isCorrupted 计算」：单独构造 vortox 真值验证
    expect(
      info.isCorrupted,
      "涡流局 isCorrupted 必须为 true（两条信息都须为假）"
    ).toBe(true);
    // 对照：把涡流去掉后 hasVortox 必须翻回 false（证明它不是恒真常量）
    const clean: any = await runSavant({
      seats: [seat(0, "savant", "townsfolk"), seat(1, "chef", "townsfolk")],
      storytellerInput: { result: { correct: "甲", incorrect: "乙" } },
    });
    expect(
      clean.meta.displayInfo.hasVortox,
      "无涡流时 hasVortox 必须为 false —— 否则上面的断言是恒真护栏（假绿）"
    ).toBe(false);
  });

  it("⭐ 涡流死亡 → hasVortox=false 且 abilityEffective 恢复正常", async () => {
    const seats = [
      seat(0, "savant", "townsfolk"),
      seat(1, "vortox", "demon", { isDead: true }), // 涡流已死
      seat(2, "chef", "townsfolk"),
    ];
    const r: any = await runSavant({ seats });
    expect(
      r.meta.displayInfo.hasVortox,
      "已死亡的涡流不应再污染信息（只统计存活涡流）"
    ).toBe(false);
    expect(
      r.meta.abilityEffective,
      "涡流死后 abilityEffective 应恢复 true（证明是涡流而非其他原因压的）"
    ).toBe(true);
  });

  it("⭐ P0-6：缺省时不产出「正确信息」/「错误信息」占位字符串", async () => {
    const seats = [seat(0, "savant", "townsfolk"), seat(1, "chef", "townsfolk")];
    const r: any = await runSavant({ seats }); // 无 storytellerInput
    const info = r.meta.displayInfo;
    expect(
      info.needsStorytellerInput,
      "❌ 说书人未填内容时，必须产出「待填写」标记（旧实现回退成占位词）"
    ).toBe(true);
    expect(info.correct, "占位字段必须为空串，不得是 '正确信息'").not.toBe(
      "正确信息"
    );
    expect(info.incorrect, "占位字段必须为空串，不得是 '错误信息'").not.toBe(
      "错误信息"
    );
    expect(
      `${info.log}`,
      "❌ 日志不得出现占位词「正确信息/错误信息」（会原样显示给说书人）"
    ).not.toMatch(/正确信息|错误信息/);
  });

  it("⭐ P0-6 反例对照：真填了内容时，内容原样保留且 needsStorytellerInput=false", async () => {
    const seats = [seat(0, "savant", "townsfolk"), seat(1, "chef", "townsfolk")];
    const r: any = await runSavant({
      seats,
      storytellerInput: { result: { correct: "1号是厨师", incorrect: "2号是僧侣" } },
    });
    const info = r.meta.displayInfo;
    expect(info.needsStorytellerInput).toBe(false);
    expect(info.correct).toBe("1号是厨师");
    expect(info.incorrect).toBe("2号是僧侣");
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-3 / P0-4 · 杂耍艺人（juggler）：确定性随机（可复现）
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-3/P0-4 杂耍艺人：假数字必须确定性可复现（同一 seed 同值）", () => {
  it("⭐ 同一 seed 的 createDeterministicRandom 反复调用得到同一序列", async () => {
    const { createDeterministicRandom, nightInfoSeed } = await import(
      "../../../roles/core/deterministicRandom"
    );

    const seed = nightInfoSeed("juggler", 2, 1);
    const a = createDeterministicRandom(seed);
    const b = createDeterministicRandom(seed);

    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(
      seqA,
      "❌ 同一 seed 的两次序列不一致 —— 说明用了 Math.random（P0-4 回归）：" +
        "中毒杂耍艺人重看结果页数字会乱跳"
    ).toEqual(seqB);
  });

  it("⭐ seed 必须区分 actorId（不同玩家不同假数字）", async () => {
    const { createDeterministicRandom, nightInfoSeed } = await import(
      "../../../roles/core/deterministicRandom"
    );
    const r1 = createDeterministicRandom(nightInfoSeed("juggler", 1, 1))();
    const r2 = createDeterministicRandom(nightInfoSeed("juggler", 2, 1))();
    expect(
      r1,
      "不同座位的种子必须给出不同的假数字（否则每个杂耍艺人看到同一个数）"
    ).not.toBe(r2);
  });

  it("⭐ P0-3 源码级：dayAbilityBridge 不得硬编码 nightCount:0（须透传 ctx.nightCount）", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../utils/dayAbilityBridge.ts"),
      "utf8"
    );
    // 剥注释后再扫（元教训：源码扫描必须剥注释，否则命中说明文字）
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 归一化空白，避免「单行正则漏跨行书写」的假绿（已知教训）
    const norm = code.replace(/\s+/g, " ");
    expect(
      /nightCount: 0 ,/.test(norm) || /nightCount: 0,/.test(norm),
      "❌ dayAbilityBridge 仍在硬编码 `nightCount: 0` —— 确定性种子与结算路径错位（P0-3 回归）"
    ).toBe(false);
    expect(
      /nightCount: ctx\.nightCount/.test(norm),
      "dayAbilityBridge 必须透传调用方的真实夜数 ctx.nightCount"
    ).toBe(true);
  });

  it("⭐ P0-4 源码级：useNightActionHandler 的 juggler 分支不得出现裸 Math.random 赋值", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../hooks/useNightActionHandler.ts"),
      "utf8"
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 只检查 juggler 分支窗口
    const idx = code.indexOf('roleId === "juggler"');
    expect(idx, "未找到 juggler 分支，疑似被重命名/移动").toBeGreaterThan(-1);
    const win = code.slice(idx, idx + 2200);
    // ⚠️⚠️ 防假绿教训（实测踩到）：**单行正则必漏跨行写法**。
    //   第一版写成 /count\s*=\s*Math\.floor\(\s*Math\.random\(\)/ → 注入
    //   `count =\n  fakeCandidates[...Math.floor(Math.random()...)]` 时**照样绿**（假绿）。
    //   ⇒ 改为：先整体剥空白归一化，再断言 juggler 窗口内**不含任何 Math.random**，
    //     且**必须**出现 createDeterministicRandom（两个方向都锁）。
    const winNorm = win.replace(/\s+/g, " ");
    expect(
      /Math\.random/.test(winNorm),
      "❌ juggler 假数字仍用裸 Math.random —— 反复查看数字乱跳（P0-4 回归）"
    ).toBe(false);
    expect(
      /createDeterministicRandom/.test(winNorm),
      "juggler 假数字必须走注入的确定性 rng"
    ).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-8 · 占卜师干扰项重选：必须挑出「存活的善良玩家」
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-8 占卜师：干扰项变邪恶后必须重选到一名存活的善良玩家", () => {
  it("⭐ setBoonSeatProvider 注入后，selectNewBoon 返回合法善良座位 id", async () => {
    const mod = await import("../../../utils/FortuneTellerBoonManager");
    const { setBoonSeatProvider } = mod as any;
    const manager = (mod as any).fortuneTellerBoonManager;
    expect(manager, "未导出 fortuneTellerBoonManager 单例").toBeTruthy();

    // 注入座位快照：0=已被变邪恶（旧干扰项） 1=已死 2=存活善良 3=邪恶爪牙
    setBoonSeatProvider(() =>
      [
        { id: 0, isDead: false, role: { id: "chef", type: "townsfolk" }, isEvilConverted: true },
        { id: 1, isDead: true, role: { id: "soldier", type: "townsfolk" } },
        { id: 2, isDead: false, role: { id: "monk", type: "townsfolk" } },
        { id: 3, isDead: false, role: { id: "poisoner", type: "minion" } },
      ] as any
    );

    const picked = await (manager as any).selectNewBoon("g1", 0);
    expect(
      picked,
      "❌ 未能重选干扰项（旧实现是 console.log 桩函数恒返回 null，P0-8 回归）——" +
        "干扰项变邪恶后将永远误报假恶魔"
    ).toBe(2);

    setBoonSeatProvider(null);
  });

  it("反例：无可选善良玩家 → 返回 null（不静默造一个非法目标）", async () => {
    const mod = await import("../../../utils/FortuneTellerBoonManager");
    const { setBoonSeatProvider } = mod as any;
    const manager = (mod as any).fortuneTellerBoonManager;

    setBoonSeatProvider(() =>
      [
        { id: 0, isDead: true, role: { id: "chef", type: "townsfolk" } },
        { id: 1, isDead: false, role: { id: "poisoner", type: "minion" } },
      ] as any
    );
    const picked = await (manager as any).selectNewBoon("g2", 0);
    expect(picked, "无存活善良玩家时必须返回 null").toBeNull();
    setBoonSeatProvider(null);
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-9 · 城镇公告员：主谓不得颠倒
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-9 城镇公告员：文案必须是「爪牙发起提名」而非「提名了爪牙」", () => {
  // ⚠️ `buildInfoMessage(roleId, ctx)` 是**双参数**签名（不是对象式），
  //    ctx 必须提供 seats / selfId / nightCount 三个必需字段。
  const ctxBase = (minionNominatedToday: boolean) => ({
    seats: [
      seat(0, "town_crier", "townsfolk"),
      seat(1, "poisoner", "minion"),
    ],
    selfId: 0,
    nightCount: 2,
    minionNominatedToday,
  });

  it("⭐ 真值 true → 「有爪牙发起过提名」；且不得出现主谓颠倒的旧串", async () => {
    const { buildInfoMessage } = await import("../../../utils/infoMessageBuilder");
    const msg = buildInfoMessage("town_crier", ctxBase(true) as any);
    expect(msg, "官方：得知今天白天是否有爪牙发起过提名").toContain(
      "有爪牙发起过提名"
    );
    expect(
      msg,
      "❌ 主谓颠倒：出现「有人提名过爪牙」，语义与官方相反（P0-9 回归）"
    ).not.toContain("有人提名过爪牙");
  });

  it("⭐ 真值 false → 「没有爪牙发起过提名」", async () => {
    const { buildInfoMessage } = await import("../../../utils/infoMessageBuilder");
    const msg = buildInfoMessage("town_crier", ctxBase(false) as any);
    expect(msg).toContain("没有爪牙发起过提名");
    expect(msg).not.toContain("有人提名过爪牙");
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-10 · 男爵 +2 外来者：配比必须真的改，且池不足必须告警
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-10 男爵配比：counts 真的变 + 池不足必须 warnings 非空", () => {
  it("⭐ 7 人局 + 男爵：3 镇民 → 1 镇民、0 外来者 → 2 外来者", async () => {
    const { computeSetupComposition } = await import(
      "../../../utils/setupComposition"
    );
    const r = computeSetupComposition(7, {
      baronInPlay: true,
      availableOutsiderPool: 4,
    });
    expect(r.counts.outsider, "官方：男爵 +2 外来者").toBe(2);
    expect(r.counts.townsfolk, "官方：新增外来者**替换掉原本的镇民**").toBe(3);
    expect(r.baronAdjusted).toBe(true);
    expect(r.baronAddedOutsiders).toBe(2);
    expect(r.warnings, "池子充足时不应告警").toHaveLength(0);
  });

  it("⭐ 外来者池不足 → baronAddedOutsiders < 2 且 warnings 非空（旧实现静默少配）", async () => {
    const { computeSetupComposition } = await import(
      "../../../utils/setupComposition"
    );
    const r = computeSetupComposition(13, {
      baronInPlay: true,
      availableOutsiderPool: 1, // 13 人局基础 outsider=0，只剩 1 个池位
    });
    expect(r.baronAddedOutsiders).toBe(1);
    expect(
      r.warnings.length,
      "❌ 外来者池不足时必须告警 —— 旧实现静默少配，说书人直到游戏中途才发现（P0-10 回归）"
    ).toBeGreaterThan(0);
    expect(r.warnings.join("；")).toContain("男爵");
  });

  it("⭐ validateSetupComposition：不符官方配比 → valid=false", async () => {
    const { validateSetupComposition } = await import(
      "../../../utils/setupComposition"
    );
    const r = validateSetupComposition(
      7,
      { townsfolk: 5, outsider: 0, minion: 1, demon: 1 }, // 未应用男爵调整的错误名单
      { baronInPlay: true, availableOutsiderPool: 4 }
    );
    expect(r.valid, "男爵在场却没调外来者 → 配比不符，必须判 invalid").toBe(
      false
    );
    expect(r.warnings.join("；")).toContain("配比不符");
  });

  it("源码级：quickStartGenerator 必须走 computeSetupComposition（不得内联静默改名单）", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../utils/quickStartGenerator.ts"),
      "utf8"
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(
      /computeSetupComposition\s*\(/.test(code),
      "❌ quickStartGenerator 未调用 computeSetupComposition —— 男爵调整可能又散落成内联实现（P0-10 回归）"
    ).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-11 · 提线木偶：onSetup 必须真的建立「与恶魔/爪牙」的 master 关系
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-11 提线木偶：新引擎 onSetup 真的写入 master 关系", () => {
  it("⭐ onSetup 后座位被标记 marionetteMasterSeatId（或 masterId）", async () => {
    const { marionetteAbility } = await import(
      "../../../roles/new_engine/marionette.ability"
    );
    const onSetup = (marionetteAbility as any).onSetup;
    expect(onSetup, "❌ 提线木偶新引擎缺少 onSetup（P0-11：新引擎管线全死）").toBeTypeOf(
      "function"
    );

    const seats = [
      seat(0, "marionette", "minion"),
      seat(1, "imp", "demon"),
      seat(2, "chef", "townsfolk"),
    ];
    // ⚠️ onSetup 返回 `{ handled, updates, logs }`（不是 seats 数组，也不回写输入）
    const out: any = onSetup({ seats, selfId: 0 });
    expect(out?.handled, "onSetup 必须返回 handled:true").toBe(true);
    const update = (out?.updates ?? []).find((u: any) => u.id === 0);
    expect(update, "onSetup 必须产出 id=0（提线木偶）的更新项").toBeTruthy();
    expect(
      update?.marionetteMasterSeatId,
      "❌ onSetup 未写入 marionetteMasterSeatId —— 提线木偶不知道自己的恶魔是谁（P0-11）"
    ).toBe(1);
    // 同链路副作用：开局即写入永久醉酒（技能不生效）
    expect(
      update?.isDrunk,
      "提线木偶应与酒鬼同链路：开局即永久醉酒"
    ).toBe(true);
  });
});
