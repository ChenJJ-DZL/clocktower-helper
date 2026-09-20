/**
 * 罂粟种植者（Poppy Grower）新引擎技能实现
 *
 * 【角色能力】"当罂粟种植者存活时，邪恶玩家互不认识。"
 *
 * ============================================================
 * ⚠️⚠️ 重要：本文件当前**不会被执行**（2026-09-21 实测确认）
 * ============================================================
 * 本能力声明 `triggerTiming: [PASSIVE]`，而全仓库对 `triggerTiming` 的**唯一生产消费方**
 * 是 `useNightEngine.ts:195` 的 `ON_DEATH` 判定（用于 `deathTriggered` 打标）。
 * `PASSIVE` 没有任何执行入口 ⇒ `calculate / stateUpdate / postProcess` 永不运行。
 * （实测：注册表 213 个能力中有 **82 个 PASSIVE**，全部如此。）
 *
 * 罂粟种植者的**真实生效路径（SST）**是 legacy 链路：
 *   ① `hooks/useGameController.ts:557` 玩家死亡时判 `role.id === "poppy_grower"`
 *      且 `!isDrunk && !isPoisoned` → `setPoppyGrowerDead(true)`
 *   ② `hooks/useNightSnapshot.ts` 把 `poppyGrowerDead` 注入快照
 *   ③ `roles/demon/demonFirstNightHelper.ts:23-28` 据此隐藏爪牙名单（恶魔首夜互认）
 *   ④ `components/game/console/GameConsole.tsx:405` 渲染"邪恶互认"步骤卡片
 *
 * 因此本文件里写的 `snapshot.evilHidden` 是**第 13 次 SST 分叉**：
 * 与真实的 `snapshot.poppyGrowerDead` 是两个名字、两个写入点，且 `evilHidden` 全仓无读者。
 *
 * 【处置决定】保留文件（未来剧本素材，勿删），但：
 *   - 保留 `evilHidden` 写出（不删，避免破坏可能的未来消费方），
 *     同时**并行写出 SST 字段 `poppyGrowerDead`**，让两条口径在"若本文件被执行"时收敛；
 *   - 由静态护栏测试 `poppy_grower_path_unification.test.ts` 钉死 SST 链路不被改坏。
 * ============================================================
 *
 * PASSIVE 触发，不唤醒。
 * 存活时标记 poppyGrowerActive，引擎据此隐藏邪恶玩家之间的身份信息。
 * 死亡时清除该标记。
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：罂粟种植者始终可以触发，无需条件。
 */
const preCheckTrivial = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：检测罂粟种植者当前是否存活
 *
 * 从 snapshot.seats 中找到罂粟种植者的座位，检查存活状态（isDead）。
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 检查罂粟种植者：可能因 farmer/saint 转换导致 roleId 变化
  // 1. 真实罂粟种植者（role.id === poppy_grower）
  // 2. 罂粟种植者被转化为农夫（statusDetails 包含"成为新农夫"且原 seatId 与 poppy_growerSeatId 匹配）
  const poppySeat = ctx.snapshot.seats.find(
    (s: any) => s.roleId === "poppy_grower" || s.role?.id === "poppy_grower"
  );
  // 记录原始罂粟种植者 seatId（在 farmer 转换时仍可识别）
  const originalPoppySeatId =
    (ctx.snapshot as any).originalPoppyGrowerSeatId ?? poppySeat?.id ?? null;
  if (poppySeat && originalPoppySeatId !== null) {
    (ctx.snapshot as any).originalPoppyGrowerSeatId = originalPoppySeatId;
  }
  // 检查原罂粟种植者是否被转为农夫
  const turnedFarmer =
    poppySeat == null &&
    originalPoppySeatId !== null &&
    ctx.snapshot.seats.some(
      (s: any) =>
        s.id === originalPoppySeatId &&
        s.roleId === "farmer" &&
        (s.statusDetails ?? []).includes("成为新农夫")
    );

  const poppyGrowerAlive = poppySeat?.isDead !== true && !turnedFarmer; // 活着才算 active
  const poppyGrowerActive = (!!poppySeat || turnedFarmer) && poppyGrowerAlive;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        poppyGrowerActive,
        poppySeatId: poppySeat?.id ?? null,
        poppyGrowerAlive,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：设置 / 清除 poppyGrowerActive 标记
 *
 * 存活时 → 隐藏邪恶互识信息；死亡时 → 恢复。
 *
 * ⚠️ 字段名收敛（2026-09-21）：真实 SST 是 `snapshot.poppyGrowerDead`（见文件头说明），
 *    本函数在"若被执行"时**同时**写出两个字段，保证不会出现第三种口径：
 *      - `poppyGrowerDead`  ← SST，供 demonFirstNightHelper / GameConsole 消费
 *      - `evilHidden`       ← 本文件历史字段，保留兼容（无读者，勿依赖）
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | {
        poppyGrowerActive: boolean;
        poppySeatId: number | null;
      }
    | undefined;

  if (!abilityResult) return ctx;

  const record = {
    poppyGrowerActive: abilityResult.poppyGrowerActive,
    nightCount: ctx.snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      evilHidden: abilityResult.poppyGrowerActive,
      // ⭐ 与真实 SST 收敛：存活 = 未死亡
      poppyGrowerDead: !abilityResult.poppyGrowerActive,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        poppy_grower: record,
      },
    },
    meta: {
      ...ctx.meta,
      poppyResult: record,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

/**
 * postProcess：生成日志
 */
const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.poppyResult as
    | { poppyGrowerActive: boolean }
    | undefined;

  if (!record) return ctx;

  const status = record.poppyGrowerActive ? "激活（存活）" : "失效（死亡）";
  const simLog = `[罂粟种植者] ${status}`;
  const abilityLog = `罂粟种植者${status}，邪恶阵营互识${record.poppyGrowerActive ? "已隐藏" : "已恢复"}`;

  console.log(simLog);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog,
      displayInfo: {
        type: "poppy_grower_status",
        active: record.poppyGrowerActive,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const poppy_growerAbility = createRoleAbility({
  /** 角色标识符 */
  roleId: "poppy_grower",
  /** 能力标识符 */
  abilityId: "poppy_hide_evil",
  /** 能力中文名 */
  abilityName: "罂粟迷雾",

  /** 触发时机：被动（持续生效） */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /** 被动技能无唤醒优先级（纯被动角色夜晚不唤醒） */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜有效 */
  firstNightOnly: false,
  /** 被动能力无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * 罂粟种植者不需要选择目标。
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  preCheck: [preCheckTrivial],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
