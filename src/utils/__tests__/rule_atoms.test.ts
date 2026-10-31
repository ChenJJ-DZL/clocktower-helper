/**
 * 语义原子层（L3）单元测试
 * ======================================================================
 * 覆盖目标：
 *   1. `extractRuleAtoms` 对**真实官方能力原文**的关键正/反例（小恶魔、圣徒、呆瓜、
 *      镇长、祖母、士兵、占卜师、男爵、间谍、异端分子、政客、弄臣…）；
 *   2. 保守性反例：死亡预防/括号裁定/「帮助你的阵营获胜」不能被误抽成触发或胜负；
 *   3. `compareRuleAtoms` 的分级口径（P1 硬矛盾 / P2 复核 / INFO 台账）；
 *   4. 胜负能力 ⇄ 判胜注册表映射（ROLE_WIN_CODES 必须引用真实 WinReasonCode；
 *      politician/heretic 属已知缺口只登记 INFO）；
 *   5. 全量不崩溃 + finding 上限（≤ 200，防止语义层爆炸式误报）。
 *
 * 数据源均为仓库内已落盘事实：官方原文来自 `json/full/*.json`（只读），
 * 实现元数据来自 `buildImplInventory()`；测试不联网、随机。
 */
import { beforeAll, describe, expect, it } from "vitest";
import type {
  ImplInventory,
  ImplRole,
  OfficialRoleSpec,
  OfficialSpecFile,
} from "../../../scripts/conformance/lib/types";
import {
  KNOWN_WIN_CODE_GAPS,
  ROLE_WIN_CODES,
  compareRuleAtoms,
  extractRuleAtoms,
  runSemanticAudit,
  winCodesForRole,
} from "../../../scripts/conformance/lib/ruleAtoms";
import { buildImplInventory } from "../../../scripts/conformance/lib/impl";
import { extractOfficialSpec } from "../../../scripts/conformance/lib/spec";
import { WIN_REASON_META } from "../winConditions/winReasonCodes";

const ROOT = process.cwd();
let spec: OfficialSpecFile;
let impl: ImplInventory;

beforeAll(() => {
  spec = extractOfficialSpec(ROOT);
  impl = buildImplInventory();
}, 180_000);

/** 取真实官方角色规范（找不到即测试失败：官方真源是只读的，名字必须存在） */
function official(nameCn: string): OfficialRoleSpec {
  const found = spec.roles.find((role) => role.nameCn === nameCn);
  if (!found) throw new Error(`官方规范缺少角色「${nameCn}」`);
  return found;
}

/** 取真实实现角色（找不到即测试失败：用于「官方 ⇄ 实现」端到端对照） */
function implRole(roleId: string): ImplRole {
  const found = impl.roles.find((role) => role.roleId === roleId);
  if (!found) throw new Error(`实现清单缺少角色「${roleId}」`);
  return found;
}

/** 构造最小实现角色（compare 单测：避免依赖并行修改中的产品代码） */
function fakeImpl(
  roleId: string,
  ability: Partial<NonNullable<ImplRole["ability"]>> | null
): ImplRole {
  return {
    roleId,
    nameCn: "测试角色",
    type: "townsfolk",
    inBuiltInScript: true,
    scripts: [],
    ability:
      ability === null
        ? null
        : {
            abilityId: `${roleId}_ability`,
            triggerTiming: [],
            firstNightPriority: null,
            otherNightPriority: null,
            targetMin: null,
            targetMax: null,
            allowSelf: null,
            allowDead: null,
            ...ability,
          },
  };
}

/** 构造最小官方规范（compare 单测：文本驱动，不依赖官方名字） */
function fakeSpec(abilityText: string): OfficialRoleSpec {
  return {
    nameCn: "测试角色",
    nameEn: "Test Role",
    type: "townsfolk",
    typeRaw: "镇民",
    firstNightOrder: null,
    otherNightOrder: null,
    firstNightOrderRaw: null,
    otherNightOrderRaw: null,
    scriptTags: [],
    capabilityTags: [],
    abilityText,
    examples: [],
    storytellerOps: "",
    reminderTokens: "",
    rulesDetail: "",
    sourceFiles: ["unit-test.json"],
    sourceRecordCount: 1,
    wikiUrl: null,
  };
}

