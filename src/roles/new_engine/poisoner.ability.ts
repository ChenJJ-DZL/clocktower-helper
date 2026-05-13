/**
 * 投毒者（Poisoner）新引擎技能实现
 *
 * ============================================================
 * 实现依据（引用自 json/full/all_characters.json — 投毒者条目）
 * ============================================================
 *
 * 【角色能力】
 *   "每个夜晚，你要选择一名玩家：他在当晚和明天白天中毒。"
 *
 * 【角色简介】
 *   "投毒者能秘密地干扰其他角色的能力。
 *    每个夜晚，投毒者会选择一名玩家在当晚的剩余时间和接下来的一整个
 *    白天阶段里中毒。
 *    中毒的玩家会失去能力，但说书人会装作他仍具有能力。他的能力不会
 *    真实地影响游戏。为了保证中毒的玩家处于未中毒的幻象中，说书人会
 *    在正确的时间下唤醒他，并如同他未中毒一样走过场来执行他的能力。
 *    如果中毒玩家的角色能力能够获取信息，说书人可以给他提供错误信息。
 *    如果一名中毒的玩家在他中毒的期间里使用了'每局游戏限一次'的能力，
 *    他无法再次使用这项能力。"
 *
 *   → 中毒效果由 abilityPriorityCalculation 中间件统一处理：
 *     被标记为 poisoned 的玩家在后续能力判定时 abilityEffective = false。
 *     本文件仅负责应用中毒状态（stateUpdate）。
 *
 * 【运作方式】
 *   "每个夜晚，唤醒投毒者。让投毒者指向任意一名玩家。被选择的玩家
 *    中毒——将'中毒'提示标记放置在被选择的玩家角色标记旁。让投毒者
 *    重新入睡。
 *    每到黄昏时，中毒玩家会恢复健康——移除他的中毒提示标记。"
 *
 *   → 本实现中将中毒标记的过期时间设为 nightCount + 1，
 *     等效于"持续到次日黄昏"。
 *
 * 【提示标记】
 *   "放置时机：在投毒者夜晚行动并选择了玩家后。
 *    放置条件：在投毒者选择的玩家角色标记旁放置。
 *    若此时投毒者醉酒中毒，不放置该标记。"
 *   → 关键规则：投毒者自身醉酒/中毒时不下毒。
 *     规则要求投毒者仍然正常唤醒、正常选择目标、正常交互，
 *     只是实际的中毒效果不生效（不放置提示标记）。
 *
 * 【规则细节】
 *   "实际上，投毒者的能力描述同样可以写为：
 *    '每个夜晚，你要选择一名玩家：他会中毒到下个黄昏。'"
 *   → 中毒持续到下一个黄昏，而非永久。
 *
 * 【提示与技巧（相关片段）】
 *   "在第一天晚上，如果你不知道毒谁，就毒那个坐在恶魔旁边的人。"
 *   → 投毒者知道恶魔身份，可策略性选择目标。
 *
 * ============================================================
 * 夜晚顺序（引自 json/rule/夜晚行动顺序一览（首夜）.json）
 *   首夜 #30 → wakePriority 10（30 - 20 = 10）
 *   其他夜：nightOrderOverrides index 114 → priority 115
 *   投毒者在爪牙中较早行动，在洗衣妇/共情者/占卜师等
 *   信息类角色之前下毒，确保其当晚获取错误信息。
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
  isAlive?: boolean;
  playerName?: string;
  alignment?: string;
  role?: { id: string; name: string; type: string };
  roleId?: string;
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  isDemonSuccessor?: boolean;
  statusEffects?: Array<{ type: string; source?: string; [key: string]: any }>;
  statuses?: Array<{ effect: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测 + 醉酒/中毒标记
 *
 * 对应规则：投毒者死亡时技能不应触发；自身醉酒/中毒时，
 * "若此时投毒者醉酒中毒，不放置该标记" —— stateUpdate 中
 * 通过 abilityEffective 跳过。
 *
 * 注意：只设置 isAbilityActive，不修改 abilityEffective。
 * abilityEffective 由 abilityPriorityCalculation 中间件在
 * calculate 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、
 * 醉酒/中毒等覆盖）。
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

// ─── 辅助函数 ─────────────────────────────────────────────────────────

// （投毒者逻辑简洁，无需独立辅助函数。保留此段以统一文件结构。）

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate 阶段：生成投毒者下毒结果。
 *
 * 优先级（从高到低）：
 * 1. storytellerInput.overrideResult   — 说书人手动完全覆盖目标 ID
 * 2. storytellerInput.fakeResult       — 说书人预设假目标（醉酒/中毒时）
 * 3. targetIds[0]                      — 玩家正常选择的目标
 *
 * abilityEffective 由 abilityPriorityCalculation 中间件在 calculate
 * 阶段前自动注入（处理 Vortox、咖啡师、酿酒师、醉酒/中毒等覆盖）。
 */
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta, storytellerInput } = context;
  const abilityEffective = meta.abilityEffective ?? true;

  let targetId: number | undefined;

  // 优先级 1：说书人手动完全覆盖
  if (storytellerInput?.overrideResult !== undefined) {
    targetId = storytellerInput.overrideResult as number;
  }
  // 优先级 2：说书人预设假信息（仅能力被干扰时）
  else if (!abilityEffective && storytellerInput?.fakeResult !== undefined) {
    targetId = storytellerInput.fakeResult as number;
  }
  // 优先级 3：玩家正常选择的目标
  else {
    targetId = targetIds?.[0];
  }

  if (targetId === undefined || targetId === null) {
    return {
      ...context,
      aborted: true,
      abortReason: "投毒者未选择目标",
    };
  }

  // 验证目标合法性（存活玩家）
  const targetSeat: PlayerLookup | undefined = snapshot.seats.find(
    (s: any) => s.id === targetId
  );

  if (!targetSeat) {
    return {
      ...context,
      aborted: true,
      abortReason: `目标玩家 ${targetId} 不存在`,
    };
  }

  if (targetSeat.isDead && abilityEffective) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能对死亡玩家下毒",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: targetId,
      isCorrupted: !abilityEffective,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate 阶段：记录投毒者选定的目标。
 *
 * 对应规则：
 * - "每个夜晚，你要选择一名玩家：他在当晚和明天白天中毒。"
 * - "若此时投毒者醉酒中毒，不放置该标记。"
 *   规则要求投毒者仍然正常唤醒、正常选择目标、正常交互，
 *   只是实际的中毒效果不生效（不放置提示标记）。
 *
 * 实现：
 * - 正常时：为目标添加 type === "poisoned" 的状态效果
 * - 醉酒/中毒时：选择仍然记录，但不修改游戏状态（不下毒）
 *
 * 中毒标记结构：
 *   { type: "poisoned", source: "poisoner", sourceSeatId, expiresAtNight }
 *
 * 同一目标上已有的投毒者中毒标记会被替换（重新刷新持续时间）。
 *
 * 存储位置：
 * - actionNode.meta.poisonerResult   — 当前行动节点元数据
 * - snapshot._abilityResults.poisoner — 全局能力结果记录
 */
const stateUpdateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const abilityEffective = meta.abilityEffective ?? true;
  const targetId = meta.abilityResult as number | undefined;

  if (targetId === undefined) return context;

  const currentNight = snapshot.nightCount ?? 0;

  // 构建持久化记录
  const record = {
    targetId,
    poisoned: abilityEffective,
    nightCount: currentNight,
    timestamp: Date.now(),
  };

  // 醉酒/中毒：不下毒，但记录选择
  if (!abilityEffective) {
    return {
      ...context,
      actionNode: {
        ...context.actionNode,
        meta: {
          ...context.actionNode.meta,
          poisonerResult: record,
        },
      },
      snapshot: {
        ...snapshot,
        _abilityResults: {
          ...((snapshot as any)._abilityResults ?? {}),
          poisoner: record,
        },
      },
      meta: {
        ...context.meta,
        poisonerResult: record,
      },
    };
  }

  // 正常：为目标添加中毒效果
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === targetId) {
        const currentEffects = seat.statusEffects ?? [];
        const filteredEffects = currentEffects.filter(
          (e: any) =>
            !(e.type === "poisoned" && e.source === "poisoner")
        );
        return {
          ...seat,
          statusEffects: [
            ...filteredEffects,
            {
              type: "poisoned",
              source: "poisoner",
              sourceSeatId: actionNode.seatId,
              appliedAtNight: currentNight,
              expiresAtNight: currentNight + 1,
            },
          ],
        };
      }
      return seat;
    }),
    _abilityResults: {
      ...((snapshot as any)._abilityResults ?? {}),
      poisoner: record,
    },
  };

  return {
    ...context,
    snapshot: newSnapshot,
    actionNode: {
      ...context.actionNode,
      meta: {
        ...context.actionNode.meta,
        poisonerResult: record,
      },
    },
    meta: {
      ...context.meta,
      poisonerResult: record,
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
  const record = meta.poisonerResult as
    | { targetId: number; poisoned: boolean; nightCount: number }
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
  const simLog = record.poisoned
    ? `[Poisoner]${tag} Poisoned: ${targetLabel} (night ${record.nightCount})`
    : `[Poisoner]${tag} Drunk/poisoned — no poison applied (target: ${targetLabel})`;

  const selfSeatId = context.actionNode.seatId;

  // 说书人提示词
  const storytellerPrompt = record.poisoned
    ? `唤醒${selfSeatId + 1}号【投毒者】，让他选择一名玩家下毒。（已选择${record.targetId + 1}号，该玩家将在今晚和明天白天中毒）`
    : `唤醒${selfSeatId + 1}号【投毒者】，让他选择一名玩家下毒。（由于醉酒/中毒，下毒未生效）`;

  // 中文游戏日志
  const abilityLog = record.poisoned
    ? `投毒者对【${targetLabel}】下了毒`
    : `投毒者${tag}试图下毒【${targetLabel}】，但自身醉酒/中毒未生效`;

  console.log(simLog);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
      // 为 NightEngine / UI 提供标准化数据
      displayInfo: {
        type: "poisoner_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        poisoned: record.poisoned,
        isCorrupted: meta.isCorrupted ?? false,
        nightCount: record.nightCount,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const poisonerAbility = createRoleAbility({
  /** 角色标识符，对应 app/data.ts 中 Role.id */
  roleId: "poisoner",
  /** 能力标识符，用于 abilityRegistry 注册 */
  abilityId: "poisoner_night_ability",
  /** 能力中文名 */
  abilityName: "致命毒药",

  /** 触发时机：每晚（首夜 + 其他夜） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /**
   * 唤醒优先级（越小越先唤醒）
   * 首夜 #30 → wakePriority 10（30 - 20 = 10）
   * 其他夜：nightOrderOverrides index 114 → priority 115
   * 投毒者在信息类角色之前行动，确保信息类当晚获取错误信息。
   */
  wakePriority: 10,
  /** 每晚都唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID，对应 promptDictionary.ts */
  wakePromptId: "role.poisoner.wake",

  /**
   * 目标选择配置
   * 投毒者每晚必须选择一名存活玩家下毒。
   * min: 1, max: 1 — 必须选恰好一名
   * allowSelf: false — 不能对自己下毒（规则未提及可自毒）
   * allowDead: false — 不能对死亡玩家下毒（规则："指向任意一名玩家"隐含存活）
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },

  // ── 中间件管道 ──────────────────────────────────────────────────────
  // Pipeline 执行顺序：preCheck → calculate → stateUpdate → postProcess

  /** preCheck：前置条件检查（存活 + 状态标记） */
  preCheck: [preCheckAliveAndStatus],

  /** calculate：核心效果计算（验证目标合法性 + 支持覆盖） */
  calculate: [calculateResult],

  /** stateUpdate：状态持久化（目标中毒标记 + 双持久化记录） */
  stateUpdate: [stateUpdateResult],

  /** postProcess：后处理（日志 + 提示词 + UI 数据） */
  postProcess: [postProcessResult],
});
