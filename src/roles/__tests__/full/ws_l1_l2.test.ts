/**
 * L1 · 静态数据层 + L2 · 引擎不变量层
 * ==================================================================
 * 剧本：**窃窃私语（whispering_secrets）** + **无名之墓（tomb_of_the_unknown）**
 * 覆盖：两剧本并集 **32 个唯一角色**（6 个同属两剧本，见 ROLE_SPEC.scripts）
 * 日期：2026-09-21 ｜ 验收标准：`outputs/角色全层测试规范.md` §0/§9
 *
 * ── 判据来源（铁律：判据一律取官方原文）───────────────────────────
 *   `src/data/officialRoleDocs.json`（按**中文名**索引）+ `app/data.ts` 的 roleIds。
 *   `官方能力原文` 已逐条摘录在 ROLE_SPEC.official，作为 targetConfig / 触发时机
 *   断言的依据 —— 任何一条改动都必须回来核对官方原文，不许凭记忆改断言。
 *
 * ── 本文件的两条设计铁律 ────────────────────────────────────────
 *   ① **不锚文案**：断言锚 `abilityId / roleId / targetConfig / triggerTiming /
 *      firstNightPriority` 这些**引擎事实字段**，不锚 console 文案。
 *   ② **负向对照**：每张表都配「不该成立的对照组」（如被动角色的夜序优先级必须为
 *      null、非目标类角色的 min/max 必须为 0），避免"存在即通过"。
 *
 * ── 与 L5 的分工 ───────────────────────────────────────────────
 *   L1/L2：静态事实 + 声明契约（本文件，毫秒级）
 *   L5   ：跑管道后**状态字段真的变了**（`ws_l5_causal.test.ts`）
 *   L3   ：说书人 UI 渲染（`ws_l3_ui.test.tsx`）
 *   L4   ：真实浏览器点击流（`e2e/whispering_secrets/full_flow.spec.ts`）
 */
import { describe, expect, it } from "vitest";

import { roles, scripts } from "../../../../app/data";
import {
  getRawAbilityMap,
  initializeAbilityRegistry,
  isRoleAbilitiesRegistered,
} from "../../new_engine/abilityRegistry";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import officialDocs from "../../../data/officialRoleDocs.json";

const DOCS = officialDocs as Record<string, string>;

initializeAbilityRegistry();

const WS = scripts.find((s) => s.id === "whispering_secrets")!;
const TOMB = scripts.find((s) => s.id === "tomb_of_the_unknown")!;

/**
 * ⚠️ 2026-09-21 补：剧本类型里 `roleIds` 是**可选**（`roleIds?: string[]`），
 *   直接 `WS.roleIds` 会触发 TS18048 / TS2488（possibly undefined）。
 *   这两个官方剧本必然有 roleIds，这里统一收窄为必填，避免每个调用处都要 `!`。
 */
const WS_ROLE_IDS: string[] = WS.roleIds ?? [];
const TOMB_ROLE_IDS: string[] = TOMB.roleIds ?? [];

const r = (id: string) => roles.find((x) => x.id === id)!;

type ScriptTag = "ws" | "tomb" | "both";

/** 能力的**生效通路**（真值表，与 `poppyganda_ability_path_truth.test.ts` 同源口径） */
type Path =
  | "NIGHT_ENGINE" // 声明了 firstNightPriority / otherNightPriority → 靠夜序入队执行
  | "DAY_BRIDGE" // 日间能力，靠 dayAbilityBridge 分发
  | "LEGACY"; // 无夜序、非 DAY → 效果在 legacy / 硬编码路径（此时新引擎文件不执行，必须登记）

interface Spec {
  id: string;
  /** 归属剧本（6 个重叠角色标 both） */
  scripts: ScriptTag;
  type: "townsfolk" | "outsider" | "minion" | "demon";
  path: Path;
  /** 官方能力原文（官方为唯一判据；用于 targetConfig / 触发时机断言） */
  official: string;
  timing: string[];
  first: number | null;
  other: number | null;
  firstOnly: boolean;
  target: { min: number; max: number; allowSelf: boolean; allowDead: boolean };
  /** 四段管道中**必然为空**的段（必须写明理由，禁止"空数组即合法"蒙混） */
  emptyStages?: string[];
  note?: string;
}

/**
 * ⭐ 32 角色真值表。
 * 每个字段都经过：① 读 `*.ability.ts` 声明 → ② 对撞官方原文 → ③ 探针实测队列。
 */
