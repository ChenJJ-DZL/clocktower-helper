/**
 * 孤儿角色审计矩阵（orphan roles audit · 自定义剧本场景）
 *
 * 背景（用户 2026-10-08 要求）：
 *   `app/data.ts` 定义 168 个角色，9 个内置剧本只引用 84 个
 *   ⇒ **84 个孤儿角色**从未进过任何测试矩阵，却在「自定义剧本构建器」
 *   （CustomScriptBuilderModal，用户可自由组池）中随时被选用。
 *   本测试以罂粟花开矩阵（poppyganda_matrix_full）为模板，把孤儿常规角色
 *   按自定义剧本场景机械测穿。
 *
 * 范围裁决：
 *   · 常规角色 59（townsfolk 26 / outsider 10 / minion 13 / demon 10）→ 走 L2 矩阵全扫；
 *   · traveler 17 / fabled 8 → 官方设计就不进剧本 roleIds / 夜序
 *     （旅行者=中途加入、传奇=说书人工具），只做「不入夜序」负向断言 + 定义完整性核对；
 *   · `king`：🔴 铁律「king 不得进剧本 roleIds」（唱诗男孩 [+国王] 设置期注入，
 *     见 reserved_abilities_ledger.test.ts）⇒ orphan_audit.roleIds **不含 king**，
 *     但 roster 层照常测它的座位行为（护栏 scriptRoles 是静态源码扫描，不受运行时影响）。
 *
 * 保真铁规：全部继承自 harness/scriptMatrix.ts 头注（systemStepRoleId 必传 /
 *   队列判定为准 / 同伴不与被测角色同 id / 基线恶魔 imp）。
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { roles, scripts, TRAVELER_ROLES } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import {
  collectScriptMatrix,
  findCell,
  printMatrixSummary,
  writeMatrixReport,
  type MutateCtx,
  type ScriptMatrixConfig,
} from "./harness/scriptMatrix";
import type { AdapterFlags } from "./harness/scriptMatrix";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

/* ───────────────── 孤儿花名册（来源：temp/orphan_inventory.ts 实测盘点） ───────────────── */

const ORPHAN_ROSTER = {
  townsfolk: [
    "astrologer", "saint_townsfolk", "bard", "miner", "professor_female",
    "monk_female", "missionary", "alchemist", "magician", "half_ogre",
    "banshee", "villager", "princess", "priestess", "knight", "steward",
    "conjurer", "pilgrim", "noble", "amnesiac", "engineer", "fisherman",
    "ranger", "atheist", "cannibal", "king",
  ],
  outsider: [
    "qutler", "acrobat", "damsel", "golem", "puzzlemaster",
    "zealot", "hatter", "ogre", "heretic", "hermit",
  ],
  minion: [
    "widow", "organ_grinder", "boffin", "fearmonger", "wizard", "xaan",
    "wraith", "vizier", "boomdandy", "summoner", "harpy", "psychopath", "shaman",
  ],
  demon: [
    "leech", "hadesia", "riot", "lord_of_typhon", "kazali",
    "lloam", "saint_demon", "titus", "leviathan", "liz",
  ],
} as const;

/** 旅行者 + 传奇（官方不进夜序；这里只做负向断言与定义核对） */
// 口径：官方旅行者 15 + fabled 8（sentinel/spirit_of_ivory 双宿主去重后 6）
const TRAVELER_FABLED_IDS = [
  // traveler（官方 15 个，来自 TRAVELER_ROLES）
  ...TRAVELER_ROLES.map((r) => r.id),
  // fabled（8；sentinel/spirit_of_ivory 同 id 双定义，去重后 6 个新 id）
  "sentinel", "spirit_of_ivory",
  "revolutionary", "doomsayer", "fibbin", "hells_librarian", "buddhist", "angel",
];

/** 已知无新引擎 ability 文件的孤儿（2026-10-08 盘点）——显式台账，不许静默 */
const KNOWN_NO_ABILITY_FILE = ["monk_female", "saint_demon"];

/**
 * deathTriggered 语义细分（孤儿审计 2026-10-08 实测裁定）：
 * `NightOrderEntry.deathTriggered` 的语义是「该角色的死亡触发**后续**动作」，
 * **不等于**「自己死→自己夜里被唤醒」（那是守鸦人 ravenkeeper 的专属语义）：
 *   · banshee 报丧女妖：官方「如果**被恶魔杀死**，在**白天**觉醒并宣布」
 *     —— 夜醒断言不成立（需恶魔击杀 + 白天觉醒，属日间专项）；
 *   · hatter 帽匠：官方「如果你死亡，所有**邪恶玩家**可以交换角色」
 *     —— 死者已死不会自己醒，触发的是**他人**行动。
 * ⇒ 两者只断言「常态三夜不唤醒」，死亡触发路径登记为日间/专项待办。
 */
