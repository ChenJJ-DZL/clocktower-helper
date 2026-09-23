/**
 * L1 + L2 · 凶宅魅影（21）+ 无上愉悦（16）**并集 37 个唯一角色**
 * =================================================================
 * 本文件回答两个问题：
 *   L1（静态事实）：`roleId` 注册进注册表了吗？type / 中文名 / 剧本归属对吗？
 *   L2（引擎不变量）：`targetConfig` / `triggerTiming` / 夜序优先级 / 四段中间件，
 *      与官方规格（`rolesData.json` = 官方夜序表 + `officialRoleDocs.json` 官方原文）一致吗？
 *
 * 🔒 判据来源（不凭记忆，逐项可回溯）
 *   · `src/data/officialRoleDocs.json`：官方角色文档，键为**中文名**。
 *     本文件每个角色的 targetConfig 期望值都在注释里附上官方原句作为依据。
 *   · `src/data/rolesData.json`：官方夜序（firstNightOrder / otherNightOrder）
 *     —— 优先级必须与它逐字相等（已知偏差走登记表）。
 *   · `app/data.ts`：剧本 `roleIds` 归属（凶宅魅影 / 无上愉悦）。
 *
 * 🔒 靶子安全：所有负向对照的普通配角固定用
 *   `chambermaid` / `chef` / `gossip` / `tinker`（纯信息类，无免疫）。
 *   绝不使用 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *
 * ⚠️ 只加测试不改生产：本文件发现的任何实现疑虑，只写入
 *   `outputs/凶宅魅影与无上愉悦37角色待修点清单.md`，不动生产代码。
 */
import { describe, expect, it } from "vitest";
import rolesData from "../../../data/rolesData.json";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { roles, scripts } from "../../../../app/data";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import { board, runRole } from "../_tbHarness";

// ── 凶宅魅影 21 角色 ────────────────────────────────────────────────
import { artistAbility } from "../../new_engine/artist.ability";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { balloonistAbility } from "../../new_engine/balloonist.ability";
import { barberAbility } from "../../new_engine/barber.ability";
import { choirBoyAbility } from "../../new_engine/choir_boy.ability";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { courtierAbility } from "../../new_engine/courtier.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import { godfatherAbility } from "../../new_engine/godfather.ability";
import { jugglerAbility } from "../../new_engine/juggler.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { philosopherAbility } from "../../new_engine/philosopher.ability";
import { pukkaAbility } from "../../new_engine/pukka.ability";
import { saintAbility } from "../../new_engine/saint.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { town_crierAbility } from "../../new_engine/town_crier.ability";
import { witchAbility } from "../../new_engine/witch.ability";
// ── 无上愉悦 16 角色 ────────────────────────────────────────────────
import { baronAbility } from "../../new_engine/baron.ability";
import { butlerAbility } from "../../new_engine/butler.ability";
import { chefAbility } from "../../new_engine/chef.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { empathAbility } from "../../new_engine/empath.ability";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { librarianAbility } from "../../new_engine/librarian.ability";
import { monkAbility } from "../../new_engine/monk.ability";
import { poisonerAbility } from "../../new_engine/poisoner.ability";
import { ravenkeeperAbility } from "../../new_engine/ravenkeeper.ability";
import { recluseAbility } from "../../new_engine/recluse.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";

const r = (id: string) => roles.find((x) => x.id === id)!;
const HM = scripts.find((s) => s.id === "haunted_manor")!;
const HP = scripts.find((s) => s.id === "high_pleasure")!;
const rdata = (id: string): any => (rolesData as any[]).find((x) => x.id === id);
const SAFE = ["chambermaid", "chef", "gossip", "tinker"] as const;

/** 座位级「硬状态」字段（差分判据用） */
const SEAT_KEYS = [
  "isDead",
  "markedForDeath",
  "isPoisoned",
  "isDrunk",
  "isCursed",
  "isProtected",
  "isExecutionProtected",
  "role",
  "statusEffects",
  "masterId",
  "fakeRole",
] as const;

/** 全部座位级差分（neg 用：要求「零变化」） */
function changedSeats(before: any[], after: any[]): string[] {
  const out: string[] = [];
  for (const b of before) {
    const a = after.find((x: any) => x.id === b.id);
    for (const k of SEAT_KEYS) {
      if (JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k])) {
        out.push(`${b.id + 1}号.${k}`);
      }
    }
  }
  return out;
}

/**
 * 只登记「**新装上**的硬状态」——用于 L2b 门控。
 *
 * 与 `changedSeats` 的区别：`isExecutionProtected: false` 这类
 * 「把 undefined 改写成 false」属于**清理**而非装上，不计入硬效果
 * （否则魔鬼代言人的过宽清理会污染门控判定）。
 */
function armedHardStates(before: any[], after: any[]): string[] {
  const HARD_TRUE = [
    "isDead",
    "markedForDeath",
    "isPoisoned",
    "isDrunk",
    "isCursed",
    "isProtected",
    "isExecutionProtected",
  ];
  const out: string[] = [];
  for (const b of before) {
    const a = after.find((x: any) => x.id === b.id);
    for (const k of HARD_TRUE) {
      if (a?.[k] === true && b?.[k] !== true) out.push(`${b.id + 1}号.${k}`);
    }
    if (JSON.stringify(b?.role) !== JSON.stringify(a?.role)) {
      out.push(`${b.id + 1}号.role`);
    }
    if (b?.masterId === undefined && a?.masterId !== undefined) {
      out.push(`${b.id + 1}号.masterId`);
    }
    if (b?.fakeRole === undefined && a?.fakeRole !== undefined) {
      out.push(`${b.id + 1}号.fakeRole`);
    }
    const bl = (b?.statusEffects ?? []) as any[];
    const al = (a?.statusEffects ?? []) as any[];
    if (al.length > bl.length) out.push(`${b.id + 1}号.statusEffects+`);
  }
  return out;
}

/** 负向对照类型 */
type NegKind =
  /** 演员已死亡 + 无任何输入 ⇒ 必须中止且零座位变化 */
  | "deadActor"
  /** 被动/设置类：不中止，但不得产生任何座位级状态变化 */
  | "passiveNoChange"
  /** 理发师（官方：恶魔「可以选择不交换」）⇒ 未指定交换时不得改角色 */
  | "barberNoSwap";

/** L2b 门控分类 */
type GateKind = "gated" | "ungated" | "exempt";

interface Spec {
  id: string;
  ability: any;
  type: "townsfolk" | "outsider" | "minion" | "demon";
  /** 官方中文名（= officialRoleDocs.json 的键；本项目 app/data 与官方一致） */
  docsName: string;
  scripts: Array<"haunted_manor" | "high_pleasure">;
  /** 官方原文推导出的目标配置 */
  target: { min: number; max: number; allowSelf: boolean; allowDead: boolean };
  /** triggerTiming 期望（AbilityTriggerTiming 的字符串值，顺序无关） */
  timing: string[];
  neg: NegKind;
  /** 效果类角色的门控分类；纯信息类不填 */
  gate?: GateKind;
}