describe("语义原子抽取 · 真实官方能力原文", () => {
  it("小恶魔：每夜杀 1 名玩家，无首夜/无限次/无胜负", () => {
    const atoms = extractRuleAtoms(official("小恶魔").abilityText);
    expect(atoms.triggersNight.everyNight).toBe(true);
    expect(atoms.triggersNight.firstNight).toBe(false);
    expect(atoms.triggersNight.oncePerGame).toBe(false);
    expect(atoms.targetKind).toBe("player");
    expect(atoms.targetCount).toEqual({ min: 1, max: 1 });
    expect(atoms.winLoss).toBeNull();
    expect(atoms.onExecution).toBe(false);
  });

  it("圣徒：被处决触发 + 阵营落败", () => {
    const atoms = extractRuleAtoms(official("圣徒").abilityText);
    expect(atoms.onExecution).toBe(true);
    expect(atoms.winLoss).toBe("teamLoses");
    expect(atoms.triggersNight.everyNight).toBe(false);
    expect(atoms.targetKind).toBe("none");
  });

  it("呆瓜：死亡后选择 1 名存活玩家（死亡是触发语境而非主动夜触发）", () => {
    const atoms = extractRuleAtoms(official("呆瓜").abilityText);
    expect(atoms.winLoss).toBe("teamLoses");
    expect(atoms.targetKind).toBe("player");
    expect(atoms.targetCount).toEqual({ min: 1, max: 1 });
    expect(atoms.allowDead).toBe(false);
    // 「当你得知你死亡时」不是标准自身死亡行动触发：保守抽为 false
    expect(atoms.onDeath).toBe(false);
  });

  it("镇长：阵营获胜，无目标选择（夜间被动）", () => {
    const atoms = extractRuleAtoms(official("镇长").abilityText);
    expect(atoms.winLoss).toBe("teamWins");
    expect(atoms.targetKind).toBe("none");
    expect(atoms.triggersNight.everyNight).toBe(false);
    expect(atoms.infoRole).toBe(false);
  });

  it("祖母：首夜信息角色，不是每夜角色", () => {
    const atoms = extractRuleAtoms(official("祖母").abilityText);
    expect(atoms.triggersNight.firstNight).toBe(true);
    expect(atoms.triggersNight.everyNight).toBe(false);
    expect(atoms.infoRole).toBe(true);
  });

  it("士兵：纯被动防御，不该命中任何触发/目标/胜负原子", () => {
    const atoms = extractRuleAtoms(official("士兵").abilityText);
    expect(atoms.triggersNight.firstNight).toBe(false);
    expect(atoms.triggersNight.everyNight).toBe(false);
    expect(atoms.onDeath).toBe(false);
    expect(atoms.onExecution).toBe(false);
    expect(atoms.targetKind).toBe("none");
    expect(atoms.targetCount).toBeNull();
    expect(atoms.winLoss).toBeNull();
    expect(atoms.infoRole).toBe(false);
    expect(atoms.passive).toBe(true);
  });

  it("占卜师：每夜选择 2 名玩家（未明说自选/死者 ⇒ null，不猜）", () => {
    const atoms = extractRuleAtoms(official("占卜师").abilityText);
    expect(atoms.triggersNight.everyNight).toBe(true);
    expect(atoms.targetKind).toBe("player");
    expect(atoms.targetCount).toEqual({ min: 2, max: 2 });
    expect(atoms.allowSelf).toBeNull();
    expect(atoms.infoRole).toBe(true);
  });

  it("僧侣：「除你以外」⇒ allowSelf=false，数量 1", () => {
    const atoms = extractRuleAtoms(official("僧侣").abilityText);
    expect(atoms.targetCount).toEqual({ min: 1, max: 1 });
    expect(atoms.allowSelf).toBe(false);
  });

  it("男爵：设置调整（外来者数量）", () => {
    const atoms = extractRuleAtoms(official("男爵").abilityText);
    expect(atoms.setupAdjustment).toBe(true);
    expect(atoms.winLoss).toBeNull();
  });

  it("间谍：registration + 死后能力保留", () => {
    const atoms = extractRuleAtoms(official("间谍").abilityText);
    expect(atoms.registration).toBe(true);
    expect(atoms.persistsAfterDeath).toBe(true);
  });

  it("异端分子：对调胜负 + 死后仍生效", () => {
    const atoms = extractRuleAtoms(official("异端分子").abilityText);
    expect(atoms.winLoss).toBe("swap");
    expect(atoms.persistsAfterDeath).toBe(true);
  });

  it("政客：同时出现「阵营落败」与「转变阵营并获胜」时必须取 teamWins", () => {
    const atoms = extractRuleAtoms(official("政客").abilityText);
    expect(atoms.winLoss).toBe("teamWins");
    expect(atoms.persistsAfterDeath).toBe(true);
  });

  it("胜负原子分类：利维坦/涡流=邪恶获胜，无神论者=善良获胜", () => {
    expect(extractRuleAtoms(official("利维坦").abilityText).winLoss).toBe("evilWins");
    expect(extractRuleAtoms(official("涡流").abilityText).winLoss).toBe("evilWins");
    expect(extractRuleAtoms(official("无神论者").abilityText).winLoss).toBe("goodWins");
  });

  it("保守反例①：弄臣/僵怖的死亡预防句不算死亡触发", () => {
    expect(extractRuleAtoms(official("弄臣").abilityText).onDeath).toBe(false);
    expect(extractRuleAtoms(official("僵怖").abilityText).onDeath).toBe(false);
  });

  it("保守反例②：小提琴手括号内「平局邪恶阵营获胜」不算角色胜负能力", () => {
    expect(extractRuleAtoms(official("小提琴手").abilityText).winLoss).toBeNull();
  });

  it("保守反例③：渔夫「帮助你的阵营获胜的建议」不算胜负能力", () => {
    expect(extractRuleAtoms(official("渔夫").abilityText).winLoss).toBeNull();
  });

  it("保守反例④：「在你的首个白天」不是首夜", () => {
    const atoms = extractRuleAtoms(official("公主").abilityText);
    expect(atoms.triggersNight.firstNight).toBe(false);
    expect(atoms.startsDay).toBe(true);
  });

  it("保守反例⑤：理发师文本中「恶魔可以选择两名玩家」不算角色目标数", () => {
    const atoms = extractRuleAtoms(official("理发师").abilityText);
    expect(atoms.targetCount).toBeNull();
  });
});

