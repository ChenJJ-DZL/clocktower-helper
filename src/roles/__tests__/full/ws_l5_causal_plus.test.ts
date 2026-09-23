import { beforeEach, describe, expect, it } from "vitest";

import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import {
  generateDynamicNightQueue,
  hasDeathEventWatch,
  isDeathTriggeredRole,
} from "../../../utils/dynamicQueueGenerator";
import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";
import { AbilityTriggerTiming } from "../../core/roleAbility.types";
import { poAbility } from "../../new_engine/po.ability";
import { vortoxAbility } from "../../new_engine/vortox.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";
import { unifiedRoleDefinition } from "../../unifiedRoleDefinition";
import { initializeAbilityRegistry } from "../../new_engine/abilityRegistry";
import { board, runRole } from "../_tbHarness";

/**
 * L5 · 因果链 · **窃窃私语 补强**（2026-09-22 建，照 `snv_l5_causal_plus.test.ts` 模板）
 * ==================================================================
 * ── 为什么要有这个文件 ────────────────────────────────────────────
 * `ws_l5_causal.test.ts` 已让 32 个角色（窃窃私语 + 无名之墓并集）**各有 3~5 条**
 * （主路径 / 差分 / 负向对照）。本文件在其之上补**两个此前完全没有被断言的维度**：
 *
 *  ① **跨角色「夜间击杀落库四件套」契约**（§A）
 *     此前 L5 只断言 `isDead` + `deathSource`；**没有一条**断言
 *     `markedForDeath` / `diedAtNight`。而下游全靠这两个字段：
 *       · L4 用 `diedAtNight === nightCount` 区分「夜杀」与「白天处决」
 *         （处决走 `diedOnDay` + `deathSource:"execution"`，**不写** `diedAtNight`）；
 *       · 夜报「平安夜 / 有人死」、送葬者、`syncStatusEffectsToSeat` 都认 `markedForDeath`。
 *     ⇒ 删掉这两个字段，原有用例**一条都不会红**（实为断言缺口）。
 *
 *  ② **逐角色「声明式契约」**（§B）
 *     本项目是「声明式规则注册表」（B 方案）：`firstNightPriority` /
 *     `otherNightPriority` / `triggerTiming` / `targetConfig` **就是规则本身**。
 *     本文件把官方原文逐条翻译成这四组字段的期望值，**每角色 1 条**，
 *     使「角色声明」也能被官方文本反向约束（改错声明 ⇒ 立刻红）。
 *
 * ── 判据来源 ──────────────────────────────────────────────────────
 * 一律取 `src/data/officialRoleDocs.json` 的【角色能力】原文（下表中逐个附**逐字**引用），
 * **不读自家实现**（元教训 5：规则语义分歧第一步永远查官方原文）。
 *
 * ⚠️ 只加测试不改生产；发现的分歧只登记（见 §B 的 gossip 说明与交付报告）。
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠️⚠️ 本文件**必须显式传 `snapshot.lastDuskExecution`**（否则假红/假绿）
 * ══════════════════════════════════════════════════════════════════
 * `zombuul.ability.ts:44-45` 的判据是 `lastDuskExecution !== null || dayDeaths > 0`。
 * 而 `_tbHarness.runRole` 的**默认 snapshot 不含该字段** ⇒ `undefined !== null` 为**真**
 * ⇒ 僵怖**恒被判为「今天白天有人死亡」**而不发动（探针实测：`abortReason="今天白天有人死亡"`）。
 *
 * 🔎 **这不是生产缺陷**（已核实写入点）：
 *   · `useGameController.ts:727` → `lastDuskExecution: snap.lastDuskExecution ?? null`
 *   · `app/page.tsx:210`        → `lastDuskExecution: snap.lastDuskExecution ?? null`
 *   生产**两处都做了 `?? null` 归一化**；类型亦为 `number | null`（`types/game.ts:184`），
 *   初始值 `null`（`GameContext.tsx:693`）。
 * ⇒ **是 harness 的债**，不是角色的锅。本文件所有涉及僵怖/条件唤醒的用例都显式传 null。
 *   （同一坑已在 `ws_l1_l2.test.ts:491` 与 `ws_l5_causal.test.ts:21-24` 登记过。）
 */

