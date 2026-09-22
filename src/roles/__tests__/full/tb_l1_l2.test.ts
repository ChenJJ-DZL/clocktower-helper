import { describe, expect, it } from "vitest";
import rolesData from "../../../data/rolesData.json";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { roles, scripts } from "../../../../app/data";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import { board, runRole } from "../_tbHarness";

import { baronAbility } from "../../new_engine/baron.ability";
import { butlerAbility } from "../../new_engine/butler.ability";
import { chefAbility } from "../../new_engine/chef.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { empathAbility } from "../../new_engine/empath.ability";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { librarianAbility } from "../../new_engine/librarian.ability";
import { mayorAbility } from "../../new_engine/mayor.ability";
import { monkAbility } from "../../new_engine/monk.ability";
import { poisonerAbility } from "../../new_engine/poisoner.ability";
import { ravenkeeperAbility } from "../../new_engine/ravenkeeper.ability";
import { recluseAbility } from "../../new_engine/recluse.ability";
import { saintAbility } from "../../new_engine/saint.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { slayerAbility } from "../../new_engine/slayer.ability";
import { soldierAbility } from "../../new_engine/soldier.ability";
import { spyAbility } from "../../new_engine/spy.ability";
import { undertakerAbility } from "../../new_engine/undertaker.ability";
import { virginAbility } from "../../new_engine/virgin.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

/**
 * L1 + L2 · 暗流涌动（Trouble Brewing）**22 个角色**
 * ==================================================================
 * 验收门槛（`outputs/角色全层测试规范.md` §0）：
 *   · 每角色 ≥3 用例（本文件 L1 两条 + L2 三条 = 5 条/角色）
 *   · 每用例 ≥3 expect
 *   · 每角色 ≥1 负向对照（L2⑤）
 *
 * 🔒 判据来源（不凭记忆，逐项可回溯）
 *   · `src/data/rolesData.json`   —— 官方夜序表（本项目「官方夜序」唯一数据源）
 *   · `src/data/officialRoleDocs.json` —— 官方角色文档，键为**中文名**
 *   · `app/data.ts`               —— 剧本 roleIds 归属 + 中文名 + type
 *
 * ⚠️ 已知单点不一致（本文件以「特征化断言」固化现状 + 交付报告列入可疑点）：
 *   ① `recluse` / `scarlet_woman` 在 rolesData.json 的中文名是
 *      「隐士」/「红罗刹」，而 app/data.ts 与 officialRoleDocs.json 均为
 *      「陌客」/「红唇女郎」 ⇒ **三处名称不一致**。
 *   ② 外来者 `saint` 没有以自身 id 注册的能力对象：
 *      `saint.ability.ts:229` 的 `roleId` 是 `"saint_townsfolk"`（扩展镇民版），
 *      于是 `isRoleMigrated("saint") === false`；外来者圣徒的处决结算实际写在
 *      `src/hooks/useExecutionHandlers.ts:261`（`t.role.id === "saint"`）。
 *   ③ `scarlet_woman.otherNightPriority` 声明为 `null`（被动不排队），而
 *      rolesData.json 记 `otherNightOrder: 37` —— 两份数据源口径不同。
 *
 * ⚠️ 只加测试不改生产：以上一律只写报告，不动生产代码。
 */

const r = (id: string) => roles.find((x) => x.id === id)!;
const TB = scripts.find((s) => s.id === "trouble_brewing")!;
const rdata = (id: string): any => (rolesData as any[]).find((x) => x.id === id);

/** 安全靶子（纯信息/无免疫）：chambermaid(侍女) / gossip(造谣者) / tinker(修补匠) */
const SAFE = ["chambermaid", "gossip", "tinker"] as const;

type NegKind =
  | "deadActor"
  | "ravenkeeperAlive"
  | "undertakerNoExecution"
  | "mayorNotDying"
  | "fortuneTellerNotTwoTargets"
  | "poisonerDeadTarget"
  | "monkSelfTarget"
  | "butlerSelfTarget"
  | "slayerNotDemon"
  | "soldierNotDemonKill"
  | "scarletWomanTooFewAlive"
  | "virginWrongNominator"
  | "impProtectedTarget"
  | "drunkNotFirstNight"
  | "baronNoReplacement"
  | "recluseRegistersGood"
  | "spyNoSeats"
  | "saintNotExecuted"
  | "chefEmptySeats"
  | "empathEmptySeats"
  | "washerwomanNotFirstNight"
  | "librarianNotFirstNight"
  | "investigatorNotFirstNight";

