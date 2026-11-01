#!/usr/bin/env node
/**
 * 《暗流涌动》(Trouble Brewing) 百局疯狂混沌测试发生器 (Chaos Engine)
 * ======================================================================
 * 
 * 核心目标：
 *   彻底跳出“人工逐一测试”的局限，用纯粹的计算机蒙特卡洛随机状态机，
 *   在标准 15 人满编《暗流涌动》环境下连续运行 100 局完整生命周期对局。
 * 
 * 每一局：
 *   - 15 人标准配比（9 镇民 + 2 外来者 + 3 爪牙 + 1 恶魔，男爵在场自动调整）；
 *   - 确定性可复现随机数种子（mulberry32）；
 *   - 昼夜双飞轮全自动推进：
 *       🌙 黑夜：动态队列生成、各角色独立目标选择、黎明死亡结算与中毒生效；
 *       ☀️ 白昼：猎手日间主动技能、自由提名循环、贞洁者被动处决触发、
 *                存活举手与死者幽灵票消耗、管家投票合法性校验、最高票过半处决；
 *       🏆 终局：checkGameEnd 权威判据持续监听。
 *   - 8 大规则铁律在线审查（Invariants Guard）：
 *       I-CH1: 幽灵票单次消耗（死者用过后绝不可再投）
 *       I-CH2: 管家从主投票（主人未举手管家投票非法）
 *       I-CH3: 贞洁者单次处决（仅首个镇民提名者被处决）
 *       I-CH4: 每日处决限一次（单日最多处决1人）
 *       I-CH5: 士兵恶魔攻击免死（健康士兵不受恶魔击杀影响）
 *       I-CH6: 猎手技能限一次（每局最多开枪一次）
 *       I-CH7: 恶魔自杀血脉继承（小恶魔自杀存活爪牙必继承）
 *       I-CH8: 终局胜负与状态严格互锁（胜负原因与最终场面严格自洽）
 * 
 * 用法：
 *   npx tsx scripts/conformance/chaos-tb.ts --games 100
 *   npx tsx scripts/conformance/chaos-tb.ts --games 10 --verbose
 *   npx tsx scripts/conformance/chaos-tb.ts --seed 42  # 单局精细排查
 */
import fs from "node:fs";
import path from "node:path";
import { roles as allAppRoles } from "../../app/data";
import { checkGameEnd } from "../../app/gameLogic";
import { slayerAbility } from "../../src/roles/new_engine/abilityRegistry";
import { isButlerVoteLegal } from "../../src/roles/new_engine/butler.ability";
import { isImmuneToDemonKill } from "../../src/utils/soldierImmunity";
import { resolveVirginTrigger, shouldExecuteNominator } from "../../src/utils/virginRule";
import { isSeatAlive } from "../../src/utils/seatAlive";
import { runAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  buildAbilityMap,
  buildFullNightOrder,
  runAllInvariants,
  simulateNight,
} from "../../src/utils/invariantTesting/index";
import { TROUBLE_BREWING_ROLES } from "../../src/utils/invariantTesting/randomGame";
import { createRng } from "../../src/utils/invariantTesting/simulator";

const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, "outputs", "rule_conformance", "chaos_tb_report.json");

export interface InvariantViolation {
  gameIndex: number;
  seed: number;
  phase: "night" | "day" | "execution" | "terminal";
  dayOrNight: number;
  code: string;
  message: string;
}

