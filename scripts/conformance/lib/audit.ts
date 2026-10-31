/**
 * 规则一致性审计核心（纯函数，可被 CLI / vitest 复用）
 * ======================================================================
 * 输入：官方规范 + 项目实现清单 + 测试证据
 * 输出：逐角色台账 + 分层 findings + 静态「是否严格符合官方规则」判定
 *
 * 判定原则（与判胜系统的 fail-closed 一脉相承）：
 *   · 只对**能严格对照**的字段下硬结论（类型 / 官方夜序数字）；
 *   · 官方缺失/无法比对的字段标 `null`（unverifiable），不假装通过；
 *   · 语义效果（技能到底怎么结算）不在本层断言 —— 见设计文档的分层体系。
 */
import type {
  ConformanceFinding,
  ConformanceReport,
  ImplInventory,
  ImplRole,
  OfficialNightOrder,
  OfficialRoleSpec,
  OfficialSpecFile,
  RoleConformanceRow,
  SpecMapping,
} from "./types";
import type { TestEvidence } from "./evidence";

/** 英文名归一化：`"Devil's Advocate"` → `devils_advocate`，`"No Dashii"` → `no_dashii` */
export function normalizeEnglishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const VARIANT_SUFFIXES = [
  "_female",
  "_male",
  "_townsfolk",
  "_outsider",
  "_minion",
  "_demon",
  "_traveler",
  "_fabled",
  "_variant",
];

/** 去掉项目角色 id 的变体后缀：`professor_female` → `professor` */
export function stripVariantSuffix(roleId: string): string {
  let current = roleId;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of VARIANT_SUFFIXES) {
      if (current.endsWith(suffix)) {
        current = current.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return current;
}

/** 去掉中文名后缀：`僧侣（女）` → `僧侣` */
export function stripChineseVariantSuffix(name: string): string {
  return name.replace(/[（(](女|男|实验角色|旅行者|传奇角色|变体)[)）]\s*$/u, "").trim();
}

interface IndexedSpec {
  byEnglish: Map<string, OfficialRoleSpec[]>;
  byChinese: Map<string, OfficialRoleSpec[]>;
  all: OfficialRoleSpec[];
}

function buildSpecIndex(spec: OfficialSpecFile): IndexedSpec {
  const byEnglish = new Map<string, OfficialRoleSpec[]>();
  const byChinese = new Map<string, OfficialRoleSpec[]>();
  for (const role of spec.roles) {
    const englishKey = normalizeEnglishName(role.nameEn || "");
    if (englishKey) {
      if (!byEnglish.has(englishKey)) byEnglish.set(englishKey, []);
      byEnglish.get(englishKey)!.push(role);
    }
    if (role.nameCn) {
      if (!byChinese.has(role.nameCn)) byChinese.set(role.nameCn, []);
      byChinese.get(role.nameCn)!.push(role);
    }
  }
  return { byEnglish, byChinese, all: spec.roles };
}

/**
 * 同名歧义时的选择策略：优先「能力原文更完整」的记录，其次按中文名稳定排序。
 * （wiki dump 里存在同名不同版本的记录，例如变体角色。）
 */
function pickBest(candidates: OfficialRoleSpec[] | undefined): OfficialRoleSpec | null {
  if (!candidates || candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const lengthDiff = b.abilityText.length - a.abilityText.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.nameCn.localeCompare(b.nameCn, "zh-Hans-CN");
  })[0]!;
}

/** 项目角色 → 官方规范（多级回退，返回命中的匹配方式便于人审） */
export function resolveSpecForRole(
  role: ImplRole,
  index: IndexedSpec
): SpecMapping | null {
  const englishKey = normalizeEnglishName(role.roleId);
  const direct = pickBest(index.byEnglish.get(englishKey));
  if (direct) return { spec: direct, matchedBy: "english_id" };

  const stem = normalizeEnglishName(stripVariantSuffix(role.roleId));
  if (stem && stem !== englishKey) {
    const stemmed = pickBest(index.byEnglish.get(stem));
    if (stemmed) return { spec: stemmed, matchedBy: "english_stem" };
  }

  const byChinese = pickBest(index.byChinese.get(role.nameCn));
  if (byChinese) return { spec: byChinese, matchedBy: "chinese_name" };

  const chineseStem = stripChineseVariantSuffix(role.nameCn);
  if (chineseStem && chineseStem !== role.nameCn) {
    const stemmedChinese = pickBest(index.byChinese.get(chineseStem));
    if (stemmedChinese) {
      return { spec: stemmedChinese, matchedBy: "chinese_stem" };
    }
  }
  return null;
}