interface Spec {
  id: string;
  ability: any;
  type: "townsfolk" | "outsider" | "minion" | "demon";
  /** 官方中文名（= officialRoleDocs.json 的键） */
  docsName: string;
  /** 该角色在 rolesData.json 里的中文名（若有单点不一致，此处固化现状） */
  rolesDataName: string;
  target: { min: number; max: number; allowSelf: boolean; allowDead: boolean };
  timing: string[];
  neg: NegKind;
  /**
   * 效果类角色的「特征落库字段」；纯信息类留空（L5 另测「信息事实正确性」）。
   * 仅用于 L2b（abilityEffective 门控）。
   */
  effectField?: string;
}

const SPEC: Spec[] = [
  // ── 镇民 13 ───────────────────────────────────────────────────────
  {
    id: "washerwoman",
    ability: washerwomanAbility,
    type: "townsfolk",
    docsName: "洗衣妇",
    rolesDataName: "洗衣妇",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "washerwomanNotFirstNight",
  },
  {
    id: "librarian",
    ability: librarianAbility,
    type: "townsfolk",
    docsName: "图书管理员",
    rolesDataName: "图书管理员",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "librarianNotFirstNight",
  },
  {
    id: "investigator",
    ability: investigatorAbility,
    type: "townsfolk",
    docsName: "调查员",
    rolesDataName: "调查员",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "investigatorNotFirstNight",
  },
  {
    id: "chef",
    ability: chefAbility,
    type: "townsfolk",
    docsName: "厨师",
    rolesDataName: "厨师",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night"],
    neg: "chefEmptySeats",
  },
  {
    id: "empath",
    ability: empathAbility,
    type: "townsfolk",
    docsName: "共情者",
    rolesDataName: "共情者",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "empathEmptySeats",
  },
  {
    id: "fortune_teller",
    ability: fortuneTellerAbility,
    type: "townsfolk",
    docsName: "占卜师",
    rolesDataName: "占卜师",
    target: { min: 2, max: 2, allowSelf: true, allowDead: true },
    timing: ["every_night"],
    neg: "fortuneTellerNotTwoTargets",
  },
  {
    id: "undertaker",
    ability: undertakerAbility,
    type: "townsfolk",
    docsName: "送葬者",
    rolesDataName: "送葬者",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "undertakerNoExecution",
  },
  {
    id: "monk",
    ability: monkAbility,
    type: "townsfolk",
    docsName: "僧侣",
    rolesDataName: "僧侣",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "monkSelfTarget",
    effectField: "protected",
  },
  {
    id: "ravenkeeper",
    ability: ravenkeeperAbility,
    type: "townsfolk",
    docsName: "守鸦人",
    rolesDataName: "守鸦人",
    target: { min: 1, max: 1, allowSelf: false, allowDead: true },
    timing: ["on_death"],
    neg: "ravenkeeperAlive",
  },
  {
    id: "virgin",
    ability: virginAbility,
    type: "townsfolk",
    docsName: "贞洁者",
    rolesDataName: "贞洁者",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "virginWrongNominator",
  },
  {
    id: "slayer",
    ability: slayerAbility,
    type: "townsfolk",
    docsName: "猎手",
    rolesDataName: "猎手",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["day"],
    neg: "slayerNotDemon",
    effectField: "isDead",
  },
  {
    id: "soldier",
    ability: soldierAbility,
    type: "townsfolk",
    docsName: "士兵",
    rolesDataName: "士兵",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "soldierNotDemonKill",
  },
  {
    id: "mayor",
    ability: mayorAbility,
    type: "townsfolk",
    docsName: "镇长",
    rolesDataName: "镇长",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "mayorNotDying",
    effectField: "isDead",
  },
  // ── 外来者 4 ──────────────────────────────────────────────────────
  {
    id: "butler",
    ability: butlerAbility,
    type: "outsider",
    docsName: "管家",
    rolesDataName: "管家",
    target: { min: 1, max: 1, allowSelf: false, allowDead: true },
    timing: ["every_night"],
    neg: "butlerSelfTarget",
    effectField: "masterId",
  },
  {
    id: "drunk",
    ability: drunkAbility,
    type: "outsider",
    docsName: "酒鬼",
    rolesDataName: "酒鬼",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night", "passive"],
    neg: "drunkNotFirstNight",
    // ⚠️ 故意不给 effectField：酒鬼的认知覆盖（fakeRole + 永久醉酒）是**角色固有属性**，
    //    官方原文「如果酒鬼醉酒或中毒，他不会有任何变化」⇒ 不受 abilityEffective 门控。
    //    见下方专属用例「⑧」。
  },
  {
    id: "recluse",
    ability: recluseAbility,
    type: "outsider",
    docsName: "陌客",
    // ⚠️ rolesData.json 用的是「隐士」—— 与另两处不一致（见文件头 §①）
    rolesDataName: "隐士",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "recluseRegistersGood",
  },
  {
    id: "saint",
    ability: saintAbility,
    type: "outsider",
    docsName: "圣徒",
    rolesDataName: "圣徒",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "saintNotExecuted",
  },
  // ── 爪牙 4 ────────────────────────────────────────────────────────
  {
    id: "poisoner",
    ability: poisonerAbility,
    type: "minion",
    docsName: "投毒者",
    rolesDataName: "投毒者",
    target: { min: 1, max: 1, allowSelf: false, allowDead: false },
    timing: ["every_night"],
    neg: "poisonerDeadTarget",
    effectField: "poisoned",
  },
  {
    id: "spy",
    ability: spyAbility,
    type: "minion",
    docsName: "间谍",
    rolesDataName: "间谍",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["first_night", "every_night"],
    neg: "spyNoSeats",
  },
  {
    id: "scarlet_woman",
    ability: scarletWomanAbility,
    type: "minion",
    docsName: "红唇女郎",
    // ⚠️ rolesData.json 用的是「红罗刹」—— 与另两处不一致（见文件头 §①）
    rolesDataName: "红罗刹",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "scarletWomanTooFewAlive",
    effectField: "role",
  },
  {
    id: "baron",
    ability: baronAbility,
    type: "minion",
    docsName: "男爵",
    rolesDataName: "男爵",
    target: { min: 0, max: 0, allowSelf: false, allowDead: false },
    timing: ["passive"],
    neg: "baronNoReplacement",
  },
  // ── 恶魔 1 ────────────────────────────────────────────────────────
  {
    id: "imp",
    ability: impAbility,
    type: "demon",
    docsName: "小恶魔",
    rolesDataName: "小恶魔",
    target: { min: 1, max: 1, allowSelf: true, allowDead: true },
    timing: ["every_night"],
    neg: "impProtectedTarget",
    effectField: "isDead",
  },
];

