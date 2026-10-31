/**
 * L5 变异测试 · 配置静态守卫（不写文件、不跑变异）
 * ======================================================================
 * 被守卫对象：`scripts/conformance/mutation.ts` 的 `MUTATIONS` 配置。
 *
 * 为什么需要本文件：
 *   变异执行器会在执行期临时改写产品文件（跑完恢复）。如果配置本身腐坏
 *   （find 字符串漂移成 0 次 / 2 次、测试文件被重命名/删除、equivalent 标记
 *   类型写错），执行器要么静默跳过、要么写错位置 —— 都是危险操作。
 *   ⇒ 把「配置是否仍然指向真实存在的唯一代码片段」变成 CI 可拦截的静态断言。
 *
 * 本文件**只读**：读取 targetFile / tests 路径做静态校验，
 * 绝不写任何文件、绝不执行变异、绝不启动 vitest 子进程。
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFind, MUTATIONS } from "../../../scripts/conformance/mutation";

const ROOT = process.cwd();

/** 每条能力文件变异都要有对应的定向测试；至少覆盖 4 个能力文件（任务要求 4–6 个）。 */
const MIN_TOTAL_MUTATIONS = 15;
const MIN_ABILITY_FILES = 4;

const ABILITY_FILE_PATTERN = /^src\/roles\/new_engine\/.+\.ability\.ts$/;

function readTargetFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

