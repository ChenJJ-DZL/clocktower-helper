import { expect, test, type Page } from "@playwright/test";
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
} from "../helpers/fullSim";
import { enterFirstNight, readSnapshot } from "../helpers/scriptFlow";

/**
 * ⭐⭐ 全真随机整局模拟（2026-10-20）· 罂粟花开 11 人
 * ================================================================
 * 与「钉死阵容逐角色脚本」互补：本文件**不预设任何角色/目标**，
 * 完全随机发牌 + 随机技能目标 + 随机提名 + 随机投票，
 * 逐步骤抓快照校验 9 条不变量（见 helpers/fullSim.ts 头注释）。
 *
 * 覆盖到的高复杂度机制（罂粟花开 24 角色池）：
 *   罂粟种植者（爪牙恶魔互不相识）/ 洗脑师（双选弹窗+疯狂判定）/
 *   镜像双子 / 军团（0 目标击杀）/ 涡流（信息必假）/ 提线木偶 /
 *   赏金猎人 / 疯子 / 畸形秀演员 …
 *
 * 种子可复现：SEED 环境变量指定，默认 20261020。
 * 违规输出：测试结束时打印清单 + 写 temp/full_sim_report.json。
 */
const SCRIPT = "罂粟花开";
const PLAYERS = 11;
const SEED = Number(process.env.SEED ?? "20261020");
const MAX_CYCLES = Number(process.env.SIM_CYCLES ?? "8"); // 昼夜循环上限

test.describe(`全真随机整局 · ${SCRIPT} ${PLAYERS}人 seed=${SEED}`, () => {
  test.setTimeout(25 * 60 * 1000); // 整局真实点击流，给足 25 分钟

  test("随机技能/提名/投票跑完整局 ⇒ 9 条不变量全程零违规", async ({ page }) => {
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
    const ctx: SimContext = makeSimContext(PLAYERS);
    ctx.step = "setup";
    // ⚠️ 传入 SEED 让**发牌本身**可复现（此前只控驱动点击，阵容每局不同）
    await enterFirstNight(page, PLAYERS, SCRIPT, SEED);
    await checkInvariants(page, ctx);

    // 自证：发牌随机源是否已注入（诊断「不可复现」根因用）。
    //   注意判据是 `__CT_DEAL_SEED__`，**不是** `Math.random` ——
    //   最终方案并不覆盖全局 Math.random（那会污染渲染路径且仍不可复现）。
    const rngSrc = await page.evaluate(() => {
      const seed = (window as unknown as { __CT_DEAL_SEED__?: number })
        .__CT_DEAL_SEED__;
      return seed === undefined
        ? "native(Math.random) — 未注入，发牌不可复现"
        : `dealLcg(seed=${seed})`;
    });

    // 记录初始角色分配（违规报告用）
    const snap0 = await readSnapshot(page);
    const lineup = (snap0?.seats ?? [])
      .map((s: any) => `${s.id + 1}号=${s.role?.name ?? s.role?.id ?? "?"}`)
      .join(" ");

    // ── 整局循环：夜 → 昼 → 夜 … ──
    let cycles = 0;
    let gameover = false;
    const trail: string[] = [];
    /**
     * ⚠️ 处决结算留痕：**必须落进报告**，否则「I14 永远读到 null ⇒ 永远跳过」
     *    会被误当成「白天效果校验通过」（验证器假阴性的经典形态）。
     */
    const duskExecs: Array<{ cycle: number; exec: unknown }> = [];
    const nightJournals: Array<{
      cycle: number;
      queue: Array<{ seatId: number; label: string }>;
      steps: NightStepRecord[];
      wakeStart?: { ids: number[]; idx: number; night: number; phase: string } | null;
      wakeEnd?: { ids: number[]; idx: number; night: number; phase: string } | null;
    }> = [];

    for (; cycles < MAX_CYCLES && !gameover; cycles++) {
      // 夜间：随机技能（带语义日志：顺序/效果/信息内容对账）
      ctx.step = `night#${cycles + 1}`;
      const nightRun = await advanceNightRandom(page, SEED + cycles * 7919);
      const nightResult = nightRun.status;
      nightJournals.push({
        cycle: cycles + 1,
        queue: nightRun.queue,
        steps: nightRun.journal,
        wakeStart: nightRun.wakeStart,
        wakeEnd: nightRun.wakeEnd,
      });
      // I10/I11/I12 语义对账
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
      const duskRun = await driveDuskRandom(page, SEED + cycles * 104729);
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
    if (gameover || live.gameOverUi) {
      if (!live.winnerText) {
        ctx.violations.push({
          invariant: "I7-win",
          step: "gameover",
          detail: "终局 UI 在场但 HUD 无「阵营胜利」文字（胜负结果不可读）",
        });
      }
    }
    const summary = {
      seed: SEED,
      cycles,
      gameover: gameover || live.gameOverUi,
      winResult: live.winner,
      winText: live.winnerText,
      deadSeatsLive: live.deadSeats,
      snapAlive: alive,
      snapWinResult: finalSnap?.winResult ?? null,
      lineup,
      rngSrc,
      trail,
      nightJournals,
      duskExecs,
      jsErrors: jsErrors.slice(0, 20),
      violations: ctx.violations,
    };

    // 违规与 JS 错误落盘（机器可读 + 人可读）
    const fs = await import("node:fs");
    const path = await import("node:path");
    const reportPath = path.resolve(
      __dirname,
      "../../temp/full_sim_report.json"
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");
    // eslint-disable-next-line no-console
    console.log("FULL_SIM_REPORT " + JSON.stringify(summary));

    // ── 断言：零违规 + 零 JS 崩溃 ──
    expect(
      ctx.violations,
      `不变量违规 ${ctx.violations.length} 条：\n` +
        ctx.violations
          .map((v) => `  [${v.invariant}] @${v.step} ${v.detail}`)
          .join("\n")
    ).toHaveLength(0);

    expect(
      jsErrors,
      `页面 JS 错误 ${jsErrors.length} 条：${jsErrors.slice(0, 5).join(" | ")}`
    ).toHaveLength(0);

    // 整局至少推进 1 个昼夜（防空转假绿）
    expect(cycles, "整局必须至少完成 1 个昼夜循环").toBeGreaterThanOrEqual(1);
  });
});