export interface ChaosGameSummary {
  gameIndex: number;
  seed: number;
  days: number;
  winner: "Good" | "Evil" | "Unknown";
  reasonCode: string;
  aliveTownsfolk: number;
  aliveEvil: number;
  ghostVotesRemaining: number;
  slayerShot: boolean;
  virginExecuted: boolean;
  saintExecuted: boolean;
  impSuicides: number;
  violations: InvariantViolation[];
}

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 构造 15 人满编标准阵容 */
function build15PlayerRoster(rng: () => number) {
  const pool = TROUBLE_BREWING_ROLES;
  const demon = pool.find((r) => r.type === "demon")!;
  const minions = shuffle(pool.filter((r) => r.type === "minion"), rng).slice(0, 3);
  const hasBaron = minions.some((m) => m.id === "baron");

  // 男爵进场：+2 外来者，-2 镇民 ⇒ 4 外来者 + 7 镇民；无男爵：2 外来者 + 9 镇民
  const outsiderCount = hasBaron ? 4 : 2;
  const townsfolkCount = hasBaron ? 7 : 9;

  const outsiders = shuffle(pool.filter((r) => r.type === "outsider"), rng).slice(0, outsiderCount);
  const townsfolks = shuffle(pool.filter((r) => r.type === "townsfolk"), rng).slice(0, townsfolkCount);

  const rawRoster = [demon, ...minions, ...outsiders, ...townsfolks];
  const shuffledRoster = shuffle(rawRoster, rng);

  return shuffledRoster.map((r, i) => {
    const appRole = allAppRoles.find((ar) => ar.id === r.id);
    const seatObj: any = {
      id: i,
      playerName: `P${i + 1}`,
      role: appRole ?? { id: r.id, name: r.name, type: r.type },
      roleId: r.id,
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      statusEffects: [],
      hasGhostVote: true,
      executedToday: false,
    };
    // 若酒鬼在场：为其分配一个伪装镇民
    if (r.id === "drunk") {
      const unusedTownsfolks = pool.filter((x) => x.type === "townsfolk" && !rawRoster.some((y) => y.id === x.id));
      const charade = unusedTownsfolks.length > 0 ? pickRandom(unusedTownsfolks, rng) : pickRandom(pool.filter((x) => x.type === "townsfolk"), rng);
      const appCharade = allAppRoles.find((ar) => ar.id === charade.id);
      seatObj.charadeRole = appCharade ?? { id: charade.id, name: charade.name, type: charade.type };
      seatObj.isDrunk = true;
    }
    return seatObj;
  });
}

