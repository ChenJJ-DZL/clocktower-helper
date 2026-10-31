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
  WaiverEntry,
} from "./types";
import type { TestEvidence } from "./evidence";
import { applyWaivers } from "./waivers";

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
  /** 人审 waiver 台账：命中的 finding 降级 INFO 并保留可追溯理由 */
  waivers?: WaiverEntry[];
  /** L3 官方范例编码覆盖（由调用方用 lib/examples::exampleCoverage 计算后传入） */
  examples?: { total: number; encoded: number };
  /** L5 变异测试基线（由调用方读取 outputs/rule_conformance/mutation_report.json） */
  mutation?: { killed: number; total: number };
  /** L4 整局随机仿真结果（由调用方运行 fuzz 或读取 fuzz_report.json） */
  fuzz?: { games: number; actions: number; violations: number };
  /** L6 E2E 断言型覆盖（由 `collectE2eAssertions` 计算后传入） */
  e2eAssertions?: { rolesWithAssertions: number; assertions: number };
  /**
   * L3 语义原子层 findings（由 `runSemanticAudit` 计算后传入；纯数据避免循环依赖）。
   * `trigger.*` 类偏差默认降一级为 P2：实现可能经 legacy/gameLogic 路径生效，
   * 属"元数据未登记"而非规则错误；判胜注册表缺口保持原级别。
   */
  semanticFindings?: Array<{
    atom: string;
    severity: "P0" | "P1" | "P2" | "INFO";
    expected: string;
    actual: string;
    detail: string;
    roleId: string;
    nameCn?: string;
  }>;
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
  /** 官方给了夜序但不作硬断言（占位槽 / 官方数据自相矛盾 / 被动能力）时记账 */
  onExempt: () => void;
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
    args.onExempt();
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
      args.onExempt();
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
  // 官方夜序表保留了「槽位」，但官方能力原文没有「每个夜晚」类主动描述、
  // 实现又只声明首夜唤醒 ⇒ 该槽位是夜序表占位（如祖母 other=77，能力文本只有
  // 「首个夜晚得知 + 孙子被杀时死亡」）。这种情况不判夜序错误，登记 INFO 交人审。
  if (
    kind === "other" &&
    !officialTextHintsNight &&
    role.ability?.triggerTiming?.length === 1 &&
    role.ability.triggerTiming[0] === "first_night"
  ) {
    addFinding({
      severity: "INFO",
      check: "spec.official_slot_only",
      roleId: role.roleId,
      roleNameCn: role.nameCn,
      official,
      impl: implPriority,
      detail: `官方其他夜夜序有槽位 ${official}，但官方能力原文无「每个夜晚」、实现仅首夜唤醒；按官方占位槽位登记（非偏差）`,
    });
    args.onExempt();
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
  let firstNightExempt = 0;
  let otherNightComparable = 0;
  let otherNightMismatches = 0;
  let otherNightExempt = 0;
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
            onExempt: () => {
              firstNightExempt++;
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
            onExempt: () => {
              otherNightExempt++;
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

  // ── L3 语义原子层 findings（官方能力文本 ⇄ 实现元数据） ──────────
  const semanticInput = input.semanticFindings ?? [];
  for (const deviation of semanticInput) {
    const severity =
      deviation.atom.startsWith("trigger.") && deviation.severity === "P1"
        ? ("P2" as const)
        : deviation.severity;
    addFinding({
      severity,
      check: `ability.atom.${deviation.atom}`,
      roleId: deviation.roleId,
      roleNameCn: deviation.nameCn,
      official: deviation.expected,
      impl: deviation.actual,
      detail: `[语义层] ${deviation.detail}`,
    });
  }
  // 把语义 findings 也回填到逐角色台账（rows 在循环里已生成）
  if (semanticInput.length > 0) {
    const checksByRole = new Map<string, string[]>();
    for (const deviation of semanticInput) {
      const list = checksByRole.get(deviation.roleId) ?? [];
      list.push(`ability.atom.${deviation.atom}`);
      checksByRole.set(deviation.roleId, list);
    }
    for (const row of rows) {
      const checks = checksByRole.get(row.roleId);
      if (checks) row.findings = [...new Set([...row.findings, ...checks])];
    }
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

  // ── 人审 waiver 应用（降级 INFO、保留理由；棘轮仍防新增） ──────────
  const waiverResult = applyWaivers(findings, input.waivers ?? []);
  const finalFindings = waiverResult.findings;

  finalFindings.sort((a, b) => {
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

  const blockerCount = finalFindings.filter(
    (f) => f.severity === "P0"
  ).length;
  const hardCount = (check: string) =>
    finalFindings.filter((f) => f.check === check && !f.waived).length;
  const stats = {
    officialRoles: spec.roles.length,
    implRoles: impl.roles.length,
    mappedRoles: rows.filter((row) => row.officialNameCn !== null).length,
    implWithoutSpec: builtInWithoutSpec,
    officialNotImplemented,
    typeChecked,
    // 下表统计**未被 waiver 的硬偏差**（waived 的仍保留在 findings 里可追溯）
    typeMismatches: hardCount("spec.type.mismatch"),
    firstNightComparable,
    firstNightMismatches: hardCount("night.first.mismatch"),
    firstNightExempt,
    firstNightAudited: firstNightComparable + firstNightExempt,
    otherNightComparable,
    otherNightMismatches: hardCount("night.other.mismatch"),
    otherNightExempt,
    otherNightAudited: otherNightComparable + otherNightExempt,
    rolesWithTestReference: rows.filter((row) => row.testReferences > 0).length,
    rolesWithAbilityImpl: rows.filter((row) => row.hasAbilityImpl).length,
    // 以下指标由 L3/L5 集成填充（运行时由 CLI/测试传入真实值）
    semanticFindings: semanticInput.length,
    officialExamples: input.examples?.total ?? spec.stats.totalExamples,
    encodedExamples: input.examples?.encoded ?? 0,
    mutationKilled: input.mutation?.killed ?? 0,
    mutationTotal: input.mutation?.total ?? 0,
    fuzzGames: input.fuzz?.games ?? 0,
    fuzzActions: input.fuzz?.actions ?? 0,
    fuzzViolations: input.fuzz?.violations ?? 0,
    e2eAssertionRoles: input.e2eAssertions?.rolesWithAssertions ?? 0,
    e2eAssertions: input.e2eAssertions?.assertions ?? 0,
    waivedFindings: waiverResult.waivedCount,
  };

  const waivedNote =
    waiverResult.waivedCount > 0
      ? `；其中 ${waiverResult.waivedCount} 项已按人审 waiver 台账登记（scripts/conformance/waivers.json，可追溯）`
      : "";

  return {
    generatedAt: new Date().toISOString(),
    stats,
    findings: finalFindings,
    rows,
    scriptBreakdown,
    capabilityTagBreakdown,
    verdict: {
      strictlyConformant: blockerCount === 0,
      blockerCount,
      note:
        blockerCount === 0
          ? `静态可判定维度未发现 P0 偏差${waivedNote}；语义层验证由 L3 官方范例 + L4 整局仿真 + L5 变异分数 + L6 断言型 E2E 共同承担（见 docs/RULE_CONFORMANCE_SYSTEM.md）`
          : `静态可判定维度存在 ${blockerCount} 个 P0 偏差，不能宣称「严格符合官方规则」${waivedNote}`,
    },
  };
}

/** 产物签名（棘轮基线用）：`severity|check|roleId`，去重排序。
 * 带上 severity 的原因是：即使 finding 的 check/角色不变，只要 waiver 被移除
 * 导致严重度回升（INFO→P0），也必须被棘轮视为回归。 */
export function findingSignatures(report: ConformanceReport): string[] {
  const set = new Set<string>();
  for (const finding of report.findings) {
    set.add(
      `${finding.severity}|${finding.check}|${finding.roleId ?? finding.roleNameCn ?? "*"}`
    );
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
  // 夜序用「审计覆盖」而非「硬比对」：显式裁定的占位槽同样算已核对，
  // 否则一旦把某条误报改成 INFO 裁定，指标就会假装"覆盖率下降"。
  "firstNightAudited",
  "otherNightAudited",
  "rolesWithTestReference",
  "rolesWithAbilityImpl",
  "encodedExamples",
  // L6 E2E 断言型覆盖（reach → assert 的升级口径，只许上升）
  "e2eAssertionRoles",
  // L4 整局随机仿真的规模（跑得越多越好）；违例数走 INVERSE_COVERAGE_METRICS
  "fuzzGames",
  "fuzzActions",
  // L5 变异被杀死数（分母变化时只盯"被杀数"，避免"补了变异但没被测住"被算作进步）
  "mutationKilled",
] as const;

/** 「越小越好」的指标：上升即回归（违例/债务类） */
export const INVERSE_COVERAGE_METRICS = ["fuzzViolations"] as const;

/**
 * 「需要外部证据文件」的指标：未运行该项时值为 0，此时**跳过**下降判定。
 *
 * 为什么必须特判：变异测试要单独跑 60s（`npm run conformance:mutation`），
 * CI 门禁不跑它。若把 0 当成真实值，fresh clone 会立刻红成"覆盖率下降"。
 * 语义上 0 在这里只能解释为"本次未测量"，因此跳过；真跑起来就是真实分数。
 */
export const EVIDENCE_GATED_METRICS = new Set<string>(["mutationKilled"]);

/** 现行基线格式版本（见 `ConformanceBaseline.schemaVersion`） */
export const BASELINE_SCHEMA_VERSION = 2;

const SEVERITIES = new Set(["P0", "P1", "P2", "INFO"]);

/** 签名是否为现行格式 `severity|check|role` */
export function isCurrentSignature(signature: string): boolean {
  return SEVERITIES.has(signature.split("|")[0] ?? "");
}

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
  /**
   * 基线是旧格式（schemaVersion < 2）：无法判断"豁免被移除导致严重度回升"，
   * 棘轮必须失败关闭，要求显式迁移。
   */
  needsMigration: boolean;
}

/** 与棘轮基线比对：任何「新 finding」或「覆盖指标下降」都算回归 */
export function compareWithBaseline(
  report: ConformanceReport,
  baseline: {
    schemaVersion?: number;
    findings: string[];
    metrics: Record<string, number>;
  }
): BaselineComparison {
  const needsMigration =
    (baseline.schemaVersion ?? 1) < BASELINE_SCHEMA_VERSION ||
    baseline.findings.some((signature) => !isCurrentSignature(signature));
  // 旧格式无法安全比对（老签名缺 severity）⇒ 返回空 diff + needsMigration，
  // 由调用方（CLI / CI 门禁）当成硬失败处理，禁止"看起来没回归"的假绿。
  if (needsMigration) {
    return {
      newFindings: [],
      fixedFindings: [],
      metricRegressions: [],
      needsMigration: true,
    };
  }

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
    // 未测量的外部证据指标（0 = 本次没跑）不参与下降判定，避免假红
    if (current === 0 && EVIDENCE_GATED_METRICS.has(metric)) continue;
    if (current < previous) {
      metricRegressions.push({ metric, baseline: previous, current });
    }
  }
  for (const metric of INVERSE_COVERAGE_METRICS) {
    const current = metrics[metric] ?? 0;
    const previous = baseline.metrics[metric] ?? 0;
    if (current > previous) {
      metricRegressions.push({ metric, baseline: previous, current });
    }
  }
  return { newFindings, fixedFindings, metricRegressions, needsMigration: false };
}

export interface BaselineMigration {
  /** 旧签名 → 新签名（同 check|role 精确对齐，severity 取当前值） */
  migrated: Array<{ from: string; to: string }>;
  /** 当前出现但旧基线里完全没有的 finding（人审后决定是否接受） */
  newFindings: string[];
  /** 旧基线里有、当前已消失（真实修复） */
  fixedFindings: string[];
  /** 旧签名在 check|role 层面无法唯一对齐（需人工处理，禁止自动迁移） */
  ambiguous: Array<{ signature: string; candidates: string[] }>;
  /** 旧签名格式不合法（无法拆分 check|role） */
  malformed: string[];
  /** 迁移后的签名集合（仅当 ambiguous/malformed 为空时可用于落盘） */
  findings: string[];
}

/**
 * 旧基线（`check|role`）→ 现行基线（`severity|check|role`）的一次性迁移。
 *
 * 安全设计（fail-closed）：
 *   · 只做「同 check|role 换 severity 前缀」这一种机械变换，不做任何猜测；
 *   · 旧签名在当前结果里找不到唯一对应 ⇒ 计入 ambiguous/malformed 并**拒绝迁移**；
 *   · 当前新增的 finding 不算迁移，单独列出，必须由调用方显式 --accept-new 接受。
 */
export function migrateBaselineSignatures(
  report: ConformanceReport,
  legacyFindings: string[]
): BaselineMigration {
  const currentSignatures = findingSignatures(report);
  const currentByKey = new Map<string, string[]>();
  for (const signature of currentSignatures) {
    const key = signature.split("|").slice(1).join("|"); // check|role
    const list = currentByKey.get(key) ?? [];
    list.push(signature);
    currentByKey.set(key, list);
  }

  const migrated: Array<{ from: string; to: string }> = [];
  const ambiguous: Array<{ signature: string; candidates: string[] }> = [];
  const malformed: string[] = [];
  const legacyKeys = new Set<string>();

  for (const signature of legacyFindings) {
    if (isCurrentSignature(signature)) {
      // 已经是新格式：原样保留（混排基线也能迁移）
      const key = signature.split("|").slice(1).join("|");
      legacyKeys.add(key);
      const candidates = currentByKey.get(key) ?? [];
      if (candidates.includes(signature)) {
        migrated.push({ from: signature, to: signature });
      } else if (candidates.length === 1) {
        migrated.push({ from: signature, to: candidates[0]! });
      } else if (candidates.length === 0) {
        // 已修复，忽略
      } else {
        ambiguous.push({ signature, candidates });
      }
      continue;
    }
    const parts = signature.split("|");
    if (parts.length < 2) {
      malformed.push(signature);
      continue;
    }
    const key = parts.join("|");
    legacyKeys.add(key);
    const candidates = currentByKey.get(key) ?? [];
    if (candidates.length === 1) {
      migrated.push({ from: signature, to: candidates[0]! });
    } else if (candidates.length === 0) {
      // 该旧债务在当前结果里已不存在 ⇒ 真实修复，不迁移
    } else {
      ambiguous.push({ signature, candidates });
    }
  }

  const newFindings = currentSignatures.filter((signature) => {
    const key = signature.split("|").slice(1).join("|");
    return !legacyKeys.has(key);
  });
  const currentSet = new Set(currentSignatures);
  const fixedFindings = legacyFindings
    .filter((signature) => {
      const key = isCurrentSignature(signature)
        ? signature.split("|").slice(1).join("|")
        : signature;
      return !currentByKey.has(key) && !currentSet.has(signature);
    })
    .sort();

  const findings = [
    ...new Set([...migrated.map((item) => item.to), ...(ambiguous.length === 0 && malformed.length === 0 ? newFindings : [])]),
  ].sort();

  return { migrated, newFindings, fixedFindings, ambiguous, malformed, findings };
}
