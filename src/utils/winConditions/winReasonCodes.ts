/**
 * 胜负原因注册表 —— 判胜「可审计 / 可证明」的唯一事实来源
 * ======================================================================
 * 背景（2026-11-01 P0 事故复盘）：
 *   `app/gameLogic.ts::checkGameEnd` 曾在内联逻辑里凭启发式猜测领域事实，
 *   导致「处决 15号-小精灵」被误判为「处决善良双子」而提前结束对局。
 *   同类缺陷的共同形态是：**判胜结果无法被状态严格证明**。
 *
 * 本模块把所有「终局原因」收敛为封闭枚举，并为每个原因声明：
 *   · `side`            —— 胜方（判胜的 winner 必须由此派生，禁止另写字面量）
 *   · `requiredEvidence` —— **判胜必须携带的证据字段**（缺失即不允许判胜）
 *   · `rule`            —— 官方规则依据（评审/文档用，便于逐条对账）
 *
 * 配套防线（见 `src/utils/__tests__/winConditionSoundness.test.ts`）：
 *   ① 任何 `isGameOver: true` 的结果必须带注册表内的 reasonCode，且 winner 与 side 一致；
 *   ② 证据字段必须齐全（fail-closed：证据不足不得宣布胜负）；
 *   ③ 每个 reasonCode 都必须有正/反例场景（覆盖棘轮，防止新规则裸奔）。
 */

import type { EvilTwinPairSource } from "../evilTwinHelper";

/** 判胜证据。所有字段可选；是否必须由 `requiredEvidence` 逐码声明。 */
export interface WinEvidence {
  /** 触发本次判胜的处决座位（仅执行类判据） */
  executedSeatId?: number | null;
  /** 被处决者的角色 ID（圣徒/地精等判据需可复核） */
  executedRoleId?: string | null;
  /** 真正的善良双子座位（镜像双子判据的核心证据） */
  goodTwinSeatId?: number | null;
  /** 镜像双子座位（须存活且未醉/毒才可能判胜） */
  evilTwinSeatId?: number | null;
  /** 配对证据来源。`unresolved`/`heuristic` **不允许**触发判胜 */
  twinPairSource?: EvilTwinPairSource | null;

  /** 结算时点的存活恶魔数（含死而未僵的僵尸等口径由 checkGameEnd 负责） */
  livingDemonCount?: number;
  /** 结算时点的非旅行者存活数（官方「仅剩 2 人」口径） */
  aliveNonTravelerCount?: number;
  /** 结算时点的存活总数（含旅行者，镇长和平获胜口径） */
  aliveCount?: number;
  /** 镇长座位 ID（以证明和平获胜者确实在场且未醉/毒） */
  mayorSeatId?: number | null;
  /** 主谋座位 ID（额外一天判据） */
  mastermindSeatId?: number | null;
  /** 利维坦座位 ID */
  leviathanSeatId?: number | null;
  /** 恐惧之灵选定的目标座位 ID */
  fearmongerTargetId?: number | null;
  /** 祖母的孙子座位 ID */
  grandchildSeatId?: number | null;
  /** 累计被处决的善良玩家数（利维坦口径） */
  goodExecutionsCount?: number;
  /** 当前夜数（涡流/利维坦/剧本级判据） */
  nightCount?: number;
  /** 无座位可锚定的全局触发条件的人读描述（须非空） */
  trigger?: string;
}

/** 终局原因码（新增规则必须在此登记，否则覆盖棘轮测试会失败） */
export type WinReasonCode =
  | "DAMSEL_GUESSED"
  | "KLUTZ_GUESSED_EVIL"
  | "SCRIPT_AUTO_EVIL_WIN"
  | "LEGION_ALL_DEAD"
  | "DEMON_ALL_DEAD"
  | "SAINT_EXECUTED"
  | "SAINT_CONVERTED_EXECUTED"
  | "GOBLIN_EXECUTED"
  | "GOOD_TWIN_EXECUTED"
  | "MAYOR_PEACEFUL_WIN"
  | "MAYOR_CONVERTED_PEACEFUL_WIN"
  | "LEGION_THRESHOLD"
  | "ONLY_EVIL_ALIVE"
  | "TWO_ALIVE"
  | "VORTOX_NO_EXECUTION"
  | "MASTERMIND_EXTRA_DAY_NO_EXECUTION"
  | "MASTERMIND_EXECUTION_GOOD_WINS"
  | "MASTERMIND_EXECUTION_EVIL_WINS"
  | "LEVIATHAN_EXECUTIONS"
  | "LEVIATHAN_DAY5"
  | "FEARMONGER_TARGET_EXECUTED"
  | "ATHEIST_STORYTELLER_EXECUTED"
  | "GRANDMOTHER_GRANDCHILD_EXECUTED";

