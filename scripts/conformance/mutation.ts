#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * L5 · 规则语义变异测试执行器（产品化）
 * ======================================================================
 * 目的：把「测试是否真的钉住了规则语义」量化成 **mutation score**
 *       （被测试杀死的变异数 / 实际执行的变异数），并按 targetFile 分组。
 *       见 docs/RULE_CONFORMANCE_SYSTEM.md · L5。
 *
 * 参照 scripts/_mutation_run.cjs 的**隔离模式**，但把安全模型产品化：
 *   1. **现读现备**：进入一条变异时立即读取 targetFile 当前内容 S，记录 sha256；
 *   2. **唯一性校验**：find 必须在 S 中恰好出现 1 次（否则判定配置腐坏 → invalid）；
 *   3. **写入变异体** M = S 中以 replace 替换那唯一一处，写后立刻读回校验 hash；
 *   4. **跑定向测试**：`npx vitest run <tests...> --reporter=dot`，单条硬超时 120s；
 *   5. **失败也恢复**：无论测试通过/失败/超时/抛错，都在 finally 里把 S 写回；
 *   6. **恢复后校验**：读回内容 sha256 必须 === hash(S)，否则判定恢复失败；
 *   7. **冲突中止**：若测试窗口内读回的内容既不是 M，说明第三方进程写了文件
 *      （工作树是团队共享的）⇒ 立即 CONFLICT、**绝不覆盖**、停止整个运行。
 *
 * 用法（在仓库根目录）：
 *   npx tsx scripts/conformance/mutation.ts                # 跑配置内全部变异
 *   npx tsx scripts/conformance/mutation.ts --dry-run      # 只校验 find 唯一性 / tests 存在，不写文件
 *   npx tsx scripts/conformance/mutation.ts --only=et1,gl2 # 只跑指定 id（逗号分隔）
 *
 * 产物：
 *   outputs/rule_conformance/mutation_report.json
 *     { total, killed, survived, mutationScore, byFile, attributionSummary, results[] }，
 *     每条含 id / targetFile / killed / survived / durationMs / error / 归因。
 *
 * 配置（MUTATIONS）：每条 { id, targetFile, find, replace, tests, description }，
 *   另可带 equivalent / equivalentReason（语义等价变异，杀不死也不该杀）或
 *   testGapReason / testGapSuggestion（已知测试缺口，存活时用于归因）。
 *   配置的静态守卫见 src/utils/__tests__/mutation_config.test.ts。
 *
 * 本文件不引入任何新依赖（只用 Node 内置模块）；只在执行期临时改写 targetFile，
 * 运行结束（含异常/信号）后工作树必须与运行前一致。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

// ────────────────────────────────────────────────────────────────────
// 常量
// ────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const CONFIG_SOURCE = "scripts/conformance/mutation.ts · MUTATIONS";
const OUT_DIR = join(ROOT, "outputs", "rule_conformance");
const REPORT_FILE = join(OUT_DIR, "mutation_report.json");
const VITEST_REPORTER = "dot";
/** 单条变异的测试硬超时（与任务约定一致：120s） */
const VITEST_TIMEOUT_MS = 120_000;
/** 写入/恢复的重试次数（Windows 上偶发 EPERM 文件锁） */
const WRITE_ATTEMPTS = 10;
const WRITE_RETRY_MS = 200;

// ────────────────────────────────────────────────────────────────────
// 配置类型
// ────────────────────────────────────────────────────────────────────

export interface MutationSpec {
  /** 稳定唯一 id（报告 / --only 用） */
  id: string;
  /** 仓库相对路径 */
  targetFile: string;
  /** 变异点：必须在 targetFile 中**恰好出现 1 次** */
  find: string;
  /** 变异体替换文本 */
  replace: string;
  /** 定向测试文件列表（仓库相对路径） */
  tests: string[];
  /** 变异语义（人读说明） */
  description: string;
  /** true = 语义等价变异（任何测试都不可能杀死），必须配 equivalentReason */
  equivalent?: boolean;
  /** 语义等价的理由（为什么该变异不改变可观察行为） */
  equivalentReason?: string;
  /** 已知测试缺口的解释（存活时归因用） */
  testGapReason?: string;
  /** 补测建议（存活时输出到报告） */
  testGapSuggestion?: string;
}

