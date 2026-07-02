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
 * 【角色简介】
 *   "僧侣会保护他人免受恶魔侵害。
 *    除首个夜晚以外的每个夜晚，僧侣可以保护除自己以外的任意玩家。
 *    如果恶魔攻击了被僧侣保护的玩家，那名玩家不会死亡。恶魔也不能
 *    再去攻击另一名玩家——当晚会没有任何人死亡。
 *    僧侣无法保护被恶魔提名并处决的玩家。"
 *   → 保护效果由引擎的 protected 状态处理：检测到被保护玩家受到
 *     恶魔攻击时，取消该攻击效果。
 *
 * 【运作方式】
 *   "除首个夜晚以外的每个夜晚，唤醒僧侣。让僧侣指向除自己外的
 *    任意一名玩家。……将僧侣的'保护'提示标记放置在他选择的玩家
 *    角色标记旁。
 *    如果恶魔攻击了标记有'保护'标记的玩家，玩家仍然会存活。
 *    在黎明时，移除'保护'提示标记。"
 *   → 本实现中将 protected 效果的过期时间设为 nightCount + 1，
 *     等效于"持续到黎明。"
 *
 * 【提示标记】
 *   "放置时机：在僧侣夜晚行动并选择了玩家后。
 *    放置条件：在僧侣要保护的玩家角色标记旁放置。僧侣无法保护自己。
 *    若此时僧侣醉酒中毒，不放置该标记。"
 *   → 醉酒/中毒时保护标记不放置，即保护不生效。
 *     但僧侣仍然正常唤醒、正常选择、正常交互。
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
 *   "如果你在晚上成功保护了某个人，你有理由确认他是个善良阵营玩家，
 *    因为恶魔想要他死。"
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（其他夜晚）.json）
 *   序号 24：僧侣 → wakePriority = 24
 *   保护类角色中：
 *     旅店老板 14 < 侍臣 15 < 僧侣 24
 *     （在恶魔行动前生效，确保保护先于攻击判定）
 * ============================================================
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

/** 兼容 snapshot.seats 中各种可能的数据结构 */
interface PlayerLookup {
  id: number;
  isDead: boolean;
  isAlive: boolean;
  playerName?: string;
  role?: { id: string; name: string; type: string };
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：只有存活且未被干扰的僧侣才能提供有效保护。
 * 醉酒/中毒时保护标记不放置，但僧侣仍正常唤醒和选择目标。
 *
 * 注意：只设置 isAbilityActive，不修改 abilityEffective。
 * abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动注入。
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

/**
 * preCheck 第 2 步：非首夜限制
 *
 * 对应规则：僧侣的能力标有 *（每个夜晚*），表示首夜不唤醒。
 */
const otherNightOnlyCheck = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;
  const nightCount = snapshot.nightCount ?? 0;
  const gamePhase = snapshot.gamePhase ?? "";

  if (nightCount === 1 || gamePhase === "firstNight") {
    return {
      ...context,
      aborted: true,
      abortReason: "首夜，僧侣不唤醒",
    };
  }

  return context;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 验证目标选择是否合法。
 *
 * 规则：
 * - 不能选择自己（"僧侣无法保护自己"）
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
 * calculate 阶段：生成僧侣保护结果。
 *
 * 优先级（从高到低）：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖目标 ID
 * 2. storytellerInput.fakeResult       — 说书人预设假目标（醉酒/中毒时）
 * 3. initialNightInfo.monkInfo         — 预置首夜信息（一般不适用）
 * 4. targetIds[0]                      — 玩家正常选择的目标
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件在 calculate
 * 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = context.actionNode.seatId;