const DEATH_TRIGGER_NOT_SELF_WAKE = new Set(["banshee", "hatter"]);

/* ───────────────── 矩阵配置（状态定义照抄暗流涌动矩阵，保真注释一致） ───────────────── */

const CONFIG: ScriptMatrixConfig = {
  scriptId: "orphan_audit",
  scriptName: "孤儿角色审计（自定义剧本池）",
  roster: ORPHAN_ROSTER,
  nights: [1, 2, 3],
  companions: {
    townsfolkPool: ["washerwoman", "chef", "empath", "soldier", "mayor"],
    outsider: "butler",
    minion: "poisoner",
    demon: "imp",
  },
  // 孤儿里没有酒鬼/提线木偶本体，但「酒鬼伪装」状态对孤儿镇民依然成立
  // （自定义剧本里酒鬼会伪装成任意镇民——包括孤儿角色）
  states: [
    // ① 常态（推导基线以此状态为准）
    { name: "常态" },

    // ② 中毒：官方「他在当晚和明天白天中毒」→ 能力失效
    {
      name: "中毒",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[0].statusEffects = [{ type: "poisoned" }];
      },
    },

    // ③ 酒鬼伪装：官方「你以为你是一个镇民角色，但其实你不是」→ 得假信息
    {
      name: "酒鬼伪装",
      applicableTo: (t) => t === "townsfolk",
      mutateSeats: ({ seats, roleId, r }: MutateCtx) => {
        seats[0].role = r("drunk");
        seats[0].charadeRole = r(roleId);
        // 保真：生产在设置阶段由 drunk.ability.ts 写入 permanent drunk 状态效果
        seats[0].statusEffects = [{ type: "drunk", permanent: true }];
      },
    },

    // ④ 陌客在座：官方「你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡」
    { name: "陌客在座", extraSeat: () => "recluse" },

    // ⑤ 间谍在座：官方「你可能会被当作善良阵营、镇民角色或外来者角色」
    { name: "间谍在座", extraSeat: () => "spy" },

    // ⑥ 昨夜有人被处决：条件唤醒角色的排程源（双注入：snapshot 喂队列 / flags 喂 adapter）
    {
      name: "昨夜处决",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[1].isDead = true;
        (seats[1] as any).executedToday = true;
      },
      snapshot: () => ({ todayExecutedId: 1 }),
      flags: (): AdapterFlags => ({ lastDuskExecution: 1 }),
    },

    // ⑦ 本角色今夜死亡：死亡触发型角色的排程源 + 其余角色的负向不变量
    {
      name: "本角色今夜死亡",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[0].isDead = true;
      },
      snapshot: () => ({ deadThisNight: [0] }),
    },
  ],
};

/* ───────────────── 测试主体 ───────────────── */

let RES: ReturnType<typeof collectScriptMatrix>;

