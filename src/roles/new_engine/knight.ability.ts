/**
 * 骑士（Knight）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/镇民.json — 骑士条目）
 * ============================================================
 *
 * 【角色能力】
 *   "在你的首个夜晚，你会得知两名非恶魔玩家。"
 *
 * 【运作方式】
 *   "在为首个夜晚进行准备时，将骑士的'得知'提示标记放置在任意
 *    两名非恶魔玩家的角色标记旁。在首个夜晚，唤醒骑士，并指向
 *    标记有'得知'的两名玩家。让骑士重新入睡。"
 *
 * 【提示标记】
 *   "放置条件：放置在两个非恶魔角色的角色标记旁边。"
 *
 * 【规则细节】
 *   - 得知的玩家可以是镇民、外来者或爪牙，但不会是恶魔
 *   - 骑士仅首夜获得信息，之后不再唤醒
 *   - 醉酒/中毒时：可能得知错误的玩家（包含恶魔）
 *
 * 【特殊交互】
 *   方古（fang_gu）：注册为恶魔，不会被骑士得知。
 *   间谍（spy）：类型为爪牙，可以被骑士得知。
 *   隐士（recluse）：类型为外来者，可以被骑士得知。
 *
 * ============================================================
 * 夜晚顺序（引用自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   序号 65：骑士
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 骑士得知信息的数据结构 */
interface KnightInfo {
  seat1: number;
  seat2: number;
}

/** 兼容的身份数据结构 */
interface PlayerSeat {
  id: number;
  isDead?: boolean;
  isAlive?: boolean;
  role?: { id: string; name: string; type: string };
  effectiveRole?: { id: string; name: string; type: string };
  charadeRole?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

/** 所有恶魔角色ID列表 */
const DEMON_IDS = new Set([
  "fang_gu",
  "vortox",
  "no_dashii",
  "vigormortis",
  "zombuul",
  "shabaloth",
  "po",
  "pukka",
  "imp",
  "legion",
  "leviathan",
  "kazali",
  "lil_monsta",
  "lleech",
  "lord_of_typhon",
  "hadesia",
  "riot",
  "al_hadikhia",
  "yaggababble",
  "poppy_grower",
]);

// ─── 前置校验中间件 ────────────────────────────────────────────────

const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerSeat | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const effects = seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

const firstNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount !== 1 && gamePhase !== "firstNight") {
    return { ...context, aborted: true, abortReason: "非首夜，骑士不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────

/**
 * 获取非恶魔玩家列表（排除自身和死亡玩家）
 * 恶魔包含：type === "demon" 或角色ID在 DEMON_IDS 中
 */
function getNonDemonCandidates(
  seats: PlayerSeat[],
  selfSeatId: number
): PlayerSeat[] {
  return seats.filter((seat) => {
    if (seat.id === selfSeatId || seat.isDead) return false;
    const role = seat.role;
    if (!role) return false;
    if (role.type === "demon" || DEMON_IDS.has(role.id)) return false;
    return true;
  });
}

function generateRealInfo(seats: PlayerSeat[], selfSeatId: number): KnightInfo {
  const candidates = getNonDemonCandidates(seats, selfSeatId);

  if (candidates.length === 0) {
    return { seat1: selfSeatId, seat2: selfSeatId };
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 2);

  return {
    seat1: chosen[0]?.id ?? selfSeatId,
    seat2: chosen[1]?.id ?? chosen[0]?.id ?? selfSeatId,
  };
}

function generateFakeInfo(seats: PlayerSeat[], selfSeatId: number): KnightInfo {
  const others = seats.filter(
    (s: any) => s.id !== selfSeatId && !s.isDead && s.role
  );
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 2);

  return {
    seat1: chosen[0]?.id ?? selfSeatId,
    seat2: chosen[1]?.id ?? chosen[0]?.id ?? selfSeatId,
  };
}

// ─── 信息解析 ─────────────────────────────────────────────────────

function resolveKnightInfo(
  snapshot: any,
  selfSeatId: number,
  abilityEffective: boolean,
  storytellerInput?: any
): KnightInfo {
  if (storytellerInput?.overrideResult) {
    return storytellerInput.overrideResult as KnightInfo;
  }

  return abilityEffective
    ? generateRealInfo(snapshot.seats, selfSeatId)
    : generateFakeInfo(snapshot.seats, selfSeatId);
}

// ─── 计算中间件 ───────────────────────────────────────────────────

const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;

  const selfSeat = snapshot.seats.find((s: any) => s.id === selfSeatId);
  if (!selfSeat) {
    return { ...context, aborted: true, abortReason: "未找到骑士座位" };
  }

  const info = resolveKnightInfo(
    snapshot,
    selfSeatId,
    abilityEffective,
    storytellerInput
  );

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: info,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ───────────────────────────────────────────────

const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as KnightInfo | undefined;
  if (!result) return context;

  const persistedRecord = {
    seat1: result.seat1,
    seat2: result.seat2,
    isCorrupted: meta.isCorrupted ?? false,
    timestamp: Date.now(),
  };

  return {
    ...context,
    actionNode: {
      ...context.actionNode,
      meta: { ...context.actionNode.meta, knightResult: persistedRecord },
    },
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        knight: result,
      },
    },
    meta: { ...context.meta, knightResult: persistedRecord },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────

const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult as KnightInfo | undefined;
  if (!result?.seat1) return context;

  const findLabel = (seatId: number): string => {
    const seat: PlayerSeat | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label1 = findLabel(result.seat1);
  const label2 = findLabel(result.seat2);
  const tag = meta.isCorrupted ? "【受干扰】" : "";
  const selfSeatId = context.actionNode.seatId;

  const simLog = `[Knight]${tag} 非恶魔: ${label1} & ${label2}`;
  const storytellerPrompt = `唤醒${selfSeatId + 1}号【骑士】，告知${result.seat1 + 1}号和${result.seat2 + 1}号不是恶魔。`;
  const abilityLog = `骑士${tag}得知${label1}和${label2}不是恶魔`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "knight_info",
        players: [result.seat1, result.seat2],
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────

export const knightAbility = createRoleAbility({
  roleId: "knight",
  abilityId: "knight_first_night_ability",
  abilityName: "骑士探测",

  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 65,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.knight.wake",

  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },

  preCheck: [preCheckAliveAndStatus, firstNightOnlyCheck],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
