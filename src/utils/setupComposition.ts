/**
 * 开局人数配比 · 唯一事实来源（含全部 setup 配比修正）
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
 *
 * ============================================================
 * 2026-10-21：补齐其余四种 setup 配比修正
 * ============================================================
 * 官方还有四个角色会改开局配比，此前**全部未实现** ⇒ 实际开局会出现
 * 「注入了 8 镇民/3 外来者，但系统认为应是 9/2」，发牌器的校验直接抛错
 * （E2E 表现为「随机落座」按钮不出现）。
 *   · 方古 fang_gu（外来者）        +1 外来者（镇民 -1）
 *   · 亡骨魔 vigormortis（爪牙）    -1 外来者（镇民 +1）
 *   · 教父 godfather（爪牙）        -1 / 0 / +1 外来者（说书人选择，默认 0）
 *   · 气球驾驶员 balloonist（恶魔）  0 / +1 外来者（说书人选择，默认 0）
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
  /** 实际生效的外来者修正总量（含男爵） */
  outsiderDelta: number;
  /** 因池子不足 / 镇民下限被钳掉的量（正数=少加了，负数=少减了） */
  clampedDelta: number;
  /**
   * ⚠️ 配比告警（非空 = 局面与官方不符，UI **必须展示**给说书人）
   */
  warnings: string[];
}

/** 男爵调整意图 */
export interface BaronAdjustmentInput {
  /** 男爵是否在场 */
  baronInPlay: boolean;
  /** 外来者角色池可用数量（用于判断能否补足 +2）；不传则不按池钳制 */
  availableOutsiderPool?: number;
  /** 在场角色 id 列表（用来算角色自带的配比修正）。不传则等价于空数组。 */
  inPlayRoleIds?: string[];
  /** 教父的外来者修正（说书人选择，只允许 -1 / 0 / +1，默认 0）。 */
  godfatherAdjustment?: -1 | 0 | 1;
  /** 气球驾驶员的外来者修正（说书人选择，只允许 0 / 1，默认 0）。 */
  balloonistAdjustment?: 0 | 1;
}

/** 把修正量格式化成「+2 / -1」，便于写进告警文案 */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * 计算最终开局配比（**唯一入口**）。
 *
 * 官方（男爵）：「增加的外来者角色总是会**替换掉原本的镇民**角色」
 *   【范例】7 人局：3 镇民 + 2 外来者 + 1 爪牙 + 1 恶魔。
 *   【范例】15 人局：原本 9 镇民 + 2 外来者 → 加 1 酒鬼 + 1 陌客，
 *            "说书人移除了僧侣标记来添加陌客标记"（镇民 -1、外来者 +1）。
 *   相克：异端分子在场时，男爵可能只增加**一个**而非两个外来者。
 *
 * 官方（方古）：「场上比平时多 1 个外来者」（方古本身是外来者 ⇒ 镇民 -1）。
 * 官方（亡骨魔）：「场上比平时少 1 个外来者」（⇒ 镇民 +1）。
 * 官方（教父 / 气球驾驶员）：由**说书人**选择是否调整外来者数量，默认不调整。
 */