/** 窃窃私语填充位（**必须是本剧本角色**，且互不干扰） */
const SAFE = ["chambermaid", "gossip", "oracle", "mathematician"];

const after = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

/** 限次能力模块级状态隔离（与 `ws_l5_causal` 同口径） */
beforeEach(() => {
  resetLimitedAbilityUses();
});

// ══════════════════════════════════════════════════════════════════════════
// §A · 跨角色契约：夜间击杀的「落库四件套」
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · ⭐ 跨角色契约：夜间击杀落库四件套（isDead / markedForDeath / diedAtNight / deathSource）", () => {
  /**
   * 窃窃私语三恶魔 —— 官方【角色能力】原文逐条核对：
   *   涡流 「每个夜晚*，你要选择一名玩家：他死亡。…」
   *   珀   「每个夜晚*，你可以选择一名玩家：他死亡。如果上次没选，当晚要选三名…」
   *   僵怖 「每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。…」
   *
   * ⚠️ 三者的**触发条件不同**（涡流必杀 / 珀可选 / 僵怖条件），故各自需要不同的快照：
   *   珀：给 1 个目标 ⇒ 正常单杀（"可选"不改变"选了就死"）。
   *   僵怖：必须显式 `lastDuskExecution: null, dayDeathsToday: 0`（见文件头 ⚠️ 段）。
   */
  const DEMONS = [
    {
      id: "vortox",
      ability: vortoxAbility,
      target: 1,
      source: "vortox_kill",
      snapshot: {},
    },
    {
      id: "po",
      ability: poAbility,
      target: 1,
      source: "po_kill",
      snapshot: {},
    },
    {
      id: "zombuul",
      ability: zombuulAbility,
      target: 1,
      source: "zombuul_kill",
      snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
    },
  ];

  it("① ⭐ 三恶魔击杀必须落「四件套」：isDead + markedForDeath + diedAtNight=nightCount + deathSource", async () => {
    const missing: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
        snapshot: d.snapshot,
      });
      const victim = after(res, d.target);
      if (victim?.isDead !== true) missing.push(d.id + ": 目标未死亡");
      if (victim?.markedForDeath !== true) {
        missing.push(
          d.id +
            ": 缺 `markedForDeath` —— 夜报会永远显示「平安夜」，" +
            "`syncStatusEffectsToSeat` 也认不出死者"
        );
      }
      if (Number(victim?.diedAtNight) !== 2) {
        missing.push(
          d.id +
            ": `diedAtNight`=" +
            victim?.diedAtNight +
            " ≠ nightCount(2) —— L4/夜报无法把它与「白天处决」区分开"
        );
      }
      if (victim?.deathSource !== d.source) {
        missing.push(
          d.id + ": `deathSource`=" + victim?.deathSource + " ≠ " + d.source
        );
      }
    }
    expect(
      missing,
      "❌ 夜间击杀落库不完整（下游：L4 夜杀/处决判据、夜报、送葬者）：\n  " +
        missing.join("\n  ")
    ).toEqual([]);
  });

  it("② 差分：nightCount 变化 ⇒ diedAtNight 必须跟着变（防写死成 2）", async () => {
    const rows: string[] = [];
    for (const n of [3, 5]) {
      const seats = board(["vortox", ...SAFE]);
      const res = await runRole(vortoxAbility, seats, 0, {
        night: n,
        phase: "night",
        targets: [1],
      });
      const got = after(res, 1)?.diedAtNight;
      if (Number(got) !== n) rows.push("nightCount=" + n + " ⇒ diedAtNight=" + got);
    }
    expect(
      rows,
      "❌ `diedAtNight` 未跟随 `snapshot.nightCount` —— 若写死常量，" +
        "第 3 夜起的夜杀会被 L4 判定为「非本夜死亡」"
    ).toEqual([]);
  });

  it("③ 负向对照（门控）：abilityEffective=false ⇒ 三恶魔**都不得**落任何死亡字段", async () => {
    const leaked: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
        snapshot: d.snapshot,
        meta: { abilityEffective: false },
      });
      const victim = after(res, d.target);
      if (victim?.isDead === true) leaked.push(d.id + ": 仍置 isDead");
      if (victim?.markedForDeath === true) leaked.push(d.id + ": 仍置 markedForDeath");
      if (victim?.diedAtNight !== undefined) leaked.push(d.id + ": 仍写 diedAtNight");
      if (victim?.deathSource) leaked.push(d.id + ": 仍写 deathSource");
    }
    expect(
      leaked,
      "❌ 被醉酒/中毒拦下的恶魔仍改写了状态（官方：醉酒/中毒者失去能力）：\n  " +
        leaked.join("\n  ")
    ).toEqual([]);
  });

  it("④ 与「处决死」字段必须互斥：夜杀不得写处决专属字段（保护 L4 的夜/处决判据）", async () => {
    /**
     * 📌 为什么这是一条**契约**而不是细节：
     *   处决死（`useGameController.ts`）写的是
     *     `diedOnDay` + `deathSource:"execution"` + `executedToday=true`，**不写** `diedAtNight`；
     *   夜杀写的是 `diedAtNight` + `markedForDeath`（见 `zombuul.ability.ts:173` 等）。
     *   两套字段一旦串味，L4「必杀恶魔必须产生**夜间**击杀」就会
     *   把白天处决的死者误认为恶魔的刀 ⇒ **假绿**（梦殒春宵那轮实测踩过，见 skill §34.5）。
     */
    const polluted: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
        snapshot: d.snapshot,
      });
      const victim = after(res, d.target);
      const snapV: any = res?.snapshot;
      if (victim?.executedToday === true) polluted.push(d.id + ": 夜里写了 executedToday");
      if (victim?.diedOnDay !== undefined) polluted.push(d.id + ": 夜里写了 diedOnDay");
      if (String(victim?.deathSource).includes("execution")) {
        polluted.push(d.id + ": deathSource 被写成 execution");
      }
      if (snapV?.todayExecutedId === d.target) {
        polluted.push(d.id + ": 把夜杀目标写进了 todayExecutedId");
      }
    }
    expect(
      polluted,
      "❌ 夜间击杀污染了「处决死」的专属字段 ⇒ L4 的夜杀/处决判据会互串（假绿源头）：\n  " +
        polluted.join("\n  ")
    ).toEqual([]);
  });

  it("⑤ 官方「每个夜晚*」⇒ 三恶魔首夜必须有夜序但**不得**在首夜被唤醒", () => {
    initializeAbilityRegistry();
    /**
     * 官方三处都是「每个夜晚**\***」——`*` 的官方含义是「**游戏的首个夜晚不发动**」。
     * 判据（两条腿，缺一即假绿）：
     *   a) `firstNightPriority` 必须为 null / 0（没有首夜槽位）；
     *   b) `otherNightPriority` 必须 > 0（非首夜要发动 —— 否则「不入队」的断言
     *      在 roster 造错时会**恒绿**）。
     * 再用**真实队列**做一次双向验证：首夜队列不含恶魔能力节点、第二夜队列含。
     */
    const bad: string[] = [];
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    for (const d of DEMONS) {
      const ab = abilities.find((a) => a?.roleId === d.id);
      if (!ab) {
        bad.push(d.id + ": 注册表里找不到该能力");
        continue;
      }
      const fn = ab.firstNightPriority;
      const on = ab.otherNightPriority;
      if (!(fn === null || fn === 0 || fn === undefined)) {
        bad.push(d.id + ": firstNightPriority=" + fn + "（官方「每个夜晚*」⇒ 首夜不发动）");
      }
      if (!(typeof on === "number" && on > 0)) {
        bad.push(
          d.id +
            ": otherNightPriority=" +
            on +
            " —— 必须 > 0，否则非首夜永不唤醒（负向对照失效）"
        );
      }

      // ⚠️ 每个恶魔**各建一次队列**（棋盘首位换成该恶魔）
      const seats = board([d.id, "chambermaid", "gossip", "oracle", "mathematician"]);
      const mk = (isFirstNight: boolean, night: number) =>
        generateDynamicNightQueue(
          ENGINE_CONFIG.fullNightOrder,
          {
            seats: JSON.parse(JSON.stringify(seats)),
            statusEffects: {},
            poppyGrowerDead: false,
            reminders: [],
            log: [],
            gamePhase: isFirstNight ? "firstNight" : "night",
            nightCount: night,
            hasCompletedFirstNight: !isFirstNight,
            // ⚠️ 僵怖的条件唤醒会读它（见文件头 ⚠️ 段）
            lastDuskExecution: null,
            dayDeathsToday: 0,
          } as any,
          { isFirstNight }
        );
      const q1 = mk(true, 1);
      const q2 = mk(false, 2);

      /**
       * ⚠️⚠️ 必须判 `node.roleId`，**不能**判 `node.seatId`。
       *   恶魔座位在**首夜队列里是合法存在的** —— 但那是**系统步骤 `demon_info`**
       *   （「恶魔互认」，官方：恶魔首夜要被唤醒拿 3 张不在场伪装 + 得知爪牙），
       *   节点 `seatId` 恰好等于恶魔座位 ⇒ 用 seatId 判会**误报**。
       */
      if (q1.some((n: any) => n.roleId === d.id)) {
        bad.push(d.id + ": 恶魔杀人能力节点出现在**首夜**队列（官方「每个夜晚*」⇒ 首夜不发动）");
      }
      if (!q2.some((n: any) => n.roleId === d.id)) {
        bad.push(d.id + ": 恶魔杀人能力节点未出现在**第二夜**队列（非首夜必须发动）");
      }
      // 反向自证：首夜确实有「恶魔互认」系统步骤（证明上面的判据不是因为队列为空而恒绿）
      if (!q1.some((n: any) => n.roleId === "demon_info" && n.seatId === 0)) {
        bad.push(
          d.id +
            ": 首夜队列里没有 seatId=0 的 `demon_info` 系统步骤 —— " +
            "队列构造异常，本用例的其余判据不可信"
        );
      }
    }
    expect(
      bad,
      "❌ 恶魔首夜规则不符（官方「每个夜晚*」= 首夜不发动）：\n  " + bad.join("\n  ")
    ).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §B · 逐角色「声明式契约」（官方原文 → 四个声明字段）
// ══════════════════════════════════════════════════════════════════════════
interface RoleContract {
  roleId: string;
  cn: string;
  /** 官方【角色能力】原文（判据来源，逐字引自 officialRoleDocs.json） */
  official: string;
  /** 是否有首夜唤醒（`firstNightPriority > 0`） */
  firstNight: boolean;
  /** 是否有非首夜唤醒（`otherNightPriority > 0`） */
  otherNight: boolean;
  /** `triggerTiming` 必须包含的项（官方语义 → 触发时机） */
  timing: string[];
  /**
   * 玩家目标配置的**必须**满足项（仅在官方明文约束时才写）。
   * 官方未明文约束的维度**不写**（断言过严 ≠ 生产缺陷）。
   */
  target?: {
    min?: number;
    max?: number;
    allowSelf?: boolean;
    allowDead?: boolean;
  };
  /** 与官方关系需要额外说明的（登记，不锁断言） */
  note?: string;
}

/**
 * **18 个角色的声明式契约表**（`saint` 见文末的已登记例外）。
 *
 * 每条 `official` 都**逐字**引自 `src/data/officialRoleDocs.json`，用来支撑
 * `firstNight` / `otherNight` / `timing` / `target` 四组期望值。
 *
 * 🔒 判据怎么从原文推出来（三条口径，全表统一）：
 *   · 「**每个夜晚***」（带星）⇒ 首夜**不**发动 ⇒ `firstNight: false`（官方 `*` = 首个夜晚不发动）
 *   · 「每个夜晚」（不带星）/「在你的首个夜晚」 ⇒ `firstNight: true`
 *   · 触发时机 = **玩家行动发生的时段**；「每局游戏限一次，在夜晚时*」⇒ `EVERY_NIGHT`
 */
const CONTRACTS: RoleContract[] = [
  {
    roleId: "chambermaid",
    cn: "侍女",
    official:
      "每个夜晚，你要选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「除你以外的两名**存活**的玩家」⇒ 恰好 2 人、不可选自己、不可选死者
    target: { min: 2, max: 2, allowSelf: false, allowDead: false },
  },
  {
    roleId: "gossip",
    cn: "造谣者",
    official: "每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。",
    // 官方「每个白天…发表声明」⇒ 玩家行动在**白天**；首夜不发动。
    firstNight: false,
    // 但官方同时写「**在当晚**会有一名玩家死亡」⇒ 夜间存在**结算**节点 ⇒ otherNightPriority > 0
    otherNight: true,
    timing: [AbilityTriggerTiming.DAY],
    note:
      "「白天声明 + 当晚结算」两段式：triggerTiming 只声明 DAY（玩家行动时段），" +
      "夜间槽位承载的是**声明正确后的死亡结算**。这与 ws_l3_ui 的 TL_DEVIATION[gossip]" +
      "（夜间节点 0 目标）是同一件事，**属设计而非缺陷**。",
  },
  {
    roleId: "oracle",
    cn: "神谕者",
    official: "每个夜晚*，你会得知有多少名死亡的玩家是邪恶的。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
  },
  {
    roleId: "mathematician",
    cn: "数学家",
    official:
      "每个夜晚，你会得知有多少名玩家的能力因为其他角色的能力而未正常生效。（从上个黎明到你被唤醒时）",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  },
  {
    roleId: "artist",
    cn: "艺术家",
    official: "每局游戏限一次，在白天时，你可以私下询问说书人一个是非问题，你会得知该问题的答案。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.DAY],
  },
  {
    roleId: "flowergirl",
    cn: "卖花女孩",
    official: "每个夜晚*，你会得知在今天白天时是否有恶魔投过票。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
  },
  {
    roleId: "innkeeper",
    cn: "旅店老板",
    official: "每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「两名玩家」⇒ 恰好 2 人（是否可选自己官方未明文 ⇒ 不锁 allowSelf）
    target: { min: 2, max: 2 },
  },
  {
    roleId: "fool",
    cn: "弄臣",
    official: "当你首次将要死亡时，你不会死亡。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.PASSIVE],
  },
  {
    roleId: "recluse",
    cn: "陌客",
    official: "你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.PASSIVE],
  },
  {
    roleId: "politician",
    cn: "政客",
    official: "如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.PASSIVE],
  },
  {
    roleId: "spy",
    cn: "间谍",
    official:
      "每个夜晚，你能查看魔典。 你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  },
  {
    roleId: "witch",
    cn: "女巫",
    official:
      "每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。如果只有三名存活的玩家，你失去此能力。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1 },
  },
  {
    roleId: "assassin",
    cn: "刺客",
    official: "每局游戏限一次，在夜晚时*，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。",
    // 官方「在夜晚时**\***」⇒ 非首夜
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「**可以**选择一名玩家」⇒ 允许不选（min = 0），最多 1 人
    target: { min: 0, max: 1 },
  },
  {
    roleId: "devils_advocate",
    cn: "魔鬼代言人",
    official: "每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：如果明天白天他被处决，他不会死亡。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「一名**存活**的玩家」⇒ 不可选死者
    target: { min: 1, max: 1, allowDead: false },
  },
  {
    roleId: "vortox",
    cn: "涡流",
    official:
      "每个夜晚*，你要选择一名玩家：他死亡。 镇民玩家的能力都会产生错误信息。 如果白天没人被处决，邪恶阵营获胜。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1 },
  },
  {
    roleId: "po",
    cn: "珀",
    official:
      "每个夜晚*，你可以选择一名玩家：他死亡。 如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「**可以**选择一名玩家」+「当晚要选择三名玩家」⇒ 0~3
    target: { min: 0, max: 3 },
  },
  {
    roleId: "zombuul",
    cn: "僵怖",
    official:
      "每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。 当你首次死亡后，你仍存活，但会被当作死亡。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「**如果**今天白天没有人死亡」⇒ 条件唤醒；未死的夜晚必须选 1 人 ⇒ min 0（条件不成立时不唤醒）
    target: { min: 0, max: 1 },
  },
  {
    roleId: "plague_doctor",
    cn: "瘟疫医生",
    official: "当你死亡时，说书人会获得一个爪牙能力。",
    firstNight: false,
    // 与 snv 的 sweetheart / barber 同口径：ON_DEATH 角色**有**非首夜槽位
    // （由死亡事件分发器在死亡当晚入队，不走静态队列）
    otherNight: true,
    timing: [AbilityTriggerTiming.ON_DEATH],
  },
];

describe("L5 · 声明式契约：官方原文 → firstNightPriority / otherNightPriority / triggerTiming / targetConfig", () => {
  initializeAbilityRegistry();

  /** 先自证「表本身没错」——否则 18 条绿灯全部不可信（元教训 0） */
  it("⓪ 自证：契约表必须恰好覆盖窃窃私语除 saint 外的 18 个角色，且注册表里都能找到", () => {
    const WS = [
      "chambermaid", "gossip", "oracle", "mathematician", "artist", "flowergirl",
      "innkeeper", "fool", "saint", "recluse", "politician", "spy", "witch",
      "assassin", "devils_advocate", "vortox", "po", "zombuul", "plague_doctor",
    ];
    expect(WS.length, "❌ 窃窃私语应为 19 个角色").toBe(19);

    const expected = WS.filter((id) => id !== "saint").sort();
    expect(
      CONTRACTS.length,
      "❌ 契约表条目数必须 = 18（少一条就有角色没被约束）"
    ).toBe(expected.length);
    expect(
      CONTRACTS.map((c) => c.roleId).sort(),
      "❌ 契约表的 roleId 集合必须与窃窃私语名册（除 saint）完全一致"
    ).toEqual(expected);

    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const missing = CONTRACTS.filter(
      (c) => !abilities.some((a) => a?.roleId === c.roleId)
    ).map((c) => c.cn + "(" + c.roleId + ")");
    expect(missing, "❌ 以下角色在能力注册表里找不到（契约无法生效 = 假绿）").toEqual([]);
  });

  for (const c of CONTRACTS) {
    it(`${c.cn} ${c.roleId}：声明必须与官方原文一致`, () => {
      const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
      const ab = abilities.find((a) => a?.roleId === c.roleId)!;
      const errs: string[] = [];

      // ① 首夜唤醒（官方「在你的首个夜晚」/「每个夜晚」⇒ true；「每个夜晚*」「白天」「当你死亡时」⇒ false）
      const fn = ab.firstNightPriority;
      const hasFn = typeof fn === "number" && fn > 0;
      if (hasFn !== c.firstNight) {
        errs.push(
          "firstNightPriority=" +
            JSON.stringify(fn) +
            " 与官方期望 " +
            c.firstNight +
            " 不符｜官方：" +
            c.official
        );
      }

      // ② 非首夜唤醒
      const on = ab.otherNightPriority;
      const hasOn = typeof on === "number" && on > 0;
      if (hasOn !== c.otherNight) {
        errs.push(
          "otherNightPriority=" +
            JSON.stringify(on) +
            " 与官方期望 " +
            c.otherNight +
            " 不符｜官方：" +
            c.official
        );
      }

      // ③ 触发时机（官方语义的直接编码）
      const timings: string[] = (ab.triggerTiming ?? []) as string[];
      for (const t of c.timing) {
        if (!timings.includes(t)) {
          errs.push(
            "triggerTiming 缺 " + t + "（实际 " + JSON.stringify(timings) + "）｜官方：" + c.official
          );
        }
      }

      // ④ 目标配置（仅在官方明文约束时校验）
      if (c.target) {
        const tc = ab.targetConfig ?? {};
        for (const [k, want] of Object.entries(c.target)) {
          if (tc[k] !== want) {
            errs.push(
              "targetConfig." + k + "=" + JSON.stringify(tc[k]) + " ≠ " + JSON.stringify(want) +
                "｜官方：" + c.official
            );
          }
        }
      }

      expect(
        errs,
        "❌ " + c.cn + "(" + c.roleId + ") 的声明式契约与官方原文不一致：\n  " +
          errs.join("\n  ") +
          (c.note ? "\n  ℹ️ 说明：" + c.note : "")
      ).toEqual([]);
    });
  }

  /**
   * ⚠️ **已登记的例外**：`saint` —— **刻意不进 CONTRACTS**，此处显式登记。
   *
   * 事实链（与 `ws_l1_l2.test.ts:574-581`、`ws_l2_matrix.test.ts` 的 ⓪ 是**同一件事**）：
   *   · 窃窃私语里的 `saint` 是**外来者版圣徒**（官方：「如果你死于处决，你的阵营落败。」）
   *   · `src/roles/new_engine/saint.ability.ts:229` 的 `roleId` 写的是 **`saint_townsfolk`**
   *     （扩展镇民版），故注册表里**没有** `roleId === "saint"` 的能力。
   *   · 本剧本圣徒的处决诅咒走 **legacy `checkGameEnd`**，`isRoleMigrated("saint") === false`。
   *   · ⚠️ 另外 `getAbilityForRole` 是 `startsWith` 模糊匹配，`getAbilityForRole("saint")`
   *     会**串门**拿到 `saint_townsfolk` 的能力（返回非 null！）⇒ 判「有没有」必须用注册表。
   * ⇒ **不做声明式契约断言**（没有声明可测），但**必须把例外本身断言住**：
   *   一旦有人把 `saint_townsfolk` 改名成 `saint`，本用例立刻红，提醒回来补契约条目。
   */
  it("⚠️ 已登记例外：saint（外来者版）没有新引擎能力，走 legacy checkGameEnd —— 例外本身必须可证伪", () => {
    initializeAbilityRegistry();
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    expect(
      abilities.filter((a) => a?.roleId === "saint").length,
      "❌ 注册表里出现了 roleId='saint' 的能力 —— 例外已失效，" +
        "请把它从本例外中移出并补进 CONTRACTS"
    ).toBe(0);
    expect(
      CONTRACTS.some((c) => c.roleId === "saint"),
      "❌ saint 不应出现在契约表里（它没有可测的声明）"
    ).toBe(false);
  });

  /**
   * 🔒 与既有护栏对齐（防「两套判定漂移」）：
   *   §B 表里的 `timing` 含 ON_DEATH 的角色，必须**同时**满足
   *   `isDeathTriggeredRole(roleId) === true`（`useNightEngine` 打 `deathTriggered` 标的源头）；
   *   反之，`timing` **不含** ON_DEATH 的角色，`isDeathTriggeredRole` 必须为 false。
   *   —— 这条把「官方语义表」与「生产判定函数」绑在一起，任一侧改动都会被另一侧抓住。
   */
  it("🔗 一致性：契约表的 ON_DEATH 期望必须与生产 `isDeathTriggeredRole` 双向一致", () => {
    const mismatches: string[] = [];
    for (const c of CONTRACTS) {
      const expectDeath = c.timing.includes(AbilityTriggerTiming.ON_DEATH);
      const actual = isDeathTriggeredRole(c.roleId);
      if (expectDeath !== actual) {
        mismatches.push(
          c.cn +
            "(" + c.roleId + ")：契约表期望 ON_DEATH=" + expectDeath + "，生产判定=" + actual +
            "｜官方：" + c.official
        );
      }
    }
    expect(
      mismatches,
      "❌ 契约表与 `isDeathTriggeredRole` 不一致（两套判定漂移）：\n  " + mismatches.join("\n  ")
    ).toEqual([]);
  });

  /**
   * 🔒 订阅类（`deathEventWatch`）不得被误判成「自己死亡触发」。
   *
   *   ⚠️ 与 snv 那边**不同**：snv 用 `choir_boy`（订阅 king 的死亡）做正例；
   *      窃窃私语**没有**订阅类角色 ⇒ 这里做**负向对照**：19 个角色**都不该**是订阅者。
   *      （若哪天给本剧本加了订阅角色，本用例会红 —— 提醒补正例而不是删掉它。）
   */
  it("🔗 一致性：窃窃私语 19 角色都不该是死亡事件**订阅者**（本剧本无订阅类角色）", () => {
    const WS = [
      "chambermaid", "gossip", "oracle", "mathematician", "artist", "flowergirl",
      "innkeeper", "fool", "saint", "recluse", "politician", "spy", "witch",
      "assassin", "devils_advocate", "vortox", "po", "zombuul", "plague_doctor",
    ];
    const subscribers = WS.filter((id) => hasDeathEventWatch(id));
    expect(
      subscribers,
      "❌ 以下角色被登记为死亡事件订阅者，但窃窃私语没有订阅类角色 —— " +
        "若这是新增设计，请把本用例改成「正例 + 负例」两条腿：" +
        subscribers.join("、")
    ).toEqual([]);
  });
});
