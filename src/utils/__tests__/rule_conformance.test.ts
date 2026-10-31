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
  compareWithBaseline,
  runConformanceAudit,
} from "../../../scripts/conformance/lib/audit";
import { collectTestEvidence } from "../../../scripts/conformance/lib/evidence";
import { buildImplInventory } from "../../../scripts/conformance/lib/impl";
import { extractOfficialSpec } from "../../../scripts/conformance/lib/spec";

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

beforeAll(() => {
  const spec = extractOfficialSpec(ROOT);
  const impl = buildImplInventory();
  const evidence = collectTestEvidence(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );
  bundle = { report: runConformanceAudit({ spec, impl, evidence }) };
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