const ROLE_SPEC: Spec[] = [
  // ─────────────────────────── 镇民 ───────────────────────────
  {
    id: "chambermaid",
    scripts: "ws",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official:
      "每个夜晚，你要选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。",
    timing: ["every_night"],
    first: 82,
    other: 114,
    firstOnly: false,
    // 官方明确「除你以外」「存活」+ 恰好两名
    target: { min: 2, max: 2, allowSelf: false, allowDead: false },
  },
  {
    id: "gossip",
    scripts: "both",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个白天，你可以公开发表一个声明。如果该声明正确，在当晚会有一名玩家死亡。",
    timing: ["day"],
    first: null,
    other: 73, // 声明正确后当晚的"死亡结算"节点 ⇒ 夜间由夜序入队
    firstOnly: false,
    target: { min: 0, max: 1, allowSelf: false, allowDead: false },
    note: "声明阶段走日间（DAY），但**死亡结算在当晚入队**（探针实测 n2=['gossip']）⇒ 生效通路取 NIGHT_ENGINE",
  },
  {
    id: "oracle",
    scripts: "both",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你会得知有多少名死亡的玩家是邪恶的。",
    timing: ["every_night"],
    first: null, // 「*」= 首夜不唤醒
    other: 98,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    emptyStages: ["stateUpdate"], // 纯信息角色：只产出信息，不改棋盘
  },
  {
    id: "mathematician",
    scripts: "ws",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official:
      "每个夜晚，你会得知有多少名玩家的能力因为其他角色的能力而未正常生效。（从上个黎明到你被唤醒时）",
    timing: ["first_night", "every_night"],
    first: 84, // 「每个夜晚」（无 *）⇒ 首夜也唤醒
    other: 116,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
  },
  {
    id: "artist",
    scripts: "both",
    type: "townsfolk",
    path: "DAY_BRIDGE",
    official: "每局游戏限一次，在白天时，你可以私下询问说书人一个是非问题，你会得知该问题的答案。",
    timing: ["day"],
    first: null,
    other: null, // 白天能力，不进夜序
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
  },
  {
    id: "flowergirl",
    scripts: "ws",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你会得知在今天白天时是否有恶魔投过票。",
    timing: ["every_night"],
    first: null,
    other: 96,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
  },
  {
    id: "innkeeper",
    scripts: "ws",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。",
    timing: ["every_night"],
    first: null,
    other: 14,
    firstOnly: false,
    // 官方「两名玩家」未排除自己 ⇒ allowSelf true 合法
    target: { min: 2, max: 2, allowSelf: true, allowDead: false },
  },
  {
    id: "fool",
    scripts: "both",
    type: "townsfolk",
    path: "LEGACY",
    official: "当你首次将要死亡时，你不会死亡。",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "免死由 utils/bmrMechanics::canFoolSurvive + 处决/夜杀结算路径裁决",
  },
  {
    id: "undertaker",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你会得知今天白天死于处决的玩家的角色。",
    timing: ["every_night"],
    first: null,
    other: 93,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "条件唤醒：队列门 requiresExecutedToday（今日必须有死于处决者）",
  },
  {
    id: "gambler",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你要选择一名玩家并猜测该玩家的角色：如果你猜错了，你会死亡。",
    timing: ["every_night"],
    first: null,
    other: 21,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: true, allowDead: true },
  },
  {
    id: "savant",
    scripts: "tomb",
    type: "townsfolk",
    path: "DAY_BRIDGE",
    official: "每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。",
    timing: ["day"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    emptyStages: ["stateUpdate"],
  },
  {
    id: "juggler",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official:
      "在你的首个白天，你可以公开猜测任意玩家的角色最多五次。在当晚，你会得知猜测正确的角色数量。",
    timing: ["every_night", "day"],
    first: null,
    other: 100, // 白昼猜完 → 当晚唤醒结算
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "队列门：仅当本白天已使用（hasUsedDayAbility / jugglerCorrectCount）才入队",
  },
  {
    id: "clockmaker",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离。（邻座的玩家距离为1）",
    timing: ["first_night"],
    first: 61,
    other: null,
    firstOnly: true,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    emptyStages: ["stateUpdate"],
  },
  {
    id: "sailor",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。| 你不会死亡。",
    timing: ["every_night"],
    first: 23,
    other: 8,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: true, allowDead: false }, // 官方「一名存活的玩家」
  },
  {
    id: "farmer",
    scripts: "tomb",
    type: "townsfolk",
    path: "NIGHT_ENGINE",
    official: "当你在夜晚死亡时，一名存活的善良玩家会变成农夫。",
    timing: ["on_death"],
    first: null,
    other: 85,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "ON_DEATH 触发（P1-6 已修：原为 PASSIVE 导致死亡当晚永不入队）",
  },

  // ─────────────────────────── 外来者 ───────────────────────────
  {
    id: "saint",
    scripts: "ws",
    type: "outsider",
    path: "LEGACY",
    official: "如果你死于处决，你的阵营落败。",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note:
      "⚠️ 注册的能力 roleId 是 `saint_townsfolk`（扩展镇民版本）⇒ isRoleMigrated('saint') === false。" +
      "本剧本的 `saint`（外来者）处决诅咒走 legacy `app/gameLogic.ts::checkGameEnd`（见 L5 用例）。",
  },
  {
    id: "recluse",
    scripts: "ws",
    type: "outsider",
    path: "LEGACY",
    official: "你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "登记干扰由 resolveRecluseRegistration 供各探查角色按需调用",
  },
  {
    id: "politician",
    scripts: "ws",
    type: "outsider",
    path: "LEGACY",
    official: "如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: true }, // 「即使你已死亡」
    emptyStages: ["preCheck"], // 无前置门控：终局判定无条件进入
  },
  {
    id: "plague_doctor",
    scripts: "ws",
    type: "outsider",
    path: "NIGHT_ENGINE",
    official: "当你死亡时，说书人会获得一个爪牙能力。",
    timing: ["on_death"],
    first: null,
    other: 83,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: true },
  },
  {
    id: "scapegoat",
    scripts: "tomb",
    type: "outsider",
    path: "LEGACY",
    official: "如果你的阵营的一名玩家被处决，你可能会代替他被处决。", // ⚠️ 官方条目缺失，见审计清单
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "⚠️ officialRoleDocs.json 无「替罪羊」顶层条目（详见审计清单 L1-③）",
  },
  {
    id: "drunk",
    scripts: "tomb",
    type: "outsider",
    path: "LEGACY",
    official: "你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。",
    timing: ["first_night", "passive"],
    first: null,
    other: null, // 永不入夜序（以 charadeRole 身份被调度）
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "真实生效路径 = utils/charadeSetup.ts（写入 charadeRole + permanent drunk）",
  },
  {
    id: "mutant",
    scripts: "tomb",
    type: "outsider",
    path: "LEGACY",
    official: "如果你“疯狂”地证明自己是外来者，你可能被处决。",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note:
      "⚠️ 新引擎文件 triggerTiming=PASSIVE 且无夜序 ⇒ 永不执行；真实路径 = utils/mutantGate.ts" +
      "（登记于 poppyganda 真值表的 LEGACY 项）。另：官方原文（疯狂证明外来者）与新引擎注释（" +
      "公开声明自己是变种人）**语义不同**，属口径待裁决项，详见审计清单。",
  },

  // ─────────────────────────── 爪牙 ───────────────────────────
  {
    id: "spy",
    scripts: "ws",
    type: "minion",
    path: "NIGHT_ENGINE",
    official: "每个夜晚，你能查看魔典。| 你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。",
    timing: ["first_night", "every_night"],
    first: 75,
    other: 108,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
  },
  {
    id: "witch",
    scripts: "ws",
    type: "minion",
    path: "NIGHT_ENGINE",
    official: "每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。如果只有三名存活的玩家，你失去此能力。",
    timing: ["every_night"],
    first: 39,
    other: 29,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
  },
  {
    id: "assassin",
    scripts: "both",
    type: "minion",
    path: "NIGHT_ENGINE",
    official: "每局游戏限一次，在夜晚时*，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。",
    timing: ["every_night"],
    first: null, // 「夜晚时*」= 首夜不行动
    other: 68,
    firstOnly: false,
    target: { min: 0, max: 1, allowSelf: true, allowDead: false }, // 「可以选择」⇒ min 0
    emptyStages: ["calculate"], // 效果全在 stateUpdate（无中间量需要计算）
  },
  {
    id: "devils_advocate",
    scripts: "ws",
    type: "minion",
    path: "NIGHT_ENGINE",
    official: "每个夜晚，你要选择一名存活的玩家（与上个夜晚不同）：如果明天白天他被处决，他不会死亡。",
    timing: ["every_night"],
    first: 37,
    other: 28,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
  },
  {
    id: "baron",
    scripts: "tomb",
    type: "minion",
    path: "LEGACY",
    official: "会有额外的外来者在场。[+2 外来者]",
    timing: ["passive"],
    first: null,
    other: null,
    firstOnly: false,
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    note: "setup 阶段生效；生产真实落地在 quickStartGenerator / setup UI",
  },
  {
    id: "poisoner",
    scripts: "tomb",
    type: "minion",
    path: "NIGHT_ENGINE",
    official: "每个夜晚，你要选择一名玩家：他在当晚和明天白天中毒。",
    timing: ["every_night"],
    first: 30,
    other: 13,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },

  // ─────────────────────────── 恶魔 ───────────────────────────
  {
    id: "vortox",
    scripts: "ws",
    type: "demon",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你要选择一名玩家：他死亡。| 镇民玩家的能力都会产生错误信息。| 如果白天没人被处决，邪恶阵营获胜。",
    timing: ["every_night"],
    first: null,
    other: 52,
    firstOnly: false,
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
  },
  {
    id: "po",
    scripts: "ws",
    type: "demon",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你可以选择一名玩家：他死亡。| 如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。",
    timing: ["every_night"],
    first: null,
    other: 49,
    firstOnly: false,
    target: { min: 0, max: 3, allowSelf: false, allowDead: false },
    note:
      "⚠️ 官方「上次未选人 ⇒ 本次必须选满 3 人」的**下限约束未在 targetConfig 表达**" +
      "（恒为 min 0）。引擎写有 `poCharged` 标记但 targetConfig 未消费 → 见审计清单。",
  },
  {
    id: "zombuul",
    scripts: "both",
    type: "demon",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。| 当你首次死亡后，你仍存活，但会被当作死亡。",
    timing: ["every_night"],
    first: null,
    other: 46,
    firstOnly: false,
    target: { min: 0, max: 1, allowSelf: false, allowDead: false },
    note: "⚠️ 条件唤醒读 `snapshot.lastDuskExecution`；runRole 默认 snapshot 无此字段 ⇒ **必须显式传 null**",
  },
  {
    id: "shabaloth",
    scripts: "tomb",
    type: "demon",
    path: "NIGHT_ENGINE",
    official: "每个夜晚*，你要选择两名玩家：他们死亡。| 你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。",
    timing: ["every_night"],
    first: null,
    other: 48,
    firstOnly: false,
    target: { min: 2, max: 2, allowSelf: false, allowDead: true },
  },
];