// ────────────────────────────────────────────────────────────────────
// 变异配置
// ────────────────────────────────────────────────────────────────────
//
// 覆盖矩阵（20 条）：
//   · src/utils/evilTwinHelper.ts          2 条：严格解析 fail-open / isGoodTwin 恒真
//   · src/utils/winConditions/winReasonCodes.ts
//                                          3 条：side 互换 / requiredEvidence 清空 /
//                                                findMissingWinEvidence 取反
//   · app/gameLogic.ts                     7 条：判胜分支条件取反、人数阈值 ±1、
//                                                圣徒分支取反、镇长 3 人边界、
//                                                失败关闭守卫取反
//   · 能力文件 5 个（saint / imp / monk / spy / drunk）共 8 条：
//                                                条件取反 / allowDead 翻转 /
//                                                首夜门控 / 边界阈值
//
export const MUTATIONS: MutationSpec[] = [
  // ── src/utils/evilTwinHelper.ts（必须被既有测试杀死）────────────────
  {
    id: "et1-unresolved-fail-open",
    targetFile: "src/utils/evilTwinHelper.ts",
    find: `  // ③ 无证据：失败关闭。判胜/阻断逻辑都不得据此断言任何事实。
  return buildResult(evilTwinSeat, null, "unresolved", false);`,
    replace: `  // ③ 无证据：失败关闭。判胜/阻断逻辑都不得据此断言任何事实。
  const guessedSeat =
    seats.find((s) => s.id !== evilTwinSeat.id && isSeatTownsfolkOrOutsider(s)) ??
    null;
  return guessedSeat
    ? buildResult(evilTwinSeat, guessedSeat, "heuristic", true)
    : buildResult(evilTwinSeat, null, "unresolved", false);`,
    tests: [
      "src/utils/__tests__/evilTwinHelper.test.ts",
      "tests/reported-bugs/evil_twin_pixie_false_win.test.ts",
    ],
    description:
      "严格解析在无证据时降级为启发式猜测并冒充 resolved（fail-open，复现 2026-11-01 P0 事故形态）",
  },
  {
    id: "et2-isgoodtwin-always-true",
    targetFile: "src/utils/evilTwinHelper.ts",
    find: `    isGoodTwin: (seatId: number) =>
      goodTwinSeat !== null && goodTwinSeat.id === seatId,`,
    replace: `    isGoodTwin: () => true,`,
    tests: [
      "src/utils/__tests__/evilTwinHelper.test.ts",
      "tests/reported-bugs/evil_twin_pixie_false_win.test.ts",
    ],
    description: "isGoodTwin 恒为 true：配对谓词不再区分被处决者是否为善良双子",
  },

  // ── src/utils/winConditions/winReasonCodes.ts ───────────────────────
  {
    id: "wr1-good-twin-side-swap",
    targetFile: "src/utils/winConditions/winReasonCodes.ts",
    find: `  GOOD_TWIN_EXECUTED: {
    side: "Evil",`,
    replace: `  GOOD_TWIN_EXECUTED: {
    side: "Good",`,
    tests: [
      "src/utils/__tests__/winConditionSoundness.test.ts",
      "tests/reported-bugs/evil_twin_pixie_false_win.test.ts",
    ],
    description:
      "GOOD_TWIN_EXECUTED 的 side 互换（Evil → Good）：winner 从注册表派生，side 错 ⇒ 整条判胜判反",
  },
  {
    id: "wr2-required-evidence-cleared",
    targetFile: "src/utils/winConditions/winReasonCodes.ts",
    find: `    rule: "镜像双子：若对立的善良双子被处决，邪恶获胜。前置证据 = 权威配对（禁止启发式猜测）。",
    requiredEvidence: [
      "executedSeatId",
      "goodTwinSeatId",
      "evilTwinSeatId",
      "twinPairSource",
    ],`,
    replace: `    rule: "镜像双子：若对立的善良双子被处决，邪恶获胜。前置证据 = 权威配对（禁止启发式猜测）。",
    requiredEvidence: [],`,
    // 2026-11-01 补测：原先只跑 winReasonMatrix（只从"结果侧"检查），漏掉了
    // `win_reason_registry_contract.test.ts` 里对**注册表声明本身**的断言
    // ⇒ 清空 requiredEvidence 竟无测试可杀。补上后该变异被杀死（20/20 → 23/23）。
    tests: [
      "src/utils/__tests__/winReasonMatrix.test.ts",
      "src/utils/__tests__/win_reason_registry_contract.test.ts",
    ],
    description:
      "清空 GOOD_TWIN_EXECUTED 的 requiredEvidence：证据注册表被静默放宽（缺证据不再抛错）",
  },
  {
    id: "wr3-find-missing-inverted",
    targetFile: "src/utils/winConditions/winReasonCodes.ts",
    find: `    return value === undefined || value === null || value === "";`,
    replace: `    return !(value === undefined || value === null || value === "");`,
    tests: ["src/utils/__tests__/winConditionSoundness.test.ts"],
    description:
      "findMissingWinEvidence 判据取反：把「已提供」的证据当成缺失（证据齐全的判胜也会抛错）",
  },

  // ── app/gameLogic.ts（判胜关键路径）─────────────────────────────────
  {
    id: "gl1-good-twin-executed-condition-negated",
    targetFile: "app/gameLogic.ts",
    find: `        twin.isGoodTwin(executedSeat.id)`,
    replace: `        !twin.isGoodTwin(executedSeat.id)`,
    tests: [
      "tests/reported-bugs/evil_twin_pixie_false_win.test.ts",
      "src/roles/__tests__/evil_twin_non_twin_execution.test.ts",
    ],
    description:
      "处决善良双子判据取反：处决非双子玩家会被误判为「善良双子被处决」（P0 事故形态）",
  },
  {
    id: "gl2-two-alive-threshold-minus-one",
    targetFile: "app/gameLogic.ts",
    find: `    if (aliveNonTravelerCount + zombuulActive.length <= 2) {`,
    replace: `    if (aliveNonTravelerCount + zombuulActive.length < 2) {`,
    tests: [
      "src/roles/__tests__/game_end_official_contract.test.ts",
      "src/utils/__tests__/winReasonMatrix.test.ts",
    ],
    description:
      "官方「仅剩 2 名非旅行者存活 ⇒ 邪恶胜」的固定阈值 2 → 1（边界 -1，2 人局不再判邪恶胜）",
  },
  {
    id: "gl3-saint-branch-negated",
    targetFile: "app/gameLogic.ts",
    find: `      if (executedSeat.role?.id === "saint" && executedSeat.isDead === true) {`,
    replace: `      if (executedSeat.role?.id !== "saint") {`,
    tests: ["src/roles/__tests__/saint.test.ts"],
    description:
      "圣徒分支条件取反：处决任何非圣徒角色都会被当成「圣徒被处决」立即判邪恶胜",
  },
  {
    id: "gl4-mayor-three-alive-boundary",
    targetFile: "app/gameLogic.ts",
    find: `    aliveCount === 3 && // 恰好 3 人存活（aliveSeats 含旅行者 → 与官方口径一致）`,
    replace: `    aliveCount === 2 && // 恰好 3 人存活（aliveSeats 含旅行者 → 与官方口径一致）`,
    tests: [
      "src/roles/__tests__/mayor_peaceful_win_boundary.test.ts",
      "src/roles/__tests__/mayor.test.ts",
    ],
    description:
      "镇长和平获胜「恰好 3 人存活」边界 3 → 2（官方 just three 被改错）",
  },
  {
    id: "gl5-peaceful-day-condition-and",
    targetFile: "app/gameLogic.ts",
    find: `    (lastAction === "execution" || lastAction === "check_phase");`,
    replace: `    (lastAction === "execution" && lastAction === "check_phase");`,
    tests: ["src/roles/__tests__/mayor_peaceful_win_boundary.test.ts"],
    description:
      "「平安日」判据的 || 改成 &&：两条入口互斥 ⇒ isNoExecutionResolution 恒 false，镇长永远不和平获胜",
  },
  {
    id: "gl6-evil-twin-block-condition-negated",
    targetFile: "app/gameLogic.ts",
    find: `      if (twin.goodTwinSeat && !twin.goodTwinSeat.isDead) {`,
    replace: `      if (twin.goodTwinSeat && twin.goodTwinSeat.isDead) {`,
    tests: [
      "tests/reported-bugs/evil_twin_pixie_false_win.test.ts",
      "src/roles/__tests__/integration/evil_twin_winner_block.test.ts",
    ],
    description:
      "「善良双子存活 ⇒ 善良无法获胜」的阻挡判据取反（存活/死亡条件对调）",
  },
  {
    id: "gl7-unresolved-guard-negated",
    targetFile: "app/gameLogic.ts",
    find: `      if (!twin.resolved) {`,
    replace: `      if (twin.resolved) {`,
    tests: ["tests/reported-bugs/evil_twin_pixie_false_win.test.ts"],
    description:
      "恶魔全灭 + 双子配对无证据（unresolved）时的 fail-closed 守卫取反：无证据也直接判善良胜",
  },

  // ── src/roles/new_engine/saint.ability.ts ───────────────────────────
  {
    id: "sa1-saint-precheck-negated",
    targetFile: "src/roles/new_engine/saint.ability.ts",
    find: `  if (!seat.executedToday) {`,
    replace: `  if (seat.executedToday) {`,
    tests: ["src/roles/__tests__/integration/saint.test.ts"],
    description:
      "圣徒 preCheck 「未被处决 ⇒ 不触发」取反：被处决反而中止，未被处决反而触发游戏结束",
  },
  {
    id: "sa2-issaintexecuted-inverted",
    targetFile: "src/roles/new_engine/saint.ability.ts",
    find: `  return seat.executedToday === true;`,
    replace: `  return seat.executedToday !== true;`,
    tests: ["src/roles/__tests__/integration/trouble_brewing_l5.test.ts"],
    description: "导出的纯函数 isSaintExecuted 判据取反（被处决的圣徒不再被识别）",
  },

  // ── src/roles/new_engine/imp.ability.ts ─────────────────────────────
  {
    id: "imp1-first-night-gate",
    targetFile: "src/roles/new_engine/imp.ability.ts",
    find: `  if (nightCount === 1 || gamePhase === "firstNight") {`,
    replace: `  if (nightCount === 1 && gamePhase === "firstNight") {`,
    tests: ["src/roles/__tests__/full/tb_l5_mutation_gaps.test.ts"],
    description:
      "小恶魔「首夜不行动」门控的 || 改成 &&：nightCount=1 且 phase=night 时首夜会开杀",
  },
  {
    id: "imp2-allow-dead-flip",
    targetFile: "src/roles/new_engine/imp.ability.ts",
    find: `    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: true,`,
    replace: `    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,`,
    tests: ["src/roles/__tests__/imp_juggler_timing_validation.test.ts"],
    description:
      "小恶魔 targetConfig.allowDead 翻转（官方允许空刀伪装士兵/僧侣，允许选死者）",
  },

  // ── src/roles/new_engine/monk.ability.ts ────────────────────────────
  {
    id: "monk1-self-target-guard-negated",
    targetFile: "src/roles/new_engine/monk.ability.ts",
    find: `  if (targetId === selfSeatId) {`,
    replace: `  if (targetId !== selfSeatId) {`,
    tests: ["src/roles/__tests__/monk.test.ts"],
    description:
      "僧侣「不能保护自己」守卫取反：保护别人被拒绝、保护自己反而通过（官方明文除你以外）",
  },
  {
    id: "monk2-first-night-gate",
    targetFile: "src/roles/new_engine/monk.ability.ts",
    find: `  if (nightCount === 1 || gamePhase === "firstNight") {`,
    replace: `  if (nightCount === 1 && gamePhase === "firstNight") {`,
    tests: ["src/roles/__tests__/full/tb_l5_mutation_gaps.test.ts"],
    description:
      "僧侣「首夜不唤醒/不放置保护」门控的 || 改成 &&：首夜以 phase=night 驱动时会挂保护标记",
  },

  // ── src/roles/new_engine/spy.ability.ts ─────────────────────────────
  {
    id: "spy1-corruption-pair-count",
    targetFile: "src/roles/new_engine/spy.ability.ts",
    find: `  const pairCount = Math.floor(count / 2);`,
    replace: `  const pairCount = Math.floor(count / 3);`,
    tests: ["src/roles/__tests__/full/tb_l5_mutation_gaps.test.ts"],
    description:
      "间谍受干扰时魔典打乱的对数 floor(N/2) → floor(N/3)（干扰力度被改小）",
  },

  // ── src/roles/new_engine/drunk.ability.ts ───────────────────────────
  {
    id: "drunk1-fake-role-type",
    targetFile: "src/roles/new_engine/drunk.ability.ts",
    find: `  const presentTownsfolk = seats.filter(
    (s: PlayerLookup) => s.id !== drunkSeatId && s.role?.type === "townsfolk"
  );`,
    replace: `  const presentTownsfolk = seats.filter(
    (s: PlayerLookup) => s.id !== drunkSeatId && s.role?.type === "outsider"
  );`,
    tests: ["src/roles/__tests__/full/tb_l5_mutation_gaps.test.ts"],
    description:
      "酒鬼 fakeRole 候选池从「在场镇民」改成「在场外来者」（官方：酒鬼以为自己是镇民）",
  },

  // ── src/utils/winConditions/winAudit.ts（L7 判胜审计）────────────────
  {
    id: "wa1-missing-reason-code-open",
    targetFile: "src/utils/winConditions/winAudit.ts",
    find: `  if (!code) {
    issues.push("缺少 reasonCode（判胜必须可溯源）");
  } else if (!(code in WIN_REASON_META)) {`,
    replace: `  if (!code) {
    // mutation: 放过缺失原因码（脏判胜不再被记为问题）
  } else if (!(code in WIN_REASON_META)) {`,
    tests: ["src/utils/__tests__/winAudit.test.ts"],
    description:
      "判胜审计对「缺 reasonCode」静默放过（L7 的核心不变量失效）",
  },
  {
    id: "wa2-evidence-gap-ignored",
    targetFile: "src/utils/winConditions/winAudit.ts",
    find: `    const missing = findMissingWinEvidence(code, result.evidence ?? {});
    if (missing.length > 0) {
      issues.push(\`判胜证据缺失：\${missing.join(", ")}\`);
    }`,
    replace: `    const missing = findMissingWinEvidence(code, result.evidence ?? {});
    if (false && missing.length > 0) {
      issues.push(\`判胜证据缺失：\${missing.join(", ")}\`);
    }`,
    tests: ["src/utils/__tests__/winAudit.test.ts"],
    description:
      "判胜审计不再校验证据完整性（fail-closed 退化为 fail-open）",
  },
  {
    id: "wa3-winner-case-sensitive",
    targetFile: "src/utils/winConditions/winAudit.ts",
    find: `    if (actual !== expectedSide.toLowerCase()) {`,
    replace: `    if (actual !== expectedSide) {`,
    tests: ["src/utils/__tests__/winAudit.test.ts"],
    description:
      "判胜审计对 winner 大小写敏感（生产里 setWinResult 用 \"evil\"、GameEndResult 用 \"Evil\" ⇒ 误报）",
  },
];