interface AuditInput {
  spec: OfficialSpecFile;
  impl: ImplInventory;
  evidence: TestEvidence;
}

type FindingSink = (finding: ConformanceFinding) => void;

/** 变体角色（通过去后缀匹配到官方规范）：其类型/夜序允许与官方不同，只做 INFO 记录 */
function isVariantMapping(mapping: SpecMapping): boolean {
  return (
    mapping.matchedBy === "english_stem" || mapping.matchedBy === "chinese_stem"
  );
}

/** 该能力是否会在夜晚被唤醒（只有这类能力才需要比对官方夜序） */
function hasNightWake(role: ImplRole): boolean {
  const trigger = role.ability?.triggerTiming ?? [];
  return trigger.some((t) => t === "first_night" || t === "every_night");
}

function compareNightOrder(args: {
  kind: "first" | "other";
  official: OfficialNightOrder;
  implPriority: number | null;
  hasAbility: boolean;
  role: ImplRole;
  /** 官方能力原文是否声称「每个夜晚」类主动行动（用于识别官方数据自相矛盾） */
  officialTextHintsNight: boolean;
  addFinding: FindingSink;
  onComparable: (mismatch: boolean) => void;
}): boolean | null {
  const {
    kind,
    official,
    implPriority,
    hasAbility,
    role,
    officialTextHintsNight,
    addFinding,
  } = args;
  if (official === null) return null; // 官方未收录：不可比对
  if (hasAbility && !hasNightWake(role)) {
    // 被动型能力（passive / on_death / on_day…）不参与夜间唤醒，
    // 官方夜序表上的编号可能来自别的机制，不做硬断言。
    return null;
  }
  if (official === "cannot_act") {
    // 官方夜序「无法行动」但能力原文写「每个夜晚」⇒ 官方数据自相矛盾
    // （常见于旅行者：他们不在夜间顺序表里，但能力确实在夜间生效）。
    // 这种情况不判对错，登记为 INFO 交人审/说书人裁定。
    if (officialTextHintsNight && hasAbility && implPriority !== null) {
      addFinding({
        severity: "INFO",
        check: "spec.official_data_conflict",
        roleId: role.roleId,
        roleNameCn: role.nameCn,
        official: "无法行动",
        impl: implPriority,
        detail: `官方夜序标「无法行动」，但官方能力原文含「每个夜晚」；实现声明了夜间优先级 ${implPriority}，需人工裁定口径`,
      });
      return null;
    }
    const ok = !hasAbility || implPriority === null;
    args.onComparable(!ok);
    if (!ok) {
      addFinding({
        severity: "P1",
        check: `night.${kind}.cannot_act_violation`,
        roleId: role.roleId,
        roleNameCn: role.nameCn,
        official: "无法行动",
        impl: implPriority,
        detail: `官方 ${kind === "first" ? "首夜" : "其他夜晚"}明确「无法行动」，但实现声明了夜间唤醒优先级 ${implPriority}`,
      });
    }
    return ok;
  }
  if (!hasAbility) {
    args.onComparable(false);
    addFinding({
      severity: "P2",
      check: `night.${kind}.unverifiable`,
      roleId: role.roleId,
      roleNameCn: role.nameCn,
      official,
      impl: null,
      detail: `官方夜序为 ${official}，但该角色未注册新引擎能力，无法比对优先级`,
    });
    return null;
  }
  const ok = implPriority === official;
  args.onComparable(!ok);
  if (!ok) {
    addFinding({
      severity: "P1",
      check: `night.${kind}.mismatch`,
      roleId: role.roleId,
      roleNameCn: role.nameCn,
      official,
      impl: implPriority,
      detail: `官方 ${kind === "first" ? "首夜" : "其他夜晚"}夜序 ${official}，实现 ${implPriority}`,
    });
  }
  return ok;
}

