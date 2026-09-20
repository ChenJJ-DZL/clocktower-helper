/**
 * 开局人数配比 · 唯一事实来源（含男爵 +2 外来者调整）
 *
 * ============================================================
 * P0-10 事故（2026-09-20）
 * ============================================================
 * 三方各自实现「男爵 +2 外来者」，互不知情：
 *   ① `new_engine/baron.ability.ts` —— 算出 `displayInfo.type = "baron_setup_adjustment"`
 *      写进 `snapshot.setupConfig`，**生产 setup UI 从不读**
 *      （全仓唯一消费方是它自己写的 `baronAdjusted:true`）
 *   ② `utils/quickStartGenerator.ts:151` —— **静默改名单**（外来者 +N、镇民 -N）
 *   ③ setup UI —— 完全不检查
 *
 * 后果：一旦外来者池不足，会被**悄悄少配**且无任何提示 →
 *   开出来的局面人数配比与官方不符，说书人直到游戏中途才发现。
 *
 * ⇒ 收敛：**配比计算与调整全走本文件**，任何路径不得再自行增减。
 */

/** 单人角色类别的数量 */
export interface RoleCounts {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

/** 官方标准人数配比表（5~15 人） */
export const STANDARD_COMPOSITIONS: Record<number, RoleCounts> = {
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

/** setup 配比计算结果（含调整详情与告警） */
export interface SetupCompositionResult {
  /** 最终配比（已应用全部调整） */
  counts: RoleCounts;
  /** 是否应用了男爵调整 */
  baronAdjusted: boolean;
  /** 男爵实际新增的外来者数（可能 < 2，若池子不足） */
  baronAddedOutsiders: number;
  /** 男爵实际移除的镇民数（= baronAddedOutsiders） */
  baronRemovedTownsfolk: number;
  /**
   * ⚠️ 配比告警（非空 = 局面与官方不符，UI **必须展示**给说书人）
   */
  warnings: string[];
}

/** 男爵调整意图 */
export interface BaronAdjustmentInput {
  /** 男爵是否在场 */
  baronInPlay: boolean;
  /** 外来者角色池可用数量（用于判断能否补足 +2） */
  availableOutsiderPool: number;
}

/**
 * 计算最终开局配比（**唯一入口**）。
 *
 * 官方（男爵）：「增加的外来者角色总是会**替换掉原本的镇民**角色」
 *   【范例】7 人局：3 镇民 + 2 外来者 + 1 爪牙 + 1 恶魔。
 *   【范例】15 人局：原本 9 镇民 + 2 外来者 → 加 1 酒鬼 + 1 陌客，
 *            "说书人移除了僧侣标记来添加陌客标记"（镇民 -1、外来者 +1）。
 *   相克：异端分子在场时，男爵可能只增加**一个**而非两个外来者。
 */
export function computeSetupComposition(
  playerCount: number,
  input: BaronAdjustmentInput
): SetupCompositionResult {
  const base =
    STANDARD_COMPOSITIONS[playerCount] ??
    // 非常规人数（<5 或 >15，如自定义局）：按比例估算，但必须告警
    {
      townsfolk: Math.max(1, playerCount - 3),
      outsider: playerCount >= 9 ? 2 : playerCount >= 6 ? 1 : 0,
      minion: playerCount >= 13 ? 3 : playerCount >= 10 ? 2 : 1,
      demon: 1,
    };

  const warnings: string[] = [];
  if (!STANDARD_COMPOSITIONS[playerCount]) {
    warnings.push(
      `人数 ${playerCount} 不在官方标准表（5~15）内，配比为估算值，请人工复核。`
    );
  }

  const counts: RoleCounts = { ...base };
  let baronAdjusted = false;
  let baronAddedOutsiders = 0;

  if (input.baronInPlay) {
    const desired = 2;
    const room = Math.max(0, input.availableOutsiderPool - base.outsider);
    baronAddedOutsiders = Math.min(desired, room);

    if (baronAddedOutsiders < desired) {
      // ⚠️ 这正是旧实现「悄悄少配」的场景 —— 现在**必须告警**
      warnings.push(
        `男爵在场，但外来者池不足：希望 +${desired}，实际仅 +${baronAddedOutsiders}` +
          `（可用池 ${input.availableOutsiderPool}，基础已用 ${base.outsider}）。` +
          `请补充外来者角色或改用其他爪牙。`
      );
    }

    counts.outsider = base.outsider + baronAddedOutsiders;
    counts.townsfolk = Math.max(0, base.townsfolk - baronAddedOutsiders);
    baronAdjusted = baronAddedOutsiders > 0;
  }

  return {
    counts,
    baronAdjusted,
    baronAddedOutsiders,
    baronRemovedTownsfolk: baronAddedOutsiders,
    warnings,
  };
}

/**
 * 校验一个**已配置**的名单是否符合（含男爵调整后的）官方配比。
 *
 * 供 setup UI / 流程校验调用：避免"静默改名单"绕过校验。
 */
export function validateSetupComposition(
  playerCount: number,
  actual: RoleCounts,
  input: BaronAdjustmentInput
): { valid: boolean; expected: RoleCounts; warnings: string[] } {
  const { counts: expected, warnings } = computeSetupComposition(
    playerCount,
    input
  );
  const mismatches: string[] = [];
  (["townsfolk", "outsider", "minion", "demon"] as const).forEach((k) => {
    if (actual[k] !== expected[k]) {
      mismatches.push(`${k}: 实际 ${actual[k]} ≠ 期望 ${expected[k]}`);
    }
  });
  if (mismatches.length > 0) {
    warnings.push(`配比不符官方表：${mismatches.join("；")}`);
  }
  return { valid: mismatches.length === 0, expected, warnings };
}
