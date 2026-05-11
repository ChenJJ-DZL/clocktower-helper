/**
 * 僧侣（Monk）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 僧侣条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚*，你要选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。"
 *
 * 【运作方式】
 *   "除首个夜晚以外的每个夜晚，唤醒僧侣。让僧侣指向除自己外的任意一名玩家。
 *    （如果僧侣指向自己，摇头表示否定，并让他指向另一名玩家。）让僧侣重新入睡。
 *    将僧侣的'保护'提示标记放置在他选择的玩家角色标记旁。
 *    如果恶魔攻击了标记有'保护'标记的玩家，玩家仍然会存活。
 *    在黎明时，移除'保护'提示标记。"
 *   → 每晚选择一名存活玩家（不能是自己），为其添加 protected 效果。
 *     保护效果持续到黎明，阻止恶魔造成的死亡。
 *
 * 【提示标记】
 *   "放置时机：在僧侣夜晚行动并选择了玩家后。
 *    放置条件：在僧侣要保护的玩家角色标记旁放置。僧侣无法保护自己。
 *    若此时僧侣醉酒中毒，不放置该标记。"
 *   → 醉酒/中毒时保护标记不放置，即保护不生效。
 *
 * 【规则细节】
 *   "僧侣能够保护的有害效果包括：死亡，醉酒，中毒，疯狂，阵营变化，
 *    来自与该玩家（保护目标）阵营不同的恶魔对他进行的角色变化，
 *    涡流的错误信息，等等。"
 *   → 保护效果可防御恶魔的大部分负面影响，核心是阻止死亡。
 *
 *   "僧侣无法保护被恶魔提名并处决的玩家。"
 *   → 保护仅限夜晚，白天处决不受影响。
 *
 * 【提示与技巧（相关片段）】
 *   "你的目标是要去保证还有价值的善良阵营玩家存活并阻止恶魔带来的骚乱。"
 *   "如果你在晚上成功保护了某个人，你有理由确认他是个善良阵营玩家，
 *    因为恶魔想要他死。"
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（其他夜晚）.json）
 *   序号 24：僧侣 → wakePriority = 24
 *   保护类角色中：
 *     旅店老板 14 < 侍臣 15 < 僧侣 24 < 锦衣卫 18
 *     （在恶魔行动前生效，确保保护先于攻击判定）
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface MonkProtectionResult {
  targetId: number;
  isProtected: boolean;
}

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
  role?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：只有存活且未被干扰的僧侣才能提供有效保护。
 * 醉酒/中毒时保护标记不放置，保护效果在 calculate 阶段标记为无效。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === actionNode.seatId
  );

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const effects =
    seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
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

/**
 * preCheck 第 2 步：首夜跳过
 *
 * 对应规则：僧侣的能力标有 *（每个夜晚*），表示首夜不唤醒。
 * 首夜恶魔不会杀人，僧侣无需行动。
 */
const skipFirstNightCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount === 1 || gamePhase === "firstNight") {
    return { ...context, aborted: true, abortReason: "首夜，僧侣不唤醒" };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 验证目标选择是否合法。
 *
 * 规则：
 * - 不能选择自己
 * - 不能选择已死亡玩家
 * - 目标必须存在
 */
function validateTarget(
  targetId: number,
  selfSeatId: number,
  seats: PlayerLookup[]
): string | null {
  if (targetId === selfSeatId) {
    return "僧侣不能保护自己";
  }
  const targetSeat = seats.find((s) => s.id === targetId);
  if (!targetSeat) {
    return "目标玩家不存在";
  }
  if (targetSeat.isDead) {
    return "目标玩家已死亡";
  }
  return null;
}

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：验证僧侣的保护目标
 *
 * 使用 abilityEffective（由 abilityPriorityCalculation 中间件计算）：
 * - true  → 保护正常生效
 * - false → 保护不生效（醉酒/中毒时，不放置保护标记）
 *
 * 对应规则："若此时僧侣醉酒中毒，不放置该标记。"
 */
const calculateTarget = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;
  const targetId = targetIds?.[0];

  if (targetId === undefined || targetId === null) {
    return { ...context, aborted: true, abortReason: "僧侣未选择目标" };
  }

  const validationError = validateTarget(targetId, selfSeatId, snapshot.seats);
  if (validationError) {
    return { ...context, aborted: true, abortReason: validationError };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        targetId,
        isProtected: abilityEffective,
      } as MonkProtectionResult,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：为目标玩家添加 protected 状态效果
 *
 * 对应规则："将僧侣的'保护'提示标记放置在他选择的玩家角色标记旁。"
 * 在目标玩家的 statusEffects 中添加 type: "protected" 效果。
 *
 * 醉酒/中毒时（!abilityEffective），根据规则不放置保护标记。
 * protected 效果的过期时间为当前 nightCount + 1（黎明时由引擎清理）。
 */
const applyProtection = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, targetIds } = context;
  const result = meta.abilityResult as MonkProtectionResult | undefined;
  const targetId = targetIds?.[0];

  if (!result?.isProtected || targetId === undefined) return context;

  const nightCount = snapshot.nightCount ?? 0;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      seats: snapshot.seats.map((seat: any) => {
        if (seat.id === targetId) {
          return {
            ...seat,
            statusEffects: [
              ...(seat.statusEffects ?? []),
              {
                type: "protected",
                source: "monk",
                sourceSeatId: context.actionNode.seatId,
                expiresAtNight: nightCount + 1,
              },
            ],
          };
        }
        return seat;
      }),
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据
 *
 * 输出内容：
 * 1. console.log — 详细 simulation log（含干扰标记 + 保护是否有效）
 * 2. meta.prompt — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, targetIds } = context;
  const targetId = targetIds?.[0];

  if (targetId === undefined) return context;

  const result = meta.abilityResult as MonkProtectionResult | undefined;
  const isProtected = result?.isProtected ?? false;

  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const label = findLabel(targetId);
  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 详细 simulation log
  const simLog = `[Monk]${tag} Protects: ${label} (effective: ${isProtected})`;

  // 说书人提示词
  const storytellerPrompt = isProtected
    ? `僧侣，请睁眼。今晚 ${targetId + 1} 号玩家受到保护，恶魔的负面能力对其无效。`
    : `僧侣，请睁眼。由于醉酒/中毒，今晚无法提供有效保护。`;

  // 中文日志
  const abilityLog = isProtected
    ? `僧侣${tag}保护了 ${label}，该玩家今晚免受恶魔负面效果影响`
    : `僧侣${tag}试图保护 ${label}，但因醉酒/中毒保护未生效`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "monk_protection",
        targetId,
        isProtected,
        isCorrupted: meta.isCorrupted ?? false,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const monkAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "monk",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "monk_night_ability",
  /** 能力中文名 */
  abilityName: "神圣保护",

  /** 触发时机：每个夜晚（不含首夜） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方其他夜晚顺序 #24 → wakePriority = 24
   * 在恶魔行动前生效，确保保护先于攻击判定
   */
  wakePriority: 24,
  /** 非首夜生效 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.monk.wake",

  /**
   * 目标选择配置
   * 僧侣需选择一名存活玩家（不能选择自己）进行保护
   * min: 1, max: 1 — 必须且只能选择一名玩家
   * allowSelf: false — 僧侣不能保护自己（规则明确）
   * allowDead: false — 只能保护存活玩家
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记 + 首夜跳过） */
  preCheck: [preCheckAliveAndStatus, skipFirstNightCheck],

  /** calculate：核心效果计算（验证目标，确定保护是否有效） */
  calculate: [calculateTarget],

  /** stateUpdate：状态持久化（为目标添加 protected 效果） */
  stateUpdate: [applyProtection],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