/** 执行规则一致性审计（纯函数：不写文件、不依赖时钟以外副作用） */
export function runConformanceAudit(input: AuditInput): ConformanceReport {
  const { spec, impl, evidence } = input;
  const index = buildSpecIndex(spec);
  const findings: ConformanceFinding[] = [];
  const seenSignatures = new Set<string>();
  const addFinding: FindingSink = (finding) => {
    const signature = `${finding.check}|${finding.roleId ?? finding.roleNameCn ?? "*"}`;
    if (seenSignatures.has(signature)) return;
    seenSignatures.add(signature);
    findings.push(finding);
  };

  const rows: RoleConformanceRow[] = [];
  const mappedSpecs = new Set<OfficialRoleSpec>();
  const mappedByMethod: Record<string, number> = {};
  let typeChecked = 0;
  let typeMismatches = 0;
  let firstNightComparable = 0;
  let firstNightMismatches = 0;
  let otherNightComparable = 0;
  let otherNightMismatches = 0;
  let builtInWithoutSpec = 0;

  for (const role of impl.roles) {
    const mapping = resolveSpecForRole(role, index);
    const referenced =
      (evidence.references.get(role.roleId) ?? 0) > 0;

    if (!mapping) {
      if (role.inBuiltInScript) {
        builtInWithoutSpec++;
        addFinding({
          severity: "P1",
          check: "impl.role.unmatched_spec",
          roleId: role.roleId,
          roleNameCn: role.nameCn,
          detail: `内置剧本角色在官方 $(json/full) 中找不到对应规范（角色名/英文名均未命中）`,
        });
      } else {
        addFinding({
          severity: "INFO",
          check: "impl.role.unmatched_spec_custom",
          roleId: role.roleId,
          roleNameCn: role.nameCn,
          detail: "非内置剧本角色，官方规范未收录（自定义角色可接受，需登记来源）",
        });
      }
      rows.push({
        roleId: role.roleId,
        nameCn: role.nameCn,
        officialNameCn: null,
        officialType: null,
        implType: role.type,
        typeOk: null,
        firstNightOk: null,
        otherNightOk: null,
        officialFirstNightOrder: null,
        officialOtherNightOrder: null,
        implFirstNightPriority: role.ability?.firstNightPriority ?? null,
        implOtherNightPriority: role.ability?.otherNightPriority ?? null,
        hasAbilityImpl: role.ability !== null,
        capabilityTags: [],
        officialExamples: 0,
        testReferences: evidence.references.get(role.roleId) ?? 0,
        e2eSeen: evidence.e2eSeen.get(role.roleId) ?? null,
        findings: (findings as ConformanceFinding[])
          .filter((f) => f.roleId === role.roleId)
          .map((f) => f.check),
      });
    } else {
      const official = mapping.spec;
      const variant = isVariantMapping(mapping);
      mappedSpecs.add(official);
      mappedByMethod[mapping.matchedBy] =
        (mappedByMethod[mapping.matchedBy] ?? 0) + 1;

      // ── 类型 ──────────────────────────────────────────────
      let typeOk: boolean | null = null;
      if (official.type !== null) {
        typeChecked++;
        typeOk = official.type === role.type;
        if (!typeOk) {
          if (variant) {
            addFinding({
              severity: "INFO",
              check: "spec.type.variant_mismatch",
              roleId: role.roleId,
              roleNameCn: role.nameCn,
              official: `${official.typeRaw}(${official.type})`,
              impl: role.type,
              detail: `变体角色（id/名称与官方规范存在后缀差异），类型不同属预期差异，仅登记`,
            });
          } else if (!role.inBuiltInScript) {
            addFinding({
              severity: "P2",
              check: "spec.type.mismatch_unused",
              roleId: role.roleId,
              roleNameCn: role.nameCn,
              official: `${official.typeRaw}(${official.type})`,
              impl: role.type,
              detail: `未用于内置剧本的角色类型与官方不一致（数据陈旧/未使用，清理或修正）`,
            });
          } else {
            typeMismatches++;
            addFinding({
              severity: "P0",
              check: "spec.type.mismatch",
              roleId: role.roleId,
              roleNameCn: role.nameCn,
              official: `${official.typeRaw}(${official.type})`,
              impl: role.type,
              detail: `内置剧本角色的官方类型为 ${official.typeRaw}，实现为 ${role.type}`,
            });
          }
        }
      }

      // ── 能力注册 ──────────────────────────────────────────
      const hasAbility = role.ability !== null;
      if (!hasAbility) {
        addFinding({
          severity: "P2",
          check: "impl.ability.missing",
          roleId: role.roleId,
          roleNameCn: role.nameCn,
          detail: "该角色未注册新引擎能力（可能走 legacy 路径，需登记或补齐）",
        });
      }

      // ── 夜序（变体角色不比对：其实现有意与官方基础角色不同） ──
      const officialTextHintsNight = /每个夜晚|每夜|每晚/.test(
        official.abilityText
      );
      const firstOk = variant
        ? null
        : compareNightOrder({
            kind: "first",
            official: official.firstNightOrder,
            implPriority: role.ability?.firstNightPriority ?? null,
            hasAbility,
            role,
            officialTextHintsNight,
            addFinding,
            onComparable: (mismatch) => {
              firstNightComparable++;
              if (mismatch) firstNightMismatches++;
            },
          });
      const otherOk = variant
        ? null
        : compareNightOrder({
            kind: "other",
            official: official.otherNightOrder,
            implPriority: role.ability?.otherNightPriority ?? null,
            hasAbility,
            role,
            officialTextHintsNight,
            addFinding,
            onComparable: (mismatch) => {
              otherNightComparable++;
              if (mismatch) otherNightMismatches++;
            },
          });

      // ── 测试入口 ──────────────────────────────────────────
      const references = evidence.references.get(role.roleId) ?? 0;
      if (references === 0) {
        addFinding({
          severity: "P2",
          check: "evidence.test_reference_missing",
          roleId: role.roleId,
          roleNameCn: role.nameCn,
          detail: "该角色在 src/tests/e2e 测试源码中零引用（连测试入口都没有）",
        });
      }

      rows.push({
        roleId: role.roleId,
        nameCn: role.nameCn,
        officialNameCn: official.nameCn,
        officialType: official.type,
        implType: role.type,
        typeOk,
        firstNightOk: firstOk,
        otherNightOk: otherOk,
        officialFirstNightOrder: official.firstNightOrder,
        officialOtherNightOrder: official.otherNightOrder,
        implFirstNightPriority: role.ability?.firstNightPriority ?? null,
        implOtherNightPriority: role.ability?.otherNightPriority ?? null,
        hasAbilityImpl: hasAbility,
        capabilityTags: official.capabilityTags,
        officialExamples: official.examples.length,
        testReferences: references,
        e2eSeen: evidence.e2eSeen.get(role.roleId) ?? null,
        findings: findings
          .filter((f) => f.roleId === role.roleId)
          .map((f) => f.check),
      });
    }
    // 补记测试入口（未匹配分支已在上面记录；这里避免重复逻辑）
    const row = rows[rows.length - 1]!;
    if (row.testReferences === 0 && referenced) row.testReferences = 1;
  }

  // ── 官方角色 → 项目实现覆盖（只对内置剧本） ────────────────
  const builtInScriptNames = new Set(impl.scriptNames);
  let officialNotImplemented = 0;
  for (const official of spec.roles) {
    if (!official.type) continue;
    const belongsToBuiltIn = official.scriptTags.some((tag) =>
      builtInScriptNames.has(tag)
    );
    if (!belongsToBuiltIn || mappedSpecs.has(official)) continue;
    officialNotImplemented++;
    addFinding({
      severity: "INFO",
      check: "spec.role.unimplemented",
      roleNameCn: official.nameCn,
      detail: `官方角色属于内置剧本（${official.scriptTags.join("、")}），但项目角色表中没有实现`,
    });
  }

  // ── 剧本 / 能力标签维度的台账统计 ─────────────────────────
  const scriptBreakdown = impl.scriptNames.map((script) => {
    const scriptRoleIds = new Set(impl.scriptRoleIds[script] ?? []);
    const derivedRows = rows.filter((row) => scriptRoleIds.has(row.roleId));
    return {
      script,
      roles: derivedRows.length,
      mapped: derivedRows.filter((row) => row.officialNameCn !== null).length,
      typeOk: derivedRows.filter((row) => row.typeOk === true).length,
      withTestRefs: derivedRows.filter((row) => row.testReferences > 0).length,
    };
  });

  const capabilityTagBreakdown = Object.entries(spec.stats.capabilityTagCounts)
    .map(([tag, count]) => ({
      tag,
      roles: count,
      withTestRefs: rows.filter(
        (row) => row.capabilityTags.includes(tag) && row.testReferences > 0
      ).length,
    }))
    .sort((a, b) => b.roles - a.roles);

  findings.sort((a, b) => {
    const severityRank: Record<string, number> = {
      P0: 0,
      P1: 1,
      P2: 2,
      INFO: 3,
    };
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const checkDiff = a.check.localeCompare(b.check);
    if (checkDiff !== 0) return checkDiff;
    return (a.roleId ?? "").localeCompare(b.roleId ?? "");
  });

  const blockerCount = findings.filter((f) => f.severity === "P0").length;
  const stats = {
    officialRoles: spec.roles.length,
    implRoles: impl.roles.length,
    mappedRoles: rows.filter((row) => row.officialNameCn !== null).length,
    implWithoutSpec: builtInWithoutSpec,
    officialNotImplemented,
    typeChecked,
    typeMismatches,
    firstNightComparable,
    firstNightMismatches,
    otherNightComparable,
    otherNightMismatches,
    rolesWithTestReference: rows.filter((row) => row.testReferences > 0).length,
    rolesWithAbilityImpl: rows.filter((row) => row.hasAbilityImpl).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    stats,
    findings,
    rows,
    scriptBreakdown,
    capabilityTagBreakdown,
    verdict: {
      strictlyConformant: blockerCount === 0,
      blockerCount,
      note:
        blockerCount === 0
          ? "静态可判定维度未发现 P0 偏差；语义层验证仍需 L3/L4 证据（见 docs/RULE_CONFORMANCE_SYSTEM.md）"
          : `静态可判定维度存在 ${blockerCount} 个 P0 偏差，不能宣称「严格符合官方规则」`,
    },
  };
}

