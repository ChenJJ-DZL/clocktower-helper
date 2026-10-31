/**
 * 判胜注册表契约测试 —— 防「变异测试空转」（L5 基线唯一存活变异 wr2）。
 * ======================================================================
 * 背景：变异测试把 `WIN_REASON_META[code].requiredEvidence` 清空后，既有测试
 * 全部仍然通过（它们只从结果侧断言 findMissingWinEvidence 为空），说明
 * 「注册表声明本身」没有被任何用例钉住。本文件直接断言注册表契约：
 *   1. 每个终局原因都必须声明**非空** requiredEvidence；
 *   2. 证据缺失时 `makeWinResult` 在测试/开发环境必须抛错（fail-closed）；
 *   3. 证据齐全时 winner 必须等于注册表 side（单一事实源）；
 *   4. findMissingWinEvidence 与 requiredEvidence 声明一致（声明什么就查什么）。
 */
import { describe, expect, it } from "vitest";
import {
  ALL_WIN_REASON_CODES,
  WIN_REASON_META,
  findMissingWinEvidence,
  makeWinResult,
} from "../../../src/utils/winConditions/winReasonCodes";

describe("判胜注册表契约（L5 变异防线）", () => {
  it("每个终局原因必须声明非空 requiredEvidence", () => {
    for (const code of ALL_WIN_REASON_CODES) {
      const required = WIN_REASON_META[code].requiredEvidence;
      expect(
        required.length,
        `${code} 的 requiredEvidence 为空：判胜将无法被状态证明（历史事故形态）`
      ).toBeGreaterThan(0);
      for (const key of required) {
        expect(
          typeof key,
          `${code} 的 requiredEvidence 含非字符串字段`
        ).toBe("string");
        expect(String(key).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("证据缺失时 makeWinResult 必须抛错（测试环境 fail-closed）", () => {
    // GOOD_TWIN_EXECUTED 声明了 4 个必填证据；空证据必须拒绝判胜
    expect(() => makeWinResult("GOOD_TWIN_EXECUTED", "测试", {})).toThrow(
      /缺少判胜证据/
    );
    // 只补一部分也必须抛错
    expect(() =>
      makeWinResult("GOOD_TWIN_EXECUTED", "测试", {
        executedSeatId: 1,
        goodTwinSeatId: 1,
      })
    ).toThrow(/缺少判胜证据/);
  });

  it("证据齐全时 winner 必须由注册表 side 派生", () => {
    const result = makeWinResult("GOOD_TWIN_EXECUTED", "测试", {
      executedSeatId: 1,
      goodTwinSeatId: 1,
      evilTwinSeatId: 2,
      twinPairSource: "explicit",
    });
    expect(result.winner).toBe(WIN_REASON_META.GOOD_TWIN_EXECUTED.side);
    expect(findMissingWinEvidence("GOOD_TWIN_EXECUTED", result.evidence)).toEqual(
      []
    );
  });

  it("findMissingWinEvidence 与 requiredEvidence 声明一致（声明什么就查什么）", () => {
    for (const code of ALL_WIN_REASON_CODES) {
      const required = WIN_REASON_META[code].requiredEvidence;
      const probe: Record<string, unknown> = {};
      // 故意只填空值：所有必填字段都应为"缺失"
      for (const key of required) probe[key] = null;
      expect(
        findMissingWinEvidence(code, probe as never).length,
        `${code} 的 findMissingWinEvidence 未按 requiredEvidence 判缺失`
      ).toBe(required.length);
      // 填上任意非空值后缺失数应减少（逐步验证）
      for (const key of required) {
        probe[key] = key === "trigger" ? "契约测试" : 1;
      }
      expect(
        findMissingWinEvidence(code, probe as never),
        `${code} 证据齐全时仍报缺失`
      ).toEqual([]);
    }
  });
});