const SPEC: Spec[] = [
  // ══════════════════════════════════════════════════════════════════
  //  凶宅魅影 21
  // ══════════════════════════════════════════════════════════════════
  {
    id: "balloonist",
    ability: balloonistAbility,
    type: "townsfolk",
    docsName: "气球驾驶员",
    scripts: ["haunted_manor"],
    // 官方：「每个夜晚，你会得知一名…玩家」——由说书人展示，玩家不选目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: true },
    timing: ["first_night", "every_night"],
    neg: "deadActor",
  },
  {
    id: "mathematician",
    ability: mathematicianAbility,
    type: "townsfolk",
    docsName: "数学家",
    scripts: ["haunted_manor"],
    // 官方：「你会得知有多少名玩家的能力…未正常生效」——纯被动信息，无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night", "every_night"],
    neg: "deadActor",
  },
  {
    id: "clockmaker",
    ability: clockmakerAbility,
    type: "townsfolk",
    docsName: "钟表匠",
    scripts: ["haunted_manor"],
    // 官方：「在你的首个夜晚，你会得知恶魔与爪牙之间最近的距离」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "seamstress",
    ability: seamstressAbility,
    type: "townsfolk",
    docsName: "女裁缝",
    scripts: ["haunted_manor"],
    // 官方：「你可以选择除你以外的两名玩家…无论他是生是死」
    target: { min: 2, max: 2, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "juggler",
    ability: jugglerAbility,
    type: "townsfolk",
    docsName: "杂耍艺人",
    scripts: ["haunted_manor"],
    // 官方：「公开猜测任意玩家的角色最多五次」——公开猜测，不走目标选择
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night", "day"],
    neg: "deadActor",
  },
  {
    id: "philosopher",
    ability: philosopherAbility,
    type: "townsfolk",
    docsName: "哲学家",
    scripts: ["haunted_manor"],
    // 官方：「你可以选择一个善良**角色**：你获得该角色的能力」——选角色不选玩家
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
  {
    id: "artist",
    ability: artistAbility,
    type: "townsfolk",
    docsName: "艺术家",
    scripts: ["haunted_manor"],
    // 官方：「你可以私下询问说书人一个是非问题」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "deadActor",
  },
  {
    id: "town_crier",
    ability: town_crierAbility,
    type: "townsfolk",
    docsName: "城镇公告员",
    scripts: ["haunted_manor"],
    // 官方：「你会得知在今天白天时是否有爪牙发起过提名」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "courtier",
    ability: courtierAbility,
    type: "townsfolk",
    docsName: "侍臣",
    scripts: ["haunted_manor"],
    // 官方：「你可以选择一个**角色**：如果该角色在场，该角色之一…醉酒三天三夜」
    // ⇒ 玩家选的不是座位（0 目标）。实现用 0~1 表示「日间选一个角色」→ 登记偏差。
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "choir_boy",
    ability: choirBoyAbility,
    type: "townsfolk",
    docsName: "唱诗男孩",
    scripts: ["haunted_manor"],
    // 官方：「如果恶魔杀死了国王，你会得知哪名玩家是恶魔」——事件触发，玩家不选目标
    // 实现用 0~1（说书人可指定恶魔座位）→ 登记偏差。
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
  },
  {
    id: "mutant",
    ability: mutantAbility,
    type: "outsider",
    docsName: "畸形秀演员",
    scripts: ["haunted_manor"],
    // 官方：「如果你"疯狂"地证明自己是外来者，你可能被处决」——纯被动态
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
  },
  {
    id: "barber",
    ability: barberAbility,
    type: "outsider",
    docsName: "理发师",
    scripts: ["haunted_manor"],
    // 官方：「如果你死亡，在当晚恶魔可以选择两名玩家…交换角色」——由恶魔操作，玩家不选
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["on_death"],
    neg: "barberNoSwap",
    gate: "ungated",
  },
  {
    id: "fool",
    ability: foolAbility,
    type: "townsfolk",
    docsName: "弄臣",
    scripts: ["haunted_manor"],
    // 官方：「当你首次将要死亡时，你不会死亡」——纯被动态
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
  },
  {
    id: "saint",
    ability: saintAbility,
    type: "outsider",
    docsName: "圣徒",
    scripts: ["haunted_manor"],
    // 官方：「如果你死于处决，你的阵营落败」——纯被动态
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
    gate: "exempt",
  },
  {
    id: "witch",
    ability: witchAbility,
    type: "minion",
    docsName: "女巫",
    scripts: ["haunted_manor"],
    // 官方：「你要选择一名玩家：如果他明天白天发起提名，他死亡」
    // 官方范例含「女巫诅咒了自己」⇒ allowSelf=true；未提死者 ⇒ allowDead=false
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
  {
    id: "godfather",
    ability: godfatherAbility,
    type: "minion",
    docsName: "教父",
    scripts: ["haunted_manor"],
    // 官方：「如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡」
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
  {
    id: "assassin",
    ability: assassinAbility,
    type: "minion",
    docsName: "刺客",
    scripts: ["haunted_manor"],
    // 官方：「你可以选择一名玩家：他死亡」——「可以」⇒ 允许不使用（0~1）；
    // 官方未排除自己，也未提死者 ⇒ allowSelf=true / allowDead=false
    target: { min: 0, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "devils_advocate",
    ability: devils_advocateAbility,
    type: "minion",
    docsName: "魔鬼代言人",
    scripts: ["haunted_manor"],
    // 官方：「你要选择一名**存活的**玩家（与上个夜晚不同）」；
    // 官方范例含「魔鬼代言人保护了自己」⇒ allowSelf=true
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "no_dashii",
    ability: no_dashiiAbility,
    type: "demon",
    docsName: "诺-达鲺",
    scripts: ["haunted_manor"],
    // 官方：「每个夜晚*，你要选择一名玩家：他死亡…」
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
  {
    id: "fang_gu",
    ability: fang_guAbility,
    type: "demon",
    docsName: "方古",
    scripts: ["haunted_manor"],
    // 官方：「你要选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古」
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
  {
    id: "pukka",
    ability: pukkaAbility,
    type: "demon",
    docsName: "普卡",
    scripts: ["haunted_manor"],
    // 官方：「你要选择一名玩家：他中毒」（未排除自己）⇒ allowSelf=true
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["first_night", "every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  // ══════════════════════════════════════════════════════════════════
  //  无上愉悦 16
  // ══════════════════════════════════════════════════════════════════
  {
    id: "washerwoman",
    ability: washerwomanAbility,
    type: "townsfolk",
    docsName: "洗衣妇",
    scripts: ["high_pleasure"],
    // 官方：「你会得知两名玩家和一个镇民角色」——由说书人展示，玩家不选目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "investigator",
    ability: investigatorAbility,
    type: "townsfolk",
    docsName: "调查员",
    scripts: ["high_pleasure"],
    // 官方：「你会得知两名玩家和一个爪牙角色」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "chef",
    ability: chefAbility,
    type: "townsfolk",
    docsName: "厨师",
    scripts: ["high_pleasure"],
    // 官方：「你会得知场上邻座的邪恶玩家有多少对」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "librarian",
    ability: librarianAbility,
    type: "townsfolk",
    docsName: "图书管理员",
    scripts: ["high_pleasure"],
    // 官方：「你会得知两名玩家和一个外来者角色」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "empath",
    ability: empathAbility,
    type: "townsfolk",
    docsName: "共情者",
    scripts: ["high_pleasure"],
    // 官方：「你会得知与你邻近的两名存活的玩家中邪恶玩家的数量」——无目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "fortune_teller",
    ability: fortuneTellerAbility,
    type: "townsfolk",
    docsName: "占卜师",
    scripts: ["high_pleasure"],
    // 官方：「你要选择两名玩家：你会得知他们之中是否有恶魔」；
    // 「无论他们存活与否，甚至可以选择自己」⇒ allowSelf=true / allowDead=true
    target: { min: 2, max: 2, allowSelf: true, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "monk",
    ability: monkAbility,
    type: "townsfolk",
    docsName: "僧侣",
    scripts: ["high_pleasure"],
    // 官方：「你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效」
    // 「除你以外」⇒ allowSelf=false；保护语义要求存活 ⇒ allowDead=false
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "ravenkeeper",
    ability: ravenkeeperAbility,
    type: "townsfolk",
    docsName: "守鸦人",
    scripts: ["high_pleasure"],
    // 官方：「你要选择一名玩家：你会得知他的角色」；「可以选择一名已死亡的玩家」
    target: { min: 1, max: 1, allowSelf: false, allowDead: true },
    timing: ["on_death"],
    neg: "deadActor",
  },
  {
    id: "butler",
    ability: butlerAbility,
    type: "outsider",
    docsName: "管家",
    scripts: ["high_pleasure"],
    // 官方：「你要选择除你以外的一名玩家」；
    // 官方运作方式含「如果管家选择了一名已死亡玩家作为主人，这种情况仍然适用」⇒ allowDead=true
    target: { min: 1, max: 1, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "drunk",
    ability: drunkAbility,
    type: "outsider",
    docsName: "酒鬼",
    scripts: ["high_pleasure"],
    // 官方：「你以为你是一个镇民角色，但其实你不是」——说书人设置，玩家不选目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night", "passive"],
    neg: "deadActor",
    gate: "exempt",
  },
  {
    id: "recluse",
    ability: recluseAbility,
    type: "outsider",
    docsName: "陌客",
    scripts: ["high_pleasure"],
    // 官方：「你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡」
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "passiveNoChange",
    gate: "exempt",
  },
  {
    id: "poisoner",
    ability: poisonerAbility,
    type: "minion",
    docsName: "投毒者",
    scripts: ["high_pleasure"],
    // 官方：「你要选择一名玩家：他在当晚和明天白天中毒」（未提可自毒、可毒死者）
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "scarlet_woman",
    ability: scarletWomanAbility,
    type: "minion",
    docsName: "红唇女郎",
    scripts: ["high_pleasure"],
    // 官方：「如果大于等于五名玩家存活时恶魔死亡，你变成那个恶魔」——纯被动态
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "baron",
    ability: baronAbility,
    type: "minion",
    docsName: "男爵",
    scripts: ["high_pleasure"],
    // 官方：「会有额外的外来者在场。[+2 外来者]」——设置阶段生效，玩家不选目标
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "passiveNoChange",
    gate: "exempt",
  },
  {
    id: "imp",
    ability: impAbility,
    type: "demon",
    docsName: "小恶魔",
    scripts: ["high_pleasure"],
    // 官方：「你要选择一名玩家：他死亡。如果你以这种方式自杀…」⇒ allowSelf=true；
    // 实现额外允许 allowDead=true（空刀伪装士兵/僧侣），官方未禁止 → 取实现值
    target: { min: 1, max: 1, allowSelf: true, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "gated",
  },
  {
    id: "zombuul",
    ability: zombuulAbility,
    type: "demon",
    docsName: "僵怖",
    scripts: ["high_pleasure"],
    // 官方：「如果今天白天没有人死亡，你会被唤醒并**要**选择一名玩家：他死亡」
    // ⇒ 官方 min 应为 1；实现 min=0（允许空刀）→ 登记偏差。
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    gate: "ungated",
  },
];

// ══════════════════════════════════════════════════════════════════════════
//  已知偏差登记表（只报告不改生产）
// ══════════════════════════════════════════════════════════════════════════

/**
 * ① L1 名称偏差：严格判据是「app/data.name === rolesData.name === officialRoleDocs 键」。
 * 实测 37 个角色有 8 处不一致，全部在此**显式钉住**（新增/消失的偏差会让用例变红）。
 */
const ROLESDATA_NAME_DEVIATION: Record<string, string> = {
  balloonist: "balloonist", // rolesData.json 该条 name 直接写英文 id
  artist: "艺人",
  courtier: "廷臣",
  mutant: "变种人",
  fool: "愚人",
  recluse: "隐士",
  scarlet_woman: "红罗刹",
  no_dashii: "诺-达", // 官方「诺-达鲺」，rolesData.json 少写最后一个「鲺」字
};
const APPDATA_NAME_DEVIATION: Record<string, string> = {
  no_dashii: "诺-达", // app/data 名称缺最后一个「鲺」字（officialRoleDocs / rolesData 均为「诺-达鲺」）
};
/**
 * `officialRoleDocs.json` 缺条目登记表（键为中文名）。
 *
 * 实测（`NODE_OPTIONS="" npx tsx temp/probe_docs_keys.ts`）：37 角色的
 * `spec.docsName` **全部**能在 `officialRoleDocs` 里命中 —— 包括 `no_dashii`
 * 的「诺-达鲺」（此前误判为缺条目，实为 app/data 侧少写一个「鲺」字，
 * 该偏差已由 `APPDATA_NAME_DEVIATION` 覆盖）。故本表为空。
 */
const DOCS_MISSING_ENTRY: Record<string, string> = {};

/**
 * ② L1 迁移缺口：`isRoleMigrated(id)` 为 false 的角色（只报告不改生产）。
 */
const MIGRATION_KNOWN_GAP: Record<string, string> = {
  saint:
    "saintAbility.roleId = \"saint_townsfolk\"（应为 \"saint\"）⇒ isRoleMigrated(\"saint\")=false，" +
    "getAbilityForRole(\"saint\") 靠 startsWith 兜底才能命中 ⇒ P1（见 hm_l5_causal.test.ts 同名用例）",
};

/**
 * ③ L2 夜序偏差：`firstNightPriority` / `otherNightPriority` 与官方 rolesData 不一致的登记。
 */
const ORDER_DEVIATION: Record<
  string,
  { fno?: number | null; ono?: number | null; why: string }
> = {
  // ✅ 2026-09-22 按**官方**修复后已删除 `choir_boy` 条目：
  //   官方【唱诗男孩】「**如果恶魔杀死了国王**，你会得知哪名玩家是恶魔」= 事件触发，
  //   官方夜序表（`rolesData.json::otherNightOrder`）给出 **0**。
  //   原先实现申报 `otherNightPriority: 84` ⇒ 静态队列每夜入队 ⇒ 已改为 **0**，
  //   动态唤醒交给 `deathEventWatch: { roleId: "king" }`
  //   ⇒ 本条偏差消除，断言直接回归 `rolesData`（= 官方夜序唯一数据源）。
  baron: {
    fno: null,
    why:
      "官方 rolesData firstNightOrder=33（设置阶段标记位）；实现刻意置 null（被动不入队）" +
      "⇒ 视为正确，登记在案以免将来误改",
  },
  scarlet_woman: {
    ono: null,
    why:
      "官方 rolesData otherNightOrder=37；实现刻意置 null 并在源码注释中说明" +
      "「被动能力不应进入夜间唤醒队列」⇒ 视为正确，登记在案",
  },
};

/**
 * ④ L2 targetConfig 偏差：官方原句推导值与实现不符的登记（钉住现状）。
 */
const TARGET_DEVIATION: Record<
  string,
  { min: number; max: number; allowSelf: boolean; allowDead: boolean; why: string }
> = {
  balloonist: {
    min: 0,
    max: 1,
    allowSelf: true,
    // ✅ 2026-09-22 按**官方原文**修正：false → true
    //   官方【气球驾驶员】→【角色简介】：「向气球驾驶员展示的玩家**可以存活或死亡**。」
    //   原先实现 `allowDead: false` + 候选池 `filter(!isDead)` ⇒ 说书人无法展示死者。
    allowDead: true,
    why:
      "官方：「每个夜晚，你会得知一名玩家…」——由说书人展示、玩家不选目标 ⇒ 官方" +
      "targetConfig 为 0 人；实现用 0~1 承载「展示哪一名座位」，且 allowSelf=true、" +
      "allowDead=true（官方明写展示的玩家**可以存活或死亡**，2026-09-22 已按官方修正）" +
      "（见 hm_l5 同角色用例）",
  },
  courtier: {
    min: 0,
    max: 1,
    allowSelf: false,
    allowDead: false,
    why: "官方选的是「一个角色」而非座位；实现用 0~1 承载日间选角，语义不同但无玩家选座",
  },
  choir_boy: {
    min: 0,
    max: 1,
    allowSelf: false,
    allowDead: true,
    why: "官方为事件触发（恶魔杀国王）；实现保留 0~1 供说书人指定恶魔座位、allowDead=true（国王可能已死）",
  },
  zombuul: {
    min: 0,
    max: 1,
    allowSelf: false,
    allowDead: false,
    why: "官方「**要**选择一名玩家」⇒ min 应为 1；实现 min=0（允许空刀）⇒ 已登记待确认（P2）",
  },
};

/**
 * ⑤ L2 四段契约缺口：`calculate` 为空的角色（四段契约要求 calculate 承载核心逻辑，
 *    因为 preview 只跑 preCheck + calculate）。
 */
const CALCULATE_EMPTY_GAP: Record<string, string> = {
  assassin:
    "assassin.ability.ts 的 `calculate: []` 为空；暗杀判定全部塞在 stateUpdate，" +
    "导致 preview（只跑 preCheck+calculate）完全空转 ⇒ P2",
};

/** 期望 triggerTiming 与实际断言用的夜序限定标志 */
const FIRST_NIGHT_ONLY = new Set([
  "clockmaker",
  "washerwoman",
  "investigator",
  "chef",
  "librarian",
]);
const OTHER_NIGHT_ONLY = new Set(["monk", "ravenkeeper"]);

// ══════════════════════════════════════════════════════════════════════════
//  L1 · 静态数据层
// ══════════════════════════════════════════════════════════════════════════
describe("L1 · 凶宅魅影/无上愉悦 · 静态数据层（37 唯一角色）", () => {
  it("0) 清单自身自洽：37 个唯一 id、无重复、与两剧本 roleIds 并集一致、两剧本零重叠", () => {
    expect(SPEC.length, "唯一角色数应为 37").toBe(37);
    expect(new Set(SPEC.map((s) => s.id)).size, "SPEC 存在重复 id").toBe(37);

    const union = [
      ...new Set([...(HM.roleIds ?? []), ...(HP.roleIds ?? [])]),
    ].sort();
    expect(
      SPEC.map((s) => s.id).sort(),
      "SPEC 与「凶宅魅影 ∪ 无上愉悦」的 roleIds 并集不一致"
    ).toEqual(union);
    expect(union.length, "并集应恰为 37 个唯一角色").toBe(37);

    const overlap = (HM.roleIds ?? []).filter((x: string) =>
      (HP.roleIds ?? []).includes(x)
    );
    expect(
      overlap,
      "两剧本按任务定义不得重叠（重叠角色只需测一次并标注同属两剧本）"
    ).toEqual([]);
  });

  describe.each(SPEC.map((s) => [s.id, s] as const))("L1 · %s", (_id, spec) => {
    it("① 已注册新引擎 · type 正确 · 官方文档有中文名 · 三处名称一致", () => {
      // ① 注册进 abilityRegistry（新引擎迁移完成）
      if (MIGRATION_KNOWN_GAP[spec.id]) {
        expect(
          isRoleMigrated(spec.id),
          `❌ ${spec.id} 的迁移缺口已被修复 —— 请从 MIGRATION_KNOWN_GAP 移除并改为严格断言`
        ).toBe(false);
      } else {
        expect(
          isRoleMigrated(spec.id),
          `❌ ${spec.id} 未注册进新引擎注册表（isRoleMigrated=false）`
        ).toBe(true);
      }

      // ② ability.roleId 必须等于注册 id（防止复制粘贴漏改）
      const roleIdHit = MIGRATION_KNOWN_GAP[spec.id]
        ? spec.ability?.roleId
        : spec.id;
      expect(
        spec.ability?.roleId,
        `❌ ${spec.id} 的能力对象 roleId 是 ${spec.ability?.roleId}（应为 ${roleIdHit}）`
      ).toBe(roleIdHit);

      // ③ app/data 的 type 与官方一致
      const role = r(spec.id);
      expect(
        role?.type,
        `❌ ${spec.id} 的 type 在 app/data 是 ${role?.type}，期望 ${spec.type}`
      ).toBe(spec.type);

      // ④ officialRoleDocs.json 有对应中文名条目（键为中文名）
      if (DOCS_MISSING_ENTRY[spec.id]) {
        expect(
          Object.prototype.hasOwnProperty.call(officialRoleDocs, spec.docsName),
          `❌ ${spec.id} 的官方条目已被补上 —— 请从 DOCS_MISSING_ENTRY 移除`
        ).toBe(false);
      } else {
        expect(
          Object.prototype.hasOwnProperty.call(officialRoleDocs, spec.docsName),
          `❌ officialRoleDocs.json 缺少「${spec.docsName}」条目（${spec.id}）`
        ).toBe(true);
      }

      // ⑤ 三处名称一致（例外走偏差登记表；新增偏差会让本用例变红）
      const expectAppName = APPDATA_NAME_DEVIATION[spec.id] ?? spec.docsName;
      const expectRolesDataName =
        ROLESDATA_NAME_DEVIATION[spec.id] ?? spec.docsName;
      expect(
        role?.name,
        `❌ app/data 中 ${spec.id} 的名字是「${role?.name}」，期望「${expectAppName}」`
      ).toBe(expectAppName);
      expect(
        rdata(spec.id)?.name,
        `❌ rolesData.json 中 ${spec.id} 的名字是「${rdata(spec.id)?.name}」`
      ).toBe(expectRolesDataName);
      // 登记表里的偏差必须真实存在（防止「已修复却忘了删登记」导致假绿）
      if (APPDATA_NAME_DEVIATION[spec.id]) {
        expect(
          role?.name,
          `❌ ${spec.id} 的 app/data 名称已与官方一致，请从 APPDATA_NAME_DEVIATION 移除`
        ).not.toBe(spec.docsName);
      }
      if (ROLESDATA_NAME_DEVIATION[spec.id]) {
        expect(
          rdata(spec.id)?.name,
          `❌ ${spec.id} 的 rolesData 名称已与官方一致，请从 ROLESDATA_NAME_DEVIATION 移除`
        ).not.toBe(spec.docsName);
      }
    });

    it("② 剧本归属正确（凶宅魅影 / 无上愉悦）", () => {
      const inHM = (HM.roleIds ?? []).includes(spec.id);
      const inHP = (HP.roleIds ?? []).includes(spec.id);
      expect(
        inHM,
        `❌ ${spec.id} 在凶宅魅影 roleIds 中${inHM ? "存在" : "缺失"}，期望 ${spec.scripts.includes("haunted_manor")}`
      ).toBe(spec.scripts.includes("haunted_manor"));
      expect(
        inHP,
        `❌ ${spec.id} 在无上愉悦 roleIds 中${inHP ? "存在" : "缺失"}，期望 ${spec.scripts.includes("high_pleasure")}`
      ).toBe(spec.scripts.includes("high_pleasure"));
      // 每个角色至少要出现在一个剧本里，且不得同属两剧本（两剧本零重叠）
      expect(inHM || inHP, `❌ ${spec.id} 不在任何被测剧本中`).toBe(true);
      expect(
        inHM && inHP,
        `❌ ${spec.id} 同时出现在两个剧本里 —— 与「两剧本零重叠」前提矛盾`
      ).toBe(false);
      // 同理 rolesData 必须能给该角色一个阵营
      expect(
        rdata(spec.id)?.type,
        `❌ rolesData.json 缺少 ${spec.id} 的 type`
      ).toBe(spec.type);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2 · 引擎不变量层
// ══════════════════════════════════════════════════════════════════════════
describe("L2 · 凶宅魅影/无上愉悦 · 引擎不变量层（37 唯一角色）", () => {
  describe.each(SPEC.map((s) => [s.id, s] as const))("L2 · %s", (_id, spec) => {
    it("③ targetConfig / triggerTiming / 夜序优先级 与官方规格一致（偏差走登记表）", () => {
      const tc = spec.ability?.targetConfig ?? {};
      const dev = TARGET_DEVIATION[spec.id];
      const expectTarget = dev
        ? {
            min: dev.min,
            max: dev.max,
            allowSelf: dev.allowSelf,
            allowDead: dev.allowDead,
          }
        : spec.target;
      expect(
        { min: tc.min, max: tc.max },
        `❌ ${spec.id} targetConfig 选择人数不符：实际 ${tc.min}~${tc.max}，期望 ${expectTarget.min}~${expectTarget.max}`
      ).toEqual({ min: expectTarget.min, max: expectTarget.max });
      expect(
        tc.allowSelf,
        `❌ ${spec.id} allowSelf 应为 ${expectTarget.allowSelf}（实际 ${tc.allowSelf}）`
      ).toBe(expectTarget.allowSelf);
      expect(
        tc.allowDead,
        `❌ ${spec.id} allowDead 应为 ${expectTarget.allowDead}（实际 ${tc.allowDead}）`
      ).toBe(expectTarget.allowDead);
      // 偏差登记必须真的仍在偏差（否则说明已修复，登记失效）
      if (dev) {
        expect(
          JSON.stringify({
            min: tc.min,
            max: tc.max,
            allowSelf: tc.allowSelf,
            allowDead: tc.allowDead,
          }),
          `❌ ${spec.id} 已与官方一致 —— 请从 TARGET_DEVIATION 移除（理由：${dev.why}）`
        ).not.toBe(JSON.stringify(spec.target));
      }

      // triggerTiming 集合一致（顺序无关）
      const actualTiming = [...(spec.ability?.triggerTiming ?? [])].sort();
      expect(
        actualTiming,
        `❌ ${spec.id} triggerTiming 与规格不符（实际 ${JSON.stringify(actualTiming)}）`
      ).toEqual([...spec.timing].sort());

      // 夜序优先级必须与 rolesData.json（= 官方夜序唯一数据源）逐字一致
      const rd = rdata(spec.id);
      const orderDev = ORDER_DEVIATION[spec.id];
      const expectFno = orderDev
        ? (orderDev.fno ?? null)
        : (rd?.firstNightOrder ?? null);
      const expectOno = orderDev
        ? (orderDev.ono ?? null)
        : (rd?.otherNightOrder ?? null);
      expect(
        spec.ability?.firstNightPriority ?? null,
        `❌ ${spec.id} firstNightPriority=${spec.ability?.firstNightPriority}，官方夜序为 ${expectFno}`
      ).toBe(expectFno);
      expect(
        spec.ability?.otherNightPriority ?? null,
        `❌ ${spec.id} otherNightPriority=${spec.ability?.otherNightPriority}，官方夜序为 ${expectOno}`
      ).toBe(expectOno);

      // 夜序限定标志必须与「首夜/非首夜」语义自洽
      expect(
        spec.ability?.firstNightOnly === true,
        `❌ ${spec.id} firstNightOnly 应为 ${FIRST_NIGHT_ONLY.has(spec.id)}（实际 ${spec.ability?.firstNightOnly}）`
      ).toBe(FIRST_NIGHT_ONLY.has(spec.id));
      expect(
        spec.ability?.otherNightOnly === true,
        `❌ ${spec.id} otherNightOnly 应为 ${OTHER_NIGHT_ONLY.has(spec.id)}（实际 ${spec.ability?.otherNightOnly}）`
      ).toBe(OTHER_NIGHT_ONLY.has(spec.id));
    });

    it("④ 四段中间件（preCheck/calculate/stateUpdate/postProcess）均为已声明数组", () => {
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
      // preCheck 必须有（死亡/醉酒门控的落点）
      expect(
        (spec.ability?.preCheck ?? []).length,
        `❌ ${spec.id}.preCheck 为空数组 —— 缺少存活/状态门控`
      ).toBeGreaterThan(0);

      // calculate 是核心阶段（preview 只跑 preCheck+calculate），不得为空
      const calcLen = (spec.ability?.calculate ?? []).length;
      if (CALCULATE_EMPTY_GAP[spec.id]) {
        expect(
          calcLen,
          `❌ ${spec.id} 的 calculate 已不再为空 —— 请从 CALCULATE_EMPTY_GAP 移除（理由：${CALCULATE_EMPTY_GAP[spec.id]}）`
        ).toBe(0);
      } else {
        expect(
          calcLen,
          `❌ ${spec.id}.calculate 为空数组 —— 技能没有任何计算逻辑（preview 会空转）`
        ).toBeGreaterThan(0);
      }
    });

    it("⑤ 负向对照：前置条件不满足时，不得产生任何座位级状态变化", async () => {
      if (spec.neg === "deadActor") {
        const seats = board([spec.id, ...SAFE]);
        seats[0] = { ...seats[0], isDead: true };
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
        });
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ ${spec.id} 已死亡却仍改动了座位状态`
        ).toEqual([]);
        expect(
          res?.aborted,
          `❌ ${spec.id} 已死亡时 preCheck 必须中止（实际 aborted=${res?.aborted}，reason=${res?.abortReason}）`
        ).toBe(true);
        expect(
          res?.meta?.abilityResult,
          `❌ ${spec.id} 已死亡时不得产出 abilityResult`
        ).toBeUndefined();
      } else if (spec.neg === "passiveNoChange") {
        const seats = board([spec.id, ...SAFE]);
        seats[0] = { ...seats[0], isDead: true };
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 1,
          phase: "firstNight",
        });
        expect(
          res?.aborted,
          `❌ ${spec.id} 是被动/设置类能力，不应因死亡中止`
        ).toBeFalsy();
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ ${spec.id} 是纯被动能力，不得产生任何座位级状态变化`
        ).toEqual([]);
        expect(
          (res?.snapshot?.seats ?? []).every((s: any) => s.isDead === true && s.id === 0
            ? true
            : s.isDead !== undefined),
          `❌ ${spec.id} 不得消除既有的 isDead 字段`
        ).toBe(true);
      } else {
        // barberNoSwap：官方「恶魔可以选择不进行角色交换」
        const seats = board(["barber", ...SAFE]);
        seats[0] = { ...seats[0], isDead: true };
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
        });
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ 理发师未指定交换对象时不得改动任何角色`
        ).toEqual([]);
        expect(
          res?.snapshot?.barberSwap,
          `❌ 未交换时不得记账 barberSwap`
        ).toBeUndefined();
        expect(
          before.map((s: any) => s.role.id),
          `❌ 角色数组不得被就地修改`
        ).toEqual((res?.snapshot?.seats ?? []).map((s: any) => s.role.id));
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2b · 醉酒/中毒门控（只对「效果类」角色；纯信息类在 L5 另测）
// ══════════════════════════════════════════════════════════════════════════
/**
 * 官方规则书「醉酒与中毒」：中毒/醉酒的玩家**失去能力**，其能力「不会真实地
 * 影响游戏」——说书人仍会走场（唤醒、让选人），但**效果不落地**。
 *
 * 本组把 37 个角色里所有「效果类」角色按实测分成三类：
 *   · GATED   —— 已正确门控：受干扰时不得产生任何「装上」的硬状态（严格断言）
 *   · UNGATED —— 已知缺口：受干扰时效果仍会落地（缺陷登记，修好后请移入 GATED）
 *   · EXEMPT  —— 官方规则下本就不受醉酒中毒影响（角色固有/设置期），并附理由
 *
 * 实测命令（可复现）：`NODE_OPTIONS="" npx tsx temp/probe_gate.ts`
 */
const GATED_EFFECT: Record<string, string> = {
  courtier: "isDrunk",
  assassin: "isDead",
  devils_advocate: "isExecutionProtected",
  pukka: "isPoisoned",
  monk: "isProtected",
  butler: "masterId",
  poisoner: "isPoisoned",
 imp: "markedForDeath",
  scarlet_woman: "role",
  // ── ✅ 2026-09-21 从 UNGATED_EFFECT 迁入（P0-B 已修：stateUpdate 已消费 abilityEffective）──
  philosopher: "isDrunk",
  barber: "role",
  witch: "isCursed",
  godfather: "isDead",
  no_dashii: "isDead",
  fang_gu: "isDead",
  zombuul: "isDead",
};
/**
 * ⚠️ 2026-09-21：**本表已清空** —— 原 7 项（philosopher / barber / witch /
 *   godfather / no_dashii / fang_gu / zombuul）全部修复并迁入 `GATED_EFFECT`。
 *   保留空表是为「新发现的未门控效果角色」留登记位（登记即视为已知缺口）。
 */
const UNGATED_EFFECT: Record<string, string> = {};
const EXEMPT_EFFECT: Record<string, string> = {
  saint:
    "官方「如果你死于处决，你的阵营落败」是**角色固有规则**，不由 abilityEffective 决定" +
    "（hm_l5_causal.test.ts 有专门用例固定该行为）",
  drunk:
    "官方「酒鬼没有任何能力」+ 永久 drunk 是**设置期写入的固有身份**，" +
    "不是受干扰后「失效的能力效果」",
  recluse:
    "官方明写「你可能会被当作邪恶阵营、爪牙角色或恶魔角色，**即使你已死亡**」" +
    "——被动登记不因中毒/醉酒失效",
  baron:
    "官方「会有额外的外来者在场。[+2 外来者]」在**初始设置时**生效并「不会因为男爵死亡而恢复」，" +
    "不是游戏过程中的能力效果",
};

/** L2b 统一入参：覆盖各角色读取的 storytellerInput / snapshot 通道 */
const GATE_INPUT: Record<string, { opts: any; layout?: string[] }> = {
  courtier: {
    // ⚠️ 廷臣读的键是 `storytellerInput.targetRoleId`（courtier.ability.ts:49），
    //    不是 `chosenRoleId`；用错键会静默不选目标 ⇒ 对照组空转（已踩过）。
    opts: {
      night: 1,
      phase: "firstNight",
      storytellerInput: { targetRoleId: "chambermaid" },
    },
  },
  assassin: { opts: { night: 2, phase: "night", targets: [1] } },
  devils_advocate: { opts: { night: 2, phase: "night", targets: [1] } },
  pukka: { opts: { night: 2, phase: "night", targets: [1] } },
  monk: { opts: { night: 2, phase: "night", targets: [1] } },
  butler: { opts: { night: 2, phase: "night", targets: [1] } },
  poisoner: { opts: { night: 1, phase: "firstNight", targets: [1] } },
  imp: { opts: { night: 2, phase: "night", targets: [1] } },
  scarlet_woman: {
    layout: ["scarlet_woman", "chambermaid", "chef", "gossip", "tinker", "imp"],
    opts: { night: 2, phase: "night" },
  },
  philosopher: {
    opts: { phase: "day", storytellerInput: { chosenRoleId: "chambermaid" } },
  },
  barber: {
    opts: {
      night: 2,
      phase: "night",
      storytellerInput: { swapA: 1, swapB: 2 },
      snapshot: { barberDied: true },
    },
  },
  witch: { opts: { night: 2, phase: "night", targets: [1] } },
  godfather: {
    opts: {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { outsiderDiedToday: true },
    },
  },
  no_dashii: { opts: { night: 2, phase: "night", targets: [1] } },
  fang_gu: { opts: { night: 2, phase: "night", targets: [1] } },
  zombuul: {
    opts: {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: null },
    },
  },
  saint: { opts: { phase: "day" } },
  drunk: {
    opts: {
      night: 1,
      phase: "firstNight",
      storytellerInput: {
        fakeRole: { id: "chef", name: "厨师", type: "townsfolk" },
      },
    },
  },
  recluse: { opts: { night: 2, phase: "night" } },
  baron: {
    opts: {
      night: 2,
      phase: "night",
      snapshot: { setupConfig: { townsfolkCount: 7, outsiderCount: 0 } },
    },
  },
};

/**
 * 按官方规则注入「受干扰 / 不受干扰」，返回差分出的硬效果清单。
 *
 * ⚠️ **干扰必须走生产通道**：在生产里，说书人把中毒/醉酒写成演员座位的
 *    `statusEffects:[{type:"poisoned"|"drunk"}]`（+ 遗留布尔 `isPoisoned`/
 *    `isDrunk`）。引擎的 `abilityPriorityCalculation`（abilityPriorityMiddleware.ts:131-149）
 *    与 `commonPreCheckAlive`（roleAbility.types.ts:28-40）**都从座位状态重算**
 *    `meta.abilityEffective`。
 *
 *    早期版本只在 `meta` 里塞 `abilityEffective:false`、座位保持健康 —— 对
 *    preCheck 里带 `commonPreCheckAlive` 的角色（如刺客）会被**覆写回 true**，
 *    于是「受干扰」用例其实测的是「正常生效」，得到「刺客未受门控」的**假结论**。
 *    改成在座位写入 poisoned 效果后，两处判定同时为 false，与控制组才有可比性。
 *
 * 复现命令：`NODE_OPTIONS="" npx tsx temp/probe_gate.ts`
 */
async function runGated(
  id: string,
  effective: boolean
): Promise<{ res: any; armed: string[]; aborted: boolean }> {
  const cfg = GATE_INPUT[id];
  let seats = board(cfg.layout ?? [id, ...SAFE]);
  // 各角色的触发前置
  if (id === "scarlet_woman") seats[5] = { ...seats[5], isDead: true }; // 恶魔已死
  if (id === "barber") seats[0] = { ...seats[0], isDead: true }; // 死亡才触发
  if (id === "saint") {
    seats[0] = { ...seats[0], isDead: true, executedToday: true };
  }
  if (!effective) {
    // 说书人通道：演员座位中毒（布尔 + 状态效果，两处判定都能读到）
    seats = seats.map((s, i) =>
      i === 0
        ? {
            ...s,
            isPoisoned: true,
            statusEffects: [
              ...((s as any).statusEffects ?? []),
              { type: "poisoned", source: "test_fixture" },
            ],
          }
        : s
    );
  }
  const before = JSON.parse(JSON.stringify(seats));
  const res = await runRole(abilityFor(id), seats, 0, {
    ...(cfg.opts ?? {}),
    meta: { abilityEffective: effective },
  });
  return {
    res,
    armed: armedHardStates(before, res?.snapshot?.seats ?? []),
    aborted: !!res?.aborted,
  };
}

/** id → ability 对象（从 SPEC 取，避免重复 import） */
function abilityFor(id: string): any {
  return SPEC.find((s) => s.id === id)?.ability;
}

describe("L2b · 效果类角色必须受 abilityEffective 门控", () => {
  it("0) 分类清单自洽且穷尽 SPEC 中所有效果类角色", () => {
    const specEffectIds = SPEC.filter((s) => s.gate)
      .map((s) => s.id)
      .sort();
    const declared = [
      ...Object.keys(GATED_EFFECT),
      ...Object.keys(UNGATED_EFFECT),
      ...Object.keys(EXEMPT_EFFECT),
    ].sort();
    expect(
      declared,
      "GATED ∪ UNGATED ∪ EXEMPT 未穷尽 SPEC 里的效果类角色（新增效果角色必须登记）"
    ).toEqual(specEffectIds);
    expect(Object.keys(GATED_EFFECT).length).toBeGreaterThan(0);
    /**
     * ⚠️ 2026-09-21 修改：原先要求 `UNGATED_EFFECT` **非空**（证明登记机制可用）。
     *   P0-B 修复后 7 项已全部迁入 GATED、此表合理为空 ⇒ 改为「允许为空」。
     *   若将来出现新的未门控角色，仍会被上一条
     *   「GATED ∪ UNGATED ∪ EXEMPT 未穷尽 SPEC」的断言暴露，登记机制依然有效。
     */
    expect(Object.keys(UNGATED_EFFECT).length).toBeGreaterThanOrEqual(0);
    for (const [id, why] of Object.entries(UNGATED_EFFECT)) {
      expect(why.length, `❌ ${id} 的缺口说明不能为空`).toBeGreaterThan(0);
    }
  });

  describe.each(
    Object.entries(GATED_EFFECT).map(([id, field]) => [id, field] as const)
  )("L2b-GATED · %s", (id, field) => {
    it(`⑥ 受干扰时 ${field} 不得装上；对照组：正常时必装上`, async () => {
      // 对照组：不受干扰 ⇒ 效果必须真的发生（否则门控用例空转）
      const on = await runGated(id, true);
      expect(
        on.aborted,
        `❌ ${id} 对照组被 preCheck 中止（${on.res?.abortReason}）⇒ 门控用例无意义`
      ).toBe(false);
      expect(
        on.armed,
        `❌ ${id} 正常生效时未产生任何硬效果（对照组失败）⇒ 门控用例无意义`
      ).not.toEqual([]);

      // 受干扰：座位中毒 ⇒ 不得有任何「装上」的硬效果
      const off = await runGated(id, false);
      expect(
        off.armed,
        `❌ ${id} 受干扰（座位中毒）时仍产生硬效果：${JSON.stringify(off.armed)}`
      ).toEqual([]);
    });
  });

  describe.each(
    Object.entries(UNGATED_EFFECT).map(([id, field]) => [id, field] as const)
  )("L2b-UNGATED-GAP · %s", (id, field) => {
    it(`⑦ 已知缺口：受干扰时 ${field} 仍会装上（缺陷登记，修好后请移入 GATED）`, async () => {
      const off = await runGated(id, false);
      expect(
        off.armed,
        `❌ ${id} 的 abilityEffective 门控**已被补上**（座位中毒时不再产生效果）。` +
          `这是好事 —— 请把 ${id} 从 UNGATED_EFFECT 移入 GATED_EFFECT。`
      ).not.toEqual([]);
      expect(
        off.armed.some((c) => c.includes(field)) ||
          off.armed.some((c) => c.endsWith(".role")),
        `❌ ${id} 的缺口字段已变化（期望含 ${field}，实际 ${JSON.stringify(off.armed)}）`
      ).toBe(true);
    });
  });

  describe.each(
    Object.entries(EXEMPT_EFFECT).map(([id, why]) => [id, why] as const)
  )("L2b-EXEMPT · %s", (id, why) => {
    it("⑧ 官方规则下不受醉酒中毒影响（豁免理由必须非空）", () => {
      expect(why.length, `❌ ${id} 的豁免理由不能为空`).toBeGreaterThan(0);
      expect(
        SPEC.find((s) => s.id === id)?.gate,
        `❌ ${id} 的 gate 分类应为 exempt`
      ).toBe("exempt");
      expect(
        Object.keys(GATED_EFFECT).includes(id) ||
          Object.keys(UNGATED_EFFECT).includes(id),
        `❌ ${id} 不得同时出现在 GATED/UNGATED 与 EXEMPT 中`
      ).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2c · 夜序边界（被动 ≠ 无夜序；死亡触发必须有夜序定位）
// ══════════════════════════════════════════════════════════════════════════
describe("L2c · 夜序边界", () => {
  it("纯被动且无夜序：mutant / fool / saint / recluse / baron / scarlet_woman / drunk", () => {
    for (const id of [
      "mutant",
      "fool",
      "saint",
      "recluse",
      "baron",
      "scarlet_woman",
      "drunk",
    ]) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(
        s.ability.firstNightPriority,
        `${id} 首夜优先级应为 null`
      ).toBeNull();
      expect(
        s.ability.otherNightPriority,
        `${id} 其他夜优先级应为 null`
      ).toBeNull();
      expect(
        (s.ability.triggerTiming ?? []).includes("passive"),
        `${id} 应包含 passive 触发`
      ).toBe(true);
    }
  });

  it("首夜限定角色：clockmaker / washerwoman / investigator / chef / librarian", () => {
    for (const id of [...FIRST_NIGHT_ONLY]) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.firstNightOnly, `${id} firstNightOnly 应为 true`).toBe(true);
      expect(
        s.ability.otherNightPriority,
        `${id} 仅首夜唤醒 ⇒ 其他夜优先级应为 null`
      ).toBeNull();
      expect(
        typeof s.ability.firstNightPriority,
        `${id} 必须有首夜优先级（否则首夜不入队）`
      ).toBe("number");
    }
  });

  it("非首夜限定角色：monk / ravenkeeper（首夜不唤醒）", () => {
    for (const id of [...OTHER_NIGHT_ONLY]) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.otherNightOnly, `${id} otherNightOnly 应为 true`).toBe(true);
      expect(
        s.ability.firstNightPriority,
        `${id} 首夜不唤醒 ⇒ 首夜优先级应为 null`
      ).toBeNull();
      expect(
        typeof s.ability.otherNightPriority,
        `${id} 必须有其他夜优先级（否则永不入队）`
      ).toBe("number");
    }
  });

  it("死亡触发（ON_DEATH）必须有夜序定位：ravenkeeper", () => {
    const rk = SPEC.find((x) => x.id === "ravenkeeper")!;
    expect(rk.ability.triggerTiming, "守鸦人应为死亡触发").toEqual(["on_death"]);
    expect(
      typeof rk.ability.otherNightPriority,
      "死亡触发需要夜序定位（否则死亡当晚无法唤醒）"
    ).toBe("number");
    expect(rk.ability.firstNightPriority, "首夜不会死亡 ⇒ 首夜优先级 null").toBeNull();
  });

  it("✅ 已修（2026-09-21）：barber 已由 PASSIVE 改为 ON_DEATH（choir_boy 属实验性剧本，另行处理）", () => {
    // barber：官方「如果你死亡…交换角色」是死亡触发 ⇒ 必须 ON_DEATH
    const barber = SPEC.find((x) => x.id === "barber")!;
    expect(barber.ability.triggerTiming, "理发师应为 on_death").toEqual([
      "on_death",
    ]);
    expect(
      typeof barber.ability.otherNightPriority,
      "理发师有夜序定位（官方 #78）"
    ).toBe("number");
    // 但队列门控看的是 ON_DEATH ⇒ PASSIVE 会让 deathTriggered 恒 false（见 hm_l5）
    const choir = SPEC.find((x) => x.id === "choir_boy")!;
    expect(choir.ability.triggerTiming, "唱诗男孩当前被标为 passive").toEqual([
      "passive",
    ]);
    /**
     * ✅ 2026-09-22 按**官方**修复后，`ORDER_DEVIATION.choir_boy` **条目已删除**
     *   （申报 `otherNightPriority: 84` → **0**，动态唤醒交给 `deathEventWatch`）
     * ⇒ 原先「点名唱诗男孩必须有 why」的断言失去对象（`undefined.length` 抛 TypeError）。
     * ✅ 改为**通用不变量**：**凡登记在 `ORDER_DEVIATION` 里的条目，都必须写清理由**
     *   —— 这样既不再点名某个角色（角色修好后自动不冲突），又保留了「不许无理由冻结」的约束。
     */
    const entries = Object.entries(ORDER_DEVIATION);
    expect(
      entries.length,
      "ORDER_DEVIATION 应仍有条目（若全部结清，请连同本节一起清理并在交付报告登记）"
    ).toBeGreaterThan(0);
    for (const [role, dev] of entries) {
      expect(
        (dev?.why ?? "").length,
        `ORDER_DEVIATION.${role} 必须登记「为什么冻结」（不许无理由冻结）`
      ).toBeGreaterThan(0);
    }
    // 唱诗男孩的夜序偏差已结清 ⇒ 不得再有登记条目
    expect(
      ORDER_DEVIATION.choir_boy,
      "唱诗男孩夜序偏差已按官方修复（84→0），不得再登记"
    ).toBeUndefined();
    expect(
      ORDER_DEVIATION.barber,
      "理发师的 deathTriggered 缺口已在 hm_l5_causal.test.ts 记录，此处不得重复登记夜序偏差"
    ).toBeUndefined();
  });
});
