/**
 * L3.5 不变式测试 - 整夜仿真器
 *
 * 直接编排"队列生成 → 逐节点能力管道执行"，不依赖 NightEngine 内部状态机：
 * - generateDynamicNightQueue 生成夜间队列（与 UI 层同一入口，规则一致）
 * - runFullAbilityPipeline 执行能力（拿到完整 context：meta/aborted/snapshot）
 * - 说书人自动选目标（默认按 targetConfig 随机选合法目标）
 *
 * 相比 UI 层仿真差异（可接受）：
 * - 不模拟"夜间中途动态插入唤醒节点"（守鸦人 ON_DEATH 由 hook 插入），
 *   仿真中死亡角色不会额外唤醒——由 I2 队列合法性不变式兜底断言。
 */
import type { IRoleAbility } from "../../roles/core/roleAbility.types";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "../dynamicQueueGenerator";
import {
  type MiddlewareContext,
  runFullAbilityPipeline,
} from "../middlewarePipeline";
import type { GameStateSnapshot, NightActionNode } from "../nightStateMachine";

/** 单次已执行动作的完整记录 */
export interface ExecutedAction {
  node: NightActionNode;
  targetIds: number[];
  /** 执行前的快照（I11 效果落地校验对比用） */
  prevSnapshot: GameStateSnapshot;
  /** 执行后的完整上下文（含 meta/aborted/snapshot） */
  context: MiddlewareContext;
  /** 执行后的快照 */
  snapshot: GameStateSnapshot;
  /** 是否被中止（preCheck 拦截等） */
  aborted: boolean;
  abortReason?: string;
}

/** 整夜仿真结果 */
export interface NightSimResult {
  initialSnapshot: GameStateSnapshot;
  finalSnapshot: GameStateSnapshot;
  /** 本次生成的夜间队列 */
  queue: NightActionNode[];
  /** 已执行动作（按队列顺序） */
  actions: ExecutedAction[];
  nightCount: number;
  isFirstNight: boolean;
}

export interface SimulateNightOptions {
  nightCount: number;
  fullNightOrder: NightOrderEntry[];
  abilityMap: Record<string, IRoleAbility>;
  /** 自定义目标选择器；默认按 targetConfig 随机选 */
  pickTargets?: (
    node: NightActionNode,
    snapshot: GameStateSnapshot,
    ability: IRoleAbility | null
  ) => number[];
  /** 每执行完一个动作后的回调 */
  onAction?: (action: ExecutedAction, index: number) => void;
  /** 说书人输入（透传给所有动作，供需输入的技能如酿酒师） */
  storytellerInput?: any;
  /** 随机种子（默认 42） */
  seed?: number;
}

/** 可复现随机数生成器（mulberry32） */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 判断座位是否处于"死亡"状态（兼容三种死亡标记）
 *
 * 引擎层不同能力使用不同的死亡标记：
 * - imp: 仅设 markedForDeath（isDead 由 settleDawn 落地）
 * - zombuul/assassin: 直接设 isDead + isAlive=false
 * - 某些能力: 仅设 isAlive=false
 */
function isSeatDead(seat: any): boolean {
  return !!seat.isDead || !!seat.markedForDeath || seat.isAlive === false;
}

/** 默认目标选择器：按 targetConfig 随机选合法目标 */
export function defaultTargetPicker(
  node: NightActionNode,
  snapshot: GameStateSnapshot,
  ability: IRoleAbility | null
): number[] {
  const tc = ability?.targetConfig ?? {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  };
  const rng = createRng(
    (snapshot.nightCount ?? 1) * 1000 + node.seatId * 7 + 1
  );

  const aliveSeats = (snapshot.seats as any[]).filter((s) => {
    if (!tc.allowDead && isSeatDead(s)) return false;
    return true;
  });
  const candidates = aliveSeats.filter((s) => {
    if (!tc.allowSelf && s.id === node.seatId) return false;
    return true;
  });

  const max = Math.min(tc.max ?? 0, candidates.length);
  if (max <= 0) return [];

  const picked = shuffle(candidates, rng)
    .slice(0, max)
    .map((s) => s.id);
  return picked;
}

/** 构造单节点能力执行的中间件上下文 */
export function buildContextForNode(
  snapshot: GameStateSnapshot,
  node: NightActionNode,
  targetIds: number[],
  storytellerInput?: any
): MiddlewareContext {
  return {
    snapshot,
    actionNode: node,
    targetIds,
    storytellerInput,
    meta: {},
    aborted: false,
  };
}

/**
 * 黎明结算（复刻 UI 层 syncStatusEffectsToSeat 契约）
 *
 * 引擎层能力只负责"标记"（markedForDeath=true 或 isAlive=false），
 * isDead 的落地由 UI 层 hook 在夜晚流程中翻译（isDead || markedForDeath || isAlive===false）。
 * 仿真器在每夜结束后执行等价结算，保证与 UI 语义一致。
 */
export function settleDawn(snapshot: GameStateSnapshot): GameStateSnapshot {
  const seats = (snapshot.seats as any[]).map((s) => {
    const marked = !!(s as any).markedForDeath;
    const engineDead = (s as any).isAlive === false;
    const wasDead = !!(s as any).isDead;
    const nowDead = wasDead || marked || engineDead;
    if (nowDead && !wasDead) {
      return { ...s, isDead: true, isAlive: false };
    }
    return { ...s, isAlive: !nowDead };
  });
  return { ...snapshot, seats };
}

/** 执行整夜仿真 */
export async function simulateNight(
  initialSnapshot: GameStateSnapshot,
  options: SimulateNightOptions
): Promise<NightSimResult> {
  const {
    nightCount,
    fullNightOrder,
    abilityMap,
    pickTargets,
    onAction,
    storytellerInput,
  } = options;
  const isFirstNight = nightCount === 1;

  const queue = generateDynamicNightQueue(fullNightOrder, initialSnapshot, {
    isFirstNight,
  });

  let currentSnapshot: GameStateSnapshot = initialSnapshot;
  const actions: ExecutedAction[] = [];

  for (const node of queue) {
    const ability = abilityMap[node.abilityId] ?? null;
    const targetIds = (pickTargets ?? defaultTargetPicker)(
      node,
      currentSnapshot,
      ability
    );

    const context = buildContextForNode(
      currentSnapshot,
      node,
      targetIds,
      storytellerInput
    );
    const result = await runFullAbilityPipeline(
      {
        preCheck: ability?.preCheck,
        calculate: ability?.calculate,
        stateUpdate: ability?.stateUpdate,
        postProcess: ability?.postProcess,
      },
      context
    );

    const action: ExecutedAction = {
      node,
      targetIds,
      prevSnapshot: currentSnapshot,
      context: result,
      snapshot: result.snapshot,
      aborted: result.aborted,
      abortReason: result.abortReason,
    };
    if (onAction) onAction(action, actions.length);
    actions.push(action);
    currentSnapshot = result.snapshot;
  }

  return {
    initialSnapshot,
    finalSnapshot: settleDawn(currentSnapshot),
    queue,
    actions,
    nightCount,
    isFirstNight,
  };
}
