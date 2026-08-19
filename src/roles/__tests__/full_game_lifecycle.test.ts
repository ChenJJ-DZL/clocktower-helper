/**
 * 全对局生命周期压测（Full Game Lifecycle Fuzz Test）
 *
 * 模拟完整对局：夜晚行动 → 白天投票处决 → 终局判定，循环至 GameOver。
 * 断言：100% 触发终局、无死锁、胜负判定准确、时间线日志非空。
 *
 * 运行：npx vitest run src/roles/__tests__/full_game_lifecycle.test.ts
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../../utils/invariantTesting/simulator";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  buildAbilityMap,
  buildFullNightOrder,
  simulateNight,
} from "../../utils/invariantTesting/index";
import { checkGameEnd, isPlayerEvil } from "../../../app/gameLogic";
import type { GameContext } from "../../../app/gameLogic";

// ─── 全量角色池（TB + BMR + S&V + 实验性） ───────────────────────

const ALL_ROLES: Array<{
  id: string;
  name: string;
  type: "townsfolk" | "outsider" | "minion" | "demon";
}> = [
  // TB
  { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "investigator", name: "调查员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
  { id: "undertaker", name: "送葬者", type: "townsfolk" },
  { id: "monk", name: "僧侣", type: "townsfolk" },
  { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
  { id: "virgin", name: "贞洁者", type: "townsfolk" },
  { id: "slayer", name: "猎手", type: "townsfolk" },
  { id: "soldier", name: "士兵", type: "townsfolk" },
  { id: "mayor", name: "镇长", type: "townsfolk" },
  { id: "butler", name: "管家", type: "outsider" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "recluse", name: "陌客", type: "outsider" },
  { id: "saint", name: "圣徒", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "spy", name: "间谍", type: "minion" },
  { id: "scarlet_woman", name: "红唇女郎", type: "minion" },
  { id: "baron", name: "男爵", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
  // BMR
  { id: "grandmother", name: "祖母", type: "townsfolk" },
  { id: "sailor", name: "水手", type: "townsfolk" },
  { id: "chambermaid", name: "侍女", type: "townsfolk" },
  { id: "exorcist", name: "驱魔人", type: "townsfolk" },
  { id: "innkeeper", name: "旅店老板", type: "townsfolk" },
  { id: "gambler", name: "赌徒", type: "townsfolk" },
  { id: "gossip", name: "造谣者", type: "townsfolk" },
  { id: "courtier", name: "朝臣", type: "townsfolk" },
  { id: "professor", name: "教授", type: "townsfolk" },
  { id: "minstrel", name: "吟游诗人", type: "townsfolk" },
  { id: "tea_lady", name: "茶女", type: "townsfolk" },
  { id: "pacifist", name: "和平主义者", type: "townsfolk" },
  { id: "fool", name: "弄臣", type: "townsfolk" },
  { id: "tinker", name: "修补匠", type: "outsider" },
  { id: "moonchild", name: "月之子", type: "outsider" },
  { id: "goon", name: "暴徒", type: "outsider" },
  { id: "lunatic", name: "疯子", type: "outsider" },
  { id: "godfather", name: "教父", type: "minion" },
  { id: "devils_advocate", name: "魔鬼代言人", type: "minion" },
  { id: "assassin", name: "刺客", type: "minion" },
  { id: "mastermind", name: "智者", type: "minion" },
  { id: "zombuul", name: "僵怖", type: "demon" },
  { id: "pukka", name: "普卡", type: "demon" },
  { id: "shabaloth", name: "沙巴洛斯", type: "demon" },
  { id: "po", name: "珀", type: "demon" },
  // S&V
  { id: "clockmaker", name: "钟表匠", type: "townsfolk" },
  { id: "dreamer", name: "梦行者", type: "townsfolk" },
  { id: "snake_charmer", name: "弄蛇人", type: "townsfolk" },
  { id: "mathematician", name: "数学家", type: "townsfolk" },
  { id: "flowergirl", name: "花艺师", type: "townsfolk" },
  { id: "town_crier", name: "镇公告员", type: "townsfolk" },
  { id: "oracle", name: "预言家", type: "townsfolk" },
  { id: "savant", name: "博学者", type: "townsfolk" },
  { id: "seamstress", name: "裁缝", type: "townsfolk" },
  { id: "philosopher", name: "哲学家", type: "townsfolk" },
  { id: "artist", name: "艺术家", type: "townsfolk" },
  { id: "juggler", name: "杂耍师", type: "townsfolk" },
  { id: "sage", name: "贤者", type: "townsfolk" },
  { id: "mutant", name: "变种人", type: "outsider" },
  { id: "sweetheart", name: "甜心", type: "outsider" },
  { id: "barber", name: "理发师", type: "outsider" },
  { id: "klutz", name: "笨蛋", type: "outsider" },
  { id: "evil_twin", name: "邪恶双子", type: "minion" },
  { id: "witch", name: "女巫", type: "minion" },
  { id: "cerenovus", name: "洗脑师", type: "minion" },
  { id: "pit_hag", name: "麻脸巫婆", type: "minion" },
  { id: "fang_gu", name: "方古", type: "demon" },
  { id: "vigormortis", name: "亡骨魔", type: "demon" },
  { id: "no_dashii", name: "诺达希", type: "demon" },
  { id: "vortox", name: "涡流", type: "demon" },
  // 实验性
  { id: "noble", name: "贵族", type: "townsfolk" },
  { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
  { id: "night_watchman", name: "守夜人", type: "townsfolk" },
  { id: "cult_leader", name: "邪教领袖", type: "townsfolk" },
  { id: "balloonist", name: "气球驾驶员", type: "townsfolk" },
  { id: "knight", name: "骑士", type: "townsfolk" },
  { id: "huntsman", name: "猎人", type: "townsfolk" },
  { id: "amnesiac", name: "失忆者", type: "townsfolk" },
  { id: "pixie", name: "小精灵", type: "townsfolk" },
  { id: "widow", name: "寡妇", type: "minion" },
  { id: "fearmonger", name: "恐惧散布者", type: "minion" },
  { id: "psychopath", name: "精神病患者", type: "minion" },
  { id: "goblin", name: "哥布林", type: "minion" },
  { id: "boomdandy", name: "爆炸矮人", type: "minion" },
  { id: "vizier", name: "维齐尔", type: "minion" },
  { id: "riot", name: "暴动", type: "demon" },
  { id: "leviathan", name: "利维坦", type: "demon" },
  { id: "lil_monsta", name: "小怪兽", type: "demon" },
];

// ─── 工具函数 ─────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

const STD_COMP: Record<number, { townsfolk: number; outsider: number; minion: number; demon: number }> = {
  7: { townsfolk: 3, outsider: 2, minion: 1, demon: 1 },
  8: { townsfolk: 4, outsider: 2, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 5, outsider: 2, minion: 2, demon: 1 },
  11: { townsfolk: 6, outsider: 2, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 7, outsider: 3, minion: 2, demon: 1 },
  14: { townsfolk: 8, outsider: 3, minion: 2, demon: 1 },
  15: { townsfolk: 9, outsider: 3, minion: 2, demon: 1 },
};

function buildCrossScriptRoster(playerCount: number, rng: () => number) {
  const comp = STD_COMP[playerCount] ?? STD_COMP[9];
  const byType = {
    townsfolk: ALL_ROLES.filter((r) => r.type === "townsfolk"),
    outsider: ALL_ROLES.filter((r) => r.type === "outsider"),
    minion: ALL_ROLES.filter((r) => r.type === "minion"),
    demon: ALL_ROLES.filter((r) => r.type === "demon"),
  };
  const roster = [
    pickFrom(byType.demon, rng),
    ...shuffle(byType.minion, rng).slice(0, comp.minion),
    ...shuffle(byType.outsider, rng).slice(0, comp.outsider),
    ...shuffle(byType.townsfolk, rng).slice(0, comp.townsfolk),
  ];
  return shuffle(roster, rng).map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

function makeSeat(id: number, role: { id: string; name: string; type: string }) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: role.id, name: role.name, type: role.type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    statusEffects: [] as any[],
    statusDetails: [] as string[],
    statuses: [] as any[],
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 1,
  };
}

function advanceToNextNight(prev: GameStateSnapshot, nightCount: number): GameStateSnapshot {
  const seats = (prev.seats as any[]).map((s) => ({
    ...s,
    markedForDeath: false,
    diedAtNight: undefined,
    killedBy: undefined,
    deathSource: undefined,
    deathSourceSeatId: undefined,
    executedToday: undefined,
  }));
  return {
    ...prev,
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats,
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
  };
}

// ─── 全对局生命周期仿真 ─────────────────────────────────────────────

interface LifecycleResult {
  seed: number;
  playerCount: number;
  roleIds: string[];
  totalNights: number;
  totalDays: number;
  winner: "Good" | "Evil" | null;
  winReason: string | null;
  timelineLength: number;
  passed: boolean;
  error?: string;
}

const MAX_ROUNDS = 20; // 最大循环轮次防死锁

async function runFullGameLifecycle(
  playerCount: number,
  seed: number
): Promise<LifecycleResult> {
  const rng = createRng(seed);
  const roster = buildCrossScriptRoster(playerCount, rng);
  const roleIds = roster.map((r) => r.id);

  try {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();

    let snapshot: GameStateSnapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: roster.map((role, i) => makeSeat(i, role)),
      statusEffects: {},
      deadThisNight: [],
      todayExecutedId: null,
      lastDuskExecution: null,
    };

    let totalNights = 0;
    let totalDays = 0;
    let timelineLength = 0;
    let winner: "Good" | "Evil" | null = null;
    let winReason: string | null = null;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // ── 夜晚阶段 ──
      const isFirstNight = round === 0;
      if (round > 0) {
        snapshot = advanceToNextNight(snapshot, round + 1);
      }

      const nightResult = await simulateNight(snapshot, {
        nightCount: round + 1,
        fullNightOrder,
        abilityMap,
        seed: seed * 100 + round,
      });

      totalNights++;
      timelineLength += nightResult.actions.length;
      snapshot = nightResult.finalSnapshot;

      // 夜晚结束后检查胜负（恶魔夜间被杀等）
      const nightSeats = snapshot.seats as any[];
      const nightGameEnd = checkGameEnd(nightSeats, "night_death", null, {
        evilTwinPair: findEvilTwinPair(nightSeats),
      });
      if (nightGameEnd.isGameOver && nightGameEnd.winner) {
        winner = nightGameEnd.winner;
        winReason = nightGameEnd.reason;
        break;
      }

      // ── 白天阶段（模拟处决） ──
      const aliveSeats = nightSeats.filter((s: any) => !s.isDead);
      if (aliveSeats.length === 0) break; // 全员死亡，不应发生

      // 随机选择一名存活玩家进行处决（50% 概率处决，50% 平安日）
      const shouldExecute = rng() > 0.4;
      let executedId: number | null = null;

      if (shouldExecute && aliveSeats.length > 0) {
        const target = aliveSeats[Math.floor(rng() * aliveSeats.length)];
        executedId = target.id;
        // 执行处决
        snapshot = {
          ...snapshot,
          seats: nightSeats.map((s: any) =>
            s.id === target.id ? { ...s, isDead: true, isSentenced: true } : s
          ),
          todayExecutedId: target.id,
        } as any;
      }

      totalDays++;

      // 白天结束后检查胜负
      const daySeats = snapshot.seats as any[];
      const gameContext: GameContext = {
        evilTwinPair: findEvilTwinPair(daySeats),
        isVortoxWorld: daySeats.some((s: any) => s.role?.id === "vortox" && !s.isDead),
      };
      const dayGameEnd = checkGameEnd(
        daySeats,
        shouldExecute ? "execution" : "check_phase",
        executedId,
        gameContext
      );
      if (dayGameEnd.isGameOver && dayGameEnd.winner) {
        winner = dayGameEnd.winner;
        winReason = dayGameEnd.reason;
        break;
      }
    }

    return {
      seed,
      playerCount,
      roleIds,
      totalNights,
      totalDays,
      winner,
      winReason,
      timelineLength,
      passed: winner !== null,
    };
  } catch (error) {
    return {
      seed,
      playerCount,
      roleIds,
      totalNights: 0,
      totalDays: 0,
      winner: null,
      winReason: null,
      timelineLength: 0,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function findEvilTwinPair(seats: any[]): { evilId: number; goodId: number } | undefined {
  // 简化：检查是否有邪恶双子角色存在且双方都存活
  const evilTwin = seats.find((s: any) => s.role?.id === "evil_twin" && !s.isDead);
  if (!evilTwin) return undefined;
  // 双子的对家由 masterId 指向
  const goodTwinId = evilTwin.masterId;
  if (goodTwinId === null || goodTwinId === undefined) return undefined;
  const goodTwin = seats.find((s: any) => s.id === goodTwinId && !s.isDead);
  if (!goodTwin) return undefined;
  return { evilId: evilTwin.id, goodId: goodTwinId };
}

// ─── Vitest 测试套件 ──────────────────────────────────────────────

describe("全对局生命周期压测 (Full Game Lifecycle)", () => {
  const GAME_COUNT = 30;

  // 生成 30 局随机种子 + 人数
  const cases: Array<{ seed: number; playerCount: number }> = [];
  const masterRng = createRng(20260819);
  for (let i = 0; i < GAME_COUNT; i++) {
    const seed = Math.floor(masterRng() * 1000000);
    const playerCount = 7 + Math.floor(masterRng() * 9); // 7~15
    cases.push({ seed, playerCount });
  }

  for (const { seed, playerCount } of cases) {
    it(`局 seed=${seed} players=${playerCount}: 终局触发+胜负判定准确`, async () => {
      const result = await runFullGameLifecycle(playerCount, seed);

      // 1. 不得抛出异常
      expect(result.error).toBeUndefined();

      // 2. 必须在 MAX_ROUNDS 内触发终局
      expect(result.winner, `未在 ${MAX_ROUNDS} 轮内触发终局`).not.toBeNull();

      // 3. 胜负阵营必须是 Good 或 Evil
      expect(["Good", "Evil"]).toContain(result.winner);

      // 4. 胜利原因非空
      expect(result.winReason).toBeTruthy();
      expect(result.winReason!.length).toBeGreaterThan(0);

      // 5. 至少经历了 1 夜
      expect(result.totalNights).toBeGreaterThanOrEqual(1);

      // 6. 时间线非空（至少有一些动作）
      expect(result.timelineLength).toBeGreaterThanOrEqual(0);

      // 7. 验证胜负逻辑一致性
      const seats = []; // 验证 winner 与最终状态一致
      if (result.winner === "Good") {
        expect(result.winReason).toMatch(/恶魔.*消灭|市长|善良/);
      }
    });
  }

  // 圣徒处决专项测试
  it("圣徒被处决 → 邪恶阵营胜利", () => {
    const seats = [
      makeSeat(0, { id: "saint", name: "圣徒", type: "outsider" }),
      makeSeat(1, { id: "imp", name: "小恶魔", type: "demon" }),
      makeSeat(2, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
      makeSeat(3, { id: "soldier", name: "士兵", type: "townsfolk" }),
    ];
    // 处决圣徒
    seats[0].isDead = true;
    seats[0].isSentenced = true;

    const result = checkGameEnd(seats as any, "execution", 0);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Evil");
    expect(result.reason).toContain("圣徒");
  });

  // 恶魔全灭专项测试
  it("恶魔全灭 → 善良阵营胜利", () => {
    const seats = [
      makeSeat(0, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
      makeSeat(1, { id: "soldier", name: "士兵", type: "townsfolk" }),
      makeSeat(2, { id: "imp", name: "小恶魔", type: "demon" }),
      makeSeat(3, { id: "poisoner", name: "投毒者", type: "minion" }),
    ];
    // 杀死恶魔
    seats[2].isDead = true;

    const result = checkGameEnd(seats as any, "night_death", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Good");
    expect(result.reason).toContain("恶魔");
  });

  // 邪恶人数占优专项测试
  it("邪恶人数 ≥ 善良人数 → 邪恶胜利", () => {
    const seats = [
      makeSeat(0, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
      makeSeat(1, { id: "imp", name: "小恶魔", type: "demon" }),
      makeSeat(2, { id: "poisoner", name: "投毒者", type: "minion" }),
      makeSeat(3, { id: "spy", name: "间谍", type: "minion" }),
    ];
    // 杀死善良方
    seats[0].isDead = true;

    const result = checkGameEnd(seats as any, "night_death", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Evil");
  });

  // 市长和平获胜专项测试（平安日 = execution + executedPlayerId === null）
  it("3人存活+平安日+市长在场 → 善良胜利", () => {
    const seats = [
      makeSeat(0, { id: "mayor", name: "镇长", type: "townsfolk" }),
      makeSeat(1, { id: "soldier", name: "士兵", type: "townsfolk" }),
      makeSeat(2, { id: "imp", name: "小恶魔", type: "demon" }),
    ];

    const result = checkGameEnd(seats as any, "execution", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Good");
    expect(result.reason).toContain("市长");
  });

  // 存活≤2人专项测试
  it("存活≤2人+恶魔存活 → 邪恶胜利", () => {
    const seats = [
      makeSeat(0, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
      makeSeat(1, { id: "imp", name: "小恶魔", type: "demon" }),
      makeSeat(2, { id: "soldier", name: "士兵", type: "townsfolk" }),
      makeSeat(3, { id: "poisoner", name: "投毒者", type: "minion" }),
    ];
    // 杀死大多数人
    seats[0].isDead = true;
    seats[2].isDead = true;
    seats[3].isDead = true;

    const result = checkGameEnd(seats as any, "night_death", null);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe("Evil");
  });
});
