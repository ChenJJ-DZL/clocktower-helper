/**
 * 全真整局模拟器（可参数化剧本）—— 供 9 个剧本共用同一套驱动与判据
 * ======================================================================
 * 原实现把 `SCRIPT = "罂粟花开"` 硬编码在 spec 里，导致其余剧本**没有**
 * 「随机技能 + 随机提名投票 + 逐步骤不变量」这一层覆盖（只有逐角色脚本）。
 *
 * 抽出本 helper 后：
 *   · `e2e/full_sim/poppyganda_random_11.spec.ts` —— 单剧本深跑（可用 env 覆盖）
 *   · `e2e/full_sim/all_scripts.spec.ts` —— 9 剧本各跑一局（矩阵式覆盖）
 *
 * 判据（I0–I14）全部来自 `helpers/fullSim.ts`，本文件只做「编排 + 落盘 + 断言」。
 */
import { expect, type Page } from "@playwright/test";
import {
  advanceNightRandom,
  checkInvariants,
  driveDuskRandom,
  makeSimContext,
  readLiveEndState,
  verifyDuskSemantics,
  verifyNightSemantics,
  type NightStepRecord,
  type SimContext,
} from "./fullSim";
import { enterFirstNight, readSnapshot } from "./scriptFlow";
import { readWinReasonFromOverlay } from "./fullSim";
import { verifyTerminalOutcome } from "../../src/utils/terminalRules";

export interface FullSimOptions {
  /** 剧本中文名（与 `app/data.ts` 的 `name` 一致） */
  script: string;
  /** 人数 */
  players: number;
  /** 发牌 + 驱动种子 */
  seed: number;
  /** 昼夜循环上限 */
  maxCycles: number;
  /** 报告文件名（不含扩展名），默认 `full_sim_report` */
  reportName?: string;
  /** 整局超时（毫秒），默认 25 分钟 */
  timeoutMs?: number;
  /**
   * 要求这一局**必须跑到终局**（默认 false）。
   * 用于「终局四条」专项：圈数不够直接报 I7-reach，
   * 而不是让「没跑到」伪装成「通过」。
   */
  requireGameOver?: boolean;
}

export interface FullSimSummary {
  script: string;
  players: number;
  seed: number;
  cycles: number;
  gameover: boolean;
  winResult: unknown;
  winText: unknown;
  deadSeatsLive: unknown;
  /** 终局座位真值：角色取最后一帧快照，存活取 DOM 活终态（快照按设计停在终局前） */
  finalSeats: Array<{
    id: number;
    roleId: string | null;
    roleType: string | null;
    isDead: boolean;
  }>;
  /** 终局四条的反算结果（未终局时 undefined） */
  terminal?: {
    ok: boolean;
    expected: string | null;
    special?: boolean;
    reason: string;
  };
  /** 跑满圈数上限仍未终局（兜底命中，不是违规） */
  hitCycleCap?: boolean;
  snapAlive: number;
  snapWinResult: unknown;
  /** 终局快照里的夜数（用于验证 nightCount 是否真的递增） */
  snapNightCount?: number | null;
  lineup: string;
  rngSrc: string;
  trail: string[];
  nightJournals: Array<{
    cycle: number;
    queue: Array<{ seatId: number; label: string }>;
    steps: NightStepRecord[];
    wakeStart?: { ids: number[]; idx: number; night: number; phase: string } | null;
    wakeEnd?: { ids: number[]; idx: number; night: number; phase: string } | null;
  }>;
  duskExecs: Array<{ cycle: number; exec: unknown }>;
  jsErrors: string[];
  violations: SimContext["violations"];
  /** 驱动超时时的现场（DOM/按钮/弹窗/座位），未超时为 null */
  stuck?: unknown;
  /** 按钮点击抛出的异常（含栈） */
  actionError?: { where: string; message: string; stack: string } | null;
  /** 中心 HUD 的阶段标签（第 N 夜 / 第 N 天 / 黄昏…） */
  uiPhaseLabel?: string | null;
}

/**
 * 跑一整局，返回 summary 并**已执行断言**（零违规 / 零 JS 错误 / 至少一个昼夜）。
 * 调用方若要自定义断言，可在返回后追加。
 */
