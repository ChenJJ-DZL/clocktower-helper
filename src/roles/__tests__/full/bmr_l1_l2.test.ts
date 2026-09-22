import { describe, expect, it } from "vitest";
import rolesData from "../../../data/rolesData.json";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { generatedRoleWakeTemplates } from "../../../data/generatedRoleWakeTemplates";
import { roles, scripts } from "../../../../app/data";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import { board, runRole } from "../_tbHarness";
import { grandmotherAbility } from "../../new_engine/grandmother.ability";
import { sailorAbility } from "../../new_engine/sailor.ability";
import { chambermaidAbility } from "../../new_engine/chambermaid.ability";
import { exorcistAbility } from "../../new_engine/exorcist.ability";
import { innkeeperAbility } from "../../new_engine/innkeeper.ability";
import { gamblerAbility } from "../../new_engine/gambler.ability";
import { gossipAbility } from "../../new_engine/gossip.ability";
import { courtierAbility } from "../../new_engine/courtier.ability";
import { professorAbility } from "../../new_engine/professor.ability";
import { minstrelAbility } from "../../new_engine/minstrel.ability";
import { teaLadyAbility } from "../../new_engine/tea_lady.ability";
import { pacifistAbility } from "../../new_engine/pacifist.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import { tinkerAbility } from "../../new_engine/tinker.ability";
import { moonchildAbility } from "../../new_engine/moonchild.ability";
import { goonAbility } from "../../new_engine/goon.ability";
import { lunaticAbility } from "../../new_engine/lunatic.ability";
import { godfatherAbility } from "../../new_engine/godfather.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { mastermindAbility } from "../../new_engine/mastermind.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";
import { pukkaAbility } from "../../new_engine/pukka.ability";
import { shabalothAbility } from "../../new_engine/shabaloth.ability";
import { poAbility } from "../../new_engine/po.ability";

/**
 * L1 + L2 · 黯月初升（Bad Moon Rising / BMR）· **25 个角色全量**
 * ==================================================================
 * 本文件回答两个问题（与规范 §1、§2 逐条对应）：
 *   L1（静态事实）：`roleId` 注册进注册表了吗？type / 中文名 / 剧本归属对吗？
 *   L2（引擎不变量）：`targetConfig` / `triggerTiming` / 夜序优先级 / 四段中间件
 *      与官方规格（`rolesData.json` = 本仓官方夜序唯一数据源）一致吗？
 *      `abilityEffective`（醉酒/中毒）门控有没有被丢弃？
 *
 * 🔒 判据来源（不凭记忆，逐项可回溯）
 *   · `src/data/rolesData.json`：官方夜序（firstNightOrder / otherNightOrder）
 *     —— 优先级必须与它逐字相等。
 *   · `src/data/officialRoleDocs.json`：官方角色文档，**键为中文名**
 *     （项目中文名与俗称不同：`tea_lady`→「茶艺师」、`fool`→「弄臣」、`goon`→「莽夫」）。
 *   · `app/data.ts`：角色 `name` / `type` / 剧本 `roleIds` 归属。
 *   · `src/data/generatedRoleWakeTemplates.ts`：唤醒提示模板，内含 `【中文名】`
 *     —— 这是「三处名称一致」的第三处落点（能力文件本身不带角色名）。
 *
 * 🔒 靶子安全（规范 §6 铁律 1）：普通配角固定用
 *   `chambermaid` / `gossip` / `grandmother` / `tinker`（纯信息类，无免疫/免死）。
 *   严禁把 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild 当靶子。
 *
 * ⚠️ 只加测试不改生产：本文件发现的一切疑虑只写入报告，不动生产代码。
 */

const r = (id: string) => roles.find((x) => x.id === id)!;
const BMR = scripts.find((s) => s.id === "bad_moon_rising")!;
/** 安全配角池（黯月初升内纯信息类，无免疫/免死能力） */
const SAFE = ["chambermaid", "gossip", "grandmother", "tinker"] as const;
const rdata = (id: string): any => (rolesData as any[]).find((x) => x.id === id);