describe("语义原子抽取 · 关键词口径（合成文本）", () => {
  it("任意玩家：allowSelf=true 且 allowDead=true（官方任意玩家含自己与死者）", () => {
    const atoms = extractRuleAtoms("你要选择任意一名玩家：他死亡。");
    expect(atoms.targetKind).toBe("player");
    expect(atoms.targetCount).toEqual({ min: 1, max: 1 });
    expect(atoms.allowSelf).toBe(true);
    expect(atoms.allowDead).toBe(true);
  });

  it("至多三名：min=0 / max=3", () => {
    const atoms = extractRuleAtoms("你可以选择至多三名玩家：他们死亡。");
    expect(atoms.targetKind).toBe("player");
    expect(atoms.targetCount).toEqual({ min: 0, max: 3 });
  });

  it("夜间每局一次：oncePerGame 与 limitOncePerGame 均为 true", () => {
    const atoms = extractRuleAtoms(
      "每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡。"
    );
    expect(atoms.triggersNight.oncePerGame).toBe(true);
    expect(atoms.limitOncePerGame).toBe(true);
    expect(atoms.triggersNight.everyNight).toBe(false);
  });

  it("酒毒免疫 / 死后保留 / 被当作 / 信息型 / 对调胜负关键词", () => {
    expect(extractRuleAtoms("即使你已醉酒或中毒，你仍能得知。").droisonImmune).toBe(true);
    expect(extractRuleAtoms("即使你已死亡，你的能力仍然生效。").persistsAfterDeath).toBe(true);
    expect(extractRuleAtoms("你可能会被当作邪恶阵营。").registration).toBe(true);
    expect(extractRuleAtoms("你会得知一名玩家的角色。").infoRole).toBe(true);
    expect(extractRuleAtoms("对调胜负结果。").winLoss).toBe("swap");
  });

  it("空文本 / 无触发文本不崩溃且全为 false/null", () => {
    for (const text of ["", "   ", "你是一个好人。"]) {
      const atoms = extractRuleAtoms(text);
      expect(atoms.winLoss).toBeNull();
      expect(atoms.targetCount).toBeNull();
      expect(atoms.triggersNight.everyNight).toBe(false);
    }
  });
});