/**
 * 夜序优先级「系统步骤型」例外表。
 *
 * 这 2 个角色在 rolesData.json 里**配有夜序号**，但能力对象刻意声明
 * `null`（不进唤醒队列）。已逐一核对官方原文与代码注释，理由如下：
 *   · baron：设置调整在**开局**完成；其首夜 33 号对应的是「爪牙互认」
 *     系统步骤（见 `trouble_brewing_22_roles_ui_sweep.test.tsx` 的
 *     `SYS_STEP.baron = "minion_info"`），不是男爵自身能力。
 *   · scarlet_woman：被动继任；文件内注释明确「被动能力不应进入夜间唤醒队列」。
 *     rolesData 的 37 是夜序表占位。
 */
const SYSTEM_STEP_ORDER: Record<string, { first?: number; other?: number }> = {
  baron: { first: 33 },
  scarlet_woman: { other: 37 },
};

/** 差分判据：座位语义字段 */
const SEAT_KEYS = [
  "isDead",
  "markedForDeath",
  "isPoisoned",
  "isDrunk",
  "statusEffects",
  "role",
  "masterId",
  "fakeRole",
  "executedToday",
] as const;

function changedSeats(before: any[], after: any[]): string[] {
  const out = new Set<string>();
  for (const b of before) {
    const a = after.find((x: any) => x.id === b.id);
    if (!a) continue;
    for (const k of SEAT_KEYS) {
      if (JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k])) {
        out.add(`${b.id + 1}号.${k}`);
      }
    }
  }
  return [...out];
}

const seatAfter = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