/** 产物签名（棘轮基线用）：`check|roleId`，去重排序 */
export function findingSignatures(report: ConformanceReport): string[] {
  const set = new Set<string>();
  for (const finding of report.findings) {
    set.add(`${finding.check}|${finding.roleId ?? finding.roleNameCn ?? "*"}`);
  }
  return [...set].sort();
}

/** 报告趋势指标（棘轮基线 metrics） */
export function reportMetrics(
  report: ConformanceReport
): Record<string, number> {
  return {
    ...report.stats,
    findingsP0: report.findings.filter((f) => f.severity === "P0").length,
    findingsP1: report.findings.filter((f) => f.severity === "P1").length,
    findingsP2: report.findings.filter((f) => f.severity === "P2").length,
    findingsINFO: report.findings.filter((f) => f.severity === "INFO").length,
  } as Record<string, number>;
}

/** 覆盖类指标（只许上升，下降视为回归） */
export const COVERAGE_METRICS = [
  "officialRoles",
  "implRoles",
  "mappedRoles",
  "typeChecked",
  "firstNightComparable",
  "otherNightComparable",
  "rolesWithTestReference",
  "rolesWithAbilityImpl",
] as const;

export interface BaselineComparison {
  /** 当前出现、基线里没有的 findings 签名（回归） */
  newFindings: string[];
  /** 基线里有、当前已消失的 findings 签名（修复） */
  fixedFindings: string[];
  /** 覆盖类指标下降（回归） */
  metricRegressions: Array<{
    metric: string;
    baseline: number;
    current: number;
  }>;
}

/** 与棘轮基线比对：任何「新 finding」或「覆盖指标下降」都算回归 */
export function compareWithBaseline(
  report: ConformanceReport,
  baseline: { findings: string[]; metrics: Record<string, number> }
): BaselineComparison {
  const currentSignatures = new Set(findingSignatures(report));
  const baselineSignatures = new Set(baseline.findings);
  const newFindings = [...currentSignatures]
    .filter((signature) => !baselineSignatures.has(signature))
    .sort();
  const fixedFindings = [...baselineSignatures]
    .filter((signature) => !currentSignatures.has(signature))
    .sort();
  const metrics = reportMetrics(report);
  const metricRegressions: BaselineComparison["metricRegressions"] = [];
  for (const metric of COVERAGE_METRICS) {
    const current = metrics[metric] ?? 0;
    const previous = baseline.metrics[metric] ?? 0;
    if (current < previous) {
      metricRegressions.push({ metric, baseline: previous, current });
    }
  }
  return { newFindings, fixedFindings, metricRegressions };
}