// ────────────────────────────────────────────────────────────────────
// 报告类型
// ────────────────────────────────────────────────────────────────────

type MutationStatus =
  | "killed"
  | "survived"
  | "invalid"
  | "timeout"
  | "error"
  | "conflict"
  | "skipped";

interface MutationResult {
  id: string;
  targetFile: string;
  description: string;
  tests: string[];
  find: string;
  replace: string;
  status: MutationStatus;
  killed: boolean;
  survived: boolean;
  /** 语义等价（配置声明）——存活不代表测试缺口 */
  equivalent: boolean;
  equivalentReason: string | null;
  /** 存活归因：equivalent / test-gap / unattributed（null 表示未存活） */
  attribution: "equivalent" | "test-gap" | "unattributed" | null;
  attributionReason: string | null;
  suggestion: string | null;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  /** 失败摘要（killed 时为 vitest 的 Tests/Test Files 行；异常时为错误信息） */
  error: string | null;
  outputTail: string | null;
  restored: boolean;
  targetHashBefore: string;
  targetHashAfterRestore: string | null;
}

interface FileGroup {
  total: number;
  killed: number;
  survived: number;
  invalid: number;
  durationMs: number;
  score: number | null;
}

interface MutationReport {
  tool: "scripts/conformance/mutation.ts";
  generatedAt: string;
  configSource: string;
  nodeVersion: string;
  platform: string;
  vitestReporter: string;
  /** 实际执行的等价命令（与任务约定一致） */
  vitestCommandTemplate: string;
  vitestTimeoutMs: number;
  durationMs: number;
  total: number;
  killed: number;
  survived: number;
  invalid: number;
  timeout: number;
  error: number;
  skipped: number;
  /** mutation score = killed / total（与任务约定一致）；total=0 时 null */
  mutationScore: number | null;
  byFile: Record<string, FileGroup>;
  results: MutationResult[];
  /** 存活变异的归因汇总（等价变异 / 测试缺口 / 未归因） */
  attributionSummary: {
    equivalent: string[];
    testGap: string[];
    unattributed: string[];
  };
  safety: {
    allRestored: boolean;
    conflicts: string[];
    restoreFailures: string[];
  };
}