// ══════════════════════════════════════════════════════════════════════
describe("L1 · 静态数据层（窃窃私语 + 无名之墓 · 32 角色）", () => {
  it("① 剧本花名册与 ROLE_SPEC 严格一致（任何增删角色/改 id 必须回来更新真值表）", () => {
    const specWs = ROLE_SPEC.filter((s) => s.scripts === "ws" || s.scripts === "both")
      .map((s) => s.id)
      .sort();
    const specTomb = ROLE_SPEC.filter((s) => s.scripts === "tomb" || s.scripts === "both")
      .map((s) => s.id)
      .sort();

    expect([...WS_ROLE_IDS].sort(), "窃窃私语 roleIds 与真值表不一致").toEqual(specWs);
    expect([...TOMB_ROLE_IDS].sort(), "无名之墓 roleIds 与真值表不一致").toEqual(specTomb);

    // 负向对照：两个剧本各自恰好 19 角色，且并集 32（6 个重叠）
    expect(WS_ROLE_IDS.length).toBe(19);
    expect(TOMB_ROLE_IDS.length).toBe(19);
    expect(ROLE_SPEC.length, "并集应为 32 个唯一角色").toBe(32);
  });

  it("② 每个角色的 type 与 app/data.ts 一致，且中英文名（name↔官方条目）对得上", () => {
    const mismatched: string[] = [];
    const missingDoc: string[] = [];
    for (const spec of ROLE_SPEC) {
      const role = r(spec.id);
      if (!role) {
        mismatched.push(`${spec.id}: 不存在于 app/data.ts`);
        continue;
      }
      if (role.type !== spec.type) {
        mismatched.push(`${spec.id}: type=${role.type}（真值表 ${spec.type}）`);
      }
      // 中文名必须能在官方文档中找到（官方文档按中文名索引）
      if (!DOCS[role.name]) missingDoc.push(`${spec.id}(${role.name})`);
    }
    expect(mismatched, `以下角色 type 与真值表不符：${mismatched.join("; ")}`).toEqual([]);

    /**
     * ⚠️ L1-③ 已知缺口（只报告，不在本批修）：
     *   `scapegoat`（替罪羊）在 `officialRoleDocs.json` 中**没有顶层条目**
     *   （全文检索「替罪羊」只出现在 *其它* 角色的相克范例正文里）。
     *   ⇒ 该角色的 targetConfig 无法用官方原文核对。
     *   本条把它显式钉住：若将来补了官方条目，本断言会红 → 强制回来更新。
     */
    expect(missingDoc, "缺官方文档条目的角色（当前已知仅 scapegoat）").toEqual([
      "scapegoat(替罪羊)",
    ]);
  });

  it("③ 注册表接线：每个角色的 abilityId/roleId 与真值表一致（含 saint 的已知例外）", () => {
    const map = getRawAbilityMap();
    const problems: string[] = [];
    const notMigrated: string[] = [];
    for (const spec of ROLE_SPEC) {
      const ability: any = Object.values(map).find(
        (a: any) => a.abilityId?.startsWith(spec.id) || a.roleId === spec.id
      );
      if (!ability) {
        problems.push(`${spec.id}: 未在注册表找到能力对象`);
        continue;
      }
      if (!isRoleAbilitiesRegistered(ability.roleId)) {
        problems.push(`${spec.id}: ability.roleId=${ability.roleId} 未注册进 unified 注册表`);
      }
      if (!isRoleMigrated(spec.id)) notMigrated.push(spec.id);
    }
    expect(problems, `注册表接线问题：${problems.join("; ")}`).toEqual([]);

    /**
     * ⚠️ 已知例外（只报告）：`saint.ability.ts` 的 `roleId` 写的是
     *   `saint_townsfolk`（**扩展镇民版圣徒**），而窃窃私语里的是 `saint`（**外来者**）
     *   ⇒ `isRoleMigrated("saint") === false`，本剧本的圣徒处决诅咒**走 legacy**。
     *   这与 skill §2.4 记录的「仓库有两个圣徒」完全一致，属既有设计而非本批缺陷，
     *   但**必须显式登记**，否则后人会以为"新引擎在管圣徒"。
     */
    expect(notMigrated, "未迁移到新引擎的角色（当前已知仅 saint）").toEqual(["saint"]);
  });

  it("④ 负向对照：真值表里没有重复 id，且 each script 标签确实能在剧本 roleIds 命中", () => {
    const ids = ROLE_SPEC.map((s) => s.id);
    expect(new Set(ids).size, "真值表存在重复 id").toBe(ids.length);
    for (const spec of ROLE_SPEC) {
      const inWs = WS_ROLE_IDS.includes(spec.id);
      const inTomb = TOMB_ROLE_IDS.includes(spec.id);
      if (spec.scripts === "ws") expect(inWs, `${spec.id} 应属窃窃私语`).toBe(true);
      if (spec.scripts === "tomb") expect(inTomb, `${spec.id} 应属无名之墓`).toBe(true);
      if (spec.scripts === "both") {
        expect(inWs && inTomb, `${spec.id} 应同属两剧本`).toBe(true);
      }
    }
    // 恰好 6 个重叠角色
    expect(ROLE_SPEC.filter((s) => s.scripts === "both").length).toBe(6);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("L2 · 引擎不变量层（声明契约）", () => {
  it("① targetConfig 与官方原文一致（人数 / allowSelf / allowDead）", () => {
    const map = getRawAbilityMap();
    const bad: string[] = [];
    for (const spec of ROLE_SPEC) {
      const ability: any = Object.values(map).find(
        (a: any) => a.abilityId?.startsWith(spec.id) || a.roleId === spec.id
      );
      const tc = ability?.targetConfig;
      if (!tc) {
        bad.push(`${spec.id}: 缺 targetConfig`);
        continue;
      }
      const actual = {
        min: tc.min,
        max: tc.max,
        allowSelf: tc.allowSelf,
        allowDead: tc.allowDead,
      };
      if (JSON.stringify(actual) !== JSON.stringify(spec.target)) {
        bad.push(
          `${spec.id}: 实际 ${JSON.stringify(actual)} ≠ 官方 ${JSON.stringify(spec.target)}`
        );
      }
      // 通用不变量：min ≤ max
      if (tc.min > tc.max) bad.push(`${spec.id}: min(${tc.min}) > max(${tc.max})`);
    }
    expect(bad, `targetConfig 与官方不符：${bad.join(" | ")}`).toEqual([]);
  });

  it("② 触发时机 / 夜序优先级 / firstNightOnly 与官方一致（被动角色必须 null）", () => {
    const map = getRawAbilityMap();
    const bad: string[] = [];
    for (const spec of ROLE_SPEC) {
      const a: any = Object.values(map).find(
        (x: any) => x.abilityId?.startsWith(spec.id) || x.roleId === spec.id
      );
      const timing = [...(a?.triggerTiming ?? [])].sort();
      if (JSON.stringify(timing) !== JSON.stringify([...spec.timing].sort())) {
        bad.push(`${spec.id}: timing ${JSON.stringify(timing)} ≠ ${JSON.stringify(spec.timing)}`);
      }
      if (a?.firstNightPriority !== spec.first) {
        bad.push(`${spec.id}: firstNightPriority=${a?.firstNightPriority} ≠ ${spec.first}`);
      }
      if (a?.otherNightPriority !== spec.other) {
        bad.push(`${spec.id}: otherNightPriority=${a?.otherNightPriority} ≠ ${spec.other}`);
      }
      if (Boolean(a?.firstNightOnly) !== spec.firstOnly) {
        bad.push(`${spec.id}: firstNightOnly=${a?.firstNightOnly} ≠ ${spec.firstOnly}`);
      }
      // 负向对照：被动 / 日间角色绝不应带夜序优先级
      if (spec.path !== "NIGHT_ENGINE" && a?.firstNightPriority !== null) {
        bad.push(`${spec.id}: ${spec.path} 角色却带 firstNightPriority=${a?.firstNightPriority}`);
      }
    }
    expect(bad, `触发时机/夜序与官方不符：${bad.join(" | ")}`).toEqual([]);
  });

  it("③ 四段管道：每段要么存在，要么在真值表里写明为空的理由", () => {
    const map = getRawAbilityMap();
    const undocumented: string[] = [];
    for (const spec of ROLE_SPEC) {
      const a: any = Object.values(map).find(
        (x: any) => x.abilityId?.startsWith(spec.id) || x.roleId === spec.id
      );
      for (const stage of ["preCheck", "calculate", "stateUpdate", "postProcess"]) {
        const segments = a?.[stage] ?? [];
        if (segments.length === 0 && !(spec.emptyStages ?? []).includes(stage)) {
          undocumented.push(`${spec.id}:${stage}`);
        }
        if (segments.length > 0 && (spec.emptyStages ?? []).includes(stage)) {
          undocumented.push(`${spec.id}:${stage}（真值表说空但实际非空）`);
        }
      }
    }
    expect(
      undocumented,
      `以下「空段」未在真值表登记理由（禁止"空数组即合法"蒙混）：${undocumented.join(", ")}`
    ).toEqual([]);
  });

  it("④ ⭐ 路径真值表：声明与**真实生效通路**一致（防「写了却不执行」）", () => {
    const map = getRawAbilityMap();
    const wrong: string[] = [];
    for (const spec of ROLE_SPEC) {
      const a: any = Object.values(map).find(
        (x: any) => x.abilityId?.startsWith(spec.id) || x.roleId === spec.id
      );
      const hasNight = a?.firstNightPriority != null || a?.otherNightPriority != null;
      const isDay = (a?.triggerTiming ?? []).includes("day");
      const actual: Path = hasNight ? "NIGHT_ENGINE" : isDay ? "DAY_BRIDGE" : "LEGACY";
      if (actual !== spec.path) {
        wrong.push(`${spec.id}: 实际通路 ${actual} ≠ 真值表 ${spec.path}`);
      }
    }
    expect(wrong, `能力通路与真值表不符：${wrong.join(" | ")}`).toEqual([]);

    // 统计口径自证：三档各有多少个（写死数字 → 改通路必红）
    const byPath = {
      NIGHT_ENGINE: ROLE_SPEC.filter((s) => s.path === "NIGHT_ENGINE").length,
      DAY_BRIDGE: ROLE_SPEC.filter((s) => s.path === "DAY_BRIDGE").length,
      LEGACY: ROLE_SPEC.filter((s) => s.path === "LEGACY").length,
    };
    expect(byPath).toEqual({ NIGHT_ENGINE: 22, DAY_BRIDGE: 2, LEGACY: 8 });
  });
});