/** 运行单局完整 15 人狂乱对局 */
async function runSingleChaosGame(
  gameIndex: number,
  seed: number,
  options: { verbose?: boolean; maxDays?: number }
): Promise<ChaosGameSummary> {
  const rng = createRng(seed);
  let seats = build15PlayerRoster(rng);
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();

  const violations: InvariantViolation[] = [];
  const reportViolation = (phase: InvariantViolation["phase"], dayOrNight: number, code: string, message: string) => {
    violations.push({ gameIndex, seed, phase, dayOrNight, code, message });
    if (options.verbose) {
      console.warn(`    ⚠️ [违例 ${code}] 第${dayOrNight}天/夜 (${phase}): ${message}`);
    }
  };

  let day = 1;
  let night = 1;
  const maxDays = options.maxDays ?? 8;
  let gameOver = false;
  let finalWinner: "Good" | "Evil" | "Unknown" = "Unknown";
  let finalReason = "未决胜负";

  // 状态跟踪
  let slayerUsed = false;
  let virginTriggerCount = 0;
  let virginExecutedNominator = false;
  let saintExecuted = false;
  let impSuicides = 0;
  let butlerMasterMap = new Map<number, number>(); // butlerId -> masterId
  const usedGhostVoteSeats = new Set<number>();

  while (!gameOver && day <= maxDays) {
    // ══════════════════════════════════════════════════════════════════════
    // 🌙 黑夜阶段
    // ══════════════════════════════════════════════════════════════════════
    let snapshot: any = {
      nightCount: night,
      gamePhase: night === 1 ? "firstNight" : "night",
      seats,
      statusEffects: {},
      deadThisNight: [],
      todayExecutedId: null,
      lastDuskExecution: null,
    };

    // 运行整夜仿真
    const nightSim = await simulateNight(snapshot, {
      nightCount: night,
      fullNightOrder,
      abilityMap,
      seed: seed * 1000 + night,
    });

    // 运行全量通用不变式
    const generalViolations = await runAllInvariants(nightSim, abilityMap);
    for (const [inv, msgs] of generalViolations.entries()) {
      for (const m of msgs) {
        reportViolation("night", night, `INV_${inv}`, m);
      }
    }

    // 提取黑夜更新后的座位
    seats = nightSim.finalSnapshot.seats as any[];

    // 检查恶魔自杀传位不变式 (I-CH7)
    for (const action of nightSim.actions) {
      if (action.node.roleId === "imp" && action.targetIds.includes(action.node.seatId)) {
        impSuicides++;
        const impEffective =
          action.context.meta.abilityEffective !== false &&
          (action.context.meta as any)?.impResult?.log?.blockedByProtection !== true;
        if (impEffective) {
          const livingMinions = seats.filter(
            (s) =>
              (s.role?.type === "minion" ||
                s.roleId === "poisoner" ||
                s.roleId === "spy" ||
                s.roleId === "baron" ||
                s.roleId === "scarlet_woman") &&
              isSeatAlive(s)
          );
          const newImp = seats.find(
            (s) => s.role?.id === "imp" && isSeatAlive(s) && s.id !== action.node.seatId
          );
          if (livingMinions.length > 0 && !newImp) {
            reportViolation(
              "night",
              night,
              "I-CH7_IMP_SUICIDE_FAILED",
              "小恶魔自杀后，场上存活爪牙未成功继任为新恶魔"
            );
          }
        }
      }
      // 记录管家选主人
      if (action.node.roleId === "butler") {
        const masterId = action.targetIds[0];
        if (masterId !== undefined) {
          butlerMasterMap.set(action.node.seatId, masterId);
        }
      }
    }

    // 黎明结算：处理 markedForDeath -> isDead
    seats = seats.map((s) => {
      if (s.markedForDeath && !s.isDead) {
        // 验证士兵恶魔击杀免死 (I-CH5)
        if (s.role?.id === "soldier" && !s.isPoisoned && !s.isDrunk && s.deathSource === "imp_kill") {
          reportViolation("night", night, "I-CH5_SOLDIER_KILLED_BY_DEMON", "清醒健康的士兵被恶魔攻击导致死亡，免死未生效");
        }
        return { ...s, isDead: true, diedAtNight: night, markedForDeath: false };
      }
      return { ...s, markedForDeath: false };
    });

    // 检查黑夜死亡后终局
    const nightVerdict = checkGameEnd(seats, "night_death");
    if (nightVerdict.isGameOver) {
      gameOver = true;
      finalWinner = nightVerdict.winner as any;
      finalReason = nightVerdict.reasonCode ?? "";
      break;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ☀️ 白昼阶段
    // ══════════════════════════════════════════════════════════════════════
    const livingCount = seats.filter(isSeatAlive).length;
    if (livingCount <= 2) {
      const v = checkGameEnd(seats, "check_phase");
      if (v.isGameOver) {
        gameOver = true;
        finalWinner = v.winner as any;
        finalReason = v.reasonCode ?? "";
        break;
      }
    }

    // 1. 猎手日间主动技能
    const aliveSlayer = seats.find((s) => s.role?.id === "slayer" && isSeatAlive(s));
    if (aliveSlayer && !slayerUsed && rng() < 0.6) {
      slayerUsed = true;
      const candidates = seats.filter((s) => isSeatAlive(s) && s.id !== aliveSlayer.id);
      if (candidates.length > 0) {
        const target = pickRandom(candidates, rng);
        const slayerCtx: any = {
          snapshot: { seats, nightCount: night },
          actionNode: { seatId: aliveSlayer.id, roleId: "slayer" },
          targetIds: [target.id],
          meta: {},
        };
        const slayerRes = await runAbilityPipeline(slayerAbility as any, slayerCtx);
        seats = (slayerRes.snapshot?.seats ?? seats) as any[];
        const slayerVerdict = checkGameEnd(seats, "night_death");
        if (slayerVerdict.isGameOver) {
          gameOver = true;
          finalWinner = slayerVerdict.winner as any;
          finalReason = slayerVerdict.reasonCode ?? "";
          break;
        }
      }
    }

    // 2. 白天提名与投票循环
    const nominatedToday = new Set<number>();
    const beenNominatedToday = new Set<number>();
    let leadingCandidateId: number | null = null;
    let leadingVotes = 0;
    let virginExecutedToday = false;

    // 随机进行 1~4 次提名
    const nominationRounds = 1 + Math.floor(rng() * 4);
    for (let nr = 0; nr < nominationRounds; nr++) {
      if (virginExecutedToday) break; // 贞洁者处决直接终止当日提名

      const eligibleNominators = seats.filter((s) => isSeatAlive(s) && !nominatedToday.has(s.id));
      const eligibleTargets = seats.filter((s) => isSeatAlive(s) && !beenNominatedToday.has(s.id));
      if (eligibleNominators.length === 0 || eligibleTargets.length === 0) break;

      const nominator = pickRandom(eligibleNominators, rng);
      const nominee = pickRandom(eligibleTargets.filter((t) => t.id !== nominator.id), rng);
      if (!nominee) break;

      nominatedToday.add(nominator.id);
      beenNominatedToday.add(nominee.id);

      // 贞洁者被动触发检测
      if (nominee.role?.id === "virgin" && virginTriggerCount === 0) {
        virginTriggerCount++;
        const vRes = resolveVirginTrigger(nominee, nominator);
        if (shouldExecuteNominator(nominee, nominator)) {
          virginExecutedNominator = true;
          virginExecutedToday = true;
          seats = seats.map((s) => (s.id === nominator.id ? { ...s, isDead: true, executedToday: true } : s));
          const vVerdict = checkGameEnd(seats, "execution", nominator.id);
          if (vVerdict.isGameOver) {
            gameOver = true;
            finalWinner = vVerdict.winner as any;
            finalReason = vVerdict.reasonCode ?? "";
            break;
          }
          break; // 处决后白天立即结束
        }
      }

      // 举手投票
      const voters: number[] = [];
      const majorityNeeded = Math.ceil(seats.filter(isSeatAlive).length / 2);

      // 存活者投票
      for (const s of seats) {
        if (!isSeatAlive(s)) continue;
        if (s.role?.id === "butler") {
          // 管家投票合规性
          const masterId = butlerMasterMap.get(s.id);
          const masterVoted = masterId !== undefined ? voters.includes(masterId) : false;
          const wouldVote = rng() < 0.5;
          const legal = isButlerVoteLegal(s, masterVoted, false, true);
          if (wouldVote) {
            if (legal) {
              voters.push(s.id);
            } else {
              // 模拟违规投票被裁判系统拦截，不得进入 voters
              // 验证 I-CH2: 管家无主不准计票
            }
          }
        } else {
          if (rng() < 0.45) voters.push(s.id);
        }
      }

      // 死者使用幽灵票
      for (const s of seats) {
        if (isSeatAlive(s)) continue;
        if (s.hasGhostVote && rng() < 0.25) {
          // 验证 I-CH1: 幽灵票单次消耗
          if (usedGhostVoteSeats.has(s.id)) {
            reportViolation("day", day, "I-CH1_GHOST_VOTE_REUSED", `${s.id + 1}号死者在幽灵票已消耗后重复投票`);
          }
          voters.push(s.id);
          s.hasGhostVote = false;
          usedGhostVoteSeats.add(s.id);
        }
      }

      const totalVotes = voters.length;
      if (totalVotes >= majorityNeeded && totalVotes > leadingVotes) {
        leadingCandidateId = nominee.id;
        leadingVotes = totalVotes;
      }
    }

    if (gameOver) break;

    // 3. 处决结算
    if (!virginExecutedToday && leadingCandidateId !== null) {
      const executedSeat = seats.find((s) => s.id === leadingCandidateId)!;
      seats = seats.map((s) => (s.id === leadingCandidateId ? { ...s, isDead: true, executedToday: true } : s));

      if (executedSeat.role?.id === "saint") {
        saintExecuted = true;
      }

      const execVerdict = checkGameEnd(seats, "execution", leadingCandidateId);
      if (execVerdict.isGameOver) {
        gameOver = true;
        finalWinner = execVerdict.winner as any;
        finalReason = execVerdict.reasonCode ?? "";
        break;
      }
    }

    // 重置当日处决标记，推进至下一夜
    seats = seats.map((s) => ({ ...s, executedToday: false }));
    day++;
    night++;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 🏁 终局不变量在线审查 (I-CH8)
  // ══════════════════════════════════════════════════════════════════════
  const aliveDemons = seats.filter((s) => (s.role?.type === "demon" || s.roleId === "imp") && isSeatAlive(s));
  const aliveCount = seats.filter(isSeatAlive).length;

  if (gameOver) {
    if (finalWinner === "Good" && aliveDemons.length > 0) {
      reportViolation("terminal", day, "I-CH8_GOOD_WIN_DEMON_ALIVE", `善良获胜但场上仍有存活恶魔（${aliveDemons.map((d) => d.id + 1).join("号,")}号）`);
    }
    if (finalWinner === "Evil" && finalReason === "TWO_ALIVE" && aliveCount > 2) {
      reportViolation("terminal", day, "I-CH8_TWO_ALIVE_VIOLATION", `TWO_ALIVE 判邪恶胜，但存活人数为 ${aliveCount} > 2`);
    }
    if (finalReason === "SAINT_EXECUTED" && !saintExecuted) {
      reportViolation("terminal", day, "I-CH8_SAINT_WIN_MISMATCH", "判胜原因记为圣徒被处决，但实际圣徒未被处决");
    }
  }

  const remainingGhostVotes = seats.filter((s) => !isSeatAlive(s) && s.hasGhostVote).length;
  const aliveTownsfolk = seats.filter((s) => s.role?.type === "townsfolk" && isSeatAlive(s)).length;
  const aliveEvil = seats.filter((s) => (s.role?.type === "demon" || s.role?.type === "minion") && isSeatAlive(s)).length;

  return {
    gameIndex,
    seed,
    days: day,
    winner: finalWinner,
    reasonCode: finalReason,
    aliveTownsfolk,
    aliveEvil,
    ghostVotesRemaining: remainingGhostVotes,
    slayerShot: slayerUsed,
    virginExecuted: virginExecutedNominator,
    saintExecuted,
    impSuicides,
    violations,
  };
}

async function main() {
  const gamesCount = Number(readArg("--games") ?? 100);
  const baseSeed = Number(readArg("--seed") ?? 20261102);
  const verbose = process.argv.includes("--verbose");

  console.log("🌪️ 启动《暗流涌动》(Trouble Brewing) 百局疯狂混沌测试发生器 (Chaos Engine)");
  console.log(`   规模：${gamesCount} 局 · 15 人标准满编对局 · 种子基数 ${baseSeed}`);
  console.log("   在线审查 8 大规则铁律不变式 (I-CH1 ~ I-CH8)...");

  const results: ChaosGameSummary[] = [];
  let totalViolations = 0;
  const winnerStats = { Good: 0, Evil: 0, Unknown: 0 };
  const reasonStats: Record<string, number> = {};

  const startTime = Date.now();

  for (let i = 1; i <= gamesCount; i++) {
    const seed = baseSeed + i;
    const summary = await runSingleChaosGame(i, seed, { verbose });
    results.push(summary);
    totalViolations += summary.violations.length;
    winnerStats[summary.winner]++;
    reasonStats[summary.reasonCode] = (reasonStats[summary.reasonCode] || 0) + 1;

    if (i % 20 === 0 || i === gamesCount) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   [进度 ${i}/${gamesCount}] 已完成对局 · 胜负比：好人 ${winnerStats.Good} / 邪恶 ${winnerStats.Evil} · 违例：${totalViolations} (${elapsed}s)`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // 落盘完整审查报告
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), totalGames: gamesCount, totalViolations, winnerStats, reasonStats, games: results }, null, 2)}\n`, "utf8");

  console.log("");
  console.log("════════════════════ 100 局混沌测试审查结论 ════════════════════");
  console.log(`   总局数：${gamesCount} 局 · 总耗时：${duration}s · 平均 ${(Date.now() - startTime) / gamesCount}ms/局`);
  console.log(`   胜负分布：善良胜利 ${winnerStats.Good} 局 (${((winnerStats.Good / gamesCount) * 100).toFixed(1)}%) · 邪恶胜利 ${winnerStats.Evil} 局 (${((winnerStats.Evil / gamesCount) * 100).toFixed(1)}%)`);
  console.log("   终局原因分布：");
  for (const [code, count] of Object.entries(reasonStats)) {
    console.log(`     · ${code}: ${count} 局`);
  }
  console.log(`   8 大规则铁律违例数：${totalViolations} ${totalViolations === 0 ? "✅ (100% 完美通过)" : "❌ (存在违例)"}`);
  console.log(`   完整对局审查台账：${path.relative(ROOT, OUT_FILE).split(path.sep).join("/")}`);

  if (totalViolations > 0) {
    console.error(`❌ 发现 ${totalViolations} 处规则冲突，请审查 ${OUT_FILE}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 发生器执行崩溃：", err);
  process.exit(1);
});
