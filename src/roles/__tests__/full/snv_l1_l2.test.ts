import { describe, expect, it } from "vitest";
import rolesData from "../../../data/rolesData.json";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { roles, scripts } from "../../../../app/data";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import { board, runRole, seat } from "../_tbHarness";
import { artistAbility } from "../../new_engine/artist.ability";
import { barberAbility } from "../../new_engine/barber.ability";
import { cerenovusAbility } from "../../new_engine/cerenovus.ability";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { dreamerAbility } from "../../new_engine/dreamer.ability";
import { evil_twinAbility } from "../../new_engine/evil_twin.ability";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { flowergirlAbility } from "../../new_engine/flowergirl.ability";
import { jugglerAbility } from "../../new_engine/juggler.ability";
import { klutzAbility } from "../../new_engine/klutz.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { philosopherAbility } from "../../new_engine/philosopher.ability";
import { pit_hagAbility } from "../../new_engine/pit_hag.ability";
import { sageAbility } from "../../new_engine/sage.ability";
import { savantAbility } from "../../new_engine/savant.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { snakeCharmerAbility } from "../../new_engine/snake_charmer.ability";
import { sweetheartAbility } from "../../new_engine/sweetheart.ability";
import { town_crierAbility } from "../../new_engine/town_crier.ability";
import { vigormortisAbility } from "../../new_engine/vigormortis.ability";
import { vortoxAbility } from "../../new_engine/vortox.ability";
import { witchAbility } from "../../new_engine/witch.ability";

/**
 * L1 + L2 · 梦殒春宵（25）/ 游园惊梦（20）**并集 25 个唯一角色**
 * ==================================================================
 * 本文件回答两个问题：
 *   L1（静态事实）：`roleId` 注册进注册表了吗？type / 中文名 / 剧本归属对吗？
 *   L2（引擎不变量）：`targetConfig` / `triggerTiming` / 夜序优先级 / 四段
 *      中间件，与官方规格（`rolesData.json` = 官方夜序表）一致吗？
 *
 * 🔒 判据来源（不凭记忆，逐项可回溯）
 *   · `src/data/rolesData.json`：官方夜序（firstNightOrder / otherNightOrder）
 *     —— 这是本项目里「官方夜序」的唯一数据源，优先级必须与它逐字相等。
 *   · `src/data/officialRoleDocs.json`：官方角色文档，键为**中文名**
 *     （注意项目中文名与俗称不同，如 `oracle`→「神谕者」、`savant`→「博学者」）。
 *   · `app/data.ts`：剧本 `roleIds` 归属（梦殒春宵 / 游园惊梦）。
 *
 * 🔒 靶子安全：所有击杀/状态类用例的普通配角固定用
 *   `chambermaid` / `gossip` / `grandmother` / `tinker`（纯信息类，无免疫）。
 *   绝不使用 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *
 * ⚠️ 只加测试不改生产：本文件发现的任何实现疑虑，只写入报告，不动生产代码。
 */

const r = (id: string) => roles.find((x) => x.id === id)!;
const SNV = scripts.find((s) => s.id === "sects_and_violets")!;
const GARDEN = scripts.find((s) => s.id === "garden_of_dreams")!;
const SAFE = ["chambermaid", "gossip", "grandmother", "tinker"] as const;
const rdata = (id: string): any => (rolesData as any[]).find((x) => x.id === id);

type NegKind =
  | "deadActor"
  | "sageNotKilledByDemon"
  | "sweetheartNoTarget"
  | "barberNoSwap"
  | "klutzAlive";