describe("语义对账 · compareRuleAtoms 分级口径", () => {
  it("每夜能力 vs 缺 every_night ⇒ P1", () => {
    const deviations = compareRuleAtoms(
      fakeSpec("每个夜晚*，你要选择一名玩家：他死亡。"),
      fakeImpl("test_role", { triggerTiming: ["first_night"] })
    );
    const hit = deviations.find((deviation) => deviation.atom === "trigger.every_night");
    expect(hit?.severity).toBe("P1");
  });

  it("首夜能力 vs 缺 first_night ⇒ P1", () => {
    const deviations = compareRuleAtoms(
      fakeSpec("在你的首个夜晚，你会得知一名善良玩家。"),
      fakeImpl("test_role", { triggerTiming: ["passive"] })
    );
    expect(
      deviations.find((deviation) => deviation.atom === "trigger.first_night")?.severity
    ).toBe("P1");
  });

  it("死亡触发 vs 缺 on_death ⇒ P1", () => {
    const deviations = compareRuleAtoms(
      fakeSpec("如果你死亡，当晚爪牙和恶魔会改为互认。"),
      fakeImpl("test_role", { triggerTiming: ["passive"] })
    );
    expect(
      deviations.find((deviation) => deviation.atom === "trigger.on_death")?.severity
    ).toBe("P1");
  });

  it("处决触发 vs 缺 on_execution ⇒ P1", () => {
    const deviations = compareRuleAtoms(
      fakeSpec("如果你被处决，你的阵营落败。"),
      fakeImpl("test_role", { triggerTiming: ["day"] })
    );
    expect(
      deviations.find((deviation) => deviation.atom === "trigger.on_execution")?.severity
    ).toBe("P1");
  });

  it("匹配的实现声明不产生触发偏差", () => {
    const deviations = compareRuleAtoms(
      fakeSpec("每个夜晚*，你要选择一名玩家：他死亡。"),
      fakeImpl("imp_like", { triggerTiming: ["every_night"] })
    );
    expect(deviations.filter((deviation) => deviation.atom.startsWith("trigger."))).toEqual(
      []
    );
  });

  it("夜间一次性能力 vs every_night ⇒ P2（且 abilityId 有限次线索时不报）", () => {
    const spec = fakeSpec("每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡。");
    const p2 = compareRuleAtoms(
      spec,
      fakeImpl("singleuse_role", {
        triggerTiming: ["every_night"],
        abilityId: "singleuse_night_ability",
      })
    );
    expect(
      p2.find((deviation) => deviation.atom === "trigger.once_per_game")?.severity
    ).toBe("P2");
    const withEvidence = compareRuleAtoms(
      spec,
      fakeImpl("singleuse_role", {
        triggerTiming: ["every_night"],
        abilityId: "singleuse_once_ability",
      })
    );
    expect(
      withEvidence.filter((deviation) => deviation.atom === "trigger.once_per_game")
    ).toEqual([]);
  });

  it("目标数量不一致 ⇒ P2；一致 ⇒ 不报", () => {
    const spec = fakeSpec("每个夜晚，你要选择两名玩家：他们死亡。");
    const mismatch = compareRuleAtoms(
      spec,
      fakeImpl("target_role", {
        triggerTiming: ["every_night"],
        targetMin: 1,
        targetMax: 1,
      })
    );
    expect(mismatch.find((deviation) => deviation.atom === "target.count")?.severity).toBe(
      "P2"
    );
    const ok = compareRuleAtoms(
      spec,
      fakeImpl("target_role", {
        triggerTiming: ["every_night"],
        targetMin: 2,
        targetMax: 2,
      })
    );
    expect(ok.filter((deviation) => deviation.atom.startsWith("target."))).toEqual([]);
  });

  it("胜负能力但判胜注册表无 reasonCode ⇒ P1；politician/heretic 已知缺口 ⇒ INFO", () => {
    const winSpec = fakeSpec("如果白天没人被处决，邪恶阵营获胜。");
    const missing = compareRuleAtoms(
      winSpec,
      fakeImpl("unregistered_win_role", { triggerTiming: ["every_night"] })
    );
    expect(missing.find((deviation) => deviation.atom === "win.reason_code")?.severity).toBe(
      "P1"
    );
    const knownGap = compareRuleAtoms(
      winSpec,
      fakeImpl("politician", { triggerTiming: ["passive"] })
    );
    expect(
      knownGap.find((deviation) => deviation.atom === "win.reason_code")?.severity
    ).toBe("INFO");
  });

  it("无胜负能力（winLoss=null）不触发 win 偏差（含真实小恶魔）", () => {
    expect(
      compareRuleAtoms(
        fakeSpec("每个夜晚*，你要选择一名玩家：他死亡。"),
        fakeImpl("imp", { triggerTiming: ["every_night"] })
      ).filter((deviation) => deviation.atom === "win.reason_code")
    ).toEqual([]);
    const realImp = compareRuleAtoms(official("小恶魔"), implRole("imp"));
    expect(realImp.filter((deviation) => deviation.atom === "win.reason_code")).toEqual([]);
  });

  it("设置调整且无 setup 证据 ⇒ INFO（abilityId 有线索则不报）", () => {
    const spec = fakeSpec("会有额外的外来者在场。[+2 外来者]");
    const info = compareRuleAtoms(
      spec,
      fakeImpl("role_x", { triggerTiming: ["passive"], abilityId: "role_x_passive" })
    );
    const hit = info.find((deviation) => deviation.atom === "setup.adjustment");
    expect(hit?.severity).toBe("INFO");
    const withEvidence = compareRuleAtoms(
      spec,
      fakeImpl("role_x", {
        triggerTiming: ["passive"],
        abilityId: "role_x_outsider_boost",
      })
    );
    expect(
      withEvidence.filter((deviation) => deviation.atom === "setup.adjustment")
    ).toEqual([]);
  });

  it("真实注册：圣徒/镇长在判胜注册表已有 reasonCode ⇒ 无 win 偏差", () => {
    for (const [nameCn, roleId] of [
      ["圣徒", "saint"],
      ["镇长", "mayor"],
    ] as const) {
      const deviations = compareRuleAtoms(official(nameCn), implRole(roleId));
      expect(
        deviations.filter((deviation) => deviation.atom === "win.reason_code"),
        `${nameCn} 的胜负能力应已登记 reasonCode`
      ).toEqual([]);
    }
  });

  it("未注册新引擎能力的角色：触发/目标不可对账，不硬报 P1", () => {
    const deviations = compareRuleAtoms(
      official("圣徒"),
      fakeImpl("saint_no_ability", null)
    );
    // 胜负能力仍然按「注册表是否有 reasonCode」对账（与能力注册无关）；此角色 id
    // 不在映射表里，因此 win 偏差可能存在 —— 这里只断言触发/目标不被硬报。
    expect(
      deviations.filter(
        (deviation) =>
          deviation.severity === "P1" &&
          (deviation.atom.startsWith("trigger.") || deviation.atom.startsWith("target."))
      )
    ).toEqual([]);
  });
});