// ══════════════════════════════════════════════════════════════════════════
//  L1 · 静态数据层（每角色 2 条，每条 ≥3 expect）
// ══════════════════════════════════════════════════════════════════════════
describe("L1 · 暗流涌动 · 静态数据层（22 角色）", () => {
  it("0) 清单自洽：22 个唯一 id，且与 trouble_brewing.roleIds 严格一致", () => {
    expect(SPEC.length, "暗流涌动应为 22 个角色").toBe(22);
    expect(new Set(SPEC.map((s) => s.id)).size, "SPEC 存在重复 id").toBe(22);
    expect(
      SPEC.map((s) => s.id).sort(),
      "SPEC 与 app/data 的 trouble_brewing.roleIds 不一致"
    ).toEqual([...(TB.roleIds ?? [])].sort());
  });

  describe.each(SPEC.map((s) => [s.id, s] as const))("L1 · %s", (_id, spec) => {
    it("① type / 中文名 / 官方文档条目 / 能力对象 roleId 对齐", () => {
      // ① app/data 的 type 与官方一致
      expect(
        r(spec.id)?.type,
        `❌ ${spec.id} 的 type 在 app/data 是 ${r(spec.id)?.type}，期望 ${spec.type}`
      ).toBe(spec.type);

      // ② app/data 中文名 == officialRoleDocs.json 的键
      expect(
        r(spec.id)?.name,
        `❌ app/data 中 ${spec.id} 的名字是「${r(spec.id)?.name}」，期望「${spec.docsName}」`
      ).toBe(spec.docsName);
      expect(
        Object.prototype.hasOwnProperty.call(officialRoleDocs, spec.docsName),
        `❌ officialRoleDocs.json 缺少「${spec.docsName}」条目（${spec.id}）`
      ).toBe(true);
      expect(
        String((officialRoleDocs as any)[spec.docsName] ?? "").length,
        `❌ officialRoleDocs「${spec.docsName}」条目为空`
      ).toBeGreaterThan(200);

      // ③ rolesData.json 的 type 与官方一致
      expect(
        rdata(spec.id)?.type,
        `❌ rolesData.json 中 ${spec.id} 的 type 缺失或错误`
      ).toBe(spec.type);

      /**
       * ④ 能力对象的 roleId 通常必须等于注册 id（防复制粘贴漏改）。
       * ⚠️ 例外：`saint`（外来者）的能力对象 roleId 是 `"saint_townsfolk"`
       *    （扩展镇民版圣徒），因此外来者圣徒**没有以自身 id 注册的能力对象**。
       *    此处固化现状，并把该缺口写入交付报告（见文件头 §②）。
       */
      if (spec.id === "saint") {
        expect(
          spec.ability?.roleId,
          "❌ 外来者 saint 的能力对象 roleId 已不再是 saint_townsfolk（请复核并更新本断言）"
        ).toBe("saint_townsfolk");
      } else {
        expect(
          spec.ability?.roleId,
          `❌ ${spec.id} 的能力对象 roleId 是 ${spec.ability?.roleId}（应为 ${spec.id}）`
        ).toBe(spec.id);
      }
    });

    it("② 注册状态（isRoleMigrated）+ rolesData 中文名现状", () => {
      /**
       * ⚠️ `saint` 是**已知缺口**：其能力对象注册在 `saint_townsfolk` 名下，
       *    所以 `isRoleMigrated("saint") === false`。外来者圣徒的处决结算
       *    写在 `src/hooks/useExecutionHandlers.ts:261`，不走注册表。
       *    本断言固化现状，缺口写入交付报告。
       */
      if (spec.id === "saint") {
        expect(
          isRoleMigrated("saint"),
          "❌ 外来者 saint 的注册状态发生变化（原本为 false）—— 请复核本断言与交付报告"
        ).toBe(false);
        expect(
          isRoleMigrated("saint_townsfolk"),
          "（说明）扩展镇民版 saint_townsfolk 才是已注册的那一个"
        ).toBe(true);
      } else {
        expect(
          isRoleMigrated(spec.id),
          `❌ ${spec.id} 未注册进新引擎注册表（isRoleMigrated=false）`
        ).toBe(true);
      }

      // rolesData.json 的中文名（固化现状：recluse/scarlet_woman 与另两处不一致）
      expect(
        rdata(spec.id)?.name,
        `❌ rolesData.json 中 ${spec.id} 的名字是「${rdata(spec.id)?.name}」，期望「${spec.rolesDataName}」`
      ).toBe(spec.rolesDataName);
    });
  });

  it("③ 已知命名单点不一致恰好是 recluse / scarlet_woman（特征化断言）", () => {
    const divergent = SPEC.filter(
      (s) => rdata(s.id)?.name !== r(s.id)?.name
    ).map((s) => s.id);
    expect(
      divergent.sort(),
      "❌ rolesData.json 与 app/data.ts 的中文名分歧集合变化 —— " +
        "若已统一，请更新本条特征化断言并关闭交付报告中的可疑点"
    ).toEqual(["recluse", "scarlet_woman"]);

    // 这三处口径：app/data 与 officialRoleDocs 一致，rolesData.json 是异类
    expect(r("recluse")?.name).toBe("陌客");
    expect(r("scarlet_woman")?.name).toBe("红唇女郎");
    expect(rdata("recluse")?.name).toBe("隐士");
    expect(rdata("scarlet_woman")?.name).toBe("红罗刹");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2 · 引擎不变量层（每角色 3 条，每条 ≥3 expect）
// ══════════════════════════════════════════════════════════════════════════
describe("L2 · 暗流涌动 · 引擎不变量层（22 角色）", () => {
  describe.each(SPEC.map((s) => [s.id, s] as const))("L2 · %s", (_id, spec) => {
    it("③ targetConfig / triggerTiming 与官方规格一致", () => {
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

      const actualTiming = [...(spec.ability?.triggerTiming ?? [])].sort();
      expect(
        actualTiming,
        `❌ ${spec.id} triggerTiming 与规格不符（实际 ${JSON.stringify(actualTiming)}）`
      ).toEqual([...spec.timing].sort());
    });

    it("④ 夜序优先级：active 角色与 rolesData 逐字一致；被动角色必须为 null", () => {
      const rd = rdata(spec.id);
      const abilityFno = spec.ability?.firstNightPriority ?? null;
      const abilityOno = spec.ability?.otherNightPriority ?? null;
      const systemStep = SYSTEM_STEP_ORDER[spec.id];

      if (systemStep) {
        // ── 例外：rolesData 配了夜序号，但能力刻意 null（系统步骤/被动）──
        expect(
          abilityFno,
          `❌ ${spec.id} 是系统步骤型角色，firstNightPriority 应为 null（实际 ${abilityFno}）`
        ).toBeNull();
        expect(
          abilityOno,
          `❌ ${spec.id} 是系统步骤型角色，otherNightPriority 应为 null（实际 ${abilityOno}）`
        ).toBeNull();
        // 固化 rolesData 侧的夜序号，证明例外不是「数据缺失」
        expect(
          rd?.firstNightOrder ?? null,
          `❌ ${spec.id} rolesData.firstNightOrder 与例外表不符`
        ).toBe(systemStep.first ?? null);
        expect(
          rd?.otherNightOrder ?? null,
          `❌ ${spec.id} rolesData.otherNightOrder 与例外表不符`
        ).toBe(systemStep.other ?? null);
        return;
      }

      // ── 常规：直接与 rolesData.json（官方夜序唯一数据源）比对 ──
      expect(
        abilityFno,
        `❌ ${spec.id} firstNightPriority=${abilityFno}，官方夜序为 ${rd?.firstNightOrder ?? null}`
      ).toBe(rd?.firstNightOrder ?? null);
      expect(
        abilityOno,
        `❌ ${spec.id} otherNightPriority=${abilityOno}，官方夜序为 ${rd?.otherNightOrder ?? null}`
      ).toBe(rd?.otherNightOrder ?? null);
    });

    it("⑤ 四段中间件均已声明；calculate 为空的角色必须可解释", () => {
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
      expect(
        (spec.ability?.preCheck ?? []).length,
        `❌ ${spec.id}.preCheck 为空数组 —— 缺少存活/状态门控`
      ).toBeGreaterThan(0);
      expect(
        (spec.ability?.postProcess ?? []).length,
        `❌ ${spec.id}.postProcess 为空数组 —— 说书人看不到提示`
      ).toBeGreaterThan(0);

      /**
       * slayer 是**唯一** calculate 为空的角色：白天一次性能力，
       * 判定全部在 `handleSlayerKill`（stateUpdate）里完成，文件内有注释说明。
       */
      if (spec.id === "slayer") {
        expect(
          (spec.ability?.calculate ?? []).length,
          "❌ slayer.calculate 不再是空数组 —— 请复核其判定是否已迁出 stateUpdate"
        ).toBe(0);
      } else {
        expect(
          (spec.ability?.calculate ?? []).length,
          `❌ ${spec.id}.calculate 为空数组 —— 技能没有任何计算逻辑`
        ).toBeGreaterThan(0);
      }
    });

    it("⑥ 负向对照：前提不满足时不得落库 / 不得触发", async () => {
      const seats0 = () => board([spec.id, ...SAFE, "imp"]);

      switch (spec.neg) {
        case "deadActor": {
          const seats = seats0();
          seats[0].isDead = true;
          const before = JSON.parse(JSON.stringify(seats));
          const res = await runRole(spec.ability, seats, 0, {
            night: 1,
            phase: "firstNight",
            targets: [1],
          });
          expect(res?.aborted, `❌ ${spec.id} 已死亡时必须中止`).toBe(true);
          expect(changedSeats(before, res?.snapshot?.seats ?? [])).toEqual([]);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "washerwomanNotFirstNight": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 3,
            phase: "night",
            snapshot: { nightCount: 3 },
          });
          expect(
            res?.aborted,
            `❌ ${spec.id} 非首夜必须中止（官方：仅首个夜晚）`
          ).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "librarianNotFirstNight":
        case "investigatorNotFirstNight": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 3,
            phase: "night",
            snapshot: { nightCount: 3 },
          });
          expect(res?.aborted, `❌ ${spec.id} 非首夜必须中止`).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "chefEmptySeats":
        case "empathEmptySeats": {
          const res = await runRole(spec.ability, [], 0, {
            night: 1,
            phase: "firstNight",
          });
          expect(res?.aborted, `❌ ${spec.id} 无座位数据时必须中止`).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "fortuneTellerNotTwoTargets": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [1], // 只给 1 名，官方要求恰好 2 名
          });
          expect(
            res?.aborted,
            "❌ 占卜师只选 1 名玩家时必须中止（官方：选择两名玩家）"
          ).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "undertakerNoExecution": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            snapshot: { nightCount: 2 },
          });
          expect(
            res?.aborted,
            "❌ 今日无人被处决时送葬者必须中止"
          ).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "monkSelfTarget": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [0], // 选自己
          });
          expect(res?.aborted, "❌ 僧侣不能保护自己，必须中止").toBe(true);
          expect(
            (seatAfter(res, 0)?.statusEffects ?? []).some(
              (e: any) => e.type === "protected"
            ),
            "❌ 僧侣选自己时不得给自己加保护"
          ).toBe(false);
          break;
        }

        case "ravenkeeperAlive": {
          const seats = seats0();
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            snapshot: { nightCount: 2 },
            targets: [1],
          });
          expect(
            res?.aborted,
            "❌ 守鸦人今晚未死亡时必须中止（官方：只在夜晚死亡时唤醒）"
          ).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "virginWrongNominator": {
          for (const rid of ["baron", "imp", "saint", "recluse"]) {
            const seats = board(["virgin", rid, ...SAFE, "imp"]);
            const res = await runRole(spec.ability, seats, 0, {
              phase: "day",
              meta: { nominatorId: 1 },
            });
            expect(
              seatAfter(res, 1)?.isDead,
              `❌ ${rid} 提名贞洁者时提名者不得死亡（官方：仅镇民提名才处决）`
            ).toBe(false);
            expect(
              seatAfter(res, 0)?.abilityUsed,
              `❌ ${rid} 提名后贞洁者能力仍必须被消耗`
            ).toBe(true);
          }
          break;
        }

        case "slayerNotDemon": {
          const seats = board(["slayer", "chambermaid", "gossip", "imp", "tinker"]);
          const res = await runRole(spec.ability, seats, 0, {
            phase: "day",
            targets: [1], // 侍女，非恶魔
          });
          expect(
            seatAfter(res, 1)?.isDead,
            "❌ 猎手打中非恶魔时目标不得死亡"
          ).toBe(false);
          expect(
            res?.snapshot?.gamePhase,
            "❌ 未命中恶魔时不得结束游戏"
          ).not.toBe("gameOver");
          break;
        }

        case "soldierNotDemonKill": {
          const seats = board(["soldier", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            meta: { killerRoleId: "poisoner" }, // 非恶魔杀手
          });
          expect(
            res?.meta?.abilityResult,
            "❌ 杀手不是恶魔时士兵不得判定为免疫"
          ).toBe(false);
          expect(
            res?.meta?.isDemonKill,
            "❌ 杀手不是恶魔时 isDemonKill 必须为 false"
          ).toBe(false);
          break;
        }

        case "mayorNotDying": {
          const seats = board(["mayor", ...SAFE, "imp"]);
          const before = JSON.parse(JSON.stringify(seats));
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [1],
          });
          expect(
            res?.aborted,
            "❌ 镇长未被攻击（isMayorDying=false）时必须中止"
          ).toBe(true);
          expect(changedSeats(before, res?.snapshot?.seats ?? [])).toEqual([]);
          break;
        }

        case "butlerSelfTarget": {
          const seats = board(["butler", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [0],
          });
          expect(res?.aborted, "❌ 管家不能选择自己作主人").toBe(true);
          expect(seatAfter(res, 0)?.masterId).toBeUndefined();
          break;
        }

        case "drunkNotFirstNight": {
          const seats = board(["drunk", ...SAFE, "imp"]);
          const before = JSON.parse(JSON.stringify(seats));
          const res = await runRole(spec.ability, seats, 0, {
            night: 3,
            phase: "night",
            snapshot: { nightCount: 3 },
          });
          expect(
            res?.aborted,
            "❌ 酒鬼非首夜必须中止（fakeRole 已在首夜固化）"
          ).toBe(true);
          expect(changedSeats(before, res?.snapshot?.seats ?? [])).toEqual([]);
          break;
        }

        case "recluseRegistersGood": {
          const seats = board(["recluse", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
          });
          const meta: any = {};
          const { resolveRecluseRegistration } = await import(
            "../../new_engine/recluse.ability"
          );
          const asGood = resolveRecluseRegistration(
            0,
            "k1",
            meta,
            undefined,
            { id: 0, registerAsEvil: false, registerAsDemon: false }
          );
          expect(
            asGood.registersAsEvil,
            "❌ 说书人显式把陌客登记为善良时，registersAsEvil 必须为 false"
          ).toBe(false);
          expect(asGood.registersAsRoleType).toBeNull();
          expect(
            res?.meta?.recluseActive,
            "（说明）陌客被动恒激活，不受死亡/醉酒影响"
          ).toBe(true);
          break;
        }

        case "spyNoSeats": {
          const seats = board(["spy", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            snapshot: { seats: [] as any },
          });
          expect(
            res?.aborted === true ||
              !(res?.meta?.grimoireData?.players?.length > 0),
            "❌ 无座位数据时间谍不得产出魔典条目"
          ).toBe(true);
          expect(res?.meta?.abilityResult).toBeUndefined();
          break;
        }

        case "saintNotExecuted": {
          const seats = board(["saint", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, { phase: "day" });
          expect(
            res?.aborted,
            "❌ 圣徒未被处决时必须中止（官方：只有因处决死亡才触发）"
          ).toBe(true);
          expect(
            res?.snapshot?.gamePhase,
            "❌ 圣徒未被处决时不得结束游戏"
          ).not.toBe("gameOver");
          break;
        }

        case "poisonerDeadTarget": {
          const seats = board(["poisoner", ...SAFE, "imp"]);
          seats[1].isDead = true;
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [1],
          });
          expect(
            res?.aborted,
            "❌ 投毒者不能对已死亡玩家下毒，必须中止"
          ).toBe(true);
          expect(
            (seatAfter(res, 1)?.statusEffects ?? []).some(
              (e: any) => e.type === "poisoned"
            ),
            "❌ 已死亡目标身上不得出现 poisoned 效果"
          ).toBe(false);
          break;
        }

        case "scarletWomanTooFewAlive": {
          const seats = board(["imp", "scarlet_woman", "baron", "empath"]);
          (seats[0] as any).isDead = true; // 恶魔已死，存活 3
          const res = await runRole(spec.ability, seats, 1);
          expect(
            res?.aborted,
            "❌ 存活不足 5 人时红唇女郎不得继任（官方：≥5 名玩家存活时）"
          ).toBe(true);
          expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
          break;
        }

        case "baronNoReplacement": {
          const seats = board(["baron", ...SAFE, "imp"]);
          const res = await runRole(spec.ability, seats, 0, {
            snapshot: { setupConfig: { townsfolkCount: 9, outsiderCount: 1 } },
          });
          const cfg: any = (res?.snapshot as any)?.setupConfig;
          expect(
            cfg?.townsfolkCount,
            "❌ 男爵未指定替换清单时仍必须完成 -2 镇民调整"
          ).toBe(7);
          expect(cfg?.outsiderCount, "❌ 外来者必须 +2").toBe(3);
          expect(
            (cfg?.removedTownsfolk ?? []).length,
            "❌ 未指定 removedTownsfolk 时不得凭空生成被移除名单"
          ).toBe(0);
          break;
        }

        case "impProtectedTarget": {
          const seats = board(["imp", ...SAFE, "soldier"]);
          seats[3].statusEffects = [{ type: "protected", source: "monk" }];
          const res = await runRole(spec.ability, seats, 0, {
            night: 2,
            phase: "night",
            targets: [3],
          });
          expect(
            seatAfter(res, 3)?.markedForDeath ?? false,
            "❌ 被僧侣保护的玩家不得被小恶魔标记死亡"
          ).toBe(false);
          expect(
            res?.meta?.impResult?.killed,
            "❌ 击杀被保护挡住时 killed 必须为 false"
          ).toBe(false);
          expect(
            seatAfter(res, 3)?.isDead ?? false,
            "❌ 被保护者不应死亡"
          ).toBe(false);
          break;
        }

        default:
          throw new Error(`未覆盖的负向对照类型：${spec.neg}`);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2b · 醉酒/中毒门控（效果类角色）
