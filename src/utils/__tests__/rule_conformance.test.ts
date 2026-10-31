/**
 * 规则一致性（Rule Conformance）棘轮测试
 * ======================================================================
 * 这是「全量检测代码是否符合官方规则」这套系统的 **CI 门禁**：
 *
 *   1. 从 `json/full/*.json`（官方 wiki 真源）抽取规范；
 *   2. 与 `app/data.ts` + 新引擎能力注册表比对类型 / 官方夜序 / 实现存在性；
 *   3. 扫描测试证据（src/tests/e2e）得到「测试入口」台账；
 *   4. 与提交在仓库里的 `outputs/rule_conformance/baseline.json` 做**棘轮**比对：
 *      · 出现任何基线里没有的新 finding（新规则偏差 / 新缺口）⇒ 红；
 *      · 覆盖类指标（已映射角色数、类型可比数、夜序可比数、有测试入口角色数）
 *        下降 ⇒ 红；
 *      · 已知债务（基线内）不阻塞 CI，但在 `outputs/rule_conformance/report.md`
 *        逐条列出，必须逐步修掉并下调基线。
 *
 * 为什么必须进 CI：规则偏差（类型写错、夜序错位、实现缺失）不会让页面白屏，
 * 也不会被普通单测发现，只有这条「官方规范 ⇄ 实现 ⇄ 证据」的对照链能拦住。
 *
 * 本地命令：
 *   npx vitest run src/utils/__tests__/rule_conformance.test.ts
 *   npx tsx scripts/conformance/audit.ts            # 生成完整报告
 *   npx tsx scripts/conformance/audit.ts --write-baseline  # 人审后更新基线
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ConformanceReport } from "../../../scripts/conformance/lib/types";
import {
  BASELINE_SCHEMA_VERSION,
  compareWithBaseline,
  findingSignatures,
  migrateBaselineSignatures,
  runConformanceAudit,
} from "../../../scripts/conformance/lib/audit";
import { collectTestEvidence } from "../../../scripts/conformance/lib/evidence";
import { collectE2eAssertions } from "../../../scripts/conformance/lib/e2eAssertions";
import { exampleCoverage } from "../../../scripts/conformance/lib/examples";
import { runFuzz } from "../../../scripts/conformance/lib/fuzzRunner";
import { buildImplInventory } from "../../../scripts/conformance/lib/impl";
import { runSemanticAudit } from "../../../scripts/conformance/lib/ruleAtoms";
import { extractOfficialSpec } from "../../../scripts/conformance/lib/spec";
import { loadWaivers } from "../../../scripts/conformance/lib/waivers";

const ROOT = process.cwd();
const BASELINE_FILE = path.join(
  ROOT,
  "outputs",
  "rule_conformance",
  "baseline.json"
);

interface AuditBundle {
  report: ConformanceReport;
}

let bundle: AuditBundle;

beforeAll(async () => {
  const spec = extractOfficialSpec(ROOT);
  const impl = buildImplInventory();
  const evidence = collectTestEvidence(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );
  const examples = exampleCoverage(ROOT);
  const semantic = runSemanticAudit(spec, impl);
  // L4：与 `npm run conformance:audit` 同一份 fuzz 配置（确定性 seed）
  const fuzz = await runFuzz();
  // L6：E2E 断言型覆盖（reach 口径之外的第二个指标）
  const e2e = collectE2eAssertions(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );
  bundle = {
    report: runConformanceAudit({
      spec,
      impl,
      evidence,
      waivers: loadWaivers(ROOT),
      examples: { total: examples.total, encoded: examples.encoded },
      fuzz: {
        games: fuzz.games,
        actions: fuzz.actions,
        violations: fuzz.violations,
      },
      e2eAssertions: {
        rolesWithAssertions: e2e.rolesWithAssertions,
        assertions: e2e.totals.assertions,
      },
      semanticFindings: semantic.findings.map((finding) => ({
        atom: finding.atom,
        severity: finding.severity,
        expected: finding.expected,
        actual: finding.actual,
        detail: finding.detail,
        roleId: finding.roleId,
        nameCn: finding.nameCn,
      })),
    }),
  };
}, 180_000);

describe("规则一致性系统 · 官方规范抽取", () => {
  it("官方规范抽取稳定：232 个唯一角色、无缺失角色能力原文", () => {
    const spec = extractOfficialSpec(ROOT);
    expect(spec.stats.uniqueRoles).toBeGreaterThanOrEqual(232);
    expect(spec.stats.missingAbilityText, "存在官方角色缺少能力原文，抽取逻辑需修复").toBe(0);
    expect(spec.stats.validRecords).toBeGreaterThan(400);
    // 官方范例必须被完整拆出（多条范例不能塌缩成 1 条）
    expect(spec.stats.totalExamples).toBeGreaterThan(
      spec.stats.rolesWithExamples
    );
  });

  it("官方夜序解析约定：数字 / 无法行动 / 缺失 三态", () => {
    const spec = extractOfficialSpec(ROOT);
    const imp = spec.roles.find((role) => role.nameCn === "小恶魔");
    expect(imp, "官方规范必须包含小恶魔").toBeDefined();
    expect(imp?.firstNightOrder).toBe("cannot_act");
    expect(imp?.otherNightOrder).toBe(45);
  });
});

describe("规则一致性系统 · 棘轮门禁（无新增偏差）", () => {
  it("与已提交基线比对：不得出现新 finding、覆盖指标不得下降", () => {
    expect(
      fs.existsSync(BASELINE_FILE),
      "缺少棘轮基线 outputs/rule_conformance/baseline.json（首次请运行 npx tsx scripts/conformance/audit.ts --write-baseline）"
    ).toBe(true);
    const baseline = JSON.parse(
      fs.readFileSync(BASELINE_FILE, "utf8")
    ) as { findings: string[]; metrics: Record<string, number> };

    const comparison = compareWithBaseline(bundle.report, baseline);
    expect(
      comparison.needsMigration,
      "棘轮基线为旧格式（签名缺 severity 前缀），已失败关闭：请运行 npx tsx scripts/conformance/audit.ts --migrate-baseline 后提交新基线"
    ).toBe(false);
    expect(
      comparison.newFindings,
      `出现 ${comparison.newFindings.length} 项新的规则一致性偏差（详见 outputs/rule_conformance/report.md）：\n${comparison.newFindings.join("\n")}`
    ).toEqual([]);
    expect(
      comparison.metricRegressions,
      "规则一致性覆盖指标下降（只许上升/持平）"
    ).toEqual([]);
  });

  it("已知债务显式化：P0/P1 数量不超过基线（修复后应下调基线）", () => {
    const baseline = JSON.parse(
      fs.readFileSync(BASELINE_FILE, "utf8")
    ) as { findings: string[]; metrics: Record<string, number> };
    const p0 = bundle.report.findings.filter((f) => f.severity === "P0").length;
    const p1 = bundle.report.findings.filter((f) => f.severity === "P1").length;
    expect(p0).toBeLessThanOrEqual(baseline.metrics.findingsP0 ?? 0);
    expect(p1).toBeLessThanOrEqual(baseline.metrics.findingsP1 ?? 0);
    // 报告中必须显式给出「是否严格符合」的静态判定，禁止静默放过已知债务
    if (p0 > 0) {
      expect(bundle.report.verdict.strictlyConformant).toBe(false);
      expect(bundle.report.verdict.blockerCount).toBe(p0);
    }
  });
});

describe("规则一致性系统 · L4 整局随机仿真", () => {
  it("整局仿真不变式违例必须为 0，且必须真的执行了动作（防空转假绿）", () => {
    // 防空转：如果限次能力单例没重置 / 角色池为空，动作数会骤降到 0，
    // 此时"违例 0"毫无意义 —— 必须同时断言样本量。
    expect(bundle.report.stats.fuzzGames).toBeGreaterThanOrEqual(6);
    expect(bundle.report.stats.fuzzActions).toBeGreaterThan(80);
    expect(
      bundle.report.stats.fuzzViolations,
      "整局随机仿真出现不变式违例（见 outputs/rule_conformance/fuzz_report.json 的 samples）"
    ).toBe(0);
  });
});

describe("规则一致性系统 · L6 E2E 断言型覆盖", () => {
  it("断言型覆盖必须真实存在（reach ≠ assert），且不是空扫描", () => {
    // 防空转：如果 e2e 目录结构变了导致切块失败，断言总数会崩到 0，
    // 此时"覆盖角色数"毫无意义 —— 必须同时断言样本量。
    expect(bundle.report.stats.e2eAssertions).toBeGreaterThan(500);
    expect(bundle.report.stats.e2eAssertionRoles).toBeGreaterThan(50);
    // 断言型覆盖不可能超过 reach 口径（测试入口数），超过说明扫描口径错
    expect(bundle.report.stats.e2eAssertionRoles).toBeLessThanOrEqual(
      bundle.report.stats.rolesWithTestReference
    );
  });
});

describe("规则一致性系统 · 基线迁移与棘轮契约", () => {  /** 造一个最小可用的 report（只填棘轮用到的字段） */
  function makeReport(
    findings: Array<{ severity: "P0" | "P1" | "P2" | "INFO"; check: string; roleId?: string }>
  ): ConformanceReport {
    return {
      generatedAt: new Date().toISOString(),
      stats: {
        officialRoles: 0,
        implRoles: 0,
        mappedRoles: 0,
        implWithoutSpec: 0,
        officialNotImplemented: 0,
        typeChecked: 0,
        typeMismatches: 0,
        firstNightComparable: 0,
        firstNightMismatches: 0,
        firstNightExempt: 0,
        firstNightAudited: 0,
        otherNightComparable: 0,
        otherNightMismatches: 0,
        otherNightExempt: 0,
        otherNightAudited: 0,
        rolesWithTestReference: 0,
        rolesWithAbilityImpl: 0,
        semanticFindings: 0,
        officialExamples: 0,
        encodedExamples: 0,
        mutationKilled: 0,
        mutationTotal: 0,
        fuzzGames: 0,
        fuzzActions: 0,
        fuzzViolations: 0,
        e2eAssertionRoles: 0,
        e2eAssertions: 0,
        waivedFindings: 0,
      },
      findings: findings.map((finding) => ({ ...finding, detail: "fixture" })),
      rows: [],
      scriptBreakdown: [],
      capabilityTagBreakdown: [],
      verdict: { strictlyConformant: true, blockerCount: 0, note: "fixture" },
    } as ConformanceReport;
  }

  it("旧格式基线（check|role）⇒ 失败关闭：不产出 diff，标记 needsMigration", () => {
    const report = makeReport([
      { severity: "P2", check: "impl.ability.missing", roleId: "saint" },
    ]);
    const comparison = compareWithBaseline(report, {
      findings: ["impl.ability.missing|saint"],
      metrics: {},
    });
    expect(comparison.needsMigration).toBe(true);
    // 关键：旧格式下不能声称"新增 0 项"来假装绿
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.fixedFindings).toEqual([]);
  });

  it("迁移只做机械换前缀：不新增 check|role、不猜测 severity", () => {
    const report = makeReport([
      { severity: "INFO", check: "impl.ability.missing", roleId: "saint" },
      { severity: "P1", check: "night.first.mismatch", roleId: "ranger" },
    ]);
    const migration = migrateBaselineSignatures(report, [
      "impl.ability.missing|saint",
      "night.first.mismatch|ranger",
    ]);
    expect(migration.ambiguous).toEqual([]);
    expect(migration.malformed).toEqual([]);
    expect(migration.newFindings).toEqual([]);
    expect(migration.findings.sort()).toEqual(
      ["INFO|impl.ability.missing|saint", "P1|night.first.mismatch|ranger"].sort()
    );
    // 换前缀后与原 check|role 一一对应（没有任何语义漂移）
    for (const item of migration.migrated) {
      expect(item.to.split("|").slice(1).join("|")).toBe(item.from);
    }
  });

  it("旧签名在当前结果里找不到唯一对应 ⇒ ambiguous 且拒绝落盘", () => {
    const report = makeReport([
      { severity: "P2", check: "impl.ability.missing", roleId: "saint_townsfolk" },
    ]);
    const migration = migrateBaselineSignatures(report, [
      "impl.ability.missing|saint",
    ]);
    // 旧 key 在当前结果中已不存在 = 真实修复，不得被"猜"成 saint_townsfolk
    expect(migration.migrated).toEqual([]);
    expect(migration.fixedFindings).toContain("impl.ability.missing|saint");
    // 改名产生的新 key 只能作为「新增」显式列出（需 --accept-new 才落盘），
    // 绝不能出现在 migrated（机械迁移）里被静默吞掉。
    expect(migration.newFindings).toContain(
      "P2|impl.ability.missing|saint_townsfolk"
    );
    expect(migration.migrated.map((item) => item.to)).not.toContain(
      "P2|impl.ability.missing|saint_townsfolk"
    );
  });

  it("现行格式基线可直接比对（schemaVersion=2）", () => {
    const report = makeReport([
      { severity: "P2", check: "impl.ability.missing", roleId: "saint" },
    ]);
    const baseline = {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      findings: findingSignatures(report),
      metrics: {
        officialRoles: 0,
        implRoles: 0,
        mappedRoles: 0,
        typeChecked: 0,
        firstNightAudited: 0,
        otherNightAudited: 0,
        rolesWithTestReference: 0,
        rolesWithAbilityImpl: 0,
        encodedExamples: 0,
      },
    };
    const comparison = compareWithBaseline(report, baseline);
    expect(comparison.needsMigration).toBe(false);
    expect(comparison.newFindings).toEqual([]);
    expect(comparison.metricRegressions).toEqual([]);
  });

  it("夜序指标用「审计覆盖」= 硬比对 + 显式裁定，避免降级误报成覆盖率下降", () => {
    const report = makeReport([
      { severity: "INFO", check: "spec.official_slot_only", roleId: "grandmother" },
    ]);
    report.stats.firstNightComparable = 60;
    report.stats.firstNightExempt = 9;
    report.stats.firstNightAudited = 69;
    expect(report.stats.firstNightAudited).toBe(69);
    const comparison = compareWithBaseline(report, {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      findings: findingSignatures(report),
      metrics: { firstNightAudited: 69, otherNightAudited: 0 },
    });
    expect(comparison.metricRegressions).toEqual([]);
  });
});
