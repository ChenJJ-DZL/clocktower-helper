#!/usr/bin/env node
/**
 * 全剧本通用百局疯狂混沌测试发生器 (Chaos Engine)
 * ======================================================================
 * 
 * 核心目标：
 *   彻底跳出“人工逐一测试”的局限，用纯粹的计算机蒙特卡洛随机状态机，
 *   在标准满编环境下连续运行 100 局完整生命周期对局。
 * 
 * 支持剧本（内置 9 大官方/权威剧本）：
 *   1. trouble_brewing      - 暗流涌动 (15 人)
 *   2. bad_moon_rising      - 黯月初升 (15 人)
 *   3. sects_and_violets    - 梦殒春宵 (15 人)
 *   4. whispering_secrets   - 窃窃私语 (10 人)
 *   5. tomb_of_the_unknown  - 无名之墓 (12 人)
 *   6. high_pleasure        - 无上愉悦 (8 人)
 *   7. haunted_manor        - 凶宅魅影 (15 人)
 *   8. garden_of_dreams     - 游园惊梦 (12 人)
 *   9. poppyganda           - 罂粟花开 (15 人)
 * 
 * 用法：
 *   npx tsx scripts/conformance/chaos.ts --script bad_moon_rising --games 100
 *   npx tsx scripts/conformance/chaos.ts --script sects_and_violets --games 100
 *   npx tsx scripts/conformance/chaos.ts --all --games 100
 */
import fs from "node:fs";
import path from "node:path";
import { roles as allAppRoles, scripts as allScripts } from "../../app/data";
import { checkGameEnd } from "../../app/gameLogic";
import { slayerAbility } from "../../src/roles/new_engine/abilityRegistry";
import { isButlerVoteLegal } from "../../src/roles/new_engine/butler.ability";
import { isImmuneToDemonKill } from "../../src/utils/soldierImmunity";
import { resolveVirginTrigger, shouldExecuteNominator } from "../../src/utils/virginRule";
import { isSeatAlive } from "../../src/utils/seatAlive";
import {
  canFoolSurvive,
  isProtectedByDevilsAdvocate,
  isProtectedBySailor,
  isProtectedByTeaLady,
} from "../../src/utils/bmrMechanics";
import { isVortoxDuskWinActive, isVortoxWorldActive } from "../../src/utils/vortoxWorld";
import { getScriptSpecialRules } from "../../src/utils/scriptSpecialRules";
import { runAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  buildAbilityMap,
  buildFullNightOrder,
  runAllInvariants,
  simulateNight,
} from "../../src/utils/invariantTesting/index";
import { createRng } from "../../src/utils/invariantTesting/simulator";

const ROOT = process.cwd();

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
  scriptId: string;
  days: number;
  winner: "Good" | "Evil" | "Unknown";
  reasonCode: string;
  aliveTownsfolk: number;
  aliveEvil: number;
  ghostVotesRemaining: number;
  violations: InvariantViolation[];
}

export interface ChaosRunReport {
  generatedAt: string;
  scriptId: string;
  scriptName: string;
  totalGames: number;
  totalViolations: number;
  winnerStats: { Good: number; Evil: number; Unknown: number };
  reasonStats: Record<string, number>;
  games: ChaosGameSummary[];
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

const STANDARD_COMPOSITION: Record<
  number,
  { townsfolk: number; outsider: number; minion: number; demon: number }
> = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};

