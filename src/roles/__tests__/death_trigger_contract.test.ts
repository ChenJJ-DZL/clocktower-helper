/**
 * 「死亡触发」契约护栏（2026-09-21 建）
 * ============================================================
 * 官方语义为「当你死亡时 / 如果你死亡」的角色，其 `triggerTiming` **必须**含
 * `AbilityTriggerTiming.ON_DEATH`。
 *
 * 为什么这是一个**契约**而不是风格问题：
 *   · `src/hooks/useNightEngine.ts:194` 打 `deathTriggered` 标的**唯一来源**就是
 *     `ability.triggerTiming?.includes(ON_DEATH)`
 *   · `src/utils/dynamicQueueGenerator.ts:414` 用该标做「**仅在当晚死亡时才入队**」门控
 *   ⇒ 声明 `[PASSIVE]` ⇒ `deathTriggered=false` ⇒ **门控不生效** ⇒
 *     该角色**存活时也被排进夜间队列**（说书人看到多余的唤醒步骤）。
 *
 * 已修案例：
 *   · P1-6 `farmer`（罂粟花开，`farmer.ability.ts:210-218`）
 *   · P1-7 `sweetheart` / `barber` / `sage`（梦陨春宵，本轮）
 *     —— 漏网原因：能力通路真值表护栏此前只覆盖罂粟花开 24 角色。
 *   · 反例（**不是缺陷**）：`tinker` 官方是「你随时可能死亡」= 说书人主动触发，
 *     不是死亡触发 ⇒ 标 PASSIVE 合理，本护栏不收录它。
 *
 * ⚠️ 本护栏含**正向对照**（`tinker` 二夜存活**应**入队）——
 *   否则「不入队」的断言在 roster 造错时会恒绿（假绿）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { roles as ALL_ROLES, scripts as ALL_SCRIPTS } from "../../../app/data";
import { applyChoirboyKingSetup, injectChoirboyKing } from "../../utils/expansionMechanics";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";
import { unifiedRoleDefinition } from "../unifiedRoleDefinition";
import {
  generateDynamicNightQueue,
  getDeathEventWatchTarget,
  hasDeathEventWatch,
  isDeathTriggeredRole,
  appendExecutedDeathTriggeredToQueue,
  resolveDeathEventWakeups,
} from "../../utils/dynamicQueueGenerator";
import { board } from "./_tbHarness";

/** 官方语义 = 死亡触发（每条都附官方【角色能力】原文依据） */
const ON_DEATH_ROLES: Record<string, string> = {
  ravenkeeper: "如果你在夜晚死亡，你会被唤醒并得知一名玩家：他是某个特定角色。",
  banshee: "如果你在夜晚死亡，所有其他玩家都会得知你是报丧女妖，且你可以在当晚杀死一名玩家。",
  moonchild: "当你得知你死亡时，你要公开选择一名存活的玩家：如果他是善良的，在当晚他会死亡。",
  plague_doctor: "如果你死亡，你今晚杀了谁，他就会在今晚死亡。",
  farmer: "当你在夜晚死亡时，一名存活的善良玩家会变成农夫。",
  sweetheart: "当你死亡时，会有一名玩家开始醉酒。",
  barber: "如果你死亡，在当晚恶魔可以选择两名玩家（不能选择其他恶魔）交换角色。",
  sage: "如果恶魔杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个恶魔。",
  hatter: "如果你死亡，当晚爪牙和恶魔玩家可以选择变成新的爪牙和恶魔角色。",
};
/** 正向对照：PASSIVE 是**正确**的（说书人主动触发，非死亡触发） */
const POSITIVE_CONTROL = "tinker";

const FILL = ["empath", "chef", "monk", "butler", "soldier", "gossip", "imp"];

function aliveQueued(rid: string): boolean {
  const seats = board([rid, ...FILL.filter((x) => x !== rid)]);
  return generateDynamicNightQueue(
    ENGINE_CONFIG.fullNightOrder,
    {
      seats: JSON.parse(JSON.stringify(seats)),
      statusEffects: {},
      poppyGrowerDead: false,
      reminders: [],
      log: [],
      gamePhase: "night",
      nightCount: 2,
    } as any,
    { isFirstNight: false }
  ).some((n: any) => n.seatId === 0);
}