  let targetId: number | undefined;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    targetId = storytellerInput.overrideResult as number;
  }
  // 优先级 2：说书人预设假信息（仅能力被干扰时）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    targetId = storytellerInput.fakeResult as number;
  }
  // 优先级 3：预置首夜信息
  else if (meta.initialNightInfo?.monkInfo !== undefined) {
    targetId = meta.initialNightInfo.monkInfo as number;
  }
  // 优先级 4：玩家正常选择的目标
  else {
    targetId = targetIds?.[0];
  }

  if (targetId === undefined || targetId === null) {
    return {
      ...context,
      aborted: true,
      abortReason: "僧侣未选择目标",
    };
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
      },
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：为目标玩家添加保护状态。
 *
 * 对应规则：
 * - "将僧侣的'保护'提示标记放置在他选择的玩家角色标记旁。"
 * - "若此时僧侣醉酒中毒，不放置该标记。"
 *   规则要求僧侣仍然正常唤醒、正常选择目标、正常交互，
 *   只是实际的保护标记不放置（保护不生效）。
 *
 * 实现：
 * - 正常时：为目标 statusEffects 添加 type === "protected"
 * - 醉酒/中毒时：选择仍然记录，但不修改游戏状态（不保护）
 *
 * protected 标记结构：
 *   { type: "protected", source: "monk", sourceSeatId, expiresAtNight }
 *
 * 同一目标上已有的僧侣保护标记会被替换（重新刷新持续时间）。
 *
 * 存储位置：
 * - actionNode.meta.monkResult     — 当前行动节点元数据
 * - snapshot._abilityResults.monk  — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const result = meta.abilityResult as
    | { targetId: number; isProtected: boolean }
    | undefined;

  if (!result) return context;

  const { targetId, isProtected } = result;
  const nightCount = snapshot.nightCount ?? 0;

  // 构建持久化记录
  const record = {
    targetId,
    isProtected: abilityEffective && isProtected,
    nightCount,
    timestamp: Date.now(),
  };

  // 醉酒/中毒：不放置保护标记，但记录选择
  if (!abilityEffective) {
    return {
      ...context,
      actionNode: {
        ...actionNode,
        meta: {
          ...actionNode.meta,
          monkResult: record,
        },
      },
      snapshot: {
        ...snapshot,
        _abilityResults: {
          ...((snapshot as any)._abilityResults ?? {}),
          monk: record,
        },
      },
      meta: {
        ...context.meta,
        monkResult: record,
      },
    };
  }

  // 正常：为目标添加保护效果
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === targetId) {
        const currentEffects = seat.statusEffects ?? [];
        const filteredEffects = currentEffects.filter(
          (e: any) => !(e.type === "protected" && e.source === "monk")
        );
        return {
          ...seat,
          statusEffects: [
            ...filteredEffects,
            {
              type: "protected",
              source: "monk",
              sourceSeatId: actionNode.seatId,
              appliedAtNight: nightCount,
              expiresAtNight: nightCount + 1,
            },
          ],
        };
      }
      return seat;
    }),
    _abilityResults: {
      ...((snapshot as any)._abilityResults ?? {}),
      monk: record,
    },
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...actionNode,
      meta: {
        ...actionNode.meta,
        monkResult: record,
      },
    },
    meta: {
      ...context.meta,
      monkResult: record,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess 阶段：生成日志、说书人提示词、UI 展示数据。
 *
 * 输出内容：
 * 1. console.log   — 英文 simulation log（含干扰标记）
 * 2. meta.prompt   — 说书人看到的唤醒提示词
 * 3. meta.abilityLog — 中文游戏日志
 * 4. meta.displayInfo — UI 消费的结构化数据
 */
const postProcessResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const record = meta.monkResult as
    | { targetId: number; isProtected: boolean; nightCount: number }
    | undefined;

  if (!record) return context;

  const tag = meta.isCorrupted ? "【受干扰】" : "";

  // 查找玩家显示名称
  const findLabel = (seatId: number): string => {
    const seat: PlayerLookup | undefined = context.snapshot.seats.find(
      (s: any) => s.id === seatId
    );
    return seat?.playerName
      ? `${seat.playerName}(${seatId + 1}号)`
      : `${seatId + 1}号`;
  };

  const targetLabel = findLabel(record.targetId);

  // 英文 simulation log
  const simLog = record.isProtected
    ? `[Monk]${tag} Protects: ${targetLabel} (night ${record.nightCount})`
    : `[Monk]${tag} Drunk/poisoned — no protection (target: ${targetLabel})`;

  const selfSeatId = context.actionNode.seatId;

  // 说书人提示词
  const storytellerPrompt = record.isProtected
    ? `唤醒${selfSeatId + 1}号【僧侣】，让他选择一名其他存活玩家进行保护。（选择了${record.targetId + 1}号，今晚恶魔的负面能力对其无效）`
    : `唤醒${selfSeatId + 1}号【僧侣】，让他选择一名其他存活玩家进行保护。（由于醉酒/中毒，保护未生效）`;

  // 中文游戏日志
  const abilityLog = record.isProtected
    ? `僧侣保护了【${targetLabel}】，该玩家今晚免受恶魔负面效果影响`
    : `僧侣${tag}试图保护【${targetLabel}】，但自身醉酒/中毒未生效`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化数据
      displayInfo: {
        type: "monk_protection",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        isProtected: record.isProtected,
        isCorrupted: meta.isCorrupted ?? false,
        nightCount: record.nightCount,
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

  /** 触发时机：每晚（不含首夜，由 otherNightOnlyCheck 阻断） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 对应官方其他夜晚顺序 #24 → wakePriority = 24
   * 在恶魔行动前生效，确保保护先于攻击判定
   */
  firstNightPriority: null,
  otherNightPriority: 24,
  /** 非首夜生效（otherNightOnlyCheck 防御性校验） */
  firstNightOnly: false,
  /** 仅非首夜唤醒（官方规则：僧侣首夜不行动） */
  otherNightOnly: true,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.monk.wake",

  /**
   * 目标选择配置
   * 僧侣需选择一名存活玩家（不能选择自己）进行保护。
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

  /** preCheck：前置条件检查（存活 + 状态标记 + 非首夜） */
  preCheck: [preCheckAliveAndStatus, otherNightOnlyCheck],

  /** calculate：核心效果计算（验证目标 + 支持覆盖） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（目标保护标记 + 双持久化记录） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