export async function runFullGameSim(
  page: Page,
  opts: FullSimOptions
): Promise<FullSimSummary> {
  const { script, players, seed, maxCycles } = opts;

  const jsErrors: string[] = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (msg) => {
    // React 渲染崩溃通常伴随 console.error，收集作为 I5 旁证
    if (msg.type() === "error") {
      const t = msg.text();
      if (!/favicon|404|Download the React DevTools/i.test(t)) jsErrors.push(t);
    }
  });

  // ── 开局：随机落座 + 随机发牌 ──
  const ctx: SimContext = makeSimContext(players);
  ctx.step = "setup";
  // ⚠️ 传入 seed 让**发牌本身**可复现（`utils/dealRng.ts` 独立随机源）
  await enterFirstNight(page, players, script, seed);
  await checkInvariants(page, ctx);

  // 自证：发牌随机源是否已注入（诊断「不可复现」用）。
  //   判据是 `__CT_DEAL_SEED__`，**不是** `Math.random` —— 最终方案不覆盖全局。
  const rngSrc = await page.evaluate(() => {
    const s = (window as unknown as { __CT_DEAL_SEED__?: number })
      .__CT_DEAL_SEED__;
    return s === undefined
      ? "native(Math.random) — 未注入，发牌不可复现"
      : `dealLcg(seed=${s})`;
  });

  const snap0 = await readSnapshot(page);
  const lineup = (snap0?.seats ?? [])
    .map((s: any) => `${s.id + 1}号=${s.role?.name ?? s.role?.id ?? "?"}`)
    .join(" ");

  // ── 整局循环：夜 → 昼 → 夜 … ──
  let cycles = 0;
  let gameover = false;
  /** 跑满圈数上限仍未终局（兜底命中，不是违规） */
  let hitCycleCap = false;
  const trail: string[] = [];
  /**
   * ⚠️ 处决结算留痕：**必须落进报告**，否则「I14 永远读到 null ⇒ 永远跳过」
   *    会被误当成「白天效果校验通过」（验证器假阴性的经典形态）。
   */
  const duskExecs: Array<{ cycle: number; exec: unknown }> = [];
  const nightJournals: FullSimSummary["nightJournals"] = [];

  for (; cycles < maxCycles && !gameover; cycles++) {
    ctx.step = `night#${cycles + 1}`;
    const nightRun = await advanceNightRandom(page, seed + cycles * 7919);
    const nightResult = nightRun.status;
    nightJournals.push({
      cycle: cycles + 1,
      queue: nightRun.queue,
      steps: nightRun.journal,
      wakeStart: nightRun.wakeStart,
      wakeEnd: nightRun.wakeEnd,
    });
    // I10/I11/I12/I13 语义对账
    const sem = verifyNightSemantics(
      nightRun.journal,
      nightRun.queue,
      nightRun.wakeStart?.ids ?? null
    );
    ctx.violations.push(...sem.map((v) => ({ ...v, step: `${ctx.step}(semantic)` })));
    trail.push(`${ctx.step}:${nightResult}`);
    await checkInvariants(page, ctx);
    if (nightResult === "timeout") {
      ctx.violations.push({
        invariant: "I6-progress",
        step: ctx.step,
        detail: "夜间驱动超时（弹窗卡死/无推进出口）",
      });
      break;
    }
    if (nightResult === "gameover") {
      gameover = true;
      break;
    }

    // 白天/黄昏：随机提名 + 随机投票
    ctx.step = `dusk#${cycles + 1}`;
    const duskRun = await driveDuskRandom(page, seed + cycles * 104729);
    const duskResult = duskRun.status;
    trail.push(`${ctx.step}:${duskResult}`);
    duskExecs.push({ cycle: cycles + 1, exec: duskRun.executed });
    // I14 处决结算：点名处决 ⇒ 必须真的死一人（白天唯一的效果判据）
    ctx.violations.push(
      ...verifyDuskSemantics(duskRun.executed).map((v) => ({
        ...v,
        step: `${ctx.step}(semantic)`,
      }))
    );
    await checkInvariants(page, ctx, { checkHud: true });

    if (duskResult === "timeout") {
      ctx.violations.push({
        invariant: "I6-progress",
        step: ctx.step,
        detail: "白天驱动超时（门禁/提名/投票/入夜卡死）",
      });
      break;
    }
    if (duskResult === "gameover") {
      gameover = true;
    }
  }

  // ── 终局校验：走「活终态」（DOM/HUD）——快照按设计停在终局前 ──
  const live = await readLiveEndState(page);
  const finalSnap = await readSnapshot(page);
  const alive = (finalSnap?.seats ?? []).filter((s: any) => !s.isDead).length;
  ctx.step = "gameover";
  // 终局座位真值：角色来自最后一帧快照（角色在终局后不再变动），
  //   存活来自 DOM 活终态（`live.deadSeats`）—— 因为**终局按设计不落快照**。
  // 终局卡片默认不展开（HUD 上只有一个「查看获胜结果」按钮）⇒ 点开再读胜因，
  //   否则 I7-rules 永远拿不到专属胜利的依据，把合法终局误判成无依据。
  if ((gameover || live.gameOverUi) && !live.winnerReason) {
    try {
      const btn = page.getByRole("button", { name: /查看获胜结果/ }).first();
      if ((await btn.count()) > 0) {
        await btn.click({ timeout: 3000 });
        // 不用盲等：直接轮询「胜利依据」节点出现（幂等，超时也只是没读到）
        await page
          .waitForFunction(
            () => {
              const norm = (t: string) => t.replace(/\s+/g, "");
              return Array.from(document.querySelectorAll("body *")).some(
                (el) =>
                  el.children.length === 0 &&
                  norm(el.textContent || "") === "胜利依据"
              );
            },
            { timeout: 3000 }
          )
          .catch(() => {});
      }
      const fromOverlay = await readWinReasonFromOverlay(page);
      if (fromOverlay) live.winnerReason = fromOverlay;
    } catch {
      /* 点不开就保持 null，由判据报红 */
    }
  }
  const deadSet = new Set<number>(live.deadSeats ?? []);
  const finalSeats = (finalSnap?.seats ?? []).map((seat: any) => ({
    id: seat.id,
    roleId: seat.role?.id ?? null,
    roleType: seat.role?.type ?? null,
    isDead: deadSet.has(seat.id),
  }));
  let terminal: FullSimSummary["terminal"];
  const reachedGameOver = gameover || live.gameOverUi;
  if (reachedGameOver) {
    if (!live.winnerText) {
      ctx.violations.push({
        invariant: "I7-win",
        step: "gameover",
        detail: "终局 UI 在场但 HUD 无「阵营胜利」文字（胜负结果不可读）",
      });
    }
    // ⭐ I7-rules：用独立判据（utils/terminalRules）反算「官方四条」，与 UI 胜方比对。
    //   ⚠️ 旧实现只校验「有胜字」，判反了照样绿。
    const check = verifyTerminalOutcome({
      seats: finalSeats.map((x: { id: number; roleId: string | null; roleType: string | null; isDead: boolean }) => ({
        id: x.id,
        isDead: x.isDead,
        role: { id: x.roleId, type: x.roleType },
      })),
      winner: (live.winner as "good" | "evil" | null) ?? null,
      winReason: live.winnerReason ?? null,
    });
    terminal = {
      ok: check.ok,
      expected: check.expected,
      special: check.special,
      reason: check.reason,
    };
    if (!check.ok) {
      ctx.violations.push({
        invariant: "I7-rules",
        step: "gameover",
        detail: check.reason,
      });
    }
  } else if (opts.requireGameOver) {
    // 「没跑到」不能当成「通过」：要求终局的专项必须报出来。
    ctx.violations.push({
      invariant: "I7-reach",
      step: `cycles#${cycles}`,
      detail: `未在 ${maxCycles} 个昼夜内终局（恶魔仍存活 / 白天未推进）`,
    });
  } else {
    /**
     * 兜底命中：**只告警，不判红**。
     * 15 人局要死 13 人才到「存活 ≤2」，20 圈内死不到是正常现象；
     * 矩阵的职责是「角色技能与流程合规」，终局判据由 5 人局的 terminal_state 专项负责。
     */
    hitCycleCap = true;
    trail.push(`⚠️ 达到 ${maxCycles} 圈上限仍未终局（兜底命中，不计违规）`);
  }

  // 中心 HUD 的阶段标签（state 真值的第一手呈现，不再靠文案猜）
  const uiPhaseLabel = await page
    .locator('[data-testid="hud-phase-label"]')
    .first()
    .textContent()
    .catch(() => null);

  /** 按钮点击时抛出的异常（含栈）—— 否则只剩「操作失败: xxx」一句，定位不到行 */
  const actionError = await page
    .evaluate(() => (window as any).__ctLastActionError ?? null)
    .catch(() => null);

  // 卡死现场（仅在 timeout 时由驱动写入）
  const stuck = await page
    .evaluate(() => (window as any).__ctStuck ?? null)
    .catch(() => null);

  const summary: FullSimSummary = {
    script,
    players,
    seed,
    cycles,
    gameover: gameover || live.gameOverUi,
    winResult: live.winner,
    winText: live.winnerText,
    deadSeatsLive: live.deadSeats,
    finalSeats,
    terminal,
    snapAlive: alive,
    snapWinResult: finalSnap?.winResult ?? null,
    snapNightCount: (finalSnap as any)?.nightCount ?? null,
    lineup,
    rngSrc,
    trail,
    nightJournals,
    duskExecs,
    jsErrors: jsErrors.slice(0, 20),
    violations: ctx.violations,
    stuck,
    uiPhaseLabel,
    actionError,
  };

  // 落盘（机器可读 + 人可读）；按剧本分文件，避免 9 剧本互相覆盖
  const fs = await import("node:fs");
  const path = await import("node:path");
  const reportPath = path.resolve(
    __dirname,
    `../../temp/${opts.reportName ?? "full_sim_report"}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");

  // 追加到共享的汇总文件，供「9 剧本覆盖矩阵」一次性读取
  const allPath = path.resolve(__dirname, "../../temp/full_sim_all_scripts.jsonl");
  fs.appendFileSync(
    allPath,
    JSON.stringify({
      script,
      players,
      seed,
      cycles,
      gameover: summary.gameover,
      winResult: summary.winResult,
      lineup: summary.lineup,
      violations: summary.violations.length,
      rngSrc: summary.rngSrc,
    }) + "\n",
    "utf-8"
  );

  // eslint-disable-next-line no-console
  console.log("FULL_SIM_REPORT " + JSON.stringify(summary));

  // ── 断言：零违规 + 零 JS 崩溃 ──
  expect(
    ctx.violations,
    `${script} 不变量违规 ${ctx.violations.length} 条：\n` +
      ctx.violations
        .map((v) => `  [${v.invariant}] @${v.step} ${v.detail}`)
        .join("\n")
  ).toHaveLength(0);

  expect(
    jsErrors,
    `${script} 页面 JS 错误 ${jsErrors.length} 条：${jsErrors.slice(0, 5).join(" | ")}`
  ).toHaveLength(0);

  // 整局至少推进 1 个昼夜（防空转假绿）
  expect(cycles, `${script} 整局必须至少完成 1 个昼夜循环`).toBeGreaterThanOrEqual(1);

  return summary;
}

/** 9 个官方剧本 + 罂粟花开（与 `app/data.ts` 的 `name` 一致） */
export const ALL_SCRIPTS: Array<{ name: string; players: number; seed: number }> = [
  { name: "暗流涌动", players: 11, seed: 90001 },
  { name: "黯月初升", players: 11, seed: 90002 },
  { name: "梦殒春宵", players: 11, seed: 90003 },
  { name: "窃窃私语", players: 11, seed: 90004 },
  { name: "无名之墓", players: 11, seed: 90005 },
  { name: "无上愉悦", players: 11, seed: 90006 },
  { name: "凶宅魅影", players: 11, seed: 90007 },
  { name: "游园惊梦", players: 11, seed: 90008 },
  { name: "罂粟花开", players: 11, seed: 90009 },
];
