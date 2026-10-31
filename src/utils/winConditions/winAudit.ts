/**
 * 判胜审计（L7 · 生产反馈闭环）—— 让「凭什么判胜」在运行时永远留痕
 * ======================================================================
 * 背景：判胜是**不可逆操作**，一旦弹窗宣布胜负，对局就结束。历史上出现过的
 * 事故形态是「判胜结果无法被状态证明」（见 docs/POSTMORTEM 第六章）。
 * `makeWinResult` 已经在构造侧 fail-closed（缺证据直接抛错/报错），但仍有两条
 * 漏洞：
 *   ① **绕过注册表的判胜路径**（历史 `{ isGameOver: true, winner, reason }`
 *      裸返回、以及两条确认弹窗路径）不会经过 `makeWinResult`；
 *   ② 生产环境降级为 `console.error` 后，**没人看得见**——日志散落在控制台，
 *      复盘时无从检索「哪些局是脏判胜」。
 *
 * 本模块提供最后一道**只读观测**关卡：
 *   · `auditWinResult()`：校验一条终局结果（reasonCode 是否登记 / winner 是否与
 *     注册表 side 一致 / 证据是否齐全），把结果写进环形缓冲，脏判胜立刻 `console.warn`；
 *   · `getWinAuditTrail()`：取最近 N 条（浏览器里同时挂到 `window.__ctWinAudit`，
 *     无需打开控制台深挖，e2e / 现场复盘可直接读取）；
 *   · **绝不改变判胜结果**：本模块只观测、不改写、不阻断（阻断在 construct 侧
 *     已由 fail-closed 完成）。
 *
 * 接入点：`app/gameLogic.ts::checkGameEnd` 的唯一出口（所有判胜都从这里返回）。
 */
import {
  findMissingWinEvidence,
  WIN_REASON_META,
  type WinEvidence,
  type WinReasonCode,
  type WinSide,
} from "./winReasonCodes";

/** 环形缓冲上限（够复盘一场完整对局，且不会无限增长吃内存） */
export const WIN_AUDIT_LIMIT = 50;

export interface WinAuditEntry {
  /** 记录时间（ms） */
  at: number;
  /** 判胜来源（如 `gameLogic.checkGameEnd`） */
  source: string;
  winner: string | null;
  reasonCode: string | null;
  reason: string | null;
  /** true = 该终局结果可通过审计（有登记的原因码 + winner 一致 + 证据齐全） */
  ok: boolean;
  /** 不通过时的具体问题（人读） */
  issues: string[];
}

let trail: WinAuditEntry[] = [];
let invalidCount = 0;
let totalCount = 0;

/** 判胜结果的最小形状（兼容 `GameEndResult`，字段全部可选以便观测遗留路径） */
export interface AuditableWinResult {
  isGameOver?: boolean;
  winner?: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  evidence?: WinEvidence | null;
}

/**
 * 审计一条终局结果并记入环形缓冲。
 *
 * @param result   判胜结果（非终局结果会被忽略，不污染台账）
 * @param source   判胜来源标识（排查时定位是哪条路径漏了证据）
 * @returns 审计条目；非终局结果返回 `null`
 */
export function auditWinResult(
  result: AuditableWinResult | null | undefined,
  source = "unknown"
): WinAuditEntry | null {
  if (!result || result.isGameOver !== true) return null;

  const issues: string[] = [];
  const code = (result.reasonCode ?? null) as WinReasonCode | null;

  if (!code) {
    issues.push("缺少 reasonCode（判胜必须可溯源）");
  } else if (!(code in WIN_REASON_META)) {
    issues.push(`reasonCode 未在注册表登记：${code}`);
  } else {
    const meta = WIN_REASON_META[code];
    const expectedSide: WinSide = meta.side;
    // 大小写不敏感：生产里存在两种落库形态（`GameEndResult` 用 "Good"/"Evil"，
    // `setWinResult` 用 "good"/"evil"）——两种都是同一阵营，不该误报。
    const actual = String(result.winner ?? "").toLowerCase();
    if (actual !== expectedSide.toLowerCase()) {
      issues.push(
        `winner(${String(result.winner)}) 与注册表 side(${expectedSide}) 不一致`
      );
    }
    const missing = findMissingWinEvidence(code, result.evidence ?? {});
    if (missing.length > 0) {
      issues.push(`判胜证据缺失：${missing.join(", ")}`);
    }
  }

  const entry: WinAuditEntry = {
    at: Date.now(),
    source,
    winner: result.winner ?? null,
    reasonCode: code,
    reason: result.reason ?? null,
    ok: issues.length === 0,
    issues,
  };

  totalCount++;
  trail.push(entry);
  if (trail.length > WIN_AUDIT_LIMIT) trail = trail.slice(-WIN_AUDIT_LIMIT);

  if (!entry.ok) {
    invalidCount++;
    // 只告警一次/条，不抛错：生产不能因为审计失败把对局卡死；
    // 开发/测试环境应已由 `makeWinResult` 的 fail-closed 提前暴露。
    console.warn(
      `[win-audit] 脏判胜（${source}）：${issues.join("；")} · reason=${String(result.reason ?? "")}`
    );
  }

  return entry;
}

/** 最近 N 条判胜审计（只读副本，防止调用方篡改台账） */
export function getWinAuditTrail(): WinAuditEntry[] {
  return trail.map((entry) => ({ ...entry, issues: [...entry.issues] }));
}

/** 审计汇总（e2e / 现场复盘用） */
export function summarizeWinAudit(): {
  total: number;
  invalid: number;
  invalidRate: number;
  byReasonCode: Record<string, number>;
} {
  const byReasonCode: Record<string, number> = {};
  for (const entry of trail) {
    const key = entry.reasonCode ?? "(missing)";
    byReasonCode[key] = (byReasonCode[key] ?? 0) + 1;
  }
  return {
    total: totalCount,
    invalid: invalidCount,
    invalidRate: totalCount === 0 ? 0 : invalidCount / totalCount,
    byReasonCode,
  };
}

/** 清空台账（测试/e2e 用例间隔离；生产无调用点） */
export function resetWinAudit(): void {
  trail = [];
  invalidCount = 0;
  totalCount = 0;
}

/** 浏览器环境暴露只读入口，便于 e2e 现场取证 */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__ctWinAudit = {
    trail: getWinAuditTrail,
    summary: summarizeWinAudit,
    reset: resetWinAudit,
  };
}
