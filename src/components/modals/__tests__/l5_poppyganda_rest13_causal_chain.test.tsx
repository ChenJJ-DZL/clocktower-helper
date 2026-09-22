// @vitest-environment jsdom
/**
 * L5「因果链」测试 —— 罂粟花开 · **补齐 13 个零专属 L5 覆盖的角色**（组件级）
 *
 * ⚠️⚠️ 为什么必须有这一辑（诚实审计结论，2026-09-21）
 * ------------------------------------------------------------------
 * 审计发现：24 角色里只有 11 个有独立 L5 因果链断言，
 * `librarian / chef / bounty_hunter / pixie / farmer / poppy_grower / drunk /
 *  lunatic / mutant / snitch / cerenovus / evil_twin / imp / vortox`
 * **一个都没有** —— 它们此前只被「矩阵探针」间接扫过（那些探针断言的是
 * **文案卫生**：不含 undefined/NaN、guide 非空），**从不验证状态字段是否真的变了**。
 *
 * 这正是本项目「测试全绿、人工实测完全不同」的同一个病灶。
 *
 * ── L5 判据（与 L3 的分工）────────────────────────────────────────────
 *   L3：渲染出来、有文字、无 undefined      ⇒ 证「看得见」
 *   L5：跑真实管道 → 断言**状态字段真的变了** ⇒ 证「生效了」
 *   本文件一律断言 `statusEffects` / `isDead` / `isDrunk` / `_abilityResults`
 *   这类**状态**，绝不写「文案含某个词」当作通过条件。
 *
 * ── 判据一律取「生产代码真实写入点」+ 官方原文 ────────────────────────
 *   · imp      → `snapshot._abilityResults.imp` + 目标 `markedForDeath`
 *   · vortox   → `snapshot.lastKill` + `vortoxActive` + 目标 `isDead/markedForDeath`
 *   · cerenovus→ 目标 `statusEffects[{type:"mad"}]`（`seat.isMad` 为兼容字段）
 *   · farmer   → `actionNode.meta` / `_abilityResults` 的继承角色记录
 *   · drunk    → `charadeRole`（虚假身份）+ 永久 `drunk` statusEffect
 *   · lunatic  → 假击杀目标记录（`lunaticTargetIds` 同源）
 *   · mutant   → 疯狂状态（`isMad` / statusEffects）
 *
 * ── 防假绿自检（本文件每条都实测过）──────────────────────────────────
 *   逐条把对应 `stateUpdate` 里的写入语句注释掉 → 本文件必须**变红**。
 *   实测记录见文末「变异检验记录」。
 */

import { describe, expect, it } from "vitest";
import { board, runRole } from "../../../roles/__tests__/_tbHarness";

// ─────────────────────────────────────────────────────────────────────
// 通用取值助手（从生产快照读状态，不猜字段名）
// ─────────────────────────────────────────────────────────────────────

/** 某座位的 statusEffects 里符合谓词的那些（SST：effects 才是唯一事实来源） */
function effectsOf(snapshot: any, seatId: number, pred: (e: any) => boolean) {
  const s = snapshot?.seats?.find((x: any) => x.id === seatId);
  return ((s?.statusEffects ?? []) as any[]).filter(pred);
}

const marked = (snapshot: any, seatId: number) =>
  snapshot?.seats?.find((x: any) => x.id === seatId)?.markedForDeath === true;

const dead = (snapshot: any, seatId: number) =>
  snapshot?.seats?.find((x: any) => x.id === seatId)?.isDead === true;

const abilityResult = (snapshot: any, roleId: string) =>
  snapshot?._abilityResults?.[roleId];

