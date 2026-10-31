/**
 * 官方范例台账门禁（L3 · Oracle 化）
 * ======================================================================
 * 把「官方 438 条范例 → 可执行夹具」的覆盖率变成可量化、可棘轮的门禁：
 *   · 官方范例总数不得缩水（≥ 400，当前 438）；
 *   · 至少 20 条官方范例被**真实可执行**夹具编码（当前 46 条 / 25 角色）；
 *   · 每条 `// 官方范例: 角色 #idx` 注释都必须指向官方真实存在的范例
 *     （防伪造注释、防止角色名/序号写错）；
 *   · 覆盖率统计自洽（total / encoded / byRole / missingByRole / byScript 对账）。
 *
 * 数据源与扫描逻辑见 `scripts/conformance/lib/examples.ts`；
 * 台账 CLI：`npx tsx scripts/conformance/examples-ledger.ts`。
 */
import { describe, expect, it } from "vitest";
import {
  exampleCoverage,
  loadOfficialExamples,
  loadOfficialSpecFile,
  scanEncodedExamples,
} from "../../../scripts/conformance/lib/examples";

describe("官方范例台账（L3 · Oracle 化）", () => {
  it("官方范例总数 ≥ 400，且 id 稳定唯一（<角色名>#<序号>）", () => {
    const spec = loadOfficialSpecFile();
    const examples = loadOfficialExamples();

    expect(spec.stats.totalExamples).toBeGreaterThanOrEqual(400);
    expect(examples.length).toBeGreaterThanOrEqual(400);

    const ids = new Set<string>();
    for (const example of examples) {
      expect(example.id).toBe(`${example.roleNameCn}#${example.index}`);
      expect(example.roleNameCn.length).toBeGreaterThan(0);
      expect(example.index).toBeGreaterThanOrEqual(0);
      expect(example.text.length).toBeGreaterThan(0);
      expect(ids.has(example.id), `官方范例 id 重复：${example.id}`).toBe(false);
      ids.add(example.id);
    }
  });

  it("至少 20 条官方范例已被真实可执行夹具编码", () => {
    const coverage = exampleCoverage();
    const scanned = scanEncodedExamples();

    expect(scanned.size).toBeGreaterThanOrEqual(20);
    expect(coverage.encoded).toBeGreaterThanOrEqual(20);
    expect(coverage.encoded).toBeLessThanOrEqual(coverage.total);
  });

  it("每个已编码 id 都能在官方范例中找到（防伪造注释）", () => {
    const officialIds = new Set(loadOfficialExamples().map((e) => e.id));
    const scanned = scanEncodedExamples();
    const unknown = [...scanned].filter((id) => !officialIds.has(id));

    expect(
      unknown,
      `夹具注释指向了不存在的官方范例（伪造/写错）：${unknown.join("、")}`
    ).toEqual([]);
    expect(exampleCoverage().unknownEncodedIds).toEqual([]);
  });

  it("覆盖率统计自洽：total / encoded / byRole / missingByRole 对账", () => {
    const coverage = exampleCoverage();
    const rows = Object.entries(coverage.byRole);

    // 1) 角色维度求和 = 总览
    const sumTotal = rows.reduce((sum, [, row]) => sum + row.total, 0);
    const sumEncoded = rows.reduce((sum, [, row]) => sum + row.encoded, 0);
    expect(sumTotal).toBe(coverage.total);
    expect(sumEncoded).toBe(coverage.encoded);
    expect(rows.length).toBe(coverage.rolesWithExamples);

    // 2) 每角色内部：encoded + missing = total，且 id 不重叠
    let missingCount = 0;
    for (const [roleName, row] of rows) {
      expect(row.encodedIds.length, `${roleName} encoded 计数`).toBe(row.encoded);
      expect(row.missingIds.length, `${roleName} missing 计数`).toBe(
        row.total - row.encoded
      );
      expect(
        new Set([...row.encodedIds, ...row.missingIds]).size,
        `${roleName} encoded/missing 不应重叠`
      ).toBe(row.total);
      missingCount += row.missingIds.length;
    }

    // 3) missingByRole 与 byRole 一一对应
    expect(missingCount).toBe(coverage.total - coverage.encoded);
    const rolesWithMissing = rows
      .filter(([, row]) => row.missingIds.length > 0)
      .map(([roleName]) => roleName)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    expect(Object.keys(coverage.missingByRole).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))).toEqual(
      rolesWithMissing
    );
    for (const roleName of rolesWithMissing) {
      expect(coverage.missingByRole[roleName]).toEqual(
        coverage.byRole[roleName].missingIds
      );
    }

    // 4) 剧本维度求和 = 总览；百分比口径正确
    expect(coverage.byScript.reduce((sum, row) => sum + row.total, 0)).toBe(
      coverage.total
    );
    expect(coverage.byScript.reduce((sum, row) => sum + row.encoded, 0)).toBe(
      coverage.encoded
    );
    expect(coverage.percent).toBeCloseTo(coverage.encoded / coverage.total, 8);
    expect(coverage.rolesWithEncoded).toBe(
      rows.filter(([, row]) => row.encoded > 0).length
    );
  });

  it("角色维度覆盖：至少 20 个角色有已编码范例，且官方范例角色面不缩水", () => {
    const coverage = exampleCoverage();
    expect(coverage.rolesWithEncoded).toBeGreaterThanOrEqual(20);
    expect(coverage.rolesWithExamples).toBeGreaterThanOrEqual(200);
    expect(coverage.total).toBe(loadOfficialSpecFile().stats.totalExamples);
  });
});