// ────────────────────────────────────────────────────────────────────
// 基础工具
// ────────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function tail(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `…(前 ${text.length - max} 字符已截断)…\n${text.slice(-max)}`;
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    // 兜底：极少数环境禁用 SharedArrayBuffer，只能忙等
    while (Date.now() < end) {
      /* spin */
    }
  }
}

/** 带重试的同步写入（Windows 上偶发 EPERM 文件锁） */
function writeFileWithRetry(file: string, content: string): void {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    try {
      writeFileSync(file, content, "utf8");
      return;
    } catch (error) {
      lastError = error;
      sleepSync(WRITE_RETRY_MS);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`写入失败: ${String(lastError)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 统计 needle 在 haystack 中的出现次数（不重叠） */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

type LineEnding = "\r\n" | "\n";

/** 判定文件主行尾（仓库里新旧文件混用 LF / CRLF，配置里的多行 find 必须适配） */
function detectLineEnding(text: string): LineEnding {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** 把文本的行尾统一成目标行尾 */
export function adaptEol(text: string, lineEnding: LineEnding): string {
  if (lineEnding === "\n") return text.replace(/\r\n/g, "\n");
  return text.replace(/\r?\n/g, "\r\n");
}

export interface FindCheck {
  /** 能在内容中唯一匹配的实际片段（已适配文件行尾）；null = 未唯一匹配 */
  needle: string | null;
  /** 实际命中次数（用于报错；未唯一时给出最接近候选的次数） */
  occurrences: number;
}

/**
 * 校验 find 在 content 中**恰好出现 1 次**，并返回适配后可用于 split/join 的 needle。
 * 多行 find 同时尝试 LF / CRLF 两种写法（配置文件统一写 LF 即可）。
 */
export function checkFind(content: string, find: string): FindCheck {
  if (find.length === 0) return { needle: null, occurrences: 0 };
  const lineEnding = detectLineEnding(content);
  const candidates = [...new Set([find, adaptEol(find, lineEnding)])];
  let best = 0;
  for (const candidate of candidates) {
    const occurrences = countOccurrences(content, candidate);
    if (occurrences === 1) return { needle: candidate, occurrences: 1 };
    if (occurrences > best) best = occurrences;
  }
  return { needle: null, occurrences: best };
}

/** 把 "file: 摘要" 之类的 vitest 输出压缩成一行 */
function summarizeVitestOutput(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const pickLast = (pattern: RegExp): string | null => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (pattern.test(lines[i])) return lines[i];
    }
    return null;
  };
  const fileLine = pickLast(/^Test Files\s+/);
  const testLine = pickLast(/^Tests\s+/);
  if (fileLine || testLine) return [fileLine, testLine].filter(Boolean).join(" | ");
  const failureLine = pickLast(/FAIL|Error:/);
  return failureLine ?? "(无 vitest 摘要)";
}

// ────────────────────────────────────────────────────────────────────
// 信号安全网：Ctrl+C / 终止信号时优先恢复原文件
// ────────────────────────────────────────────────────────────────────

interface ActiveMutation {
  path: string;
  relativePath: string;
  original: string;
  mutatedHash: string;
}

let activeMutation: ActiveMutation | null = null;
let signalHandlersInstalled = false;

function installSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (activeMutation) {
      const { path, relativePath, original, mutatedHash } = activeMutation;
      try {
        if (sha256(readFileSync(path, "utf8")) === mutatedHash) {
          writeFileSync(path, original, "utf8");
          console.error(`\n[SAFETY] 收到 ${signal}，已恢复 ${relativePath}`);
        } else {
          console.error(
            `\n[SAFETY] 收到 ${signal}，但 ${relativePath} 已被第三方修改 ⇒ 不覆盖`
          );
        }
      } catch (error) {
        console.error(
          `\n[SAFETY] 收到 ${signal}，恢复 ${relativePath} 失败: ${errorMessage(error)}`
        );
      }
      activeMutation = null;
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
}

// ────────────────────────────────────────────────────────────────────
// vitest 执行
// ────────────────────────────────────────────────────────────────────

interface VitestRun {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** vitest 一个测试文件都没跑（路径写错等）——不能把 exit 0 当成「测试通过」 */
  noTestsFound: boolean;
  durationMs: number;
  summary: string;
  outputTail: string;
  spawnError: string | null;
}

function runVitest(tests: string[]): VitestRun {
  const started = Date.now();
  // 等价于 `npx vitest run <tests...> --reporter=dot`，但直接调用 vendor 入口，
  // 避免 Windows 上 npx.cmd 需要 shell 的问题（不引入新依赖 / 不改变语义）。
  const vitestEntry = join(ROOT, "node_modules", "vitest", "vitest.mjs");
  const args = [vitestEntry, "run", ...tests, `--reporter=${VITEST_REPORTER}`];
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "" },
    encoding: "utf8",
    timeout: VITEST_TIMEOUT_MS,
    killSignal: "SIGKILL",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const timedOut =
    (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const spawnError =
    result.error && !timedOut
      ? `${result.error.name}: ${result.error.message}`
      : null;
  return {
    exitCode: result.status,
    signal: result.signal,
    timedOut,
    noTestsFound: /No test files found/i.test(output),
    durationMs: Date.now() - started,
    summary: summarizeVitestOutput(output),
    outputTail: tail(output),
    spawnError,
  };
}

// ────────────────────────────────────────────────────────────────────
// 单条变异执行（含安全恢复）
// ────────────────────────────────────────────────────────────────────

function emptyResult(spec: MutationSpec, status: MutationStatus): MutationResult {
  return {
    id: spec.id,
    targetFile: spec.targetFile,
    description: spec.description,
    tests: [...spec.tests],
    find: spec.find,
    replace: spec.replace,
    status,
    killed: false,
    survived: false,
    equivalent: spec.equivalent === true,
    equivalentReason: spec.equivalentReason ?? null,
    attribution: null,
    attributionReason: null,
    suggestion: null,
    durationMs: 0,
    exitCode: null,
    timedOut: false,
    error: null,
    outputTail: null,
    restored: true,
    targetHashBefore: "",
    targetHashAfterRestore: null,
  };
}

function executeMutation(spec: MutationSpec): MutationResult {
  const started = Date.now();
  const result = emptyResult(spec, "invalid");
  const targetPath = resolve(ROOT, spec.targetFile);

  // ① 目标文件存在性
  if (!existsSync(targetPath)) {
    result.error = `targetFile 不存在: ${spec.targetFile}`;
    result.durationMs = Date.now() - started;
    return result;
  }
  // ② 测试文件存在性
  const missingTests = spec.tests.filter(
    (file) => !existsSync(resolve(ROOT, file))
  );
  if (missingTests.length > 0) {
    result.error = `tests 文件不存在: ${missingTests.join(", ")}`;
    result.durationMs = Date.now() - started;
    return result;
  }
  // ③ 现读现备 + find 唯一性校验（自动适配文件 CRLF/LF）
  const original = readFileSync(targetPath, "utf8");
  const originalHash = sha256(original);
  result.targetHashBefore = originalHash;
  const findCheck = checkFind(original, spec.find);
  if (!findCheck.needle) {
    result.error = `find 在 ${spec.targetFile} 中命中 ${findCheck.occurrences} 次（要求恰好 1 次），疑似配置腐坏`;
    result.durationMs = Date.now() - started;
    return result;
  }

  const replacement = adaptEol(spec.replace, detectLineEnding(original));
  const mutated = original.split(findCheck.needle).join(replacement);
  if (mutated === original) {
    result.error = "replace 与 find 等价（空变异，未改变文件内容）";
    result.durationMs = Date.now() - started;
    return result;
  }
  const mutatedHash = sha256(mutated);
  let wroteMutated = false;
  let conflict = false;
  let run: VitestRun | null = null;

  activeMutation = {
    path: targetPath,
    relativePath: spec.targetFile,
    original,
    mutatedHash,
  };
  try {
    // ④ 写入变异体（写后读回校验）
    writeFileWithRetry(targetPath, mutated);
    const written = readFileSync(targetPath, "utf8");
    if (sha256(written) !== mutatedHash) {
      throw new Error("写入变异体后读回 hash 不一致（写入被截断/篡改）");
    }
    wroteMutated = true;

    // ⑤ 跑定向测试（单条 120s 硬超时）
    run = runVitest(spec.tests);
    result.exitCode = run.exitCode;
    result.timedOut = run.timedOut;
  } catch (error) {
    result.error = `执行期异常: ${errorMessage(error)}`;
  } finally {
    // ⑥ 恢复原文件（失败也恢复）+ 恢复后 hash 校验；第三方写入 ⇒ CONFLICT 不覆盖
    try {
      const current = readFileSync(targetPath, "utf8");
      const currentHash = sha256(current);
      if (wroteMutated && currentHash !== mutatedHash) {
        // 测试窗口内文件被第三方改过 ⇒ 绝不覆盖，停止整个运行
        conflict = true;
        result.error = `CONFLICT: 测试期间 ${spec.targetFile} 被第三方进程修改（读回 hash ≠ 变异体 hash），已停止且不覆盖`;
      } else if (currentHash !== originalHash) {
        writeFileWithRetry(targetPath, original);
        const restored = readFileSync(targetPath, "utf8");
        result.targetHashAfterRestore = sha256(restored);
        result.restored = result.targetHashAfterRestore === originalHash;
        if (!result.restored) {
          conflict = true;
          result.error = `CONFLICT: 恢复后 hash 与原始 hash 不一致（${spec.targetFile}）`;
        }
      } else {
        // 从未写成功（写失败/早期异常）且内容仍是原文件
        result.targetHashAfterRestore = currentHash;
        result.restored = true;
      }
    } catch (error) {
      conflict = true;
      result.error = `CONFLICT: 恢复原文件失败: ${errorMessage(error)}`;
    } finally {
      activeMutation = null;
    }
  }

  // ⑦ 判定状态与归因
  if (conflict) {
    result.status = "conflict";
    result.killed = false;
    result.survived = false;
  } else if (result.error) {
    result.status = "error";
  } else if (run?.spawnError) {
    result.status = "error";
    result.error = `vitest 启动失败: ${run.spawnError}`;
  } else if (run?.noTestsFound) {
    result.status = "error";
    result.error = "vitest 未收集到任何测试文件（tests 路径配置腐坏）";
  } else if (run?.timedOut) {
    result.status = "timeout";
    result.error = `单条测试超过 ${VITEST_TIMEOUT_MS}ms 超时（已中止并恢复原文件）`;
  } else if (run && run.exitCode !== 0) {
    result.status = "killed";
    result.killed = true;
    result.error = run.summary;
    result.outputTail = run.outputTail;
  } else {
    result.status = "survived";
    result.survived = true;
    result.error = run?.summary ?? null;
    result.outputTail = run?.outputTail ?? null;
  }

  // ⑧ 存活归因（等价变异 / 测试缺口）
  if (result.survived) {
    if (result.equivalent) {
      result.attribution = "equivalent";
      result.attributionReason = result.equivalentReason;
    } else if (spec.testGapReason) {
      result.attribution = "test-gap";
      result.attributionReason = spec.testGapReason;
      result.suggestion = spec.testGapSuggestion ?? null;
    } else {
      result.attribution = "unattributed";
      result.attributionReason = "未在配置中声明归因（需人工判定：测试缺口 or 等价变异）";
    }
  }

  result.durationMs = Date.now() - started;
  return result;
}

// ────────────────────────────────────────────────────────────────────
// 汇总
// ────────────────────────────────────────────────────────────────────

function buildReport(
  results: MutationResult[],
  durationMs: number
): MutationReport {
  const byFile: Record<string, FileGroup> = {};
  const conflicts: string[] = [];
  const restoreFailures: string[] = [];
  let killed = 0;
  let survived = 0;
  let invalid = 0;
  let timeout = 0;
  let errored = 0;
  let skipped = 0;

  for (const item of results) {
    const group = byFile[item.targetFile] ?? {
      total: 0,
      killed: 0,
      survived: 0,
      invalid: 0,
      durationMs: 0,
      score: null,
    };
    group.total += 1;
    group.durationMs += item.durationMs;
    switch (item.status) {
      case "killed":
        killed += 1;
        group.killed += 1;
        break;
      case "survived":
        survived += 1;
        group.survived += 1;
        break;
      case "invalid":
        invalid += 1;
        group.invalid += 1;
        break;
      case "timeout":
        timeout += 1;
        break;
      case "error":
        errored += 1;
        break;
      case "conflict":
        conflicts.push(item.id);
        break;
      case "skipped":
        skipped += 1;
        break;
    }
    if (item.status === "conflict") {
      // conflict 已在上面单独记录，不重复计入其它桶
    }
    if (
      (item.status === "killed" ||
        item.status === "survived" ||
        item.status === "timeout" ||
        item.status === "error") &&
      !item.restored
    ) {
      restoreFailures.push(item.id);
    }
    byFile[item.targetFile] = group;
  }

  for (const group of Object.values(byFile)) {
    group.score = group.total === 0 ? null : group.killed / group.total;
  }

  const attributionSummary = {
    equivalent: [] as string[],
    testGap: [] as string[],
    unattributed: [] as string[],
  };
  for (const item of results) {
    if (item.attribution === "equivalent") {
      attributionSummary.equivalent.push(item.id);
    } else if (item.attribution === "test-gap") {
      attributionSummary.testGap.push(item.id);
    } else if (item.attribution === "unattributed") {
      attributionSummary.unattributed.push(item.id);
    }
  }

  return {
    tool: "scripts/conformance/mutation.ts",
    generatedAt: new Date().toISOString(),
    configSource: CONFIG_SOURCE,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    vitestReporter: VITEST_REPORTER,
    vitestCommandTemplate: "npx vitest run <tests...> --reporter=dot",
    vitestTimeoutMs: VITEST_TIMEOUT_MS,
    durationMs,
    total: results.length,
    killed,
    survived,
    invalid,
    timeout,
    error: errored,
    skipped,
    mutationScore: results.length === 0 ? null : killed / results.length,
    byFile,
    results,
    attributionSummary,
    safety: {
      allRestored:
        conflicts.length === 0 &&
        restoreFailures.length === 0 &&
        results.every(
          (item) =>
            item.restored || item.status === "invalid" || item.status === "skipped"
        ),
      conflicts,
      restoreFailures,
    },
  };
}

function percent(score: number | null): string {
  return score === null ? "n/a" : `${(score * 100).toFixed(1)}%`;
}

function printSummary(report: MutationReport): void {
  const lines: string[] = [];
  lines.push("");
  lines.push("================ L5 变异测试基线 ================");
  lines.push(
    `配置: ${CONFIG_SOURCE}（${report.total} 条） | 单条超时: ${
      report.vitestTimeoutMs / 1000
    }s | 总耗时: ${(report.durationMs / 1000).toFixed(1)}s`
  );
  lines.push(
    `mutation score: ${report.killed}/${report.total} = ${percent(
      report.mutationScore
    )}` +
      (report.invalid ? ` | invalid=${report.invalid}` : "") +
      (report.timeout ? ` | timeout=${report.timeout}` : "") +
      (report.error ? ` | error=${report.error}` : "") +
      (report.skipped ? ` | skipped=${report.skipped}` : "")
  );
  lines.push("");
  lines.push("按 targetFile:");
  const files = Object.keys(report.byFile).sort();
  for (const file of files) {
    const group = report.byFile[file];
    lines.push(
      `  ${file}  ${group.killed}/${group.total} (${percent(
        group.score
      )})  耗时 ${(group.durationMs / 1000).toFixed(1)}s` +
        (group.invalid ? `  invalid=${group.invalid}` : "")
    );
  }

  const survivors = report.results.filter((item) => item.status === "survived");
  lines.push("");
  lines.push(
    `存活归因: 等价变异 ${report.attributionSummary.equivalent.length} 条 | ` +
      `测试缺口 ${report.attributionSummary.testGap.length} 条 | ` +
      `未归因 ${report.attributionSummary.unattributed.length} 条`
  );
  if (survivors.length === 0) {
    lines.push("存活清单: 无（全部变异被既有测试杀死）");
  } else {
    lines.push(`存活清单（${survivors.length} 条）：`);
    for (const item of survivors) {
      lines.push(`  - ${item.id}  [${item.targetFile}]`);
      lines.push(
        `      归因: ${
          item.attribution === "equivalent"
            ? "等价变异"
            : item.attribution === "test-gap"
              ? "测试缺口"
              : "未归因（需人工判定）"
        } — ${item.attributionReason ?? "n/a"}`
      );
      if (item.suggestion) lines.push(`      建议: ${item.suggestion}`);
      if (item.error) lines.push(`      vitest: ${item.error}`);
    }
  }

  const unexpected = report.results.filter(
    (item) => item.status !== "killed" && item.status !== "survived"
  );
  if (unexpected.length > 0) {
    lines.push("");
    lines.push("异常条目:");
    for (const item of unexpected) {
      lines.push(
        `  - ${item.id} [${item.status}] ${item.error ?? "(无错误信息)"}`
      );
    }
  }

  lines.push("");
  lines.push(
    `安全自检: ${
      report.safety.allRestored
        ? "全部 targetFile 已恢复且 hash 校验通过，0 CONFLICT"
        : `⚠️ 恢复异常! conflicts=${JSON.stringify(
            report.safety.conflicts
          )} restoreFailures=${JSON.stringify(report.safety.restoreFailures)}`
    }`
  );
  lines.push(`报告: ${REPORT_FILE}`);
  lines.push("=================================================");
  lines.push("");
  console.log(lines.join("\n"));
}

// ────────────────────────────────────────────────────────────────────
// dry-run（只校验配置，不写文件）
// ────────────────────────────────────────────────────────────────────

interface DryRunValidation {
  spec: MutationSpec;
  ok: boolean;
  problems: string[];
  occurrences: number;
}

function validateSpec(spec: MutationSpec): DryRunValidation {
  const problems: string[] = [];
  const targetPath = resolve(ROOT, spec.targetFile);
  let occurrences = -1;

  if (!spec.id || typeof spec.id !== "string") problems.push("id 为空");
  if (!spec.targetFile || isAbsolute(spec.targetFile))
    problems.push("targetFile 必须是非空仓库相对路径");
  if (!existsSync(targetPath)) {
    problems.push(`targetFile 不存在: ${spec.targetFile}`);
  } else {
    const content = readFileSync(targetPath, "utf8");
    const findCheck = checkFind(content, spec.find);
    occurrences = findCheck.occurrences;
    if (findCheck.occurrences !== 1) {
      problems.push(`find 命中 ${findCheck.occurrences} 次（要求恰好 1 次）`);
    }
  }
  const normalizedReplace = adaptEol(spec.replace, "\n");
  if (!spec.replace || normalizedReplace === adaptEol(spec.find, "\n")) {
    problems.push("replace 为空或与 find 相同（空变异）");
  }
  if (!Array.isArray(spec.tests) || spec.tests.length === 0) {
    problems.push("tests 不能为空");
  } else {
    const missing = spec.tests.filter(
      (file) => !existsSync(resolve(ROOT, file))
    );
    if (missing.length > 0) problems.push(`tests 不存在: ${missing.join(", ")}`);
  }
  if (typeof spec.description !== "string" || spec.description.length === 0) {
    problems.push("description 为空");
  }
  if (
    typeof spec.equivalent !== "undefined" &&
    typeof spec.equivalent !== "boolean"
  ) {
    problems.push("equivalent 必须是 boolean");
  }
  if (spec.equivalent === true && !spec.equivalentReason) {
    problems.push("equivalent=true 时必须提供 equivalentReason");
  }
  return { spec, ok: problems.length === 0, problems, occurrences };
}

function printValidation(validation: DryRunValidation, index: number): void {
  const { spec, ok, problems } = validation;
  const head = ok ? "✅" : "❌";
  console.log(
    `${head} [${index}] ${spec.id} → ${spec.targetFile}（find ×${validation.occurrences}，tests=${spec.tests.length}）`
  );
  if (!ok) {
    for (const problem of problems) console.log(`      - ${problem}`);
  }
}

function runDryRun(specs: MutationSpec[]): void {
  console.log(
    `\n[DRY-RUN] 校验 ${specs.length} 条变异配置（不写任何文件、不跑变异）`
  );
  const validations = specs.map(validateSpec);
  validations.forEach(printValidation);
  const failed = validations.filter((item) => !item.ok);
  console.log(
    `\n[DRY-RUN] 结果: ${specs.length - failed.length}/${specs.length} 条配置有效` +
      (failed.length > 0 ? `，${failed.length} 条无效` : "")
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

// ────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  dryRun: boolean;
  onlyIds: string[] | null;
} {
  let dryRun = false;
  let onlyIds: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--only") {
      const value = argv[i + 1];
      if (!value) throw new Error("--only 需要一个逗号分隔的 id 列表");
      onlyIds = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      onlyIds = value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: npx tsx scripts/conformance/mutation.ts [--dry-run] [--only=<id1,id2>]"
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return { dryRun, onlyIds };
}

function selectMutations(onlyIds: string[] | null): MutationSpec[] {
  if (!onlyIds) return MUTATIONS;
  const byId = new Map(MUTATIONS.map((spec) => [spec.id, spec]));
  const unknown = onlyIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    const known = MUTATIONS.map((spec) => spec.id).join(", ");
    throw new Error(`--only 中有未知 id: ${unknown.join(", ")}\n可用 id: ${known}`);
  }
  const selected = onlyIds
    .map((id) => byId.get(id))
    .filter((spec): spec is MutationSpec => Boolean(spec));
  if (selected.length === 0)
    throw new Error("--only 没有选中任何变异（列表为空）");
  return selected;
}

function writeReport(report: MutationReport): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    REPORT_FILE,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
}

function runAll(specs: MutationSpec[]): MutationReport {
  installSignalHandlers();
  const started = Date.now();
  const results: MutationResult[] = [];
  let conflictOccurred = false;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (conflictOccurred) {
      results.push(
        emptyResult(
          spec,
          "skipped" // 前一条出现 CONFLICT，安全策略要求停止后续执行
        )
      );
      continue;
    }
    console.log(
      `\n[${i + 1}/${specs.length}] ${spec.id}  (${spec.targetFile})`
    );
    const result = executeMutation(spec);
    results.push(result);
    const icon =
      result.status === "killed"
        ? "🔴 KILLED"
        : result.status === "survived"
          ? "🟢 SURVIVED"
          : `⚠️ ${result.status.toUpperCase()}`;
    console.log(
      `    → ${icon}  ${result.durationMs}ms  还原=${
        result.restored ? "OK" : "FAIL"
      }${result.error ? `  ${result.error}` : ""}`
    );
    if (result.status === "conflict") {
      conflictOccurred = true;
      console.error(
        "\n⛔ CONFLICT：检测到第三方写入，已按安全策略停止后续变异（绝不覆盖他人改动）。"
      );
    }
  }

  return buildReport(results, Date.now() - started);
}

export function main(): void {
  // 运行时前置：必须在仓库根目录执行（保证相对路径语义）
  if (!existsSync(join(ROOT, "scripts", "conformance", "mutation.ts"))) {
    console.error(
      `[mutation] 请在仓库根目录运行（当前 cwd=${ROOT}，找不到 scripts/conformance/mutation.ts）`
    );
    process.exitCode = 1;
    return;
  }

  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[mutation] ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  let selected: MutationSpec[];
  try {
    selected = selectMutations(args.onlyIds);
  } catch (error) {
    console.error(`[mutation] ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    runDryRun(selected);
    return;
  }

  console.log(
    `\n[mutation] L5 变异测试开始：${selected.length} 条，单条超时 ${
      VITEST_TIMEOUT_MS / 1000
    }s`
  );
  const report = runAll(selected);
  writeReport(report);
  printSummary(report);

  if (report.invalid > 0) {
    console.error(
      `\n[mutation] ⚠️ 有 ${report.invalid} 条配置无效（find 不唯一 / tests 缺失），请先修配置。`
    );
    process.exitCode = 1;
  }
  if (report.safety.conflicts.length > 0 || report.safety.restoreFailures.length > 0) {
    console.error(
      "\n[mutation] ⛔ 安全自检未通过：请检查 CONFLICT / 恢复失败条目。"
    );
    process.exitCode = 1;
  }
}

/** 直接执行（npx tsx ...）时才跑 CLI；被测试 import 时只暴露 MUTATIONS / 工具函数。 */
const DIRECT_INVOCATION =
  !process.env.VITEST &&
  typeof process.argv[1] === "string" &&
  /(?:^|[\\/])mutation\.[cm]?ts$/.test(process.argv[1]);

if (DIRECT_INVOCATION) {
  main();
}