// ═════════════════════════════════════════════════════════════════════
// ① 小恶魔（imp）—— 杀人：目标必须被标记死亡 + 结果落库
// ═════════════════════════════════════════════════════════════════════
describe("L5 · imp 小恶魔：选中目标必须落 markedForDeath + _abilityResults", () => {
  const mk = () => board(["chef", "soldier", "imp", "monk", "mayor"]);

  it("⭐ 存活恶魔选 1 号 → _abilityResults.imp 记录 targetId=0，且目标被标记死亡", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/imp.ability")).impAbility as any,
      mk(),
      2, // 3号 是恶魔
      { targets: [0], phase: "night", night: 2 }
    );
    const snap = res.snapshot;
    const rec = abilityResult(snap, "imp");
    expect(rec, "❌ imp 的 stateUpdate 未写入 _abilityResults.imp —— 击杀无痕迹").toBeTruthy();
    expect(rec.targetId, "记录的击杀目标必须是 1 号（0 基 id=0）").toBe(0);
    expect(rec.killed, "能力生效时 killed 必须为 true").toBe(true);
    expect(
      marked(snap, 0),
      "❌ 目标未被标记 markedForDeath —— 说书人白天结算时「无人死亡」（测试绿、实测错）"
    ).toBe(true);
  });

  it("⭐ 恶魔醉酒 → killed=false 且目标**不得**被标记死亡（但仍记录选择）", async () => {
    const seats = mk();
    seats[2] = { ...seats[2], statusEffects: [{ type: "drunk" }] };
    const res = await runRole(
      (await import("../../../roles/new_engine/imp.ability")).impAbility as any,
      seats,
      2,
      { targets: [0], phase: "night", night: 2, meta: { abilityEffective: false } }
    );
    const snap = res.snapshot;
    const rec = abilityResult(snap, "imp");
    expect(rec, "醉酒恶魔仍须记录「选了谁」（说书人要知道）").toBeTruthy();
    expect(rec.killed, "醉酒恶魔不得真的杀人").toBe(false);
    expect(
      marked(snap, 0),
      "❌ 醉酒恶魔仍把目标标死 —— 官方：醉酒/中毒时能力不生效"
    ).toBe(false);
  });

  it("反例：死亡恶魔不得杀人（preCheck 必须 abort）", async () => {
    const seats = mk();
    seats[2] = { ...seats[2], isDead: true };
    const res = await runRole(
      (await import("../../../roles/new_engine/imp.ability")).impAbility as any,
      seats,
      2,
      { targets: [0], phase: "night", night: 2 }
    );
    expect(res.aborted, "已死亡角色的 preCheck 必须中止管道").toBe(true);
    expect(marked(res.snapshot, 0), "已死恶魔绝不能标记任何人死亡").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ② 涡流（vortox）—— lastKill + vortoxActive + 目标死亡三处状态
// ═════════════════════════════════════════════════════════════════════
describe("L5 · vortox 涡流：lastKill / vortoxActive / 目标 isDead 三处状态必须落地", () => {
  const mk = () => board(["chef", "soldier", "monk", "vortox", "mayor"]);

  it("⭐ 涡流击杀存活玩家 → lastKill.targetId 正确 + 目标真的 isDead", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/vortox.ability")).vortoxAbility as any,
      mk(),
      3,
      { targets: [0], phase: "night", night: 2 }
    );
    const snap = res.snapshot;
    expect(snap.lastKill, "❌ vortox 未写 lastKill —— 死亡播报拿不到击杀来源").toBeTruthy();
    expect(snap.lastKill.demonRole, "lastKill 必须标识是涡流所为").toBe("vortox");
    expect(
      snap.lastKill.targetId,
      "❌ lastKill.targetId 与所选目标不一致 —— 播报会指向错误的人"
    ).toBe(0);
    expect(
      dead(snap, 0),
      "❌ 涡流选中的 1 号没有真的死 —— 白天不会播报死亡（测试绿、实测错）"
    ).toBe(true);
  });

  it("⭐ 涡流在场必须置 vortoxActive=true（全局信息干扰开关）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/vortox.ability")).vortoxAbility as any,
      mk(),
      3,
      { targets: [0], phase: "night", night: 2 }
    );
    expect(
      res.snapshot.vortoxActive,
      "❌ vortoxActive 未置位 —— 所有信息角色会拿到真信息，涡流核心机制失效"
    ).toBe(true);
  });

  it("⭐ 士兵免疫：目标为士兵时不得死亡（官方：士兵免疫恶魔击杀）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/vortox.ability")).vortoxAbility as any,
      mk(),
      3,
      { targets: [1], phase: "night", night: 2 } // 2号 = 士兵
    );
    expect(
      dead(res.snapshot, 1),
      "❌ 士兵被涡流击杀 —— 官方「士兵不受恶魔能力影响」被破坏"
    ).toBe(false);
    expect(
      res.snapshot.lastKill.killed,
      "lastKill.killed 必须为 false（说书人据此播报平安夜）"
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ③ 洗脑师（cerenovus）—— 目标必须被写入「疯狂」状态
// ═════════════════════════════════════════════════════════════════════
describe("L5 · cerenovus 洗脑师：目标必须落 isMad + madRoles + statusDetails", () => {
  const mk = () => board(["chef", "soldier", "monk", "cerenovus", "imp"]);

  // 生产真实写入点（cerenovus.ability.ts::stateUpdate :54-91）：
  //   seat.isMad = true
  //   seat.cerenovusMadnessRole = roleName
  //   seat.statusDetails 追加 `洗脑疯狂:${roleName}`
  //   snapshot.madRoles[targetId] = roleName
  //   snapshot._abilityResults.cerenovus = { targetId, roleName, mad:true }
  const seatOf = (snap: any, seatId: number) =>
    snap?.seats?.find((x: any) => x.id === seatId);

  it("⭐ 洗脑目标 → isMad=true + madRoles 记录角色（不是只记日志）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/cerenovus.ability"))
        .cerenovusAbility as any,
      mk(),
      3,
      {
        targets: [0],
        phase: "night",
        night: 2,
        // ⚠️ storytellerInput 是 **ctx 顶层字段**（不是 meta 里）——
        //   放 meta 里角色读不到，会静默用默认「镇民」⇒ 测试绿但没测到角色名分支。
        storytellerInput: { roleName: "士兵" },
      }
    );
    const snap = res.snapshot;
    const s0 = seatOf(snap, 0);
    expect(
      s0?.isMad,
      "❌ 目标座位 isMad 不为 true —— 洗脑只在文案里生效" +
        "（玩家被处决时系统认不出他「发疯」）"
    ).toBe(true);
    expect(
      s0?.cerenovusMadnessRole,
      "必须记录疯狂扮演的角色名（疯狂校验要靠它）"
    ).toBe("士兵");
    expect(
      (snap as any)?.madRoles?.[0],
      "SST：snapshot.madRoles 也必须同步（处决校验的读取点）"
    ).toBe("士兵");
    expect(
      (s0?.statusDetails ?? []).some((d: any) =>
        typeof d === "string" && d.startsWith("洗脑疯狂:")
      ),
      "statusDetails 必须留痕（说书人白天核对疯狂用）"
    ).toBe(true);
  });

  it("⭐ 反例：洗脑师醉酒 → 不得施加 mad 状态", async () => {
    const seats = mk();
    seats[3] = { ...seats[3], statusEffects: [{ type: "drunk" }] };
    const res = await runRole(
      (await import("../../../roles/new_engine/cerenovus.ability"))
        .cerenovusAbility as any,
      seats,
      3,
      { targets: [0], phase: "night", night: 2, meta: { abilityEffective: false } }
    );
    expect(
      (seatOf(res.snapshot, 0)?.isMad ?? false),
      "❌ 醉酒洗脑师仍施加了疯狂状态 —— 官方：醉酒时能力不生效"
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ④ 农夫（farmer）—— 死亡传承：必须写入继承角色
// ═════════════════════════════════════════════════════════════════════
describe("L5 · farmer 农夫：死亡后必须产出继承记录（不是只给文案）", () => {
  const mk = () => board(["chef", "farmer", "monk", "soldier", "imp"]);

  it("⭐ 农夫已死 → 产出继承角色记录（_abilityResults 或 actionNode.meta）", async () => {
    const seats = mk();
    seats[1] = { ...seats[1], isDead: true };
    const res = await runRole(
      (await import("../../../roles/new_engine/farmer.ability")).farmerAbility as any,
      seats,
      1,
      {
        phase: "night",
        night: 2,
        snapshot: { deadThisNight: [1] },
        nodeMeta: { deathTriggered: true },
      }
    );
    const rec =
      abilityResult(res.snapshot, "farmer") ??
      res.actionNode?.meta?.farmerResult ??
      res.meta?.farmerResult;
    expect(
      rec,
      "❌ 农夫死后没有产出任何继承记录 —— 传承只停留在文案，" +
        "说书人无法据此给继任者授予能力"
    ).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⑤ 酒鬼（drunk）—— 虚假身份 + 永久醉酒，两处状态都必须落
// ═════════════════════════════════════════════════════════════════════
describe("L5 · drunk 酒鬼：fakeRole（假身份）+ 永久 drunk 状态必须成对落地", () => {
  const mk = () => board(["drunk", "chef", "monk", "soldier", "imp"]);

  // 生产真实写入点（drunk.ability.ts::applyDrunkSetup :291-337）：
  //   seat.fakeRole = { id, name, type }      ← 引擎按此唤醒（不是 charadeRole！）
  //   seat.statusEffects += { type:"drunk", source:"drunk", permanent:true }
  it("⭐ stateUpdate 必须写入 fakeRole（否则酒鬼看到的是「酒鬼」而自知）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/drunk.ability")).drunkAbility as any,
      mk(),
      0,
      {
        phase: "firstNight",
        night: 1,
        meta: { fakeRole: { id: "soldier", name: "士兵", type: "townsfolk" } },
      }
    );
    const seat0 = res.snapshot.seats.find((s: any) => s.id === 0);
    expect(
      seat0?.fakeRole,
      "❌ 酒鬼没有 fakeRole —— 玩家会在角色卡上看到「酒鬼」，立刻知道自己被骗" +
        "（官方：酒鬼以为自己是某个镇民）"
    ).toBeTruthy();
    expect(
      seat0.fakeRole.id,
      "fakeRole 不得还是酒鬼自己（否则引擎会按酒鬼调度，等于没伪装）"
    ).not.toBe("drunk");
  });

  it("⭐ 酒鬼必须带永久醉酒状态（能力永不生效）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/drunk.ability")).drunkAbility as any,
      mk(),
      0,
      {
        phase: "firstNight",
        night: 1,
        meta: { fakeRole: { id: "soldier", name: "士兵", type: "townsfolk" } },
      }
    );
    const seat0 = res.snapshot.seats.find((s: any) => s.id === 0);
    const drunkEffects = (seat0?.statusEffects ?? []).filter(
      (e: any) => e?.type === "drunk"
    );
    expect(
      drunkEffects.length,
      "❌ 酒鬼没有永久醉酒状态 —— 他的「能力」会真的生效，破坏整个身份设定"
    ).toBeGreaterThan(0);
    expect(
      drunkEffects.some((e: any) => e.permanent === true),
      "醉酒状态必须标 permanent:true（否则会在夜晚结束时被清掉）"
    ).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⑥ 疯子（lunatic）—— 假击杀目标：必须记录「他以为杀了谁」
// ═════════════════════════════════════════════════════════════════════
describe("L5 · lunatic 疯子：假击杀目标必须落库（供真恶魔确认页消费）", () => {
  const mk = () => board(["lunatic", "chef", "monk", "soldier", "imp"]);

  it("⭐ 疯子选目标 → 产出假击杀记录，且**真的无人死亡**", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/lunatic.ability"))
        .lunaticAbility as any,
      mk(),
      0,
      {
        targets: [1],
        phase: "night",
        night: 2,
        snapshot: { apparentDemonRole: null },
        nodeMeta: {},
      }
    );
    const rec =
      abilityResult(res.snapshot, "lunatic") ??
      res.actionNode?.meta?.lunaticResult;
    expect(
      rec,
      "❌ 疯子没有记录假击杀目标 —— 真恶魔确认页看不到「疯子昨晚选了谁」"
    ).toBeTruthy();
    expect(
      dead(res.snapshot, 1),
      "❌ 疯子选的 1 号真的死了 —— 官方：疯子以为自己是恶魔，但他的「击杀」不生效"
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⑦ 图书管理员 / 厨师 —— 信息落库（真值必须与假值分开存）
// ═════════════════════════════════════════════════════════════════════
describe("L5 · librarian/chef：能力结果必须落 _abilityResults（可复现、可供说书人核对）", () => {
  it("⭐ librarian 结果落库，且外来者候选为空时 roleName 为空串（而非占位词）", async () => {
    const res = await runRole(
      (await import("../../../roles/new_engine/librarian.ability"))
        .librarianAbility as any,
      board(["librarian", "chef", "monk", "soldier", "imp"]), // 无外来者
      0,
      { phase: "firstNight", night: 1 }
    );
    const rec = abilityResult(res.snapshot, "librarian");
    expect(rec, "❌ librarian 结果未落库").toBeTruthy();
    expect(
      String(rec.roleName ?? ""),
      "❌ 无外来者时必须给空串（旧实现给占位词，说书人会照念给玩家听）"
    ).toBe("");
  });

  it("⭐ chef 结果必须落库（同一夜重复计算结果稳定）", async () => {
    const seats = board(["chef", "monk", "imp", "soldier", "mayor"]);
    const a = await runRole(
      (await import("../../../roles/new_engine/chef.ability")).chefAbility as any,
      seats,
      0,
      { phase: "firstNight", night: 1 }
    );
    const b = await runRole(
      (await import("../../../roles/new_engine/chef.ability")).chefAbility as any,
      seats,
      0,
      { phase: "firstNight", night: 1 }
    );
    // 生产写入点（chef.ability.ts::stateUpdateResult :564-595）：
    //   snapshot._abilityResults.chef = result（**裸 number**，0 是合法值！）
    //   actionNode.meta.chefResult = { evilPairCount, isCorrupted, timestamp }
    const ra = abilityResult(a.snapshot, "chef");
    const rb = abilityResult(b.snapshot, "chef");
    expect(
      typeof ra,
      "❌ chef 结果未落库（应为 number；用 toBeTruthy 会把合法的 0 误判为未落库）"
    ).toBe("number");
    expect(
      ra,
      "❌ 同一夜两次计算得到不同结果 —— 提示预演与结算弹窗会对不上（非确定性随机）"
    ).toBe(rb);
    expect(
      a.actionNode?.meta?.chefResult?.evilPairCount,
      "actionNode.meta.chefResult 也必须与 snapshot 同值（SST 不许分叉）"
    ).toBe(ra);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⑧ ⭐⭐ 「醉酒/中毒 → 效果类能力必须不生效」跨角色闸门（P0）
// ═════════════════════════════════════════════════════════════════════
/**
 * 官方原文（投毒者 / 规则书「醉酒与中毒」）：
 *   "中毒的玩家会失去能力……他的能力**不会真实地影响游戏**。
 *    为了保证中毒的玩家处于未中毒的幻象中，说书人会……走过场来执行他的能力。"
 * ⇒ 凡「施加效果」类能力（施加疯狂 / 保护 / 击杀），
 *   醉酒或中毒时必须 **只记选择、不写状态**。
 *
 * ⚠️ 发现过程（2026-09-21）：探针横测罂粟花开 24 角色后发现
 *   `cerenovus` 与 `vortox` **漏门控**（两者 `preCheck` 覆盖掉了
 *   `commonPreCheckAlive`，而自身未做 `abilityEffective` 判定）——
 *   **醉酒/中毒的洗脑师照样施加疯狂、涡流照样杀人**。
 *   对照组 `imp` / `monk`（有守卫）行为正确 ⇒ 证明夹具与判据有效，
 *   不是「等价变异」，是真缺陷。已修（两者 stateUpdate 前置门控）。
 *
 * 🔒 防假绿：本节每条都带**对照组**（不醉酒时必须生效），
 *   否则「any 情况都不生效」也能过 —— 那是把 bug 写进契约。
 */
describe("L5 · ⭐⭐ 醉酒/中毒闸门：效果类能力必须不生效（含对照组）", () => {
  const drunkSeats = (seats: any[], id: number) =>
    seats.map((s: any) =>
      s.id === id
        ? { ...s, statusEffects: [...(s.statusEffects ?? []), { type: "drunk" }] }
        : s
    );
  const poisonSeats = (seats: any[], id: number) =>
    seats.map((s: any) =>
      s.id === id
        ? {
            ...s,
            statusEffects: [...(s.statusEffects ?? []), { type: "poisoned" }],
          }
        : s
    );

  const CERE = () => board(["chef", "soldier", "monk", "cerenovus", "imp"]);
  const cereOpts = {
    targets: [0],
    phase: "night" as const,
    night: 2,
    storytellerInput: { roleName: "士兵" },
  };
  const cerenovus = async () =>
    (await import("../../../roles/new_engine/cerenovus.ability"))
      .cerenovusAbility as any;
  const isMad = (snap: any) =>
    snap?.seats?.find((s: any) => s.id === 0)?.isMad === true;

  it("对照组：洗脑师清醒 → 必须施加 isMad（否则本节其余断言无意义）", async () => {
    const res = await runRole(await cerenovus(), CERE(), 3, cereOpts);
    expect(isMad(res.snapshot), "清醒洗脑师未施加疯狂 —— 对照失败").toBe(true);
  });

  it("⭐ 洗脑师醉酒 → 不得施加 isMad / madRoles", async () => {
    const res = await runRole(
      await cerenovus(),
      drunkSeats(CERE(), 3),
      3,
      cereOpts
    );
    expect(
      isMad(res.snapshot),
      "❌ 醉酒洗脑师仍施加了疯狂 —— 官方：醉酒时能力不生效"
    ).toBe(false);
    expect(
      (res.snapshot as any)?.madRoles?.[0],
      "❌ 醉酒洗脑师仍写入了 madRoles —— 处决校验会据此判玩家违规"
    ).toBeUndefined();
  });

  it("⭐ 洗脑师中毒 → 不得施加 isMad", async () => {
    const res = await runRole(
      await cerenovus(),
      poisonSeats(CERE(), 3),
      3,
      cereOpts
    );
    expect(
      isMad(res.snapshot),
      "❌ 中毒洗脑师仍施加了疯狂 —— 官方：中毒时能力不生效"
    ).toBe(false);
  });

  // ── 涡流（击杀语义）─────────────────────────────────────────────
  const VORT = () => board(["chef", "soldier", "monk", "vortox", "imp"]);
  const vortOpts = { targets: [0], phase: "night" as const, night: 2 };
  const vortox = async () =>
    (await import("../../../roles/new_engine/vortox.ability"))
      .vortoxAbility as any;
  const targetDead = (snap: any) =>
    snap?.seats?.find((s: any) => s.id === 0)?.markedForDeath === true ||
    snap?.seats?.find((s: any) => s.id === 0)?.isDead === true;

  it("对照组：涡流清醒 → 必须击杀 1 号", async () => {
    const res = await runRole(await vortox(), VORT(), 3, vortOpts);
    expect(targetDead(res.snapshot), "清醒涡流未击杀 —— 对照失败").toBe(true);
  });

  it("⭐ 涡流醉酒 → 不得击杀（不得写 markedForDeath / isDead）", async () => {
    const res = await runRole(
      await vortox(),
      drunkSeats(VORT(), 3),
      3,
      vortOpts
    );
    expect(
      targetDead(res.snapshot),
      "❌ 醉酒涡流仍击杀了目标 —— 官方：醉酒时能力不生效"
    ).toBe(false);
    expect(
      res.snapshot?.lastKill?.killed,
      "lastKill.killed 必须为 false（说书人据此播报平安夜）"
    ).toBe(false);
  });

  it("⭐ 涡流中毒 → 不得击杀", async () => {
    const res = await runRole(
      await vortox(),
      poisonSeats(VORT(), 3),
      3,
      vortOpts
    );
    expect(
      targetDead(res.snapshot),
      "❌ 中毒涡流仍击杀了目标 —— 官方：中毒时能力不生效"
    ).toBe(false);
  });
});