interface Spec {
  /** 角色 id（= 注册表 key） */
  id: string;
  ability: any;
  type: "townsfolk" | "outsider" | "minion" | "demon";
  /** 官方中文名（= officialRoleDocs.json 的键） */
  docsName: string;
  /** 归属剧本（Garden 与 SNV 高度重叠 ⇒ 同名角色同时属于两个剧本） */
  scripts: Array<"sects_and_violets" | "garden_of_dreams">;
  target: { min: number; max: number; allowSelf: boolean; allowDead: boolean };
  /** triggerTiming 期望（AbilityTriggerTiming 的字符串值） */
  timing: string[];
  /** 负向对照类型 */
  neg: NegKind;
  /**
   * 是否「效果类」（会在 stateUpdate 里写座位/快照状态，必须受 abilityEffective 门控）。
   * undefined ⇒ 不适用（纯信息类）。
   */
  effectField?: string;
}

const SPEC: Spec[] = [
  // ── 镇民 13 ───────────────────────────────────────────────────────
  {
    id: "clockmaker",
    ability: clockmakerAbility,
    type: "townsfolk",
    docsName: "钟表匠",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "dreamer",
    ability: dreamerAbility,
    type: "townsfolk",
    docsName: "筑梦师",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["first_night", "every_night"],
    neg: "deadActor",
  },
  {
    id: "snake_charmer",
    ability: snakeCharmerAbility,
    type: "townsfolk",
    docsName: "舞蛇人",
    scripts: ["sects_and_violets"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "mathematician",
    ability: mathematicianAbility,
    type: "townsfolk",
    docsName: "数学家",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    // 官方夜序：首夜 84 + 其他夜 116（rolesData.json）⇒ 两夜都唤醒
    timing: ["first_night", "every_night"],
    neg: "deadActor",
  },
  {
    id: "flowergirl",
    ability: flowergirlAbility,
    type: "townsfolk",
    docsName: "卖花女孩",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "town_crier",
    ability: town_crierAbility,
    type: "townsfolk",
    docsName: "城镇公告员",
    scripts: ["sects_and_violets"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "oracle",
    ability: oracleAbility,
    type: "townsfolk",
    docsName: "神谕者",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "savant",
    ability: savantAbility,
    type: "townsfolk",
    docsName: "博学者",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "deadActor",
  },
  {
    id: "seamstress",
    ability: seamstressAbility,
    type: "townsfolk",
    docsName: "女裁缝",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 2, max: 2, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "deadActor",
  },
  {
    id: "philosopher",
    ability: philosopherAbility,
    type: "townsfolk",
    docsName: "哲学家",
    scripts: ["sects_and_violets"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "deadActor",
    effectField: "philosopherGainedRole",
  },
  {
    id: "artist",
    ability: artistAbility,
    type: "townsfolk",
    docsName: "艺术家",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "deadActor",
  },
  {
    id: "juggler",
    ability: jugglerAbility,
    type: "townsfolk",
    docsName: "杂耍艺人",
    scripts: ["sects_and_violets"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night", "day"],
    neg: "deadActor",
  },
  {
    id: "sage",
    ability: sageAbility,
    type: "townsfolk",
    docsName: "贤者",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["on_death"],
    neg: "sageNotKilledByDemon",
  },
  // ── 外来者 4 ──────────────────────────────────────────────────────
  {
    id: "mutant",
    ability: mutantAbility,
    type: "outsider",
    // 官方 CN 名是「畸形秀演员」（不是俗称「变种人」）
    docsName: "畸形秀演员",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "deadActor",
  },
  {
    id: "sweetheart",
    ability: sweetheartAbility,
    type: "outsider",
    docsName: "心上人",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["on_death"],
    neg: "sweetheartNoTarget",
    effectField: "sweetheartDrunkTargetId",
  },
  {
    id: "barber",
    ability: barberAbility,
    type: "outsider",
    docsName: "理发师",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["on_death"],
    neg: "barberNoSwap",
    effectField: "barberSwap",
  },
  {
    id: "klutz",
    ability: klutzAbility,
    type: "outsider",
    docsName: "呆瓜",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "klutzAlive",
  },
  // ── 爪牙 4 ────────────────────────────────────────────────────────
  {
    id: "evil_twin",
    ability: evil_twinAbility,
    type: "minion",
    docsName: "镜像双子",
    scripts: ["sects_and_violets"],
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "deadActor",
  },
  {
    id: "witch",
    ability: witchAbility,
    type: "minion",
    docsName: "女巫",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isCursed",
  },
  {
    id: "cerenovus",
    ability: cerenovusAbility,
    type: "minion",
    docsName: "洗脑师",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isMad",
  },
  {
    id: "pit_hag",
    ability: pit_hagAbility,
    type: "minion",
    docsName: "麻脸巫婆",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: true, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "role",
  },
  // ── 恶魔 4 ────────────────────────────────────────────────────────
  {
    id: "fang_gu",
    ability: fang_guAbility,
    type: "demon",
    docsName: "方古",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isDead",
  },
  {
    id: "vigormortis",
    ability: vigormortisAbility,
    type: "demon",
    docsName: "亡骨魔",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isDead",
  },
  {
    id: "no_dashii",
    ability: no_dashiiAbility,
    type: "demon",
    docsName: "诺-达鲺",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isDead",
  },
  {
    id: "vortox",
    ability: vortoxAbility,
    type: "demon",
    docsName: "涡流",
    scripts: ["sects_and_violets", "garden_of_dreams"],
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "deadActor",
    effectField: "isDead",
  },
];

/** 座位语义字段（差分判据用） */
const SEAT_KEYS = [
  "isDead",
  "markedForDeath",
  "isPoisoned",
  "isDrunk",
  "isCursed",
  "isMad",
  "isProtected",
  "isGoodTwin",
  "role",
  "statusEffects",
] as const;

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
 * ⚠️ L1 名称一致性「已知偏差登记表」
 * ------------------------------------------------------------------
 * 严格判据是「app/data.ts / officialRoleDocs.json / rolesData.json **三处同名**」。
 * 实测 25 个角色里有 6 处不一致（**已登记为可疑点，只报告不改生产**）：
 *   · rolesData.json 的叫法与官方文档不同（5 处）：
 *       snake_charmer「弄蛇人」↔「舞蛇人」；artist「艺人」↔「艺术家」；
 *       sage「哲人」↔「贤者」；klutz「笨蛋」↔「呆瓜」；
 *       evil_twin「邪恶双子」↔「镜像双子」
 *   · app/data.ts 的 no_dashii 写作「诺-达」（**缺最后一个「鲺」字**），
 *     官方文档为「诺-达鲺」。
 * 本表把偏差**显式钉住**：任何新增/消失的偏差都会让用例变红（回归护栏），
 * 而不会静默放过。
 */
const ROLESDATA_NAME_DEVIATION: Record<string, string> = {
  snake_charmer: "弄蛇人",
  artist: "艺人",
  sage: "哲人",
  klutz: "笨蛋",
  evil_twin: "邪恶双子",
  mutant: "变种人",
  no_dashii: "诺-达",
};
const APPDATA_NAME_DEVIATION: Record<string, string> = {
  no_dashii: "诺-达",
};

// ══════════════════════════════════════════════════════════════════════════
//  L1 · 静态数据层（每角色一个 it，≥3 expect）
// ══════════════════════════════════════════════════════════════════════════
describe("L1 · 梦殒春宵/游园惊梦 · 静态数据层（25 唯一角色）", () => {
  it("0) 清单自身自洽：25 个唯一 id、无重复、与两剧本 roleIds 并集一致", () => {
    expect(SPEC.length, "唯一角色数应为 25").toBe(25);
    expect(new Set(SPEC.map((s) => s.id)).size, "SPEC 存在重复 id").toBe(25);

    const union = [
      ...new Set([...(SNV.roleIds ?? []), ...(GARDEN.roleIds ?? [])]),
    ].sort();
    expect(
      SPEC.map((s) => s.id).sort(),
      "SPEC 与「梦殒春宵 ∪ 游园惊梦」的 roleIds 并集不一致"
    ).toEqual(union);
    expect(union.length, "并集应恰为 25 个唯一角色").toBe(25);
  });

  describe.each(SPEC.map((s) => [s.id, s] as const))("L1 · %s", (_id, spec) => {
    it("① 已注册新引擎 · type 正确 · 官方文档有中文名 · 三处名称一致", () => {
      // ① 注册进 abilityRegistry（新引擎迁移完成）
      expect(
        isRoleMigrated(spec.id),
        `❌ ${spec.id} 未注册进新引擎注册表（isRoleMigrated=false）`
      ).toBe(true);

      // ② ability.roleId 必须等于注册 id（防止复制粘贴漏改）
      expect(
        spec.ability?.roleId,
        `❌ ${spec.id} 的能力对象 roleId 是 ${spec.ability?.roleId}（应为 ${spec.id}）`
      ).toBe(spec.id);

      // ③ app/data 的 type 与官方一致
      const role = r(spec.id);
      expect(
        role?.type,
        `❌ ${spec.id} 的 type 在 app/data 是 ${role?.type}，期望 ${spec.type}`
      ).toBe(spec.type);

      // ④ officialRoleDocs.json 有对应中文名条目（键为中文名）
      expect(
        Object.prototype.hasOwnProperty.call(officialRoleDocs, spec.docsName),
        `❌ officialRoleDocs.json 缺少「${spec.docsName}」条目（${spec.id}）`
      ).toBe(true);

      // ⑤ 三处名称一致：app/data.name === officialRoleDocs 键 === rolesData.name
      //    例外走「已知偏差登记表」（见文件上方注释），新增偏差会让本用例变红。
      const expectAppName =
        APPDATA_NAME_DEVIATION[spec.id] ?? spec.docsName;
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

    it("② 剧本归属正确（梦殒春宵 / 游园惊梦）", () => {
      const inSnv = (SNV.roleIds ?? []).includes(spec.id);
      const inGarden = (GARDEN.roleIds ?? []).includes(spec.id);
      expect(
        inSnv,
        `❌ ${spec.id} 在梦殒春宵 roleIds 中${inSnv ? "存在" : "缺失"}，期望 ${spec.scripts.includes("sects_and_violets")}`
      ).toBe(spec.scripts.includes("sects_and_violets"));
      expect(
        inGarden,
        `❌ ${spec.id} 在游园惊梦 roleIds 中${inGarden ? "存在" : "缺失"}，期望 ${spec.scripts.includes("garden_of_dreams")}`
      ).toBe(spec.scripts.includes("garden_of_dreams"));
      // 每个角色至少要出现在一个剧本里
      expect(
        inSnv || inGarden,
        `❌ ${spec.id} 不在任何被测剧本中`
      ).toBe(true);
      // 同理 rolesData 必须能给该角色一个阵营
      expect(
        rdata(spec.id)?.type,
        `❌ rolesData.json 缺少 ${spec.id} 的 type`
      ).toBe(spec.type);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2 · 引擎不变量层（每角色一个 it，≥3 expect）
// ══════════════════════════════════════════════════════════════════════════
describe("L2 · 梦殒春宵/游园惊梦 · 引擎不变量层（25 唯一角色）", () => {
  describe.each(SPEC.map((s) => [s.id, s] as const))("L2 · %s", (_id, spec) => {
    it("③ targetConfig / triggerTiming / 夜序优先级 与官方规格一致", () => {
      const tc = spec.ability?.targetConfig ?? {};
      expect(
        { min: tc.min, max: tc.max },
        `❌ ${spec.id} targetConfig 选择人数不符：实际 ${tc.min}~${tc.max}，期望 ${spec.target.min}~${spec.target.max}`
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
      const actualTiming = [...(spec.ability?.triggerTiming ?? [])].sort();
      expect(
        actualTiming,
        `❌ ${spec.id} triggerTiming 与规格不符（实际 ${JSON.stringify(actualTiming)}）`
      ).toEqual([...spec.timing].sort());

      // 夜序优先级必须与 rolesData.json（= 官方夜序唯一数据源）逐字一致
      const rd = rdata(spec.id);
      const expectFno = rd?.firstNightOrder ?? null;
      const expectOno = rd?.otherNightOrder ?? null;
      expect(
        spec.ability?.firstNightPriority ?? null,
        `❌ ${spec.id} firstNightPriority=${spec.ability?.firstNightPriority}，官方夜序为 ${expectFno}`
      ).toBe(expectFno);
      expect(
        spec.ability?.otherNightPriority ?? null,
        `❌ ${spec.id} otherNightPriority=${spec.ability?.otherNightPriority}，官方夜序为 ${expectOno}`
      ).toBe(expectOno);
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
      // calculate 是核心，绝不能为空（否则技能无逻辑）
      expect(
        (spec.ability?.calculate ?? []).length,
        `❌ ${spec.id}.calculate 为空数组 —— 技能没有任何计算逻辑`
      ).toBeGreaterThan(0);
      // preCheck 必须有（死亡/醉酒门控的落点）
      expect(
        (spec.ability?.preCheck ?? []).length,
        `❌ ${spec.id}.preCheck 为空数组 —— 缺少存活/状态门控`
      ).toBeGreaterThan(0);
    });

    it("⑤ 负向对照：前置条件不满足时，不得产生任何座位级状态变化", async () => {
      if (spec.neg === "deadActor") {
        const seats = board([spec.id, ...SAFE]);
        seats[0].isDead = true;
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 1,
          phase: "firstNight",
          targets: [1],
        });
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ ${spec.id} 已死亡却仍改动了座位状态`
        ).toEqual([]);
        expect(
          res?.aborted,
          `❌ ${spec.id} 已死亡时 preCheck 必须中止（实际 aborted=${res?.aborted}）`
        ).toBe(true);
      } else if (spec.neg === "sageNotKilledByDemon") {
        // 官方：贤者「被恶魔杀死」才得知两名邪恶玩家；非恶魔击杀 ⇒ 无线索
        const seats = board(["sage", "imp", "chambermaid", "gossip", "tinker"]);
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          storytellerInput: { killedByDemon: false },
        });
        expect(
          res?.meta?.abilityResult?.targetIds,
          `❌ 贤者非被恶魔杀死时不得给出任何线索（实际 ${JSON.stringify(res?.meta?.abilityResult?.targetIds)}）`
        ).toEqual([]);
        expect(
          res?.meta?.abilityResult?.found,
          `❌ 贤者非被恶魔杀死时 found 应为 false`
        ).toBe(false);
      } else if (spec.neg === "sweetheartNoTarget") {
        const seats = board(["sweetheart", ...SAFE]);
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
        });
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ 心上人未指定醉酒目标时不得让任何玩家进入醉酒状态`
        ).toEqual([]);
        expect(
          (res?.snapshot?.seats ?? []).some((s: any) => s.isDrunk === true),
          `❌ 未指定目标却出现醉酒者`
        ).toBe(false);
      } else if (spec.neg === "barberNoSwap") {
        const seats = board(["barber", ...SAFE]);
        seats[0].isDead = true; // 理发师死亡才触发
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
      } else if (spec.neg === "klutzAlive") {
        // 呆瓜「一旦你得知自己死亡，立即公开选择一名玩家」⇒ 存活时不得发动
        const seats = board(["klutz", ...SAFE]);
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
        });
        expect(
          res?.aborted,
          `❌ 呆瓜存活时 preCheck 必须中止（实际 aborted=${res?.aborted}）`
        ).toBe(true);
        expect(
          changedSeats(before, res?.snapshot?.seats ?? []),
          `❌ 呆瓜存活时不得改动任何座位`
        ).toEqual([]);
      } else {
        throw new Error(`未覆盖的负向对照类型：${spec.neg}`);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2b · 醉酒/中毒门控（只对「效果类」角色；纯信息类在 L5 另测）
// ══════════════════════════════════════════════════════════════════════════
/**
 * ⚠️⚠️ 本条是本次全层测试里的**核心可疑点**（只报告，不改生产）
 * ------------------------------------------------------------------
 * 官方规则书「醉酒与中毒」：中毒/醉酒的玩家**失去能力**，其能力「不会真实地
 * 影响游戏」——说书人仍会走场（唤醒、让选人），但**效果不落地**。
 *
 * 项目里已有先例：`vortox.ability.ts:96-138` 与 `cerenovus.ability.ts:54-84`
 * 都带 2026-09-21 的 P0 修复注释，判 `meta.abilityEffective === false` 时
 * **不写 isDead / isMad / statusEffects**。
 *
 * 但下列**同类效果角色没有这层门控**（`grep -c abilityEffective` 均为 0）：
 *   · fang_gu / vigormortis / no_dashii（恶魔击杀，line 见各文件 stateUpdate）
 *   · witch（诅咒）、pit_hag（改角色）、sweetheart（醉酒）、barber（换人）
 *   · 另有 philosopher 的「在场者醉酒」分支同样不判（`philosopher.ability.ts:87-106`）
 * ⇒ 被投毒/醉酒的这些角色，其效果**照常落地**（下毒恶魔照样杀人）。
 *   本组用例把现状**显式钉住**（characterization），一旦有人补上门控，
 *   用例会变红并提示把对应 id 从 KNOWN_UNGATED 挪到 GATED。
 */
const GATED_EFFECT: Record<string, string> = {
  // 已正确门控（严格断言：受干扰时必须无效果）
  cerenovus: "isMad",
  vortox: "isDead",
  // ── ✅ 2026-09-21 从 KNOWN_UNGATED 迁入（P0-B 已修：stateUpdate 已消费 abilityEffective）──
  fang_gu: "isDead",
  vigormortis: "isDead",
  no_dashii: "isDead",
  witch: "isCursed",
  pit_hag: "role",
  sweetheart: "isDrunk",
  barber: "role",
  philosopher: "isDrunk",
};
/**
 * ⚠️ 2026-09-21：**本表已清空** —— 原 8 项全部修复并迁入上方 `GATED_EFFECT`。
 *   保留空表是为「新发现的未门控效果角色」留登记位（登记即视为已知缺口）。
 */
const KNOWN_UNGATED: Record<string, string> = {};

describe("L2b · 效果类角色必须受 abilityEffective 门控", () => {
  /** 统一入参：覆盖各角色读取的 storytellerInput 通道 */
  const COMMON_INPUT = {
    newRoleId: "soldier", // pit_hag
    roleName: "镇民", // cerenovus
    swapA: 1,
    swapB: 2, // barber
    drunkTarget: 1, // sweetheart
    chosenRoleId: "chambermaid", // philosopher（在场 ⇒ 该玩家醉酒）
  };

  async function runGated(
    spec: Spec,
    abilityEffective: boolean
  ): Promise<{ res: any; changes: string[] }> {
    const seats = board([spec.id, ...SAFE]);
    const before = JSON.parse(JSON.stringify(seats));
    const res = await runRole(spec.ability, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      meta: { abilityEffective },
      storytellerInput: { ...COMMON_INPUT },
      snapshot: { dayCount: 1 },
    });
    return { res, changes: changedSeats(before, res?.snapshot?.seats ?? []) };
  }

  const HARD = /\.(isDead|isCursed|isMad|isDrunk|isPoisoned|role)$/;

  it("0) 门控/缺口清单自洽且穷尽 SPEC 中所有效果类角色", () => {
    const specEffectIds = SPEC.filter((s) => s.effectField)
      .map((s) => s.id)
      .sort();
    const declared = [...Object.keys(GATED_EFFECT), ...Object.keys(KNOWN_UNGATED)].sort();
    expect(
      declared,
      "GATED_EFFECT ∪ KNOWN_UNGATED 未穷尽 SPEC 里的效果类角色（新增效果角色必须登记）"
    ).toEqual(specEffectIds);
    expect(Object.keys(GATED_EFFECT).length).toBeGreaterThan(0);
  });

  describe.each(
    Object.entries(GATED_EFFECT).map(([id, field]) => [id, field] as const)
  )("L2b-GATED · %s", (id, field) => {
    it(`⑥ 受干扰（abilityEffective=false）→ ${field} 不得落地；对照组：正常时必落地`, async () => {
      const spec = SPEC.find((s) => s.id === id)!;

      // 对照组：abilityEffective=true ⇒ 效果必须真的发生（否则用例空转）
      const on = await runGated(spec, true);
      const onHit = on.changes.filter((c) => c.endsWith(`.${field}`) || HARD.test(c));
      expect(
        onHit,
        `❌ ${id} 正常生效时未产生任何效果（对照组失败）⇒ 门控用例无意义`
      ).not.toEqual([]);

      // 受干扰：abilityEffective=false ⇒ 不得有任何硬效果
      const off = await runGated(spec, false);
      expect(
        off.changes.filter((c) => HARD.test(c)),
        `❌ ${id} 受干扰（abilityEffective=false）时仍产生硬效果：${JSON.stringify(off.changes)}`
      ).toEqual([]);
    });
  });

  describe.each(
    Object.entries(KNOWN_UNGATED).map(([id, field]) => [id, field] as const)
  )("L2b-UNKNOWN-GAP · %s", (id, field) => {
    it(`⑦ 已知缺口：受干扰时 ${field} 仍会落地（缺陷登记，修好后请移入 GATED）`, async () => {
      const spec = SPEC.find((s) => s.id === id)!;
      const off = await runGated(spec, false);
      const hit = off.changes.filter(
        (c) => c.endsWith(`.${field}`) || HARD.test(c)
      );
      expect(
        hit,
        `❌ ${id} 的 abilityEffective 门控**已被补上**（受干扰时不再产生效果）。` +
          `这是好事 —— 请把 ${id} 从 KNOWN_UNGATED 移入 GATED_EFFECT。`
      ).not.toEqual([]);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2c · 睡觉序规则：PASSIVE 且无夜序的角色不得进入夜间队列
// ══════════════════════════════════════════════════════════════════════════
describe("L2c · 夜序边界", () => {
  it("呆瓜(klutz)：完全被动，首夜/其他夜优先级均为 null", () => {
    const k = SPEC.find((s) => s.id === "klutz")!;
    expect(k.ability.firstNightPriority, "呆瓜首夜优先级应为 null").toBeNull();
    expect(
      k.ability.otherNightPriority,
      "呆瓜其他夜优先级应为 null"
    ).toBeNull();
    expect(k.ability.triggerTiming).toEqual(["passive"]);
  });

  it("变种人(mutant)：PASSIVE 且无夜序（真实路径是日间门禁，非入夜）", () => {
    const m = SPEC.find((s) => s.id === "mutant")!;
    expect(m.ability.triggerTiming).toEqual(["passive"]);
    expect(m.ability.firstNightPriority).toBeNull();
    expect(m.ability.otherNightPriority).toBeNull();
  });

  it("✅ 已修（2026-09-21）：贤者/心上人/理发师是死亡触发 ⇒ triggerTiming 必须为 ON_DEATH", () => {
    // 原断言 `["passive"]` 是把缺陷记成了期望：PASSIVE ⇒ deathTriggered=false
    // ⇒ dynamicQueueGenerator.ts:414 的「存活则排除」门控失效 ⇒ 该角色**存活时也被唤醒**。
    for (const id of ["sage", "sweetheart", "barber"]) {
      const s = SPEC.find((x) => x.id === id)!;
      expect(s.ability.triggerTiming, `${id} 应为 on_death`).toEqual(["on_death"]);
      expect(s.ability.firstNightPriority, `${id} 首夜优先级应为 null`).toBeNull();
      expect(
        typeof s.ability.otherNightPriority,
        `${id} 死亡触发需要夜序定位（otherNightPriority 应为数字）`
      ).toBe("number");
    }
  });
});