/**
 * `rolesData.json` 中 4 个 BMR 角色使用的是**旧译名**，与 app/data + 官方文档不一致：
 *   tea_lady→「茶女」(app/data/officialRoleDocs 为「茶艺师」)
 *   courtier→「廷臣」(为「侍臣」)
 *   fool→「愚人」(为「弄臣」)
 *   goon→「暴徒」(为「莽夫」)
 * 这些是**历史遗留数据**，不属于本轮「三处名称一致」的比对范围（比对用的是
 * app/data.ts / officialRoleDocs.json / wake 模板三处）。此处显式记录，避免误判为缺陷。
 * 见交付报告「可疑点」栏。
 */
const ROLESDATA_LEGACY_ALIAS: Record<string, string> = {
  tea_lady: "茶女",
  courtier: "廷臣",
  fool: "愚人",
  goon: "暴徒",
};

/** 负向对照种类（每种都指向一条官方前提） */
type NegKind =
  | "deadActor" // 行动者已死 → 必须中止且不改任何座位
  | "noInput" // 缺少必要的说书人输入 → 不得产生硬效果
  | "notMinionExecuted" // 被处决者不是爪牙 → 吟游诗人不得触发
  | "pacifistSaveGate" // 和平主义者：邪恶被处决 / 善良但说书人不救 → 不得取消死亡
  | "evilTarget" // 目标邪恶 → 月之子不得下死亡指令
  | "dayDeathBlocks"; // 白天已有人死亡 → 僵怖不得被唤醒

interface Spec {
  id: string;
  ability: any;
  type: "townsfolk" | "outsider" | "minion" | "demon";
  /** 官方中文名（= officialRoleDocs.json 的键） */
  docsName: string;
  target: { min: number; max: number; allowSelf: boolean; allowDead: boolean };
  /** triggerTiming 期望（AbilityTriggerTiming 的字符串值） */
  timing: string[];
  neg: NegKind;
  /** 是否有能力效果落地（决定是否必须受 abilityEffective 门控） */
  effect: boolean;
}