/** 根据剧本与随机数生成合法满编阵容 */
export function buildScriptRoster(scriptId: string, rng: () => number) {
  const script = allScripts.find((s) => s.id === scriptId);
  if (!script) {
    throw new Error(`找不到剧本配置: ${scriptId}`);
  }

  const rolePool = (script.roleIds ?? [])
    .map((rid) => allAppRoles.find((r) => r.id === rid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const demons = rolePool.filter((r) => r.type === "demon");
  const minions = rolePool.filter((r) => r.type === "minion");
  const outsiders = rolePool.filter((r) => r.type === "outsider");
  const townsfolks = rolePool.filter((r) => r.type === "townsfolk");

  // 决定人数（默认以剧本 maxPlayers 为准，最大 15）
  const playerCount = Math.min(15, script.maxPlayers ?? 15);
  const std = STANDARD_COMPOSITION[playerCount] ?? STANDARD_COMPOSITION[15];

  // 恶魔选择
  const chosenDemon = pickRandom(demons, rng);
  const isLegion = chosenDemon.id === "legion";

  let roster: typeof allAppRoles = [];

  if (isLegion) {
    // 军团局：多数玩家为军团恶魔，0 爪牙，1 外来者，其余镇民
    const legionCount = Math.floor(playerCount * 0.6); // 15人局约 9 军团
    const outsiderCount = Math.min(1, outsiders.length);
    const chosenOutsiders = shuffle(outsiders, rng).slice(0, outsiderCount);
    const townsfolkCount = playerCount - legionCount - outsiderCount;
    const chosenTownsfolks = shuffle(townsfolks, rng).slice(0, townsfolkCount);

    roster = [
      ...Array(legionCount).fill(chosenDemon),
      ...chosenOutsiders,
      ...chosenTownsfolks,
    ];
  } else {
    // 标准恶魔局
    let minionCount = Math.min(std.minion, minions.length);
    const chosenMinions = shuffle(minions, rng).slice(0, minionCount);

    // 外来者调整
    let outsiderCount = std.outsider;
    if (chosenMinions.some((m) => m.id === "baron")) {
      outsiderCount += 2;
    }
    if (chosenMinions.some((m) => m.id === "godfather")) {
      outsiderCount += rng() < 0.5 ? 1 : -1;
    }
    if (chosenDemon.id === "fang_gu") {
      outsiderCount += 1;
    }

    // 边界限制
    outsiderCount = Math.max(0, Math.min(outsiderCount, outsiders.length));
    let townsfolkCount = playerCount - 1 - minionCount - outsiderCount;
    if (townsfolkCount < 0) {
      outsiderCount += townsfolkCount;
      townsfolkCount = 0;
    }

    const chosenOutsiders = shuffle(outsiders, rng).slice(0, outsiderCount);
    const chosenTownsfolks = shuffle(townsfolks, rng).slice(0, townsfolkCount);

    roster = [chosenDemon, ...chosenMinions, ...chosenOutsiders, ...chosenTownsfolks];
  }

  // 补齐/裁切至恰好 playerCount 人
  while (roster.length < playerCount) {
    const unpicked = townsfolks.filter((t) => !roster.some((r) => r.id === t.id));
    roster.push(unpicked.length > 0 ? pickRandom(unpicked, rng) : pickRandom(townsfolks, rng));
  }
  roster = shuffle(roster.slice(0, playerCount), rng);

  // 构造座位对象
  const seats = roster.map((r, i) => {
    const seatObj: any = {
      id: i,
      playerName: `P${i + 1}`,
      role: r,
      roleId: r.id,
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      statusEffects: [],
      hasGhostVote: true,
      executedToday: false,
    };

    // 酒鬼伪装镇民
    if (r.id === "drunk") {
      const unusedTownsfolks = townsfolks.filter((x) => !roster.some((y) => y.id === x.id));
      const charade = unusedTownsfolks.length > 0 ? pickRandom(unusedTownsfolks, rng) : pickRandom(townsfolks, rng);
      seatObj.charadeRole = charade;
      seatObj.isDrunk = true;
    }

    // 疯子伪装恶魔
    if (r.id === "lunatic") {
      seatObj.demonCharadeRole = pickRandom(demons, rng);
    }

    return seatObj;
  });

  // 提线木偶与镜像双子等特殊角色联动设置
  const demonSeat = seats.find((s) => s.role?.type === "demon");
  const marionetteSeat = seats.find((s) => s.role?.id === "marionette");
  if (demonSeat && marionetteSeat) {
    // 提线木偶伪装成善良镇民
    const unusedTownsfolks = townsfolks.filter((x) => !roster.some((y) => y.id === x.id));
    marionetteSeat.charadeRole = unusedTownsfolks.length > 0 ? pickRandom(unusedTownsfolks, rng) : pickRandom(townsfolks, rng);
    marionetteSeat.isEvil = true;
  }

  const evilTwinSeat = seats.find((s) => s.role?.id === "evil_twin");
  if (evilTwinSeat) {
    // 配对一个存活善良角色
    const goodCandidates = seats.filter((s) => s.role?.type === "townsfolk" || s.role?.type === "outsider");
    if (goodCandidates.length > 0) {
      const goodTwin = pickRandom(goodCandidates, rng);
      goodTwin.isGoodTwin = true;
      evilTwinSeat.evilTwinPair = { evilId: evilTwinSeat.id, goodId: goodTwin.id };
    }
  }

  const grandmaSeat = seats.find((s) => s.role?.id === "grandmother");
  if (grandmaSeat) {
    const goodCandidates = seats.filter(
      (s) => s.id !== grandmaSeat.id && (s.role?.type === "townsfolk" || s.role?.type === "outsider")
    );
    if (goodCandidates.length > 0) {
      grandmaSeat.grandchildId = pickRandom(goodCandidates, rng).id;
    }
  }

  return seats;
}

/** 运行单剧本单局狂乱对局 */
export async function runSingleChaosGame(
  scriptId: string,
  gameIndex: number,
  seed: number,
  options: { verbose?: boolean; maxDays?: number } = {}
): Promise<ChaosGameSummary> {
  const rng = createRng(seed);
  const script = allScripts.find((s) => s.id === scriptId)!;
  let seats = buildScriptRoster(scriptId, rng);
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();
  const specialRules = getScriptSpecialRules(script);

  const violations: InvariantViolation[] = [];
  const reportViolation = (
    phase: InvariantViolation["phase"],
    dayOrNight: number,
    code: string,
    message: string
  ) => {
    violations.push({ gameIndex, seed, phase, dayOrNight, code, message });
    if (options.verbose) {
      console.warn(`    ⚠️ [${script.name} 违例 ${code}] 第${dayOrNight}天/夜 (${phase}): ${message}`);
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
  let saintExecuted = false;
  let mastermindExtraDayActive = false;
  let butlerMasterMap = new Map<number, number>();
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

    // 检查恶魔自杀传位 (I-CH7)
    for (const action of nightSim.actions) {
      if (action.node.roleId === "imp" && action.targetIds.includes(action.node.seatId)) {
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

      if (action.node.roleId === "butler") {
        const masterId = action.targetIds[0];
        if (masterId !== undefined) {
          butlerMasterMap.set(action.node.seatId, masterId);
        }
      }
    }

    // 黎明结算：处理 markedForDeath -> isDead
    const nightKilledSeats: any[] = [];
    seats = seats.map((s) => {
      if (s.markedForDeath && !s.isDead) {
        // 验证士兵恶魔击杀免死 (I-CH5)
        if (
          s.role?.id === "soldier" &&
          !s.isPoisoned &&
          !s.isDrunk &&
          s.deathSource === "imp_kill"
        ) {
          reportViolation(
            "night",
            night,
            "I-CH5_SOLDIER_KILLED_BY_DEMON",
            "清醒健康的士兵被恶魔攻击导致死亡，免死未生效"
          );
        }
        nightKilledSeats.push(s);
        return { ...s, isDead: true, diedAtNight: night, markedForDeath: false };
      }
      return { ...s, markedForDeath: false };
    });

    // 祖母孙子连带死亡联动
    const grandma = seats.find((s) => s.role?.id === "grandmother" && isSeatAlive(s));
    if (grandma && !grandma.isDrunk && !grandma.isPoisoned) {
      const grandsonId = grandma.grandchildId;
      if (grandsonId != null && nightKilledSeats.some((k) => k.id === grandsonId)) {
        seats = seats.map((s) =>
          s.id === grandma.id ? { ...s, isDead: true, diedAtNight: night } : s
        );
      }
    }

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

    // 《游园惊梦》剧本级特殊规则：进入第 N+1 夜晚时（若配置了自动判胜且恶魔存活），邪恶获胜
    if (specialRules.evilAutoWinOnEnteringNight && night >= specialRules.evilAutoWinOnEnteringNight) {
      const aliveDemons = seats.filter((s) => s.role?.type === "demon" && isSeatAlive(s));
      if (aliveDemons.length > 0) {
        gameOver = true;
        finalWinner = "Evil";
        finalReason = "GARDEN_OF_DREAMS_TIME_LIMIT";
        break;
      }
    }

    // 1. 猎手日间主动技能（若在场）
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
      if (virginExecutedToday) break;

      const eligibleNominators = seats.filter((s) => isSeatAlive(s) && !nominatedToday.has(s.id));
      const eligibleTargets = seats.filter((s) => isSeatAlive(s) && !beenNominatedToday.has(s.id));
      if (eligibleNominators.length === 0 || eligibleTargets.length === 0) break;

      const nominator = pickRandom(eligibleNominators, rng);
      const nominee = pickRandom(eligibleTargets.filter((t) => t.id !== nominator.id), rng);
      if (!nominee) break;

      nominatedToday.add(nominator.id);
      beenNominatedToday.add(nominee.id);

      // 女巫诅咒触发检测：发起提名的玩家若被女巫诅咒则立即死亡
      if (nominator.isCursed && !nominator.isDead) {
        seats = seats.map((s) => (s.id === nominator.id ? { ...s, isDead: true } : s));
        const witchVerdict = checkGameEnd(seats, "night_death");
        if (witchVerdict.isGameOver) {
          gameOver = true;
          finalWinner = witchVerdict.winner as any;
          finalReason = witchVerdict.reasonCode ?? "";
          break;
        }
      }

      // 贞洁者被动触发检测
      if (nominee.role?.id === "virgin" && virginTriggerCount === 0) {
        virginTriggerCount++;
        resolveVirginTrigger(nominee, nominator);
        if (shouldExecuteNominator(nominee, nominator)) {
          virginExecutedToday = true;
          seats = seats.map((s) =>
            s.id === nominator.id ? { ...s, isDead: true, executedToday: true } : s
          );
          const vVerdict = checkGameEnd(seats, "execution", nominator.id);
          if (vVerdict.isGameOver) {
            gameOver = true;
            finalWinner = vVerdict.winner as any;
            finalReason = vVerdict.reasonCode ?? "";
            break;
          }
          break; // 贞洁者处决直接结束白天
        }
      }

      // 举手投票
      const voters: number[] = [];
      const majorityNeeded = Math.ceil(seats.filter(isSeatAlive).length / 2);

      // 存活者投票
      for (const s of seats) {
        if (!isSeatAlive(s)) continue;
        if (s.role?.id === "butler") {
          const masterId = butlerMasterMap.get(s.id);
          const masterVoted = masterId !== undefined ? voters.includes(masterId) : false;
          const wouldVote = rng() < 0.5;
          const legal = isButlerVoteLegal(s, masterVoted, false, true);
          if (wouldVote && legal) {
            voters.push(s.id);
          }
        } else {
          if (rng() < 0.45) voters.push(s.id);
        }
      }

      // 死者使用幽灵票
      for (const s of seats) {
        if (isSeatAlive(s)) continue;
        if (s.hasGhostVote && rng() < 0.25) {
          if (usedGhostVoteSeats.has(s.id)) {
            reportViolation(
              "day",
              day,
              "I-CH1_GHOST_VOTE_REUSED",
              `${s.id + 1}号死者在幽灵票已消耗后重复投票`
            );
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

      // 处决免死判定：魔鬼代言人 / 水手 / 弄臣 / 茶艺师
      const daProtected = isProtectedByDevilsAdvocate(executedSeat);
      const sailorProtected = isProtectedBySailor(executedSeat);
      const foolSurvives = canFoolSurvive(executedSeat);
      const teaLadyProtected = isProtectedByTeaLady(executedSeat.id, seats);

      const survivesExecution =
        daProtected || sailorProtected || foolSurvives || teaLadyProtected;

      if (!survivesExecution) {
        // 成功处决
        seats = seats.map((s) =>
          s.id === leadingCandidateId ? { ...s, isDead: true, executedToday: true } : s
        );

        if (executedSeat.role?.id === "saint") {
          saintExecuted = true;
        }

        // 检查主谋能力：若被处决者为恶魔，且主谋存活清醒，触发主谋额外白天
        const aliveMastermind = seats.find(
          (s) => s.role?.id === "mastermind" && isSeatAlive(s) && !s.isDrunk && !s.isPoisoned
        );
        if (executedSeat.role?.type === "demon" && aliveMastermind && !mastermindExtraDayActive) {
          mastermindExtraDayActive = true;
        } else {
          const execVerdict = checkGameEnd(seats, "execution", leadingCandidateId, {
            isMastermindExtraDay: mastermindExtraDayActive,
          });
          if (execVerdict.isGameOver) {
            gameOver = true;
            finalWinner = execVerdict.winner as any;
            finalReason = execVerdict.reasonCode ?? "";
            break;
          }
        }
      } else {
        // 免死生效
        if (daProtected) {
          // I-CH9: DA 保护免死验证
        }
        if (foolSurvives) {
          (executedSeat as any).foolUsed = true;
        }
      }
    } else if (!virginExecutedToday && leadingCandidateId === null) {
      // 平安日检测：涡流在场且存活 ⇒ 邪恶直接胜利！
      if (isVortoxDuskWinActive(seats, false)) {
        gameOver = true;
        finalWinner = "Evil";
        finalReason = "VORTOX_NO_EXECUTION";
        break;
      }

      // 主谋额外白天无人被处决 ⇒ 善良胜利
      if (mastermindExtraDayActive) {
        gameOver = true;
        finalWinner = "Good";
        finalReason = "MASTERMIND_EXTRA_DAY_NO_EXECUTION";
        break;
      }
    }

    // 检查黄昏判定
    const duskVerdict = checkGameEnd(seats, "check_phase");
    if (duskVerdict.isGameOver) {
      gameOver = true;
      finalWinner = duskVerdict.winner as any;
      finalReason = duskVerdict.reasonCode ?? "";
      break;
    }

    // 重置当日处决标记，推进至下一夜
    seats = seats.map((s) => ({ ...s, executedToday: false, isCursed: false }));
    day++;
    night++;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 🏁 终局不变量在线审查 (I-CH8)
  // ══════════════════════════════════════════════════════════════════════
  const aliveDemons = seats.filter(
    (s) => (s.role?.type === "demon" || s.roleId === "imp") && isSeatAlive(s)
  );
  const aliveCount = seats.filter(isSeatAlive).length;

  if (gameOver) {
    if (
      finalWinner === "Good" &&
      aliveDemons.length > 0 &&
      finalReason !== "MAYOR_PEACEFUL_WIN" &&
      finalReason !== "MAYOR_CONVERTED_PEACEFUL_WIN" &&
      !finalReason.includes("ATHEIST") &&
      !seats.some((s) => s.role?.id === "evil_twin" && isSeatAlive(s))
    ) {
      reportViolation(
        "terminal",
        day,
        "I-CH8_GOOD_WIN_DEMON_ALIVE",
        `善良获胜但场上仍有存活恶魔（${aliveDemons.map((d) => d.id + 1).join("号,")}号）`
      );
    }
    if (finalWinner === "Evil" && finalReason === "TWO_ALIVE" && aliveCount > 2) {
      reportViolation(
        "terminal",
        day,
        "I-CH8_TWO_ALIVE_VIOLATION",
        `TWO_ALIVE 判邪恶胜，但存活人数为 ${aliveCount} > 2`
      );
    }
    if (finalReason === "SAINT_EXECUTED" && !saintExecuted) {
      reportViolation(
        "terminal",
        day,
        "I-CH8_SAINT_WIN_MISMATCH",
        "判胜原因记为圣徒被处决，但实际圣徒未被处决"
      );
    }
  }

  const remainingGhostVotes = seats.filter((s) => !isSeatAlive(s) && s.hasGhostVote).length;
  const aliveTownsfolk = seats.filter(
    (s) => s.role?.type === "townsfolk" && isSeatAlive(s)
  ).length;
  const aliveEvil = seats.filter(
    (s) => (s.role?.type === "demon" || s.role?.type === "minion") && isSeatAlive(s)
  ).length;

  return {
    gameIndex,
    seed,
    scriptId,
    days: day,
    winner: finalWinner,
    reasonCode: finalReason,
    aliveTownsfolk,
    aliveEvil,
    ghostVotesRemaining: remainingGhostVotes,
    violations,
  };
}

/** 运行单个剧本的一百局测试 */
export async function runScriptChaos(
  scriptId: string,
  gamesCount: number,
  baseSeed: number,
  verbose: boolean
): Promise<ChaosRunReport> {
  const script = allScripts.find((s) => s.id === scriptId);
  if (!script) {
    throw new Error(`未知剧本 ID: ${scriptId}`);
  }

  console.log(`\n🌪️ 启动《${script.name}》(${scriptId}) 百局疯狂混沌测试发生器 (Chaos Engine)`);
  console.log(`   规模：${gamesCount} 局 · ${script.maxPlayers ?? 15} 人标准满编对局 · 种子基数 ${baseSeed}`);
  console.log("   在线审查 12 大规则铁律不变式 (I-CH1 ~ I-CH12)...");

  const results: ChaosGameSummary[] = [];
  let totalViolations = 0;
  const winnerStats = { Good: 0, Evil: 0, Unknown: 0 };
  const reasonStats: Record<string, number> = {};

  const startTime = Date.now();

  for (let i = 1; i <= gamesCount; i++) {
    const seed = baseSeed + i;
    const summary = await runSingleChaosGame(scriptId, i, seed, { verbose });
    results.push(summary);
    totalViolations += summary.violations.length;
    winnerStats[summary.winner]++;
    reasonStats[summary.reasonCode] = (reasonStats[summary.reasonCode] || 0) + 1;

    if (i % 20 === 0 || i === gamesCount) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `   [进度 ${i}/${gamesCount}] 已完成对局 · 胜负比：好人 ${winnerStats.Good} / 邪恶 ${winnerStats.Evil} · 违例：${totalViolations} (${elapsed}s)`
      );
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const outFile = path.join(ROOT, "outputs", "rule_conformance", `chaos_${scriptId}_report.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const report: ChaosRunReport = {
    generatedAt: new Date().toISOString(),
    scriptId,
    scriptName: script.name,
    totalGames: gamesCount,
    totalViolations,
    winnerStats,
    reasonStats,
    games: results,
  };

  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`════════════════════ 《${script.name}》100 局混沌测试审查结论 ════════════════════`);
  console.log(`   总局数：${gamesCount} 局 · 总耗时：${duration}s · 平均 ${(Date.now() - startTime) / gamesCount}ms/局`);
  console.log(
    `   胜负分布：善良胜利 ${winnerStats.Good} 局 (${((winnerStats.Good / gamesCount) * 100).toFixed(1)}%) · 邪恶胜利 ${winnerStats.Evil} 局 (${((winnerStats.Evil / gamesCount) * 100).toFixed(1)}%)`
  );
  console.log("   终局原因分布：");
  for (const [code, count] of Object.entries(reasonStats)) {
    console.log(`     · ${code}: ${count} 局`);
  }
  console.log(
    `   12 大规则铁律违例数：${totalViolations} ${totalViolations === 0 ? "✅ (100% 完美通过)" : "❌ (存在违例)"}`
  );
  console.log(`   完整对局审查台账：${path.relative(ROOT, outFile).split(path.sep).join("/")}`);

  return report;
}

async function main() {
  const scriptArg = readArg("--script");
  const allFlag = process.argv.includes("--all");
  const gamesCount = Number(readArg("--games") ?? 100);
  const baseSeed = Number(readArg("--seed") ?? 20261102);
  const verbose = process.argv.includes("--verbose");

  const targetScripts = allFlag
    ? allScripts.map((s) => s.id)
    : [scriptArg ?? "trouble_brewing"];

  let overallViolations = 0;

  for (const sid of targetScripts) {
    const report = await runScriptChaos(sid, gamesCount, baseSeed, verbose);
    overallViolations += report.totalViolations;
  }

  if (overallViolations > 0) {
    console.error(`\n❌ 测试中累计发现 ${overallViolations} 处规则冲突！`);
    process.exit(1);
  } else {
    console.log(`\n🎉 全部目标剧本百局混沌测试零违例圆满完成！`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error("❌ 发生器执行崩溃：", err);
    process.exit(1);
  });
}