describe("L5 变异配置 · 静态校验", () => {
  it(`配置规模 ≥ ${MIN_TOTAL_MUTATIONS} 条，且 id 唯一、字段形状合法`, () => {
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(MIN_TOTAL_MUTATIONS);

    const ids = MUTATIONS.map((spec) => spec.id);
    expect(new Set(ids).size, `存在重复 id: ${ids.join(", ")}`).toBe(
      ids.length
    );

    for (const spec of MUTATIONS) {
      expect(isNonEmptyString(spec.id), "id 必须是非空字符串").toBe(true);
      expect(spec.id, `id 含空白字符: ${JSON.stringify(spec.id)}`).toMatch(
        /^[a-z0-9][a-z0-9._-]*$/
      );
      expect(
        isNonEmptyString(spec.targetFile),
        `${spec.id}: targetFile 必须是非空字符串`
      ).toBe(true);
      expect(
        isAbsolute(spec.targetFile),
        `${spec.id}: targetFile 必须是仓库相对路径`
      ).toBe(false);
      expect(isNonEmptyString(spec.find), `${spec.id}: find 不能为空`).toBe(
        true
      );
      expect(
        isNonEmptyString(spec.replace),
        `${spec.id}: replace 不能为空`
      ).toBe(true);
      expect(
        isNonEmptyString(spec.description),
        `${spec.id}: description 不能为空`
      ).toBe(true);
      expect(
        Array.isArray(spec.tests) && spec.tests.length > 0,
        `${spec.id}: tests 必须是非空数组`
      ).toBe(true);
    }
  });

  describe("find 唯一性 / targetFile 与 tests 路径存在性", () => {
    it.each(
      MUTATIONS.map((spec) => [spec.id, spec] as const)
    )("%s：find 在 targetFile 中恰好出现 1 次", (_id, spec) => {
      expect(
        existsSync(resolve(ROOT, spec.targetFile)),
        `${spec.id}: targetFile 不存在 → ${spec.targetFile}`
      ).toBe(true);

      const content = readTargetFile(spec.targetFile);
      const findCheck = checkFind(content, spec.find);
      expect(
        findCheck.occurrences,
        `${spec.id}: find 在 ${spec.targetFile} 中命中 ${findCheck.occurrences} 次（要求恰好 1 次）—— 配置已腐坏`
      ).toBe(1);
      expect(findCheck.needle, `${spec.id}: find 未能唯一匹配`).not.toBeNull();
    });

    it.each(
      MUTATIONS.map((spec) => [spec.id, spec] as const)
    )("%s：tests 中每个测试文件都存在", (_id, spec) => {
      expect(spec.tests.length).toBeGreaterThan(0);
      const missing = spec.tests.filter(
        (file) => !existsSync(resolve(ROOT, file))
      );
      expect(
        missing,
        `${spec.id}: 以下测试文件不存在（改名/删除后需要同步配置）: ${missing.join(
          ", "
        )}`
      ).toEqual([]);
    });

    it("replace 必须真正改变 find（拒绝空变异）", () => {
      const noops = MUTATIONS.filter((spec) => spec.replace === spec.find).map(
        (spec) => spec.id
      );
      expect(
        noops,
        `以下变异 replace 与 find 相同: ${noops.join(", ")}`
      ).toEqual([]);
    });
  });

  describe("equivalent / 归因标记类型", () => {
    it("equivalent 只能是 boolean（缺省 = false），且 true 时必须说明理由", () => {
      for (const spec of MUTATIONS) {
        if (!("equivalent" in spec) || spec.equivalent === undefined) continue;
        expect(
          typeof spec.equivalent,
          `${spec.id}: equivalent 必须是 boolean，实际 ${typeof spec.equivalent}`
        ).toBe("boolean");
        if (spec.equivalent === true) {
          expect(
            isNonEmptyString(spec.equivalentReason),
            `${spec.id}: equivalent=true 时必须提供非空 equivalentReason`
          ).toBe(true);
        }
      }
    });

    it("testGapReason / testGapSuggestion 若出现则必须为字符串", () => {
      for (const spec of MUTATIONS) {
        if (spec.testGapReason !== undefined) {
          expect(
            typeof spec.testGapReason,
            `${spec.id}: testGapReason 必须是字符串`
          ).toBe("string");
          expect(spec.testGapReason.length).toBeGreaterThan(0);
        }
        if (spec.testGapSuggestion !== undefined) {
          expect(
            typeof spec.testGapSuggestion,
            `${spec.id}: testGapSuggestion 必须是字符串`
          ).toBe("string");
          expect(spec.testGapSuggestion.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("覆盖矩阵（防止配置退化）", () => {
    const targetFiles = new Set(MUTATIONS.map((spec) => spec.targetFile));

    it("必须覆盖镜像双子严格解析 / 判胜注册表 / 判胜入口", () => {
      expect(
        targetFiles.has("src/utils/evilTwinHelper.ts"),
        "缺少 src/utils/evilTwinHelper.ts 的变异（判胜级严格解析必须被钉住）"
      ).toBe(true);
      expect(
        targetFiles.has("src/utils/winConditions/winReasonCodes.ts"),
        "缺少 src/utils/winConditions/winReasonCodes.ts 的变异"
      ).toBe(true);
      expect(
        targetFiles.has("app/gameLogic.ts"),
        "缺少 app/gameLogic.ts 判胜分支的变异"
      ).toBe(true);
    });

    it(`必须覆盖 ≥ ${MIN_ABILITY_FILES} 个能力文件（任务要求 4–6 个）`, () => {
      const abilityFiles = [...targetFiles].filter((file) =>
        ABILITY_FILE_PATTERN.test(file)
      );
      expect(
        abilityFiles.length,
        `能力文件覆盖不足：${abilityFiles.join(", ") || "(none)"}`
      ).toBeGreaterThanOrEqual(MIN_ABILITY_FILES);
      expect(
        abilityFiles.length,
        `能力文件过多（任务要求 ≤ 6 个）：${abilityFiles.join(", ")}`
      ).toBeLessThanOrEqual(6);
    });

    it("每条能力文件变异都必须给出定向测试（不跑全量套件）", () => {
      const abilityMutations = MUTATIONS.filter((spec) =>
        ABILITY_FILE_PATTERN.test(spec.targetFile)
      );
      expect(abilityMutations.length).toBeGreaterThan(0);
      for (const spec of abilityMutations) {
        expect(
          spec.tests.length,
          `${spec.id}: 能力文件变异必须给出定向测试文件列表`
        ).toBeGreaterThan(0);
      }
    });
  });
});
