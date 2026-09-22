import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../../new_engine/abilityRegistry";
import { unifiedRoleDefinition } from "../../unifiedRoleDefinition";
import {
  generateDynamicNightQueue,
  hasDeathEventWatch,
  isDeathTriggeredRole,
} from "../../../utils/dynamicQueueGenerator";
import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";
import { AbilityTriggerTiming } from "../../core/roleAbility.types";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { vigormortisAbility } from "../../new_engine/vigormortis.ability";
import { vortoxAbility } from "../../new_engine/vortox.ability";

/**
 * L5 · 因果链 · **梦殒春宵 补强**（2026-09-21 建）
 * ==================================================================
 * ── 为什么要有这个文件 ────────────────────────────────────────────
 * `snv_l5_causal.test.ts` 已让 25 个角色**各有 3 条**（主路径 / 差分 / 负向对照），
 * 本文件在其之上补**两个此前完全没有被断言的维度**：
 *
 *  ① **跨角色「夜间击杀落库四件套」契约**（§A）
 *     此前 L5 只断言 `isDead` + `deathSource`；**没有任何一条**断言
 *     `markedForDeath` / `diedAtNight`。而下游全靠这两个字段：
 *       · L4 用 `diedAtNight === nightCount` 区分「夜杀」与「白天处决」
 *         （处决走 `diedOnDay` + `deathSource:"execution"`，**不写** diedAtNight）；
 *       · 夜报「平安夜 / 有人死」、送葬者、`syncStatusEffectsToSeat` 都认 `markedForDeath`。
 *     ⇒ 删掉这两个字段，原有 69 条用例**一条都不会红**（实为断言缺口）。
 *
 *  ② **逐角色的「声明式契约」**（§B）
 *     本项目是「声明式规则注册表」（B 方案）：`firstNightPriority` /
 *     `otherNightPriority` / `triggerTiming` / `targetConfig` **就是规则本身**。
 *     本文件把官方原文逐条翻译成这四组字段的期望值，**每角色 1 条**，
 *     使「角色声明」也能被官方文本反向约束（改错声明 ⇒ 立刻红）。
 *
 * ── 判据来源 ──────────────────────────────────────────────────────
 * 一律取 `src/data/officialRoleDocs.json` 的【角色能力】原文（下表中逐个附引用），
 * **不读自家实现**（元教训 5：规则语义分歧第一步永远查官方原文）。
 *
 * ⚠️ 只加测试不改生产；发现的分歧只登记（见 §B philosopher 注释与交付报告）。
 */

const SAFE = ["chambermaid", "gossip", "grandmother", "tinker"];
const after = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

/** 限次能力模块级状态隔离（与 `snv_l5_causal` 同口径） */
beforeEach(() => {
  resetLimitedAbilityUses();
});