export type WinSide = "Good" | "Evil";

export const WIN_REASON_META = {
  DAMSEL_GUESSED: {
    side: "Evil",
    rule: "落难少女：爪牙猜中落难少女，邪恶获胜。",
    requiredEvidence: ["trigger"],
  },
  KLUTZ_GUESSED_EVIL: {
    side: "Evil",
    rule: "呆瓜：猜测判定使邪恶获胜的一支（唯一事实源含待办说明）。",
    requiredEvidence: ["trigger"],
  },
  SCRIPT_AUTO_EVIL_WIN: {
    side: "Evil",
    rule: "剧本级特殊规则：进入固定天数后邪恶自动获胜（唯一事实源 utils/scriptSpecialRules）。",
    requiredEvidence: ["trigger"],
  },
  LEGION_ALL_DEAD: {
    side: "Good",
    rule: "军团局：所有军团被彻底消灭，善良获胜。",
    requiredEvidence: ["livingDemonCount"],
  },
  DEMON_ALL_DEAD: {
    side: "Good",
    rule: "官方：Good wins if the Demon dies.（邪恶双子均存活时善良无法获胜，需先处决邪恶双子）",
    requiredEvidence: ["livingDemonCount"],
  },
  SAINT_EXECUTED: {
    side: "Evil",
    rule: "圣徒：若圣徒被处决（未处于中毒/醉酒），其阵营落败（此码 = 圣徒仍属善良）。",
    requiredEvidence: ["executedSeatId", "executedRoleId"],
  },
  SAINT_CONVERTED_EXECUTED: {
    side: "Good",
    rule: "圣徒（已被转为邪恶）：其阵营落败 ⇒ 邪恶落败、善良获胜。",
    requiredEvidence: ["executedSeatId", "executedRoleId"],
  },
  GOBLIN_EXECUTED: {
    side: "Evil",
    rule: "地精：若地精被处决（未处于中毒/醉酒），邪恶获胜。",
    requiredEvidence: ["executedSeatId", "executedRoleId"],
  },
  GOOD_TWIN_EXECUTED: {
    side: "Evil",
    rule: "镜像双子：若对立的善良双子被处决，邪恶获胜。前置证据 = 权威配对（禁止启发式猜测）。",
    requiredEvidence: [
      "executedSeatId",
      "goodTwinSeatId",
      "evilTwinSeatId",
      "twinPairSource",
    ],
  },
  MAYOR_PEACEFUL_WIN: {
    side: "Good",
    rule: "镇长：若恰好 3 名玩家存活且无人被处决（旅行者计入 3 人口径），其阵营获胜（此码 = 镇长仍属善良）。",
    requiredEvidence: ["aliveCount", "mayorSeatId"],
  },
  MAYOR_CONVERTED_PEACEFUL_WIN: {
    side: "Evil",
    rule: "镇长（已被转为邪恶）：其阵营获胜 ⇒ 邪恶获胜。",
    requiredEvidence: ["aliveCount", "mayorSeatId"],
  },
  LEGION_THRESHOLD: {
    side: "Evil",
    rule: "军团：善良存活人数不足以消灭军团（<=1），或存活总数 <=2 且仍有军团，邪恶获胜。",
    requiredEvidence: ["aliveNonTravelerCount", "livingDemonCount"],
  },
  ONLY_EVIL_ALIVE: {
    side: "Evil",
    rule: "官方允许的提前结束：存活者全为邪恶，善良已无人可提名恶魔。",
    requiredEvidence: ["aliveNonTravelerCount", "livingDemonCount"],
  },
  TWO_ALIVE: {
    side: "Evil",
    rule: "官方固定阈值：仅剩 2 名非旅行者存活时邪恶获胜。",
    requiredEvidence: ["aliveNonTravelerCount"],
  },
  VORTOX_NO_EXECUTION: {
    side: "Evil",
    rule: "涡流：涡流存活时，每个白天若无人被处决，邪恶获胜。",
    requiredEvidence: ["nightCount"],
  },
  MASTERMIND_EXTRA_DAY_NO_EXECUTION: {
    side: "Good",
    rule: "主谋额外一天：无人被处决 ⇒ 善良获胜（唯一事实源 utils/mastermindRule）。",
    requiredEvidence: ["trigger"],
  },
  MASTERMIND_EXECUTION_GOOD_WINS: {
    side: "Good",
    rule: "主谋额外一天：处决邪恶玩家 ⇒ 善良获胜。",
    requiredEvidence: ["executedSeatId"],
  },
  MASTERMIND_EXECUTION_EVIL_WINS: {
    side: "Evil",
    rule: "主谋额外一天：处决善良玩家 ⇒ 邪恶获胜。",
    requiredEvidence: ["executedSeatId"],
  },
  LEVIATHAN_EXECUTIONS: {
    side: "Evil",
    rule: "利维坦：多于一名善良玩家被处决，邪恶获胜。",
    requiredEvidence: ["goodExecutionsCount", "leviathanSeatId"],
  },
  LEVIATHAN_DAY5: {
    side: "Evil",
    rule: "利维坦：第五个白天结束时利维坦仍存活，邪恶获胜。",
    requiredEvidence: ["nightCount", "leviathanSeatId"],
  },
  FEARMONGER_TARGET_EXECUTED: {
    side: "Evil",
    rule: "恐惧之灵：其选定的目标被处决时邪恶获胜。",
    requiredEvidence: ["executedSeatId", "fearmongerTargetId"],
  },
  ATHEIST_STORYTELLER_EXECUTED: {
    side: "Good",
    rule: "无神论者：说书人被处决，善良阵营获胜。",
    requiredEvidence: ["trigger"],
  },
  GRANDMOTHER_GRANDCHILD_EXECUTED: {
    side: "Evil",
    rule: "祖母与利维坦剧本特殊判据：孙子被处决且利维坦在场，邪恶获胜。",
    requiredEvidence: ["executedSeatId", "grandchildSeatId"],
  },
} as const satisfies Record<
  WinReasonCode,
  {
    side: WinSide;
    rule: string;
    requiredEvidence: readonly (keyof WinEvidence)[];
  }
