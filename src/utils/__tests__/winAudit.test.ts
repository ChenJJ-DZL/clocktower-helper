/**
 * L7 · 判胜审计（win-audit）契约测试
 * ======================================================================
 * 被测对象：`src/utils/winConditions/winAudit.ts`
 * 目的：判胜结果**在运行时**必须可审计 —— 任何一条终局结果若缺少登记过的
 *       reasonCode、winner 与注册表 side 不一致、或证据不齐，都要立刻留痕告警，
 *       而不是只依赖测试期断言（生产现场没人看测试）。
 *
 * 覆盖点：
 *   1. 非终局结果不入台账（避免污染复盘）；
 *   2. 合法终局 ⇒ ok；
 *   3. 缺 reasonCode / 未登记 code / winner 与 side 不符 / 证据缺失 ⇒ ok=false + 告警；
 *   4. 大小写不敏感（生产里同时存在 "Good" 与 "good" 两种落库形态）；
 *   5. 环形缓冲上限（不许无限增长）；
 *   6. **真实判胜入口**产生的每一条记录都必须 ok（生产路径不得产脏数据）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roles } from "../../../app/data";
import { checkGameEnd } from "../../../app/gameLogic";
import {
  auditWinResult,
  getWinAuditTrail,
  resetWinAudit,
  summarizeWinAudit,
  WIN_AUDIT_LIMIT,
} from "../winConditions/winAudit";

const role = (id: string) => roles.find((candidate) => candidate.id === id)!;

function seat(
  id: number,
  roleId: string,
  over: Record<string, unknown> = {}
): any {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: role(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    hasGhostVote: true,
    ...over,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetWinAudit();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  resetWinAudit();
});

describe("win-audit · 只观测终局结果", () => {
  it("非终局结果不入台账（isGameOver !== true）", () => {
    expect(auditWinResult({ isGameOver: false, winner: null })).toBeNull();
    expect(auditWinResult(null)).toBeNull();
    expect(auditWinResult(undefined)).toBeNull();
    expect(getWinAuditTrail()).toHaveLength(0);
    expect(summarizeWinAudit().total).toBe(0);
  });

  it("合法终局：登记过的 reasonCode + winner 一致 + 证据齐全 ⇒ ok", () => {
    const entry = auditWinResult(
      {
        isGameOver: true,
        winner: "Good",
        reason: "恶魔全灭",
        reasonCode: "DEMON_ALL_DEAD",
        evidence: { livingDemonCount: 0 },
      },
      "fixture"
    );
    expect(entry?.ok).toBe(true);
    expect(entry?.issues).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(summarizeWinAudit()).toMatchObject({ total: 1, invalid: 0 });
  });

  it("大小写不敏感：setWinResult 的 \"good\"/\"evil\" 不应误报", () => {
    const entry = auditWinResult({
      isGameOver: true,
      winner: "evil",
      reason: "圣徒被处决",
      reasonCode: "SAINT_EXECUTED",
      evidence: { executedSeatId: 0, executedRoleId: "saint" },
    });
    expect(entry?.ok).toBe(true);
  });
});

describe("win-audit · 脏判胜必须被抓住", () => {
  it("缺 reasonCode ⇒ 不通过 + 告警", () => {
    const entry = auditWinResult({
      isGameOver: true,
      winner: "Good",
      reason: "某个旧路径裸返回",
    });
    expect(entry?.ok).toBe(false);
    expect(entry?.issues.join()).toContain("缺少 reasonCode");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("[win-audit]");
  });

  it("reasonCode 未登记 ⇒ 不通过", () => {
    const entry = auditWinResult({
      isGameOver: true,
      winner: "Good",
      reasonCode: "NOT_A_REAL_CODE" as never,
    });
    expect(entry?.ok).toBe(false);
    expect(entry?.issues.join()).toContain("未在注册表登记");
  });

  it("winner 与注册表 side 反向 ⇒ 不通过（防止判反阵营）", () => {
    const entry = auditWinResult({
      isGameOver: true,
      winner: "Good", // SAINT_EXECUTED 的 side 是 Evil
      reasonCode: "SAINT_EXECUTED",
      evidence: { executedSeatId: 0, executedRoleId: "saint" },
    });
    expect(entry?.ok).toBe(false);
    expect(entry?.issues.join()).toContain("不一致");
  });

  it("证据缺失 ⇒ 不通过，并逐字段列出缺什么", () => {
    const entry = auditWinResult({
      isGameOver: true,
      winner: "Evil",
      reasonCode: "SAINT_EXECUTED",
      evidence: { executedSeatId: 3 },
    });
    expect(entry?.ok).toBe(false);
    expect(entry?.issues.join()).toContain("executedRoleId");
  });

  it("环形缓冲有上限，不会无限增长", () => {
    for (let i = 0; i < WIN_AUDIT_LIMIT + 10; i++) {
      auditWinResult({
        isGameOver: true,
        winner: "Good",
        reasonCode: "DEMON_ALL_DEAD",
        evidence: { livingDemonCount: 0 },
      });
    }
    const trail = getWinAuditTrail();
    expect(trail).toHaveLength(WIN_AUDIT_LIMIT);
    // 汇总计的是累计次数，不是缓冲长度
    expect(summarizeWinAudit().total).toBe(WIN_AUDIT_LIMIT + 10);
  });

  it("getWinAuditTrail 返回副本：调用方改不动台账", () => {
    auditWinResult({
      isGameOver: true,
      winner: "Good",
      reasonCode: "DEMON_ALL_DEAD",
      evidence: { livingDemonCount: 0 },
    });
    const trail = getWinAuditTrail();
    trail[0]!.issues.push("手改");
    trail[0]!.reasonCode = "HACKED";
    expect(getWinAuditTrail()[0]?.issues).toEqual([]);
    expect(getWinAuditTrail()[0]?.reasonCode).toBe("DEMON_ALL_DEAD");
  });
});

describe("win-audit · 真实判胜入口接入（生产路径不得产脏数据）", () => {
  it("checkGameEnd 的每条终局记录都必须通过审计", () => {
    // 场景 A：恶魔全灭 ⇒ 善良胜
    const demonDead = [
      seat(0, "imp", { isDead: true, executedToday: true }),
      seat(1, "chef"),
      seat(2, "mayor"),
      seat(3, "soldier"),
      seat(4, "empath"),
    ];
    const verdictA = checkGameEnd(demonDead, "execution", 0);
    expect(verdictA.isGameOver).toBe(true);

    // 场景 B：圣徒被处决 ⇒ 邪恶胜（同一条入口，另一条判据）
    const saintDead = [
      seat(0, "saint", { isDead: true, executedToday: true }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];
    const verdictB = checkGameEnd(saintDead, "execution", 0);
    expect(verdictB.isGameOver).toBe(true);

    const trail = getWinAuditTrail();
    expect(trail.length).toBe(2);
    const dirty = trail.filter((entry) => !entry.ok);
    expect(
      dirty,
      `真实判胜入口产生了脏数据（缺 reasonCode/证据/胜方不一致）：${JSON.stringify(dirty, null, 2)}`
    ).toEqual([]);
    // 来源必须标明是唯一判胜入口，便于现场定位
    expect(trail.every((entry) => entry.source === "gameLogic.checkGameEnd")).toBe(
      true
    );
    // 未终局的检查不应写入台账
    checkGameEnd(
      [seat(0, "chef"), seat(1, "imp"), seat(2, "mayor"), seat(3, "soldier")],
      "check_phase"
    );
    expect(getWinAuditTrail()).toHaveLength(2);
  });
});