// ══════════════════════════════════════════════════════════════════════════
// §A · 跨角色契约：夜间击杀的「落库四件套」
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · ⭐ 跨角色契约：夜间击杀落库四件套（isDead / markedForDeath / diedAtNight / deathSource）", () => {
  /**
   * 梦殒春宵四恶魔 —— 官方【角色能力】原文逐条核对（全部是「必须杀人」）：
   *   方古    「每个夜晚*，你要选择一名玩家：他死亡。…」
   *   亡骨魔  「每个夜晚*，你要选择一名玩家：他死亡。…」
   *   诺-达鲺 「每个夜晚*，你要选择一名玩家：他死亡。…」
   *   涡流    「每个夜晚*，你要选择一名玩家：他死亡。…」
   */
  const DEMONS = [
    { id: "fang_gu", ability: fang_guAbility, target: 1, source: "fang_gu_kill" },
    { id: "vigormortis", ability: vigormortisAbility, target: 1, source: "vigormortis_kill" },
    { id: "no_dashii", ability: no_dashiiAbility, target: 2, source: "no_dashii_kill" },
    { id: "vortox", ability: vortoxAbility, target: 1, source: "vortox_kill" },
  ];

  it("① ⭐ 四恶魔击杀必须落「四件套」：isDead + markedForDeath + diedAtNight=nightCount + deathSource", async () => {
    const missing: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
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
            ": `diedAtNight`=" + victim?.diedAtNight + " ≠ nightCount(2) —— " +
            "L4/夜报无法把它与「白天处决」区分开"
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

  it("③ 负向对照（门控）：abilityEffective=false ⇒ 四恶魔**都不得**落任何死亡字段", async () => {
    const leaked: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
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
     *   处决死（`useGameController.ts:503-517`）写的是
     *     `diedOnDay` + `deathSource:"execution"` + `executedToday=true`，**不写** `diedAtNight`；
     *   夜杀写的是 `diedAtNight` + `markedForDeath`。
     *   两套字段一旦串味，L4 用例④「必杀恶魔必须产生**夜间**击杀」就会
     *   把白天处决的死者误认为恶魔的刀 ⇒ **假绿**（本会话实测踩过）。
     */
    const polluted: string[] = [];
    for (const d of DEMONS) {
      const seats = board([d.id, ...SAFE]);
      const res = await runRole(d.ability, seats, 0, {
        night: 2,
        phase: "night",
        targets: [d.target],
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

  it("⑤ 官方「每个夜晚*」⇒ 四恶魔首夜必须有夜序但**不得**在首夜被唤醒", () => {
    initializeAbilityRegistry();
    /**
     * 官方四处都是「每个夜晚**\***」——`*` 的官方含义是「**游戏的首个夜晚不发动**」。
     * 判据（两条腿，缺一即假绿）：
     *   a) `firstNightPriority` 必须为 null / 0（没有首夜槽位）；
     *   b) `otherNightPriority` 必须 > 0（非首夜要发动 —— 否则「不入队」的断言
     *      在 roster 造错时会**恒绿**）。
     * 再用**真实队列**做一次双向验证：首夜队列不含恶魔、第二夜队列含恶魔。
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
          d.id + ": otherNightPriority=" + on + " —— 必须 > 0，否则非首夜永不唤醒（负向对照失效）"
        );
      }

      // ⚠️ 每个恶魔**各建一次队列**（棋盘首位换成该恶魔）——
      //    用同一张 vortox 棋盘去断言 4 个恶魔会漏 3 个（本用例第二版即栽在此）。
      const seats = board([d.id, "chambermaid", "gossip", "grandmother", "tinker"]);
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
          } as any,
          { isFirstNight }
        );
      const q1 = mk(true, 1);
      const q2 = mk(false, 2);

      /**
       * ⚠️⚠️ 必须判 `node.roleId`，**不能**判 `node.seatId`（本用例首版即栽在此）。
       *
       *   恶魔座位在**首夜队列里是合法存在的** —— 但那是**系统步骤 `demon_info`**
       *   （「恶魔互认」，官方：恶魔首夜要被唤醒拿 3 张不在场伪装 + 得知爪牙），
       *   `priority 2.5`，节点 `seatId` 恰好等于恶魔座位 ⇒ 用 seatId 判会**误报**。
       *   官方「每个夜晚**\***」约束的是**恶魔的杀人能力**是否发动，即
       *   `roleId === <demonId>` 的能力节点。
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
          d.id + ": 首夜队列里没有 seatId=0 的 `demon_info` 系统步骤 —— " +
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
  /** 已知与官方存在分歧、**刻意不锁断言**的说明（只登记） */
  divergence?: string;
}

/**
 * 25 角色的声明式契约表。
 *
 * 每条 `official` 都**逐字**引自 `src/data/officialRoleDocs.json`，用来支撑
 * `firstNight` / `otherNight` / `timing` / `target` 四组期望值。
 */
const CONTRACTS: RoleContract[] = [
  {
    roleId: "clockmaker",
    cn: "钟表匠",
    official: "在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离。（邻座的玩家距离为1）",
    firstNight: true,
    otherNight: false,
    timing: [AbilityTriggerTiming.FIRST_NIGHT],
  },
  {
    roleId: "dreamer",
    cn: "筑梦师",
    official:
      "每个夜晚，你要选择除你及旅行者以外的一名玩家：你会得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「除你及旅行者以外的一名玩家」⇒ 必须选 1 人、不可选自己。旅行者维度由队列层排除。
    target: { min: 1, max: 1, allowSelf: false },
  },
  {
    roleId: "snake_charmer",
    cn: "舞蛇人",
    official: "每个夜晚，你要选择一名存活的玩家：如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「一名**存活**的玩家」⇒ 不可选死者
    target: { min: 1, max: 1, allowDead: false },
  },
  {
    roleId: "mathematician",
    cn: "数学家",
    official: "每个夜晚，你会得知有多少名玩家的能力因为其他角色的能力而未正常生效。（从上个黎明到你被唤醒时）",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
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
    roleId: "town_crier",
    cn: "城镇公告员",
    official: "每个夜晚*，你会得知在今天白天时是否有爪牙发起过提名。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
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
    roleId: "savant",
    cn: "博学者",
    official: "每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.DAY],
  },
  {
    roleId: "seamstress",
    cn: "女裁缝",
    official: "每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：你会得知他们是否为同一阵营。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    // 官方「除你以外的**两名**玩家」
    target: { min: 2, max: 2, allowSelf: false },
  },
  {
    roleId: "philosopher",
    cn: "哲学家",
    official:
      "每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。 如果这个角色在场，他醉酒。",
    firstNight: true,
    otherNight: true,
    // ⚠️⚠️ 已知分歧（**刻意不锁断言**，待人工裁决）
    //   官方明文是「在**夜晚**时」，但生产声明为 `triggerTiming: [DAY]`
    //   （`src/roles/new_engine/philosopher.ability.ts:227`），且**同时**有夜序槽位
    //   （`firstNightPriority: 6` / `otherNightPriority: 4`，与官方 S&V 夜序「哲学家最先」
    //     相符）⇒ 该角色会**同时**出现在夜间唤醒队列**和**日间能力入口（`dayAbilityBridge`）。
    //   本用例**只断言官方要求的行为**（夜晚必须被唤醒）；声明分歧单独登记，
    //   不写断言锁死现状（锁死会把缺陷固化成"预期"）。
    //   ⚠️ 改动它需先确认「夜间是否有选角色的入口」——若只有日间面板能选，
    //     直接改成 EVERY_NIGHT 会让哲学家彻底无法发动。⇒ 需人工实测后裁决。
    timing: [],
    divergence:
      "官方「在夜晚时」vs 声明 triggerTiming=[DAY]（philosopher.ability.ts:227）；夜序槽位 6/4 存在",
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
    roleId: "juggler",
    cn: "杂耍艺人",
    official:
      "在你的首个白天，你可以公开猜测任意玩家的角色最多五次。在当晚，你会得知猜测正确的角色数量。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT, AbilityTriggerTiming.DAY],
  },
  {
    roleId: "sage",
    cn: "贤者",
    official: "如果恶魔杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个恶魔。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.ON_DEATH],
  },
  {
    roleId: "mutant",
    cn: "畸形秀演员",
    official: "如果你“疯狂”地证明自己是外来者，你可能被处决。",
    firstNight: false,
    otherNight: false,
    timing: [AbilityTriggerTiming.PASSIVE],
  },
  {
    roleId: "sweetheart",
    cn: "心上人",
    official: "当你死亡时，会有一名玩家开始醉酒。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.ON_DEATH],
  },
  {
    roleId: "barber",
    cn: "理发师",
    official: "如果你死亡，在当晚恶魔可以选择两名玩家（不能选择其他恶魔）交换角色。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.ON_DEATH],
  },
  {
    roleId: "klutz",
    cn: "呆瓜",
    official: "当你得知你死亡时，你要公开选择一名存活的玩家：如果他是邪恶的，你的阵营落败。",
    firstNight: false,
    otherNight: false,
    // ⚠️ 声明为 PASSIVE 是**可接受**的（已实测验证，非缺陷）：
    //   官方运作是「当呆瓜玩家被**宣布**死亡时，他必须宣布自己是呆瓜，然后选择一名玩家」
    //   —— 是**公开宣告**（说书人/玩家主动触发），不是夜间唤醒；
    //   且它的 fn/on 皆为 null ⇒ **根本没有夜序槽位** ⇒ 不存在
    //   「标 PASSIVE 导致 deathTriggered=false、存活时被误唤醒」的风险
    //   （那个风险只对「有夜序槽位却标 PASSIVE」的角色成立，如历史上的 sweetheart/barber/sage）。
    //   ⇒ 元教训 0：静态扫描只产生候选项，必须反例验证。
    timing: [AbilityTriggerTiming.PASSIVE],
  },
  {
    roleId: "evil_twin",
    cn: "镜像双子",
    official:
      "你与一名对立阵营的玩家互相知道对方是什么角色。 如果其中善良玩家被处决，邪恶阵营获胜。 如果你们都存活，善良阵营无法获胜。",
    firstNight: true,
    otherNight: false,
    timing: [AbilityTriggerTiming.FIRST_NIGHT],
  },
  {
    roleId: "witch",
    cn: "女巫",
    official: "每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。如果只有三名存活的玩家，你失去此能力。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1 },
  },
  {
    roleId: "cerenovus",
    cn: "洗脑师",
    official: "每个夜晚，你要选择一名玩家和一个善良角色。他明天白天和夜晚需要“疯狂”地证明自己是这个角色，不然他可能被处决。",
    firstNight: true,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1 },
  },
  {
    roleId: "pit_hag",
    cn: "麻脸巫婆",
    official:
      "每个夜晚*，你要选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1 },
  },
  {
    roleId: "fang_gu",
    cn: "方古",
    official:
      "每个夜晚*，你要选择一名玩家：他死亡。 被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。[+1外来者]",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },
  {
    roleId: "vigormortis",
    cn: "亡骨魔",
    official: "每个夜晚*，你要选择一名玩家：他死亡。 被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。[-1外来者]",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },
  {
    roleId: "no_dashii",
    cn: "诺-达鲺",
    official: "每个夜晚*，你要选择一名玩家：他死亡。 与你邻近的两名镇民中毒。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },
  {
    roleId: "vortox",
    cn: "涡流",
    official:
      "每个夜晚*，你要选择一名玩家：他死亡。 镇民玩家的能力都会产生错误信息。 如果白天没人被处决，邪恶阵营获胜。",
    firstNight: false,
    otherNight: true,
    timing: [AbilityTriggerTiming.EVERY_NIGHT],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },
];

describe("L5 · 声明式契约：官方原文 → firstNightPriority / otherNightPriority / triggerTiming / targetConfig", () => {
  initializeAbilityRegistry();

  /** 先自证「表本身没错」——否则 25 条绿灯全部不可信（元教训 0） */
  it("⓪ 自证：契约表必须恰好覆盖梦殒春宵 25 个角色，且注册表里都能找到", () => {
    const SNV = [
      "clockmaker", "dreamer", "snake_charmer", "mathematician", "flowergirl",
      "town_crier", "oracle", "savant", "seamstress", "philosopher", "artist",
      "juggler", "sage", "mutant", "sweetheart", "barber", "klutz", "evil_twin",
      "witch", "cerenovus", "pit_hag", "fang_gu", "vigormortis", "no_dashii", "vortox",
    ];
    expect(CONTRACTS.length, "❌ 契约表条目数必须 = 25（少一条就有角色没被约束）").toBe(
      SNV.length
    );
    expect(
      CONTRACTS.map((c) => c.roleId).sort(),
      "❌ 契约表的 roleId 集合必须与梦殒春宵名册完全一致"
    ).toEqual([...SNV].sort());
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
          (c.divergence ? "\n  ⚠️ 已知分歧（本用例未锁断言）：" + c.divergence : "")
      ).toEqual([]);
    });
  }

  /**
   * ⚠️ 「已知分歧」单独登记 —— **刻意不断言现状**。
   *
   * 为什么要单列而不是塞进上面的循环：若把它写进 `timing` 期望值，
   * 只能二选一 ——要么断言官方值（用例必红，阻塞 CI）、
   * 要么断言现状（把缺陷固化成"预期"，最坏）。两条都不可接受。
   * 正解：**登记 + 不锁**，交人工裁决（元教训：规则语义分歧先查官方原文，
   * 改动需先验证 UI 是否有替代入口）。
   */
  it("⚠️ 分歧登记：philosopher 的 triggerTiming 与官方「在夜晚时」不符（待人工裁决，本用例不锁现状）", () => {
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const ab = abilities.find((a) => a?.roleId === "philosopher")!;
    const fn = ab.firstNightPriority;
    const on = ab.otherNightPriority;
    // 只断言**官方要求的行为**：官方「在夜晚时」⇒ 夜间必须唤醒（夜里得有机会发动）。
    expect(
      typeof fn === "number" && fn > 0 && typeof on === "number" && on > 0,
      "❌ 官方【哲学家】是「在夜晚时…」（officialRoleDocs.json）⇒ 必须被排进夜间队列；" +
        "当前 fn=" + JSON.stringify(fn) + " on=" + JSON.stringify(on)
    ).toBe(true);
    // 声明分歧只记录（不 assert 现状，避免把缺陷冻结）
    // eslint-disable-next-line no-console
    console.log(
      "⚠️ [待裁决] philosopher.triggerTiming = " +
        JSON.stringify(ab.triggerTiming) +
        "，官方原文为「每局游戏限一次，**在夜晚时**，你可以选择一个善良角色」；" +
        "同时它有夜序槽位 fn=" + fn + "/on=" + on + " ⇒ 会经 `utils/dayAbilityBridge` 出现在" +
        "【日间能力入口】，形成「夜+日」双入口。改法需先确认夜间是否存在「选角色」的 UI 入口。"
    );
  });

  /**
   * 🔒 与既有护栏对齐（防「两套判定漂移」）：
   *   §B 表里的 `timing` 含 ON_DEATH 的角色，必须**同时**满足：
   *     · `isDeathTriggeredRole(roleId) === true`（`useNightEngine` 打 `deathTriggered` 标的源头）
   *     · §A/`snv_l5_causal` 里的 ON_DEATH 语义一致
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
   *   代表：`choir_boy`（订阅 **king** 的死亡，而非自己死亡）。
   */
  it("🔗 一致性：订阅类角色（deathEventWatch）不得与 ON_DEATH 混同", () => {
    expect(
      hasDeathEventWatch("choir_boy"),
      "❌ choir_boy 必须订阅 king 的死亡（`deathEventWatch.roleId === 'king'`）"
    ).toBe(true);
    expect(
      isDeathTriggeredRole("choir_boy"),
      "❌ choir_boy 是**订阅他人死亡**，不是「自己死亡触发」；" +
        "若为 true 说明 §B/A 的 ON_DEATH 语义被混同（会影响死亡事件分发器的分组）"
    ).toBe(false);
  });
});