>;

/** 全部终局原因码（覆盖棘轮测试用：新增代码必须补场景，否则 CI 变红） */
export const ALL_WIN_REASON_CODES = Object.keys(
  WIN_REASON_META
) as WinReasonCode[];

/**
 * 镜像双子判胜的**唯一文案**。
 *
 * 为什么单独导出：该规则有两条落地路径 ——
 *   ① `app/gameLogic.ts::checkGameEnd`（唯一判胜入口）；
 *   ② `useConfirmHandlers.confirmEvilTwinExecution`（弹窗已裁决 → UI 状态落地，
 *      与 `confirmSaintExecution` 同型）。
 * 两条路径必须引用同一常量，禁止各自写字符串（历史事故：两处各写一份判据，
 * 修一处漏一处）。若未来并入 checkGameEnd 单一路径，删除②即可。
 */
export const GOOD_TWIN_EXECUTED_REASON = "善良双子被处决（镜像双子胜利）";

/**
 * 圣徒判胜的**唯一文案**（同上：`checkGameEnd` 与 `confirmSaintExecution`
 * 两条落地路径共用，禁止各写一份）。
 */
export const SAINT_EXECUTED_REASON = "圣徒被处决";

/** 判胜结果的最小形状（与 `app/gameLogic.ts::GameEndResult` 结构兼容） */
export interface WinResultLike {
  isGameOver: true;
  winner: WinSide;
  reason: string;
  reasonCode: WinReasonCode;
  evidence: WinEvidence;
}

/**
 * 构造终局结果：`winner` 一律从注册表派生，杜绝「同一判据两处各写一遍胜负」。
 */
export function makeWinResult(
  code: WinReasonCode,
  reason: string,
  evidence: WinEvidence = {}
): WinResultLike {
  // 判胜不可逆 ⇒ 证据不齐时**不得**静默放行（fail-closed）。
  //   · 测试/开发环境：直接抛错，让任何漏传证据的判胜路径立刻暴露（CI 拦截）；
  //   · 生产环境：降级为控制台错误（不能把对局卡死在抛错上），并保留调用方兜底。
  const missing = findMissingWinEvidence(code, evidence);
  if (missing.length > 0) {
    const message = `[win-condition] ${code} 缺少判胜证据: ${missing.join(", ")}`;
    const isProduction =
      typeof process !== "undefined" && process.env?.NODE_ENV === "production";
    if (!isProduction) throw new Error(message);
    console.error(message);
  }
  return {
    isGameOver: true,
    winner: WIN_REASON_META[code].side,
    reason,
    reasonCode: code,
    evidence,
  };
}

/**
 * 校验一条终局结果的证据是否齐全。
 * 返回缺失字段名列表；空数组 = 证据齐全（可以判胜）。
 */
export function findMissingWinEvidence(
  code: WinReasonCode,
  evidence: WinEvidence | undefined | null
): string[] {
  const required = WIN_REASON_META[code].requiredEvidence as readonly string[];
  const ev = evidence ?? {};
  return required.filter((key) => {
    const value = (ev as Record<string, unknown>)[key];
    return value === undefined || value === null || value === "";
  });
}