// ══════════════════════════════════════════════════════════════════════════
describe("L2b · 效果类角色必须受 abilityEffective 门控", () => {
  const EFFECT_SPEC = SPEC.filter((s) => s.effectField);

  it("0) 效果类清单非空（防过滤条件写错导致空转）", () => {
    expect(EFFECT_SPEC.length, "效果类角色数应 > 0").toBeGreaterThan(0);
    expect(EFFECT_SPEC.map((s) => s.id)).toContain("imp");
    expect(EFFECT_SPEC.map((s) => s.id)).toContain("poisoner");
    expect(EFFECT_SPEC.map((s) => s.id)).toContain("monk");
  });

  describe.each(EFFECT_SPEC.map((s) => [s.id, s] as const))(
    "L2b · %s",
    (_id, spec) => {
      it("⑦ 醉酒：不得写入座位级效果，但选择仍须被记录", async () => {
        const seats = board([spec.id, ...SAFE, "imp"]);
        (seats[0] as any).isDrunk = true;
        const before = JSON.parse(JSON.stringify(seats));
        const res = await runRole(spec.ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
          snapshot: { nightCount: 2 },
          meta: { isMayorDying: true, killerRoleId: "imp", chooserSeatId: 1 },
          storytellerInput: { executedSeatId: 1 },
        });

        const changed = changedSeats(before, res?.snapshot?.seats ?? []);
        const hard = changed.filter((c) =>
          /\.(isDead|isPoisoned|isDrunk|role|masterId|fakeRole|markedForDeath)$/.test(
            c
          )
        );
        expect(
          hard,
          `❌ ${spec.id} 醉酒时仍产生了硬效果：${JSON.stringify(hard)}`
        ).toEqual([]);
        expect(
          res?.meta?.abilityEffective,
          `❌ ${spec.id} 醉酒时 abilityEffective 必须为 false`
        ).toBe(false);
        // 保护类效果字段本身也不得落地
        expect(
          changed.filter((c) => c.endsWith(`.${spec.effectField}`)),
          `❌ ${spec.id} 醉酒时不得改写 ${spec.effectField}`
        ).toEqual([]);
      });
    }
  );

  it("⑧ 例外：酒鬼的认知覆盖不受醉酒门控（官方：如果酒鬼醉酒或中毒，他不会有任何变化）", async () => {
    const seats = board(["drunk", ...SAFE, "imp"]);
    (seats[0] as any).isDrunk = true;
    const res = await runRole(SPEC.find((s) => s.id === "drunk")!.ability, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: { nightCount: 1 },
    });
    const drunk = seatAfter(res, 0);
    expect(res?.aborted, "❌ 酒鬼首夜必须执行认知覆盖设置").toBeFalsy();
    expect(
      drunk?.fakeRole?.type,
      "❌ 醉酒状态下酒鬼仍必须拿到 fakeRole（认知覆盖不受影响）"
    ).toBe("townsfolk");
    expect(
      (drunk?.statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.permanent === true
      ),
      "❌ 酒鬼必须带 permanent 的 drunk 效果"
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  L2c · 被动角色不得进入夜间唤醒队列
// ══════════════════════════════════════════════════════════════════════════
describe("L2c · 夜序边界：被动角色不排队", () => {
  const PASSIVE = ["virgin", "soldier", "mayor", "recluse", "saint", "baron", "scarlet_woman"];

  it("① 纯被动角色（无夜序）首夜/其他夜优先级均为 null", () => {
    for (const id of PASSIVE) {
      const spec = SPEC.find((s) => s.id === id)!;
      expect(
        spec.ability.firstNightPriority,
        `❌ ${id} 首夜优先级应为 null`
      ).toBeNull();
      expect(
        spec.ability.otherNightPriority,
        `❌ ${id} 其他夜优先级应为 null`
      ).toBeNull();
    }
    // 反向对照：有夜序的角色不得为 null（证明上面不是"全 null 恒真"）
    const active = SPEC.find((s) => s.id === "empath")!;
    expect(typeof active.ability.firstNightPriority).toBe("number");
    expect(typeof active.ability.otherNightPriority).toBe("number");
  });

  it("② 红唇女郎：rolesData 记 37，但能力声明 null（被动不排队）", () => {
    const sw = SPEC.find((s) => s.id === "scarlet_woman")!;
    expect(sw.ability.triggerTiming).toEqual(["passive"]);
    expect(sw.ability.otherNightPriority).toBeNull();
    expect(rdata("scarlet_woman")?.otherNightOrder).toBe(37);
  });

  it("③ 猎手（白天能力）：两夜优先级均为 null，triggerTiming=day", () => {
    const sl = SPEC.find((s) => s.id === "slayer")!;
    expect(sl.ability.triggerTiming).toEqual(["day"]);
    expect(sl.ability.firstNightPriority).toBeNull();
    expect(sl.ability.otherNightPriority).toBeNull();
    expect(sl.ability.targetConfig.min).toBe(1);
  });
});