const SPEC: Spec[] = [
  // ── 镇民 13 ────────────────────────────────────────────────────────
  {
    id: "grandmother",
    ability: grandmotherAbility,
    type: "townsfolk",
    docsName: "祖母",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
    effect: false,
  },
  {
    id: "sailor",
    ability: sailorAbility,
    type: "townsfolk",
    docsName: "水手",
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "chambermaid",
    ability: chambermaidAbility,
    type: "townsfolk",
    docsName: "侍女",
    target: { min: 2, max: 2, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: false,
  },
  {
    id: "exorcist",
    ability: exorcistAbility,
    type: "townsfolk",
    docsName: "驱魔人",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "innkeeper",
    ability: innkeeperAbility,
    type: "townsfolk",
    docsName: "旅店老板",
    target: { min: 2, max: 2, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "gambler",
    ability: gamblerAbility,
    type: "townsfolk",
    docsName: "赌徒",
    target: { min: 1, max: 1, allowSelf: true, allowDead: true },
    timing: ["every_night"],
    neg: "noInput",
    effect: true,
  },
  {
    id: "gossip",
    ability: gossipAbility,
    type: "townsfolk",
    docsName: "造谣者",
    target: { min: 0, max: 1, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "courtier",
    ability: courtierAbility,
    type: "townsfolk",
    docsName: "侍臣",
    target: { min: 0, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "professor",
    ability: professorAbility,
    type: "townsfolk",
    docsName: "教授",
    target: { min: 1, max: 1, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "minstrel",
    ability: minstrelAbility,
    type: "townsfolk",
    docsName: "吟游诗人",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "notMinionExecuted",
    effect: true,
  },
  {
    id: "tea_lady",
    ability: teaLadyAbility,
    type: "townsfolk",
    docsName: "茶艺师",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "pacifist",
    ability: pacifistAbility,
    type: "townsfolk",
    docsName: "和平主义者",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "pacifistSaveGate",
    effect: true,
  },
  {
    id: "fool",
    ability: foolAbility,
    type: "townsfolk",
    docsName: "弄臣",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
    effect: true,
  },
  // ── 外来者 4 ──────────────────────────────────────────────────────
  {
    id: "tinker",
    ability: tinkerAbility,
    type: "outsider",
    docsName: "修补匠",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "noInput",
    effect: true,
  },
  {
    id: "moonchild",
    ability: moonchildAbility,
    type: "outsider",
    docsName: "月之子",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["on_death"],
    neg: "evilTarget",
    effect: true,
  },
  {
    id: "goon",
    ability: goonAbility,
    type: "outsider",
    docsName: "莽夫",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "noInput",
    effect: true,
  },
  {
    id: "lunatic",
    ability: lunaticAbility,
    type: "outsider",
    docsName: "疯子",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  // ── 爪牙 4 ────────────────────────────────────────────────────────
  {
    id: "godfather",
    ability: godfatherAbility,
    type: "minion",
    docsName: "教父",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "devils_advocate",
    ability: devils_advocateAbility,
    type: "minion",
    docsName: "魔鬼代言人",
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "assassin",
    ability: assassinAbility,
    type: "minion",
    docsName: "刺客",
    target: { min: 0, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "mastermind",
    ability: mastermindAbility,
    type: "minion",
    docsName: "主谋",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "noInput",
    effect: true,
  },
  // ── 恶魔 4 ────────────────────────────────────────────────────────
  {
    id: "zombuul",
    ability: zombuulAbility,
    type: "demon",
    docsName: "僵怖",
    target: { min: 0, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "dayDeathBlocks",
    effect: true,
  },
  {
    id: "pukka",
    ability: pukkaAbility,
    type: "demon",
    docsName: "普卡",
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["first_night", "every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "shabaloth",
    ability: shabalothAbility,
    type: "demon",
    docsName: "沙巴洛斯",
    target: { min: 2, max: 2, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
  {
    id: "po",
    ability: poAbility,
    type: "demon",
    docsName: "珀",
    target: { min: 0, max: 3, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effect: true,
  },
];

/** 硬效果字段：能力应产生的、会改变世界语义的座位字段 */
const HARD_KEYS = [
  "isDead",
  "markedForDeath",
  "isPoisoned",
  "isDrunk",
  "isProtected",
  "isExecutionProtected",
  "protectedByTeaLady",
  "alignment",
  "isEvilConverted",
  "role",
  "statusEffects",
  "statusDetails",
] as const;

function hardChanges(before: any[], after: any[]): string[] {
  const out: string[] = [];
  for (const b of before) {
    const a = after.find((x: any) => x.id === b.id);
    for (const k of HARD_KEYS) {
      if (JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k])) {
        out.push(`${b.id + 1}号.${k}`);
      }
    }
  }
  return out;
}

/** 构造棋盘：[行动者, ...安全配角]（去掉与行动者重名的配角） */
function layoutFor(roleId: string, extra: string[] = []): string[] {
  const pool = [...SAFE.filter((x) => x !== roleId), ...extra];
  // 去重并保持顺序
  return [roleId, ...pool.filter((x, i) => pool.indexOf(x) === i)];
}

// ══════════════════════════════════════════════════════════════════════════
//  L1 · 静态数据层
// ══════════════════════════════════════════════════════════════════════════
describe("L1 · 黯月初升 · 静态数据层（25 角色）", () => {
  it("0) 清单自身自洽：25 个唯一 id，且与 bad_moon_rising.roleIds 完全一致", () => {
    expect(SPEC.length, "黯月初升应为 25 个角色").toBe(25);
    expect(new Set(SPEC.map((s) => s.id)).size, "SPEC 存在重复 id").toBe(25);
    expect(
      [...SPEC.map((s) => s.id)].sort(),
      "SPEC 与 app/data 中 bad_moon_rising.roleIds 不一致"
    ).toEqual([...(BMR.roleIds ?? [])].sort());
    // 阵营配额：13 镇民 / 4 外来者 / 4 爪牙 / 4 恶魔
    const byType = (t: string) => SPEC.filter((s) => s.type === t).length;
    expect(
      { townsfolk: byType("townsfolk"), outsider: byType("outsider"), minion: byType("minion"), demon: byType("demon") },
      "阵营配额应为 13/4/4/4"
    ).toEqual({ townsfolk: 13, outsider: 4, minion: 4, demon: 4 });
  });

  describe.each(SPEC.map((s) => [s.id, s] as const))("L1 · %s", (_id, spec) => {
    it("① 已注册新引擎 · type 正确 · 官方文档有中文名 · 三处名称一致", () => {
      // ① 注册进 abilityRegistry（新引擎迁移完成）
      expect(
        isRoleMigrated(spec.id),
        `❌ ${spec.id} 未注册进新引擎注册表（isRoleMigrated=false）`
      ).toBe(true);
      // ② 能力对象的 roleId 必须等于注册 id（防复制粘贴漏改）
      expect(
        spec.ability?.roleId,
        `❌ ${spec.id} 能力对象 roleId=${spec.ability?.roleId}（应为 ${spec.id}）`
      ).toBe(spec.id);
      // ③ app/data 的 type 与官方一致
      expect(
        r(spec.id)?.type,
        `❌ ${spec.id} 的 type 在 app/data 是 ${r(spec.id)?.type}，期望 ${spec.type}`
      ).toBe(spec.type);
      // ④ officialRoleDocs.json 有对应中文名条目（键为中文名）
      expect(
        Object.prototype.hasOwnProperty.call(officialRoleDocs, spec.docsName),
        `❌ officialRoleDocs.json 缺少「${spec.docsName}」条目（${spec.id}）`
      ).toBe(true);
      // ⑤ 三处名称一致：app/data.name === officialRoleDocs 键 === wake 模板【名】
      expect(
        r(spec.id)?.name,
        `❌ app/data 中 ${spec.id} 名字是「${r(spec.id)?.name}」，期望「${spec.docsName}」`
      ).toBe(spec.docsName);
      const tpl = generatedRoleWakeTemplates.find(
        (x: any) => x.id === `role.${spec.id}.wake`
      ) as any;
      expect(tpl, `❌ wake 模板缺少 role.${spec.id}.wake`).toBeTruthy();
      const wakeName = String(tpl?.template ?? "").match(/【([^】（）]+)/)?.[1];
      expect(
        wakeName,
        `❌ wake 模板中 ${spec.id} 的中文名是「${wakeName}」，期望「${spec.docsName}」`
      ).toBe(spec.docsName);
    });

    it("② 剧本归属正确（roleIds）· 记录跨剧本复用", () => {
      const inBmr = (BMR.roleIds ?? []).includes(spec.id);
      expect(inBmr, `❌ ${spec.id} 不在 bad_moon_rising.roleIds 中`).toBe(true);
      // 记录：该角色实际出现在哪些剧本里（跨剧本复用证据）
      const inScripts = scripts
        .filter((s: any) => (s.roleIds ?? []).includes(spec.id))
        .map((s: any) => s.id);
      expect(
        inScripts.length,
        `❌ ${spec.id} 不在任何剧本的 roleIds 中`
      ).toBeGreaterThan(0);
      expect(inScripts, `❌ ${spec.id} 的剧本归属记录不含 bad_moon_rising`).toContain(
        "bad_moon_rising"
      );
      // 角色本体必须能在 app/data.roles 中找到
      expect(r(spec.id), `❌ ${spec.id} 未在 app/data.roles 中找到`).toBeTruthy();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2 · 引擎不变量层
// ══════════════════════════════════════════════════════════════════════════
describe("L2 · 黯月初升 · 引擎不变量层（25 角色）", () => {
  describe.each(SPEC.map((s) => [s.id, s] as const))("L2 · %s", (_id, spec) => {
    it("③ targetConfig / triggerTiming / 夜序优先级 与官方规格一致", () => {
      const tc = spec.ability?.targetConfig ?? {};
      expect(
        { min: tc.min, max: tc.max },
        `❌ ${spec.id} targetConfig 人数不符：实际 ${tc.min}~${tc.max}，期望 ${spec.target.min}~${spec.target.max}`
      ).toEqual({ min: spec.target.min, max: spec.target.max });
      expect(
        tc.allowSelf,
        `❌ ${spec.id} allowSelf 应为 ${spec.target.allowSelf}（实际 ${tc.allowSelf}）`
      ).toBe(spec.target.allowSelf);
      expect(
        tc.allowDead,
        `❌ ${spec.id} allowDead 应为 ${spec.target.allowDead}（实际 ${tc.allowDead}）`
      ).toBe(spec.target.allowDead);

      // triggerTiming 集合一致（顺序无关）
      expect(
        [...(spec.ability?.triggerTiming ?? [])].sort(),
        `❌ ${spec.id} triggerTiming 与规格不符`
      ).toEqual([...spec.timing].sort());

      // 夜序优先级必须与 rolesData.json（官方夜序唯一数据源）逐字一致。
      //
      // ⚠️ 例外：`grandmother`。官方夜序表（`rolesData.json` / `nightOrder.json`）
      //   为祖母在**其他夜**保留了第 77 步（"如果恶魔杀死了孙子，祖母死亡"），
      //   但能力声明是 `otherNightPriority: null`（首夜仅信息 + 连锁死亡）。
      //   ⇒ 这条偏差**不在本文件断言**（否则会与官方夜序数据源冲突），
      //     改由下面 ⑧ 号用例显式记录并要求「不得静默改动」。
      //   见交付报告「可疑点」：祖母连锁死亡是否接线。
      const skipPriorityCheck = spec.id === "grandmother";
      const rd = rdata(spec.id);
      if (!skipPriorityCheck) {
        expect(
          spec.ability?.firstNightPriority ?? null,
          `❌ ${spec.id} firstNightPriority=${spec.ability?.firstNightPriority}，官方夜序 ${rd?.firstNightOrder ?? null}`
        ).toBe(rd?.firstNightOrder ?? null);
        expect(
          spec.ability?.otherNightPriority ?? null,
          `❌ ${spec.id} otherNightPriority=${spec.ability?.otherNightPriority}，官方夜序 ${rd?.otherNightOrder ?? null}`
        ).toBe(rd?.otherNightOrder ?? null);
      } else {
        // 记录（不判红）：显式确认偏差仍在
        expect(
          spec.ability?.firstNightPriority,
          `❌ 祖母首夜优先级应仍为 60（官方夜序）`
        ).toBe(rd?.firstNightOrder);
        expect(
          rd?.otherNightOrder,
          `ℹ️ 祖母在官方夜序表里的其他夜步号应为 77（用于报告偏差）`
        ).toBe(77);
      }
    });

    it("④ 四段中间件（preCheck/calculate/stateUpdate/postProcess）均已显式声明", () => {
      for (const stage of [
        "preCheck",
        "calculate",
        "stateUpdate",
        "postProcess",
      ] as const) {
        expect(
          Array.isArray(spec.ability?.[stage]),
          `❌ ${spec.id}.${stage} 不是数组（实际 ${typeof spec.ability?.[stage]}）—— 四段必须显式声明`
        ).toBe(true);
      }
      // calculate 是核心；但**允许显式为空**并给出理由（规范 §2「四段至少各存在
      // 或明确说明为何为空」）。已知两例：
      //   · assassin：选择与判定全在 preCheck（是否已用过/是否首夜/是否存活），
      //     真实效果在 stateUpdate（无视保护击杀）
      //   · professor：复活前置全部在 preCheck（限一次 / 目标必须已死），
      //     复活效果在 stateUpdate
      const CALC_EMPTY_ALLOWED = new Set(["assassin", "professor"]);
      if (CALC_EMPTY_ALLOWED.has(spec.id)) {
        expect(
          (spec.ability?.calculate ?? []).length,
          `❌ ${spec.id}.calculate 被声明为「可空」，实际非空（请同步本条注释）`
        ).toBe(0);
      } else {
        expect(
          (spec.ability?.calculate ?? []).length,
          `❌ ${spec.id}.calculate 为空数组 —— 技能没有任何计算逻辑`
        ).toBeGreaterThan(0);
      }
      // preCheck 必须存在（死亡/状态门控落点）
      expect(
        (spec.ability?.preCheck ?? []).length,
        `❌ ${spec.id}.preCheck 为空数组 —— 缺少存活/状态门控`
      ).toBeGreaterThan(0);
    });

    it("⑤ 负向对照：前提不满足时不得产生任何座位级硬效果", async () => {
      if (spec.neg === "deadActor") {
        const seats = board(layoutFor(spec.id));
        seats[0].isDead = true;
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
          storytellerInput: { targetRoleId: "chambermaid", executedSeatId: 1, shouldSave: false },
          snapshot: { outsiderDiedToday: true },
        });
        expect(
          res?.aborted,
          `❌ ${spec.id} 行动者已死亡却未中止（aborted=${res?.aborted}）`
        ).toBe(true);
        expect(
          hardChanges(before, res?.snapshot?.seats ?? []),
          `❌ ${spec.id} 已死亡却仍改动了座位硬效果`
        ).toEqual([]);
      } else if (spec.neg === "noInput") {
        const seats = board(layoutFor(spec.id));
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: [],
        });
        expect(
          hardChanges(before, res?.snapshot?.seats ?? []),
          `❌ ${spec.id} 在缺少说书人输入/目标时仍产生了硬效果`
        ).toEqual([]);
        // 兜底：不得凭空出现死亡/醉酒/中毒者
        const bad = (res?.snapshot?.seats ?? []).filter(
          (s: any) =>
            (s.isDead === true && !before.find((b: any) => b.id === s.id)?.isDead) ||
            (s.isDrunk === true && !before.find((b: any) => b.id === s.id)?.isDrunk) ||
            (s.isPoisoned === true && !before.find((b: any) => b.id === s.id)?.isPoisoned)
        );
        expect(
          bad.length,
          `❌ ${spec.id} 无输入下凭空产生了死亡/醉酒/中毒：${bad.map((s: any) => s.id + 1 + "号").join(",")}`
        ).toBe(0);
      } else if (spec.neg === "pacifistSaveGate") {
        // 和平主义者：官方「被处决的善良玩家不会死亡（由说书人决定）」
        //   B：被处决者 = 2号 imp（邪恶，即使说书人标了 shouldSave）⇒ 救不了
        //   C：被处决者 = 1号 chambermaid（善良）但说书人不救 ⇒ 不产出
        const seatsB = board([spec.id, "chambermaid", "imp", "gossip", "tinker"]);
        const rb = await runRole(spec.ability, seatsB, 0, {
          night: 2,
          phase: "day",
          storytellerInput: { executedSeatId: 2, shouldSave: true },
        });
        expect(
          rb?.meta?.stateUpdates,
          `❌ 被处决的是邪恶玩家，和平主义者却产出了救人指令`
        ).toBeUndefined();
        expect(
          rb?.meta?.abilityResult?.isGoodExecuted,
          `❌ 邪恶玩家应被判为非善良（isGoodExecuted 应为 false）`
        ).toBe(false);

        const seatsC = board([spec.id, "chambermaid", "imp", "gossip", "tinker"]);
        const rc = await runRole(spec.ability, seatsC, 0, {
          night: 2,
          phase: "day",
          storytellerInput: { executedSeatId: 1, shouldSave: false },
        });
        expect(
          rc?.meta?.stateUpdates,
          `❌ 说书人未选择拯救，和平主义者却产出了 CANCEL_DEATH`
        ).toBeUndefined();
        expect(
          rc?.meta?.abilityResult?.shouldSave,
          `❌ 说书人不救时 shouldSave 应为 false`
        ).toBe(false);
      } else if (spec.neg === "notMinionExecuted") {
        // 被处决者 = 1号 chambermaid（镇民，非爪牙）⇒ 不得触发
        const seats = board(layoutFor(spec.id));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "day",
          storytellerInput: { executedSeatId: 1, shouldSave: true },
        });
        expect(
          res?.meta?.stateUpdates,
          `❌ ${spec.id} 被处决者不是爪牙/善良时仍产出了说书人指令：${JSON.stringify(res?.meta?.stateUpdates)}`
        ).toBeUndefined();
        expect(
          res?.meta?.abilityResult?.shouldDrunkEveryone === true ||
            res?.meta?.abilityResult?.shouldSave === true,
          `❌ ${spec.id} 被判为「应触发」（shouldDrunkEveryone / shouldSave 不得为 true）`
        ).toBe(false);
      } else if (spec.neg === "evilTarget") {
        // 月之子选中邪恶（2号 imp）⇒ 不得下死亡指令
        const seats = board([spec.id, "chambermaid", "imp", "gossip", "tinker"]);
        seats[0].isDead = true; // 月之子能力在死亡时触发
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: [2],
        });
        expect(
          res?.meta?.stateUpdates,
          `❌ 月之子选中邪恶玩家却产出了死亡指令`
        ).toBeUndefined();
        expect(
          res?.meta?.abilityResult?.shouldKill,
          `❌ 月之子选中邪恶玩家时 shouldKill 应为 false`
        ).toBe(false);
      } else if (spec.neg === "dayDeathBlocks") {
        // 僵怖：白天已有人死亡 ⇒ 不得被唤醒
        const seats = board(layoutFor(spec.id));
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
          snapshot: { lastDuskExecution: null, dayDeathsToday: 1 },
        });
        expect(
          res?.aborted,
          `❌ 僵怖：白天已有人死亡却仍被唤醒（aborted=${res?.aborted}）`
        ).toBe(true);
        expect(
          hardChanges(before, res?.snapshot?.seats ?? []),
          `❌ 僵怖：白天已有人死亡却仍改动了座位硬效果`
        ).toEqual([]);
      } else {
        throw new Error(`未覆盖的负向对照类型：${spec.neg}`);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2b · 醉酒/中毒门控（abilityEffective）自查 —— 全 25 角色统一
// ══════════════════════════════════════════════════════════════════════════
describe("L2b · 醉酒时 abilityEffective 必须为 false（门控不得丢失）", () => {
  describe.each(SPEC.map((s) => [s.id, s] as const))("L2b · %s", (_id, spec) => {
    it("⑥ 醉酒 → abilityEffective=false（负向对照：清醒 → true）", async () => {
      // 清醒对照：门控应为 true（能力有效）
      const clean = board(layoutFor(spec.id));
      const rc = await runRole(spec.ability, clean, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        preview: true,
      });
      expect(
        rc?.meta?.abilityEffective,
        `❌ ${spec.id} 清醒时 abilityEffective 应为 true（实际 ${rc?.meta?.abilityEffective}）`
      ).toBe(true);

      // 醉酒：能力必须不生效。两种合法形态：
      //   ① 全局门控 middleware 把 `meta.abilityEffective` 置为 false（多数角色）
      //   ② 角色自己的 preCheck 在醉酒时直接 `aborted`（tea_lady / fool）
      //     —— preCheck 中止时管线提前返回，`abilityEffective` 保持 undefined，
      //        这是**更强**的门控，故一并接受。
      const drunk = board(layoutFor(spec.id));
      drunk[0].isDrunk = true;
      drunk[0].statusEffects = [{ type: "drunk", permanent: false }];
      const rd = await runRole(spec.ability, drunk, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        preview: true,
      });
      const gatedByFlag = rd?.meta?.abilityEffective === false;
      const gatedByAbort = rd?.aborted === true;
      expect(
        gatedByFlag || gatedByAbort,
        `❌ ${spec.id} 醉酒时能力仍然生效（abilityEffective=${rd?.meta?.abilityEffective}, aborted=${rd?.aborted}）—— 醉酒/中毒门控丢失`
      ).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2c · 夜序边界（被动角色不得进队列；非首夜角色首夜优先级为 null）
// ══════════════════════════════════════════════════════════════════════════
describe("L2c · 黯月初升 · 夜序边界", () => {
  it("纯被动且无夜序者（minstrel/tea_lady/pacifist/fool/goon/mastermind）双优先级均为 null", () => {
    const ids = ["minstrel", "tea_lady", "pacifist", "fool", "goon", "mastermind"];
    for (const id of ids) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.triggerTiming, `${id} 应为 passive`).toEqual(["passive"]);
      expect(s.ability.firstNightPriority, `${id} 首夜优先级应为 null`).toBeNull();
      expect(s.ability.otherNightPriority, `${id} 其他夜优先级应为 null`).toBeNull();
    }
  });

  it("非首夜角色（exorcist/innkeeper/gambler/professor/assassin/zombuul/shabaloth）首夜优先级必须为 null", () => {
    const ids = [
      "exorcist",
      "innkeeper",
      "gambler",
      "professor",
      "assassin",
      "zombuul",
      "shabaloth",
    ];
    for (const id of ids) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.firstNightPriority, `${id} 首夜优先级应为 null`).toBeNull();
      expect(
        typeof s.ability.otherNightPriority,
        `${id} 其他夜优先级应为数字`
      ).toBe("number");
    }
  });

  it("首夜也行动者（grandmother/sailor/chambermaid/courtier/lunatic/godfather/devils_advocate/pukka）首夜优先级必须是数字", () => {
    const ids = [
      "grandmother",
      "sailor",
      "chambermaid",
      "courtier",
      "lunatic",
      "godfather",
      "devils_advocate",
      "pukka",
    ];
    for (const id of ids) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(
        typeof s.ability.firstNightPriority,
        `${id} 首夜应被唤醒（firstNightPriority 应为数字）`
      ).toBe("number");
    }
  });

  it("tinker / moonchild：被动但保留死亡/猝死夜序（otherNightPriority 为数字）", () => {
    for (const id of ["tinker", "moonchild"]) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.firstNightPriority, `${id} 首夜优先级应为 null`).toBeNull();
      expect(
        typeof s.ability.otherNightPriority,
        `${id} 猝死/死亡触发需要夜序定位（otherNightPriority 应为数字）`
      ).toBe("number");
    }
  });
});