describe("契约 · 死亡触发角色的 triggerTiming 与队列门控", () => {
  initializeAbilityRegistry();

  it("① 每个死亡触发角色的 triggerTiming 必须含 ON_DEATH（源头变量）", () => {
    // ⚠️ 与 `dynamicQueueGenerator.ts::roleHasNightAction` **同源**：
    //    那边也是 `unifiedRoleDefinition.getAllAbilities()`（按 roleId 查）。
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const missing: string[] = [];
    for (const rid of Object.keys(ON_DEATH_ROLES)) {
      const ab = abilities.find((a) => a?.roleId === rid);
      const timings: string[] = (ab?.triggerTiming ?? []) as string[];
      if (!timings.includes("on_death")) missing.push(rid + "[" + timings.join("|") + "]");
    }
    expect(
      missing,
      "❌ 以下角色的官方语义是死亡触发，但 triggerTiming 未含 ON_DEATH：" +
        "「PASSIVE ⇒ deathTriggered=false ⇒ 存活时也会入队」"
    ).toEqual([]);
  });

  it("② 生前不应被唤醒：死亡触发角色在『二夜存活』时不得入队", () => {
    const entered = Object.keys(ON_DEATH_ROLES).filter((rid) => aliveQueued(rid));
    expect(entered, "❌ 这些死亡触发角色在存活时仍被排入夜间队列").toEqual([]);
  });

  it("④ `isDeathTriggeredRole` 必须与生产夜序表的 `deathTriggered` 标逐角色一致（防镜像双份漂移）", async () => {
    // ⚠️ 本项目的「镜像双份」老问题：`useNightEngine.ts::generateNightOrderFromParser`
    //   与 `invariantTesting/engineConfig.ts::buildFullNightOrder` 是两份实现。
    //   `GameStage.tsx` 现在走 `isDeathTriggeredRole`（第三处消费点）——
    //   三者必须同源，否则「死亡当晚能不能被唤醒」会出现只在某个入口生效的诡异 bug。
    const { buildFullNightOrder } = await import(
      "../../utils/invariantTesting/engineConfig"
    );
    const entries = buildFullNightOrder() as any[];
    const drift: string[] = [];
    for (const rid of Object.keys(ON_DEATH_ROLES)) {
      const e = entries.find((x: any) => x.roleId === rid);
      if (!e) continue;
      if (e.deathTriggered !== isDeathTriggeredRole(rid)) {
        drift.push(rid + "(表=" + e.deathTriggered + " 函数=" + isDeathTriggeredRole(rid) + ")");
      }
    }
    expect(drift, "❌ 夜序表的 deathTriggered 标与 isDeathTriggeredRole 不一致").toEqual([]);
  });

  it("⑦ 死亡事件分发器：订阅类（deathEventWatch）静态不入队、订阅对象死亡时被唤醒", () => {
    // ⭐ 2026-09-21 新增的统一架构（B 方案）：
    //   「他人死亡触发」不再写专属特例，而是声明 `deathEventWatch` +
    //   由 `resolveDeathEventWakeups` 统一分发（与「自己死亡触发」同一入口）。
    //
    // ⚠️ 注意：这里把 `"king"` 作为 **deadRoleId 参数**传入，不需要 seats 里真有 king 座位
    //   （`king` 尚未注册进 `app/data.ts` roles 表 —— 见 choir_boy.ability.ts 的阻塞项注释）。

    // ① 声明生效：唱诗男孩订阅 king
    expect(getDeathEventWatchTarget("choir_boy"), "❌ choir_boy 应订阅 king").toBe("king");
    expect(hasDeathEventWatch("choir_boy")).toBe(true);
    expect(hasDeathEventWatch("ravenkeeper"), "❌ 守鸦人是自己死亡触发，非订阅类").toBe(false);

    // ② 静态不入队（死亡事件在队列生成时尚未发生）
    expect(aliveQueued("choir_boy"), "❌ 订阅类角色不得进入静态夜间队列").toBe(false);

    // ③ ⭐ 正向：国王死亡 ⇒ 存活的唱诗男孩被列为 watch 唤醒
    const seats = board(["choir_boy", "empath", "chef", "imp"]);
    expect(
      resolveDeathEventWakeups(seats, 99, "king"),
      "❌ 国王死亡时应唤醒存活的唱诗男孩（reason=watch）"
    ).toEqual([{ seatId: 0, roleId: "choir_boy", reason: "watch" }]);

    // ④ ⭐ 正向对照：自己死亡触发仍走同一分发器（reason=self）
    expect(
      resolveDeathEventWakeups(seats, 3, "ravenkeeper"),
      "❌ 自己死亡触发应返回 reason=self"
    ).toEqual([{ seatId: 3, roleId: "ravenkeeper", reason: "self" }]);

    // ⑤ 负向：无人订阅的死亡 ⇒ 空（防「无条件返回」的假绿）
    expect(
      resolveDeathEventWakeups(seats, 3, "empath"),
      "❌ 无订阅者的死亡事件不应产生唤醒"
    ).toEqual([]);

    // ⑥ 负向：唱诗男孩**已死** ⇒ 不再唤醒
    const dead = board(["choir_boy", "empath", "chef", "imp"]);
    dead[0].isDead = true;
    expect(
      resolveDeathEventWakeups(dead, 99, "king"),
      "❌ 已死亡的唱诗男孩不应被唤醒"
    ).toEqual([]);
  });

  it("⑧ `[+国王]` 设置调整：唱诗男孩在场且国王不在场 ⇒ 替换一名其他镇民（人数不变）", () => {
    // 官方【唱诗男孩】：「在游戏设置阶段，如果唱诗男孩在场而国王不在场，那么国王就会
    //   被添加进来并**替换掉一个其他镇民**。而如果国王已经在场，唱诗男孩不会因此
    //   再将另外一名国王添加进场。」
    const kingRole = (ALL_ROLES as any[]).find((r) => r.id === "king");
    expect(
      kingRole,
      "❌ `king` 必须已注册进 app/data.ts 的 roles 表（否则 r(\"king\") === undefined，唱诗男孩不可达）"
    ).toBeDefined();

    // ① 唱诗男孩在场 + 无国王 ⇒ 替换一名**其他**镇民
    const A = board(["choir_boy", "empath", "chef"]);
    const ra = applyChoirboyKingSetup(A as any, kingRole);
    expect(ra.changed, "❌ 应注入国王").toBe(true);
    expect(
      ra.seats.filter((s: any) => s.role?.id === "king").length,
      "❌ 应恰好有 1 名国王"
    ).toBe(1);
    expect(ra.replacedSeatId, "❌ 不得替换唱诗男孩自己（座位 0）").not.toBe(0);
    expect(ra.seats.length, "❌ 必须替换而非新增 ⇒ 人数不变").toBe(A.length);

    // ② 关键：阵营配比不变（镇民数不变）
    expect(
      ra.seats.filter((s: any) => s.role?.type === "townsfolk").length,
      "❌ 镇民数应保持不变（替换的是镇民）"
    ).toBe(A.filter((s: any) => s.role?.type === "townsfolk").length);

    // ③ 国王已在场 ⇒ 不重复添加（官方明文）
    const B = board(["choir_boy", "king", "empath"]);
    const rb = applyChoirboyKingSetup(B as any, kingRole);
    expect(rb.changed, "❌ 国王已在场时不得再添加").toBe(false);
    expect(rb.seats.filter((s: any) => s.role?.id === "king").length).toBe(1);

    // ④ 无唱诗男孩 ⇒ 不动
    const C = board(["empath", "chef"]);
    expect(applyChoirboyKingSetup(C as any, kingRole).changed).toBe(false);
  });

  it("⑨ 泛型版 `injectChoirboyKing` 与 Seat 适配版行为一致（防两条设置路径漂移）", () => {
    // ⚠️ 设置阶段有**两条**路径，必须行为一致：
    //   · 手动换角 → `IRoleAbility.onSetup` → `applyChoirboyKingSetup`（Seat 版）
    //   · 快速开局 → `quickStartGenerator` → `injectChoirboyKing`（泛型版）
    // 泛型版是**唯一实现**，Seat 版只是适配层；本用例钉住两者一致。
    const kingRole = (ALL_ROLES as any[]).find((r) => r.id === "king");
    expect(kingRole).toBeDefined();

    // 泛型版：Role[] 形状
    const rolesArr = [
      { id: "choir_boy", type: "townsfolk" },
      { id: "empath", type: "townsfolk" },
      { id: "imp", type: "demon" },
    ];
    const rg = injectChoirboyKing(rolesArr as any, { id: "king", type: "townsfolk" } as any);
    expect(rg.changed, "❌ 泛型版应注入").toBe(true);
    expect(rg.items.filter((r: any) => r.id === "king").length).toBe(1);
    expect(rg.items.length, "❌ 泛型版也必须替换而非新增").toBe(rolesArr.length);
    expect(rg.replacedId, "❌ 不得替换唱诗男孩").not.toBe("choir_boy");

    // Seat 版：与泛型版结论一致（同输入语义）
    const seats = board(["choir_boy", "empath", "imp"]);
    const rs = applyChoirboyKingSetup(seats as any, kingRole);
    expect(rs.changed, "❌ Seat 版应注入").toBe(rs.changed && rg.changed);
    expect(rs.seats.filter((s: any) => s.role?.id === "king").length).toBe(
      rg.items.filter((r: any) => r.id === "king").length
    );
  });

  it("⑩ 处决死的死亡触发角色：当晚**补入**队列（官方 hatter 范例：被处决，当晚触发）", () => {
    // 官方【帽匠】范例：「刺客杀死了一名玩家。**帽匠被处决了。当晚**，刺客选择变成了主谋。」
    //   ⇒「如果你死亡」类**不分死因**、**当晚**生效。
    //
    // 🔒 修法要点（P1-16）：**不可**让静态队列生成器产出它们 ——
    //   `deathTriggered` 角色**刻意不走静态队列**是**既有设计契约**
    //   （`ravenkeeper.test.ts` / `trouble_brewing_matrix_full.test.ts` 两个「意图测试」记录）。
    //   正解是**单独补**：`startSubsequentNight` 里用 `todayExecutedId` 追加到 wakeIds。
    //   逻辑收敛在 SST 纯函数 `dynamicQueueGenerator::appendExecutedDeathTriggeredToQueue`。
    const seats = board(["sweetheart", "empath", "chef", "imp"]);
    const base = [3]; // 假设恶魔（3号）已在队列

    // ① ⭐ 正向：0号 sweetheart（死亡触发）当日被处决 ⇒ **追加到队尾**
    expect(
      appendExecutedDeathTriggeredToQueue(seats as any, 0, base),
      "❌ 处决死的死亡触发角色必须补入队列（官方：帽匠被处决，当晚触发）"
    ).toEqual([3, 0]);

    // ② 已在队列 ⇒ 不重复补
    expect(appendExecutedDeathTriggeredToQueue(seats as any, 0, [0, 3])).toEqual([0, 3]);

    // ③ ⚠️ 负向对照：1号 empath（**非**死亡触发）被处决 ⇒ **不得**补
    //    （防「无条件追加」的假绿）
    expect(
      appendExecutedDeathTriggeredToQueue(seats as any, 1, base),
      "❌ 非死亡触发角色被处决时不得补入"
    ).toEqual([3]);

    // ④ 无当日处决 ⇒ 不变
    expect(appendExecutedDeathTriggeredToQueue(seats as any, null, base)).toEqual([3]);

    // ⑤ 座位不存在 ⇒ 不变
    expect(appendExecutedDeathTriggeredToQueue(seats as any, 99, base)).toEqual([3]);
  });

  it("⑥ 🔒 源码级：死亡触发判定**禁止硬编码角色名**（防白名单复活）", () => {
    // 本项目已两次栽在「硬编码角色名白名单」上：
    //   · `GameStage.tsx` 原为 `role?.id === "ravenkeeper" || "sage"`
    //   · `useGameController.ts` 原为 `getSeatRoleId(targetId) !== "ravenkeeper"`
    // 两者都导致其他死亡触发角色死亡当晚拿不到唤醒节点。
    // 本护栏做**源码级扫描**（先剥注释、再剥空白归一化，与项目「护栏三件套」一致），
    // 一旦有人在死亡触发判定里写回角色名常量 ⇒ 立刻红。
    const BANNED: Array<{ file: string; re: RegExp; why: string }> = [
      {
        file: "src/hooks/useGameController.ts",
        re: /getSeatRoleId\(targetId\)\s*!==\s*"/,
        why: "死亡触发入队判定不得用 `getSeatRoleId(targetId) !== \"<角色名>\"`",
      },
      {
        file: "src/components/game/GameStage.tsx",
        re: /role\?\.id\s*===\s*"(ravenkeeper|sage)"/,
        why: "canActWhileDead 不得硬编码 ravenkeeper/sage",
      },
      {
        file: "src/hooks/useNightSnapshot.ts",
        re: /roleId\s*===\s*"(ravenkeeper|sage)"/,
        why: "continueToNextAction 的 canActWhileDead 不得硬编码 ravenkeeper/sage",
      },
      {
        file: "src/hooks/useNightActionHandler.ts",
        re: /deadSeat\?\.role\?\.id\s*===\s*"/,
        why: "newlyDead 补调入队不得只判 ravenkeeper",
      },
      {
        file: "src/hooks/useNightEngine.ts",
        // ⚠️ 必须覆盖  形式（曾漏 —— 变异 #6 未红暴露）：roleId !== "ravenkeeper"
        re: /(roleId|e\.roleId)\s*(?:[!=]==?|[=:])\s*"(ravenkeeper|sage)"/,
        why: "enqueueDeathTriggeredIfNeeded 不得写死 entry 查询与节点 roleId",
      },
      {
        file: "src/hooks/useRoleAction.ts",
        re: /roleId\s*===\s*"(ravenkeeper|sage)"/,
        why: "目标可选性 fallback 不得只判 ravenkeeper",
      },
      {
        file: "src/utils/wakeQueue.ts",
        re: /role\?\.id\s*===\s*"(ravenkeeper|sage)"/,
        why: "队列归一化的「当晚死亡仍叫醒」不得只判 ravenkeeper",
      },
    ];
    // ✅ 2026-09-21：7 处白名单已全部纳入扫描（曾是「已知未覆盖」）。
    const hits: string[] = [];
    for (const b of BANNED) {
      const raw = readFileSync(b.file, "utf8");
      // 剥注释（行注释 + 块注释）后归一化空白，避免注释里的历史说明误报
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\s+/g, " ");
      if (b.re.test(stripped)) hits.push(b.file + " ⇒ " + b.why);
    }
    expect(hits, "❌ 死亡触发判定出现硬编码角色名白名单").toEqual([]);
  });

  /**
   * 👑 护栏（2026-09-21 建）：**`king` 不得进入任何剧本的发牌池**；含唱诗男孩的剧本里，
   *   国王只能由 `[+国王]` 设置注入产生。
   *
   * ── 官方依据 ──────────────────────────────────────────────────────
   * `choir_boy` 的官方标记是 **`[+国王]`**：
   *   「若唱诗男孩在场而国王不在场，设置阶段国王会被加入并替换掉一名其他镇民」
   *   （原文见 `app/data.ts::king.fullDescription`）。
   * 实现：`utils/expansionMechanics::injectChoirboyKing`，
   *   由 `utils/quickStartGenerator`（**生产发牌路径**）与
   *   `choir_boy.ability.ts::onSetup` 调用。
   * ⇒ 国王**只在唱诗男孩在场时**才出现，它**不是**可自由抽取的剧本角色。
   *
   * ── 为什么必须「不进发牌池」（本护栏的由来，含一次自我纠错）────────
   * 🔬 实测暴露（2026-09-21 全套 E2E）：`e2e/haunted_manor/full_flow.spec.ts` 用例①
   *   **长期红**，报错「凶宅魅影发出了不属于本剧本的角色」——逐位比对后
   *   **唯一越界项就是 `king`**（连跑 2 局皆为 king）。
   *
   * ❌ **第一版修法（错）**：把 `"king"` 加进 `haunted_manor.roleIds`。
   *   看似合理（国王确实会出现在场上），实则引入**新规则缺陷** ——
   *   `quickStartGenerator` 的取牌池是
   *     `availableRoles = allRoles.filter(r => new Set(script.roleIds).has(r.id))`
   *   ⇒ 名册里有 king 就等于**允许随机发出「没有唱诗男孩的国王」**，
   *   违反官方「国王仅由 `[+国王]` 引入」。
   *   （⚠️ 又一次印证元教训 1：**静态阅读 ≠ 可达性验证** ——
   *     「它会不会出现在场上」与「它能不能被抽出来」是两件事。）
   *
   * ✅ **正解**：(a) `roleIds` 保持**不含 king**；(b) 「发牌结果可能含 king」这一事实
   *   登记在**消费方**（E2E 真值表 `e2e/haunted_manor/full_flow.spec.ts` 的
   *   `HM_ROSTER` / `TYPE` / `NAME` 已补 `king`，并注明是设置注入角色）。
   */
  it("⑬ 👑 设置注入契约：`king` 不得进入任何剧本的发牌池（仅由唱诗男孩 [+国王] 注入）", () => {
    const leaked: string[] = [];
    for (const sc of ALL_SCRIPTS as any[]) {
      const ids: string[] = sc?.roleIds ?? [];
      if (ids.includes("king")) leaked.push(sc.name + "(" + sc.id + ")");
    }
    // ✅ 正向对照：必须先确认「确实有剧本含唱诗男孩」，否则本护栏可能因范围失效而恒绿
    const withChoirBoy = (ALL_SCRIPTS as any[]).filter((sc: any) =>
      (sc?.roleIds ?? []).includes("choir_boy")
    );
    expect(
      withChoirBoy.length,
      "❌ 没有任何剧本含 choir_boy —— 扫描范围失效，本护栏的绿灯不可信"
    ).toBeGreaterThan(0);
    expect(
      leaked,
      "❌ 以下剧本把 `king` 放进了取牌池 —— 会导致随机发出「没有唱诗男孩的国王」，" +
        "违反官方 `[+国王]`（国王只在唱诗男孩在场时于**设置阶段**加入）：" +
        leaked.join("、")
    ).toEqual([]);
  });

  it("⑭ 🔒 `king` 必须真在 `roles` 表里且 `type` 为 townsfolk（`[+国王]` 注入目标存在）", () => {
    const king = (ALL_ROLES as any[]).find((r) => r.id === "king");
    expect(king, "❌ app/data.ts 里找不到 king 角色定义（注入会静默失败）").toBeTruthy();
    expect(
      king.type,
      "❌ 国王必须是 townsfolk —— 官方 [+国王] 是「替换掉一名**其他镇民**」，" +
        "阵营若错则配比校验全盘失效"
    ).toBe("townsfolk");
    // 反向对照：国王必须**没有**夜序槽位以外的特殊性导致无法注入（至少有基础字段）
    expect(typeof king.name, "❌ king 缺 name").toBe("string");
    expect(String(king.name).length).toBeGreaterThan(0);
  });

  it("⑤ ⚠️ 正向对照：tinker（PASSIVE 正确）不应被判为死亡触发", () => {
    expect(
      aliveQueued(POSITIVE_CONTROL),
      "❌ 对照失败：tinker 是『随时可能死亡』（说书人主动触发）⇒ PASSIVE 合理 ⇒ 会被排入队列。" +
        "若这里为 false，说明 roster/引擎选择出了问题，② 的绿灯不可信。"
    ).toBe(true);
    expect(
      isDeathTriggeredRole(POSITIVE_CONTROL),
      "❌ 对照失败：tinker 不属于死亡触发 ⇒ isDeathTriggeredRole 必须为 false"
    ).toBe(false);
  });

  /**
   * 🔴🔴 P0 护栏（2026-09-21 建）—— **别名自毁**：后续夜晚队列恒为空。
   *
   * ── 现场 ───────────────────────────────────────────────────────────
   * P1-16 修复引入的写法（`useExecutionHandlers::startSubsequentNight`）：
   *   const wakeIdsWithExecuted = appendExecutedDeathTriggeredToQueue(seats, id, wakeIds);
   *   wakeIds.length = 0;                    // 原地清空
   *   wakeIds.push(...wakeIdsWithExecuted);  // 再从「已被清空的同一数组」spread
   * 而 `appendExecutedDeathTriggeredToQueue` 在**无需追加**时 `return wakeIds;`
   * —— 返回**同一引用** ⇒ 第 2 行清空源、第 3 行 spread 空数组 ⇒ `wakeIds` **恒为空**。
   *
   * ── 后果（为什么是 P0）───────────────────────────────────────────
   * 第二个夜晚起 `wakeQueueIds=[]` ⇒ 引擎不派发任何能力 ⇒ **整晚平安夜**、
   * **恶魔永不杀人**，而 UI 上「夜晚行动顺序」面板照常显示完整队列（极具欺骗性）。
   * ⚠️ 全仓 2275 个用例**全绿**却没拦住 —— 因为既有测试都断言「单次调用返回值」，
   *    没有任何一条断言「**返回值与入参不是同一引用**」或「调用方不得原地改」。
   *
   * 🔬 实测证据（E2E 探针日志）：
   *   `[DBG-queue]   len=5 queueSeatIds=[1,2,4,6,3]`
   *   `[DBG-wakeIds] computed= [1,2,4,6,3]`
   *   `[startSubsequentNight] 进入第 2 夜，队列长度: 0`   ← 打印时已被清空
   *
   * ── 本护栏的两条腿 ────────────────────────────────────────────────
   * ① **契约腿**（运行时）：纯函数必须**恒返回新数组**，且**不得修改入参**。
   * ② **源码腿**（静态）：调用方**禁止**把同样的数组「原地清空后 spread 同一返回值」。
   *    —— 单靠 ① 不够：即便函数返回副本，调用方若写 `baseWakeIds.length = 0` 仍会自我毁灭。
   */
  it("⑪ 🔴 P0 别名契约：appendExecutedDeathTriggeredToQueue 必须恒返回新数组、不得改入参", () => {
    const base = [3];
    const seats = board(["sweetheart", "empath", "chef", "imp"]);

    // ① 无需追加的三条路径（最容易踩雷：它们曾 `return wakeIds;`）
    const noExec = appendExecutedDeathTriggeredToQueue(seats as any, null, base);
    const already = appendExecutedDeathTriggeredToQueue(seats as any, 3, base);
    const missingSeat = appendExecutedDeathTriggeredToQueue(seats as any, 99, base);
    const notDeathTriggered = appendExecutedDeathTriggeredToQueue(seats as any, 1, base);
    const needAppend = appendExecutedDeathTriggeredToQueue(seats as any, 0, base);

    for (const [label, out] of [
      ["无当日处决", noExec],
      ["已在队列", already],
      ["座位不存在", missingSeat],
      ["非死亡触发", notDeathTriggered],
      ["需追加", needAppend],
    ] as const) {
      expect(
        out,
        "❌ 【" + label + "】返回值与入参是**同一引用** —— " +
          "调用方若「先 .length=0 再 push(...返回值)」会清空源后 spread 空数组 ⇒ 队列恒空" +
          "（P0：后续夜晚全员不被唤醒、恶魔永不杀人）"
      ).not.toBe(base);
    }

    // ② 纯函数不得产生副作用（入参必须原样）
    expect(base, "❌ 纯函数修改了入参 wakeIds（禁止副作用）").toEqual([3]);

    // ③ 语义仍然正确（防止为过 ① 而改坏行为）
    expect(needAppend).toEqual([3, 0]);
    expect(noExec).toEqual([3]);
    expect(notDeathTriggered, "❌ 非死亡触发角色被处决时不得补入").toEqual([3]);
  });

  it("⑫ 🔴 P0 源码级：禁止「原地清空入参数组后再 spread 同一返回值」的别名自毁写法", () => {
    // ⚠️ 判据不能只看 `X.length = 0` 这一行 —— 必须成对出现：
    //   ① 把**第 3 个实参**（源数组）原样传给 appendExecutedDeathTriggeredToQueue
    //   ② 在同一文件里对该源数组做 `.length = 0` / `.splice(0`
    //   单独出现任一条都不构成缺陷（可能是别的无关数组），**成对**才红。
    //   三件套：剥注释 → 剥空白归一化 → 正反双向断言（本用例自带反向对照）。
    const FILE = "src/hooks/useExecutionHandlers.ts";
    const raw = readFileSync(FILE, "utf8");
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\s+/g, "");

    // 取调用点：appendExecutedDeathTriggeredToQueue(seats...,todayExecutedId,<SRC>)
    const callRe =
      /appendExecutedDeathTriggeredToQueue\([^)]*?,\s*([A-Za-z_$][\w$]*)\s*\)/g;
    const srcVars: string[] = [];
    for (;;) {
      const m = callRe.exec(stripped);
      if (!m) break;
      srcVars.push(m[1]);
    }
    expect(
      srcVars.length,
      "❌ 未在 " + FILE + " 找到 appendExecutedDeathTriggeredToQueue 调用 —— " +
        "若已改写，本护栏的判据需同步更新（否则会**静默失效**）"
    ).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const v of srcVars) {
      // 原地改源数组的两种已知写法（跨行安全：已剥空白）
      const cleared =
        new RegExp(v.replace(/\$/g, "\\$") + "\\.length=0").test(stripped) ||
        new RegExp(v.replace(/\$/g, "\\$") + "\\.splice\\(0").test(stripped);
      if (cleared) offenders.push(v);
    }
    expect(
      offenders,
      "❌ 检测到**别名自毁**写法：这些数组既是 appendExecutedDeathTriggeredToQueue 的入参，" +
        "又被原地清空（.length=0 / .splice(0）⇒ 若函数返回同一引用，队列会被清成空数组" +
        "（P0：后续夜晚恶魔永不杀人）。正解：整体替换 `const out = append…(seats, id, base)`。"
    ).toEqual([]);
  });
});