export function computeSetupComposition(
  playerCount: number,
  input: BaronAdjustmentInput
): SetupCompositionResult {
  // ① 基础配比：官方标准表；人数不在表内时按比例估算并告警（不静默）
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

  const inPlay = new Set(input.inPlayRoleIds ?? []);

  // ② 统计外来者修正总量 delta（每个修正都对应「外来者 +N ⇒ 镇民 -N」）
  let delta = 0;
  // 方古（外来者）：官方「+1 外来者」
  if (inPlay.has("fang_gu")) delta += 1;
  // 亡骨魔（爪牙）：官方「-1 外来者」
  if (inPlay.has("vigormortis")) delta -= 1;
  // 男爵（爪牙）：官方「+2 外来者」；
  //   `baronInPlay` 与 `inPlayRoleIds` 是两条同一事实的入口 ⇒ 只算一次
  const baronDesired = input.baronInPlay || inPlay.has("baron") ? 2 : 0;
  if (baronDesired > 0) delta += baronDesired;
  // 教父（爪牙）：说书人自选 -1 / 0 / +1，默认 0（不选即不改配比）
  if (inPlay.has("godfather")) delta += input.godfatherAdjustment ?? 0;
  // 气球驾驶员（恶魔）：说书人自选 0 / +1，默认 0
  if (inPlay.has("balloonist")) delta += input.balloonistAdjustment ?? 0;

  // ③ 钳制：
  //    上限 a = 外来者池大小（不传则不按池钳制）
  //    上限 b = 至少留 1 名镇民（playerCount - 外来者 - 爪牙 - 恶魔 >= 1）
  const pool = input.availableOutsiderPool;
  const maxByTownsfolkFloor = Math.max(
    0,
    playerCount - base.minion - base.demon - 1
  );
  const upperBound =
    pool === undefined
      ? maxByTownsfolkFloor
      : Math.min(pool, maxByTownsfolkFloor);
  const desiredOutsider = base.outsider + delta;
  const outsider = Math.min(Math.max(desiredOutsider, 0), upperBound);
  //    被钳掉的量：正数 = 少加了外来者，负数 = 少减了外来者
  const clampedDelta = desiredOutsider - outsider;

  // ④ 镇民：配比总和必须等于人数（外来者每多一个，镇民就少一个）
  const townsfolk = Math.max(
    0,
    playerCount - outsider - base.minion - base.demon
  );
  const counts: RoleCounts = {
    townsfolk,
    outsider,
    minion: base.minion,
    demon: base.demon,
  };

  // 实际生效的外来者修正总量（含男爵）
  const realizedDelta = outsider - base.outsider;

  // ⑤ 告警：一旦发生钳制，必须说清「希望多少、实际多少、为什么」
  if (clampedDelta !== 0) {
    const reasons: string[] = [];
    if (desiredOutsider < 0) {
      reasons.push("外来者数量不能为负数（下限 0）");
    }
    if (pool !== undefined && desiredOutsider > pool) {
      reasons.push(`外来者池只有 ${pool} 个可用角色`);
    }
    if (desiredOutsider > maxByTownsfolkFloor) {
      reasons.push(
        `至少要保留 1 名镇民（外来者上限 ${maxByTownsfolkFloor}）`
      );
    }
    warnings.push(
      `配比被钳制：期望外来者 ${desiredOutsider} 名，实际 ${outsider} 名` +
        `（期望修正 ${signed(delta)}，实际修正 ${signed(realizedDelta)}）。` +
        `原因：${reasons.join("；") || "超出可配范围"}。` +
        `请补充外来者角色或改用其他爪牙。`
    );
  }

  // 男爵既有的三个字段语义保持不变：实际新增的外来者数（池子不足时 < 2）
  const room =
    pool === undefined ? Infinity : Math.max(0, pool - base.outsider);
  const baronAddedOutsiders = Math.max(
    0,
    Math.min(baronDesired, room, Math.max(0, realizedDelta))
  );
  if (baronDesired > 0 && baronAddedOutsiders < baronDesired) {
    // ⚠️ 这正是旧实现「悄悄少配」的场景 —— 现在**必须告警**
    warnings.push(
      `男爵在场，但外来者池不足：希望 +${baronDesired}，实际仅 +${baronAddedOutsiders}` +
        `（可用池 ${pool ?? "未知"}，基础已用 ${base.outsider}）。` +
        `请补充外来者角色或改用其他爪牙。`
    );
  }

  return {
    counts,
    baronAdjusted: baronAddedOutsiders > 0,
    baronAddedOutsiders,
    baronRemovedTownsfolk: baronAddedOutsiders,
    outsiderDelta: realizedDelta,
    clampedDelta,
    warnings,
  };
}

/**
 * 校验一个**已配置**的名单是否符合（含全部 setup 修正后的）官方配比。
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