describe("胜负能力映射表 ROLE_WIN_CODES", () => {
  it("覆盖任务要求的关键角色，且 politician/heretic 登记为已知缺口", () => {
    for (const roleId of [
      "saint",
      "mayor",
      "evil_twin",
      "klutz",
      "goblin",
      "mastermind",
      "leviathan",
      "heretic",
      "politician",
      "damsel",
      "vortox",
      "fearmonger",
    ]) {
      expect(roleId in ROLE_WIN_CODES, `${roleId} 应出现在 ROLE_WIN_CODES`).toBe(true);
    }
    expect(KNOWN_WIN_CODE_GAPS.has("politician")).toBe(true);
    expect(KNOWN_WIN_CODE_GAPS.has("heretic")).toBe(true);
    expect(winCodesForRole("politician")).toEqual([]);
    expect(winCodesForRole("heretic")).toEqual([]);
  });

  it("映射的每个 reasonCode 都真实存在于 WIN_REASON_META", () => {
    for (const [roleId, codes] of Object.entries(ROLE_WIN_CODES)) {
      for (const code of codes) {
        expect(
          code in WIN_REASON_META,
          `${roleId} 映射了不存在的 reasonCode: ${code}`
        ).toBe(true);
      }
    }
  });
});

describe("语义层全量审计（runSemanticAudit）", () => {
  it("全量 232 条官方文本抽取不崩溃，且原子命中数合理", () => {
    expect(spec.roles.length).toBeGreaterThanOrEqual(232);
    let everyNightHits = 0;
    for (const role of spec.roles) {
      const atoms = extractRuleAtoms(role.abilityText);
      // 每个原子必须是可 JSON 序列化的基本类型（防止 undefined/NaN 混入产物）
      expect(typeof atoms.triggersNight.everyNight).toBe("boolean");
      expect(typeof atoms.infoRole).toBe("boolean");
      expect(JSON.stringify(atoms).includes("undefined")).toBe(false);
      if (atoms.triggersNight.everyNight) everyNightHits++;
    }
    expect(everyNightHits).toBeGreaterThan(50);
  });

  it("全量对账：finding 数 ≤ 200（保守分级，不爆炸式误报）", () => {
    const result = runSemanticAudit(spec, impl);
    expect(result.stats.comparedRoles).toBeGreaterThan(100);
    expect(result.stats.deviations.total).toBeLessThanOrEqual(200);
    // 语义层不产生 P0（P0 只属于静态层的类型/夜序等硬事实）
    expect(result.stats.deviations.P0).toBe(0);
    // 每条 finding 必须是可复核结构
    for (const finding of result.findings) {
      expect(finding.roleId).toBeTruthy();
      expect(finding.atom).toBeTruthy();
      expect(finding.detail.length).toBeGreaterThan(0);
      expect(["P1", "P2", "INFO"]).toContain(finding.severity);
    }
    // byAtom 聚合与 findings 总数一致（防止聚合口径漂移）
    const aggregated = result.byAtom.reduce((sum, row) => sum + row.count, 0);
    expect(aggregated).toBe(result.stats.deviations.total);
    // 全量快照必须可 JSON 序列化（CLI 落盘契约）
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("变体/重复实现不重复产出 finding（同一官方角色只对账主实现）", () => {
    const result = runSemanticAudit(spec, impl);
    expect(result.stats.variantSkippedRoles).toBeGreaterThan(0);
    const findingRoleIds = new Set(result.findings.map((finding) => finding.roleId));
    for (const skipped of result.variantSkipped) {
      // 变体角色自身不应产生 finding（其元数据差异属预期）
      expect(findingRoleIds.has(skipped)).toBe(false);
    }
  });
});
