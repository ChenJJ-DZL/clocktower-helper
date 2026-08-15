/**
 * L3.5 不变式测试 - 随机对局生成器
 *
 * 固定种子 + 可复现：用 mulberry32 生成"角色组合 + 座位顺序 + 中毒/醉酒注入"，
 * 构造引擎层快照供仿真器消费。同一种子必然产生同一批对局。
 */
import type { GameStateSnapshot } from "../nightStateMachine";
import { createRng } from "./simulator";

/** 暗流涌动角色池（id + 类型），其他剧本可扩展 */
export const TROUBLE_BREWING_ROLES: Array<{
  id: string;
  name: string;
  type: "townsfolk" | "outsider" | "minion" | "demon";
}> = [
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
];

export interface RandomGameConfig {
  /** 玩家数（默认 7，含 1 恶魔 1 爪牙 1 外来者） */
  playerCount?: number;
  /** 运行夜数（默认 2：首夜 + 次夜） */
  nights?: number;
  /** 随机种子（默认 42） */
  seed?: number;
  /** 每夜随机给 0~N 名存活玩家注入中毒效果 */
  poisonPerNight?: number;
  /** 每夜随机给 0~N 名存活玩家注入醉酒效果 */
  drunkPerNight?: number;
  /** 角色池（默认暗流涌动） */
  rolePool?: typeof TROUBLE_BREWING_ROLES;
}

export interface RandomGame {
  seed: number;
  /** 每夜初始快照（首夜快照由 buildInitialSnapshot 给出） */
  snapshots: GameStateSnapshot[];
}

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

/** 按标准配比生成角色组合 */
function buildRoster(
  pool: typeof TROUBLE_BREWING_ROLES,
  playerCount: number,
  rng: () => number
): Array<{ id: string; name: string; type: string }> {
  const demons = pool.filter((r) => r.type === "demon");
  const minions = pool.filter((r) => r.type === "minion");
  const outsiders = pool.filter((r) => r.type === "outsider");
  const townsfolks = pool.filter((r) => r.type === "townsfolk");

  // 1 恶魔 + 1 爪牙 + 1 外来者 + 其余镇民
  const roster = [
    pickFrom(demons, rng),
    pickFrom(minions, rng),
    pickFrom(outsiders, rng),
    ...shuffle(townsfolks, rng).slice(0, Math.max(0, playerCount - 3)),
  ];
  return shuffle(roster, rng).map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

/** 构造一个座位 */
function makeSeat(
  id: number,
  role: { id: string; name: string; type: string },
  overrides: Record<string, any> = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: role.id, name: role.name, type: role.type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...overrides,
  };
}

/** 生成一局随机游戏的每夜初始快照 */
export function generateRandomGame(config: RandomGameConfig = {}): RandomGame {
  const {
    playerCount = 7,
    nights = 2,
    seed = 42,
    poisonPerNight = 1,
    drunkPerNight = 1,
    rolePool = TROUBLE_BREWING_ROLES,
  } = config;

  const rng = createRng(seed);
  const roster = buildRoster(rolePool, playerCount, rng);
  const seats = roster.map((role, i) => makeSeat(i, role));

  const snapshots: GameStateSnapshot[] = [];
  for (let night = 1; night <= nights; night++) {
    // 每夜注入中毒/醉酒的候选：当前存活玩家（seats 已含上一夜死亡标记）
    const aliveCandidates = seats.filter((s) => !s.isDead);
    let poisonTargetId: number | null = null;
    let drunkTargetId: number | null = null;
    if (night > 1 && poisonPerNight > 0 && aliveCandidates.length > 0) {
      poisonTargetId = pickFrom(aliveCandidates, rng).id;
    }
    if (night > 1 && drunkPerNight > 0 && aliveCandidates.length > 0) {
      drunkTargetId = pickFrom(aliveCandidates, rng).id;
    }

    // 每夜基于上一夜存活玩家重建（死亡玩家保持死亡）
    const currentSeats = seats.map((s) => {
      if (s.isDead) return s;
      // 跨夜重置：清空死亡标记，保留永久状态
      const base = { ...s, markedForDeath: false, diedAtNight: undefined, killedBy: undefined, deathSource: undefined, deathSourceSeatId: undefined };
      // 注入中毒/醉酒（作用于存活玩家）
      const effects: any[] = [...(base.statusEffects ?? [])];
      if (poisonTargetId === s.id && !effects.some((e: any) => e.type === "poisoned")) {
        effects.push({ type: "poisoned", source: "invariant_inject", sourceSeatId: -1 });
      }
      if (drunkTargetId === s.id && !effects.some((e: any) => e.type === "drunk")) {
        effects.push({ type: "drunk", source: "invariant_inject", sourceSeatId: -1 });
      }
      base.statusEffects = effects;
      base.isPoisoned = effects.some((e: any) => e.type === "poisoned");
      base.isDrunk = effects.some((e: any) => e.type === "drunk");
      return base;
    });

    const snapshot: GameStateSnapshot = {
      nightCount: night,
      gamePhase: night === 1 ? "firstNight" : "night",
      seats: currentSeats,
      statusEffects: {},
      deadThisNight: [],
      todayExecutedId: null,
      lastDuskExecution: null,
    };
    snapshots.push(snapshot);
  }

  return { seed, snapshots };
}