describe("孤儿角色审计 · 自定义剧本场景（84 孤儿 / 常规 59 全矩阵）", () => {
  beforeAll(() => {
    // 🔴 保真前置：必须先注册能力，否则 ENGINE_CONFIG.fullNightOrder 退化（假绿）
    initializeAbilityRegistry();
    // 动态注册「孤儿审计」宿主剧本（仅测试进程内存，不落盘 app/data.ts）。
    // roleIds 不含 king —— 铁律见文件头注。
    if (!scripts.find((s) => s.id === "orphan_audit")) {
      scripts.push({
        id: "orphan_audit",
        name: "孤儿角色审计（自定义剧本池）",
        difficulty: "审计",
        description: "测试内动态注册的宿主剧本，承载孤儿角色的夜序与 adapter 采集。",
        roleIds: [
          ...ORPHAN_ROSTER.townsfolk.filter((id) => id !== "king"),
          ...ORPHAN_ROSTER.outsider,
          ...ORPHAN_ROSTER.minion,
          ...ORPHAN_ROSTER.demon,
        ],
      });
    }
  });

  /* ─────────── ⭐⭐ 官方预期唤醒表（独立事实源，2026-10-08 逐条对撞官方原文裁定） ───────────
   * ⚠️ 变异检验教训：仅断言「注册表 vs 队列」是**同源循环**（fullNightOrder 由 priority
   * 生成，改 priority = 改预期 = 恒一致，organ_grinder 变异实证假绿）。
   * 本表 = 独立事实源：每条经官方原文（角色卡/ability 头注官方引文/词表）人工裁定。
   * 规则：「每个夜晚」→[1,2,3]；「每个夜晚*」→[2,3]；「首个夜晚」→[1]；
   *       被动/白天/死亡触发 → []（deathTriggered 由死亡事件驱动，非常规夜序）。
   */
  it("前置自检：能力注册表已装载，夜序表足量", () => {
    expect(
      ENGINE_CONFIG.fullNightOrder.length,
      "夜序表条目过少 → 极可能漏了 initializeAbilityRegistry()"
    ).toBeGreaterThan(50);
  });

  it("采集 59 角色 × 3 夜 × 7 状态 = 1239 单元格，硬错误（文案卫生类）为 0", () => {
    RES = collectScriptMatrix(CONFIG);
    const file = writeMatrixReport(CONFIG, RES);
    printMatrixSummary(RES);
    expect(RES.cells.length).toBe(59 * 3 * 7);
    console.log(`\n报告已写入：${file}`);

    const withAnomaly = RES.cells.filter((c) => c.anomalies.length > 0);
    expect(
      withAnomaly.length,
      `存在硬错误：${withAnomaly
        .slice(0, 12)
        .map(
          (c) =>
            `${c.roleId}/${c.night}夜/${c.state}: ${c.anomalies.join(",")}`
        )
        .join(" | ")}`
    ).toBe(0);
  });

  /* ─────────── ⭐ 注册-唤醒推导一致性（判据：注册表 NightOrderEntry 机械推导） ───────────
   * 推导规则：
   *   entry.firstNightPriority > 0                    → n1 应有自身能力节点
   *   entry.otherNightPriority > 0 && !deathTriggered → n2/n3 应有自身能力节点
   *   deathTriggered / 无 entry                       → 常态三夜均无自身能力节点
   * 条件唤醒（requiresExecutedToday 等快照门控）在常态不唤醒属**正确**行为，
   * 归入 deviations（带 reason），不判红 —— 由「昨夜处决」等状态覆盖其唤醒路径。
   */
  it("⭐ 注册-唤醒推导一致性：注册表预期 vs 实际队列（偏差必须可解释）", () => {
    const entries = new Map(ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e]));
    const deviations: string[] = [];

    for (const roleId of [
      ...ORPHAN_ROSTER.townsfolk,
      ...ORPHAN_ROSTER.outsider,
      ...ORPHAN_ROSTER.minion,
      ...ORPHAN_ROSTER.demon,
    ]) {
      const b = RES.baselineAbilityWake[roleId];
      expect(b, `${roleId} 未采集到常态基线`).toBeDefined();
      const entry = entries.get(roleId);

      const expectN1 = !!entry && entry.firstNightPriority > 0;
      const expectOther =
        !!entry && entry.otherNightPriority > 0 && !entry.deathTriggered;

      if (!entry) {
        // 注册表无条目：三夜都不该被自身能力唤醒
        for (const [n, v] of [["n1", b.n1], ["n2", b.n2], ["n3", b.n3]] as const) {
          if (v)
            deviations.push(
              `${roleId}: 注册表无 NightOrderEntry，但 ${n} 被自身能力唤醒（幽灵节点？）`
            );
        }
        continue;
      }

      if (entry.deathTriggered) {
        // 死亡触发型：常态三夜都不该被自身能力唤醒
        for (const [n, v] of [["n1", b.n1], ["n2", b.n2], ["n3", b.n3]] as const) {
          if (v)
            deviations.push(
              `${roleId}: deathTriggered 角色常态 ${n} 被唤醒（门控失效？）`
            );
        }
        // 语义细分：只有「自己死→自己醒」型（守鸦人）才断言死亡状态夜醒；
        // banshee（白天觉醒）/ hatter（触发他人）见 DEATH_TRIGGER_NOT_SELF_WAKE 注释
        if (!DEATH_TRIGGER_NOT_SELF_WAKE.has(roleId)) {
          const dead = findCell(RES, roleId, 2, "本角色今夜死亡");
          if (dead && dead.applicable && !dead.abilityWoken) {
            deviations.push(
              `${roleId}: deathTriggered 角色在「今夜死亡」状态第2夜未被唤醒（触发断链？）`
            );
          }
        }
        continue;
      }

      if (expectN1 !== b.n1) {
        deviations.push(
          `${roleId}: firstNightPriority=${entry.firstNightPriority} 但 n1 实际=${b.n1}`
        );
      }
      if (expectOther && !b.n2) {
        deviations.push(
          `${roleId}: otherNightPriority=${entry.otherNightPriority} 但 n2 常态未唤醒（若为条件唤醒请登记）`
        );
      }
      if (!expectOther && b.n2) {
        deviations.push(
          `${roleId}: otherNightPriority=${entry.otherNightPriority} 但 n2 实际唤醒了`
        );
      }
    }

    // 第一轮：允许带 reason 的条件唤醒偏差为 0 条 —— 有偏差先修或登记，不许静默
    expect(
      deviations,
      `注册-唤醒一致性偏差 ${deviations.length} 条：\n` +
        deviations.map((d) => `  · ${d}`).join("\n")
    ).toEqual([]);
  });

  it("⭐⭐ 官方预期唤醒表：实际唤醒夜必须与官方裁定一致（独立事实源）", () => {
    const OFFICIAL_WAKE_EXPECT: Record<string, number[]> = {
      // ── townsfolk ──
      astrologer: [1, 2, 3],      // 官方「每个夜晚」（无*）；ability 头注「首夜不行动」为错误自注
      missionary: [1, 2, 3],      // 官方「每个夜晚，你要选择一名玩家」（无*）
      professor_female: [2, 3],   // 复活需先有死者（首夜无死可复），与男版教授同构
      priestess: [1, 2, 3],       // 官方「每个夜晚」（无*）
      amnesiac: [1, 2, 3],        // 说书人自定义能力，夜间线索/确认弹性
      engineer: [1, 2, 3],        // 每局一次，夜晚选择改角色
      ranger: [1, 2, 3],          // 每局一次，夜晚选择（孤儿审计已补节点）
      king: [1, 2, 3],            // 官方「每个夜晚，如果死亡数≥存活数」（条件由说书人现场判）
      alchemist: [1],             // 官方「首夜获得爪牙能力」
      knight: [1],
      steward: [1],
      noble: [1],
      pilgrim: [1],
      half_ogre: [2, 3],          // 官方「每个夜晚*」
      // ── outsider ──
      qutler: [1, 2, 3],          // 官方「每个夜晚，选择主人」（无*）
      acrobat: [2, 3],            // 官方「每个夜晚*」
      ogre: [1],                  // 官方「在你的首个夜晚」
      // ── minion ──
      organ_grinder: [1, 2, 3],   // 官方运作：「每个夜晚，唤醒街头风琴手点头或摇头」（无*）
      fearmonger: [1, 2, 3],      // 官方「每个夜晚」（无*）
      wraith: [1, 2, 3],          // 跟随邪恶唤醒（邪恶首夜互认 → 含首夜）
      summoner: [1, 2, 3],        // n1 伪装 / n3 选择；n2 入队由 preCheck 拦（第三夜限制）
      harpy: [1, 2, 3],           // 官方「每个夜晚」（无*）
      widow: [1],                 // 官方「在你的首个夜晚，查看魔典并选玩家中毒」
      boffin: [1],                // 首夜说书人告知恶魔获得的能力
      vizier: [1],                // 首夜公开展示维齐尔（说书人操作型节点）
      // ── demon ──
      leech: [1, 2, 3],           // 首夜必须寄生 + 每夜*
      kazali: [1, 2, 3],          // n1 指定爪牙 + 每夜*杀
      lord_of_typhon: [2, 3],     // 官方「每个夜晚*」
      hadesia: [2, 3],
      lloam: [2, 3],              // 夜晚中毒玩家死亡（自动，每夜）
      titus: [2, 3],
      liz: [2, 3],
      // 未列出者 = 官方无常规夜间节点（纯被动/白天/死亡触发/继承型）→ 预期 []
    };

    const entries = new Map(ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e]));
    const deviations: string[] = [];
    for (const roleId of [
      ...ORPHAN_ROSTER.townsfolk,
      ...ORPHAN_ROSTER.outsider,
      ...ORPHAN_ROSTER.minion,
      ...ORPHAN_ROSTER.demon,
    ]) {
      const expected = OFFICIAL_WAKE_EXPECT[roleId] ?? [];
      const b = RES.baselineAbilityWake[roleId];
      expect(b, `${roleId} 未采集到常态基线`).toBeDefined();
      const actual = [b.n1 && 1, b.n2 && 2, b.n3 && 3].filter(Boolean);
      const missing = expected.filter((n) => !actual.includes(n));
      const extra = actual.filter((n: any) => !expected.includes(n));
      if (missing.length)
        deviations.push(`${roleId}: 官方应唤醒 ${missing.join("/")}夜，实际未唤醒`);
      if (extra.length)
        deviations.push(`${roleId}: 官方无 ${extra.join("/")}夜节点，实际却唤醒（杜撰或优先级误设）`);
    }
    expect(
      deviations,
      `官方预期唤醒表偏差 ${deviations.length} 条：\n` +
        deviations.map((d) => `  · ${d}`).join("\n")
    ).toEqual([]);
  });


  it("已知无 ability 文件的孤儿（monk_female / saint_demon）：显式台账，不许有夜序节点", () => {
    const entries = new Map(ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e]));
    for (const id of KNOWN_NO_ABILITY_FILE) {
      expect(
        entries.has(id),
        `${id} 出现了夜序节点但无 ability 文件 —— 谁在供给节点？核查后更新台账`
      ).toBe(false);
      const b = RES.baselineAbilityWake[id];
      expect(b, `${id} 未采集到基线`).toBeDefined();
      expect(b.n1 && b.n2 && b.n3, `${id} 无实现却常态被唤醒`).toBe(false);
    }
  });

  it("traveler / fabled：官方设计不进夜序 —— fullNightOrder 不得出现这些 id", () => {
    // 例外台账：bureaucrat / thief 官方即有夜间行动（每夜选人改票），
    // 新引擎自 W8.x 起已有正式实现（bureaucrat.ability.ts / thief.ability.ts）
    // —— 它们是唯一允许出现在夜序中的旅行者；新增例外必须先登记于此。
    const NIGHT_ACTION_TRAVELERS = new Set(["bureaucrat", "thief"]);
    const entryIds = new Set(ENGINE_CONFIG.fullNightOrder.map((e) => e.roleId));
    const leaked = TRAVELER_FABLED_IDS.filter(
      (id) => entryIds.has(id) && !NIGHT_ACTION_TRAVELERS.has(id)
    );
    expect(
      leaked,
      `旅行者/传奇泄漏进夜序（它们不该被剧本队列唤醒）：${leaked.join(",")}`
    ).toEqual([]);
    // 定义完整性：全部在角色库中有定义
    const missing = TRAVELER_FABLED_IDS.filter(
      (id) => !roles.find((x) => x.id === id)
    );
    expect(missing, `角色库缺定义：${missing.join(",")}`).toEqual([]);
  });

  it("孤儿审计宿主剧本不含 king（🔴 铁律：king 只由唱诗男孩 [+国王] 注入）", () => {
    const audit = scripts.find((s) => s.id === "orphan_audit")!;
    expect(audit.roleIds).not.toContain("king");
    // 但 king 仍在角色库（唱诗男孩机制依赖它）
    expect(roles.find((x) => x.id === "king")).toBeDefined();
  });

  it("占位引导文案 = 0（词表回退后不再有占位句；新占位 = 回归）", () => {
    const placeholderRoles = new Set<string>();
    for (const c of RES.cells) {
      if (c.state !== "常态" || !c.woken) continue;
      if (/准备执行技能|请执行行动/.test(c.guide)) {
        placeholderRoles.add(c.roleId);
      }
    }
    expect(
      [...placeholderRoles],
      `出现占位引导文案（词表回退失效或词条缺失）：${[...placeholderRoles].join(", ")}`
    ).toEqual([]);
  });

  it("⭐ 唤醒词表覆盖护栏：22 个孤儿角色的 role.<id>.wake 词条必须存在", async () => {
    const { generatedRoleWakeTemplates } = await import(
      "../../data/generatedRoleWakeTemplates"
    );
    const ids = new Set(generatedRoleWakeTemplates.map((t) => t.id));
    const ORPHAN_WAKE_IDS = [
      "astrologer", "professor_female", "alchemist", "magician", "amnesiac",
      "king", "qutler", "acrobat", "damsel", "organ_grinder", "fearmonger",
      "wizard", "xaan", "wraith", "summoner", "harpy", "lord_of_typhon",
      "kazali", "lloam", "titus", "leviathan", "liz",
    ];
    const missing = ORPHAN_WAKE_IDS.filter((id) => !ids.has(`role.${id}.wake`));
    expect(
      missing,
      `唤醒词表缺词条（这些角色的 guide 将退化为占位句）：${missing.join(",")}`
    ).toEqual([]);
  });

  it("报告 JSON 已落盘（temp/reports/orphan_audit_matrix.json）", () => {
    const file = path.resolve(
      process.cwd(),
      "temp/reports/orphan_audit_matrix.json"
    );
    expect(fs.existsSync(file), `报告文件不存在：${file}`).toBe(true);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(json.cells?.length ?? json.length).toBeGreaterThan(0);
  });
});
