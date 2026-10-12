/**
 * travelerDusk.ts —— **暮色（Twilight）阶段**唯一事实源
 * ==================================================================
 * 🔴 为什么要有这个文件（2026-10-13 实测）：
 *   `src/utils/dynamicQueueGenerator.ts` 与 `src/hooks/useNightEngine.ts`
 *   **全仓零 `traveler` 引用** ⇒ 夜序/白天流程从不遍历 `state.travelers`。
 *   而旅行者只存在于 `travelers[]`（**不占 seats**），
 *   ⇒ 除「怪咖」外 14/15 个旅行者的规则在真实对局里**永不触发**。
 *
 * ✅ 修法（用户 2026-10-13 选定方案 B）：**独立暮色阶段**。
 *   官方 Dusk = 「入夜之前，旅行者与传奇角色行动的时刻」，
 *   本仓库的 `dusk` 已被「白天提名阶段」占用（见 `app/data.ts` 的 GamePhase），
 *   ⇒ 新增独立阶段 `twilight`（暮色），夹在「提名/处决」与「入夜」之间，
 *   逐个唤醒有行动的旅行者。
 *
 * ── 官方「谁在暮色行动」────────────────────────────────────────────
 *   来源：`json/wiki_crawl/parsed_roles.json`（`type === "traveler"` 的 ability 原文）
 *   首夜：官员 / 窃贼 / 学徒 / 咖啡师
 *   其他夜：官员 / 窃贼 / 咖啡师 / 流莺 / 集骨者
 *
 *   ⚠️ 其余 9 个旅行者（怪咖/法官/女舍监/巫毒师/主教/屠夫/替罪羊/乞丐/枪手）
 *      **不在暮色行动**——它们的规则挂在白天流程或流放结算上，
 *      不要塞进本文件充数（那正是"看起来有、实际没有"的老毛病）。
 *
 * ⚠️ 本文件**只排唤醒顺序与提示**，不负责效果结算。
 *    各旅行者的效果落地情况见 `traveler_wiring_contract.test.ts`。
 */
import type { Role } from "../../app/data";

/** 该旅行者在哪些夜晚的暮色行动 */
export type TwilightWhen = "first" | "other" | "every";

export interface TwilightTravelerSpec {
  /** 中文名（与 `TRAVELER_ROLES` 的 name 逐字一致） */
  name: string;
  when: TwilightWhen;
  /** 给说书人的操作提示（显示在暮色步骤卡片上） */
  hint: string;
}

/**
 * 官方暮色旅行者注册表（**唯一事实源**）
 *
 * 顺序即唤醒顺序（与官方黄昏说明一致：官员→窃贼→学徒→咖啡师→流莺→集骨者）。
 */
export const TWILIGHT_TRAVELERS: Record<string, TwilightTravelerSpec> = {
  bureaucrat: {
    name: "官员",
    when: "every",
    hint: "选择除自己以外的一名玩家：明天白天他的投票算作三票。",
  },
  thief: {
    name: "窃贼",
    when: "every",
    hint: "选择除自己以外的一名玩家：明天白天他的投票会被算作负数。",
  },
  apprentice: {
    name: "学徒",
    when: "first",
    hint:
      "首个夜晚：善良则获得一个镇民角色能力，邪恶则获得一个爪牙角色能力。",
  },
  barista: {
    name: "咖啡师",
    when: "every",
    hint:
      "说书人二选一并告知该玩家：① 解除并免疫醉酒/中毒且信息正确；② 能力可生效两次。",
  },
  harlot: {
    name: "流莺",
    when: "other",
    hint: "选择一名存活玩家：若他同意，你得知他的角色，但你们两个可能同时死亡。",
  },
  bone_collector: {
    name: "集骨者",
    when: "other",
    hint: "每局限一次：选择一名死亡玩家，他重新获得能力直到下个黄昏。",
  },
};

/** 暮色步骤（一个已落座的旅行者 = 一步） */
export interface TwilightStep {
  /** 稳定 key：`${roleId}#${seatIndex}`（同角色可能坐两个位置） */
  key: string;
  /** 在 `state.travelers` 数组中的下标 */
  seatIndex: number;
  roleId: string;
  roleName: string;
  /** 官方能力原文（展示给说书人，避免"点了不知道该干嘛"） */
  ability: string;
  hint: string;
}

/** 是否为「暮色旅行者」 */
export function isTwilightTraveler(roleId: string | undefined | null): boolean {
  return !!roleId && Object.prototype.hasOwnProperty.call(TWILIGHT_TRAVELERS, roleId);
}

/** 该旅行者在指定夜晚是否行动 */
export function actsOnNight(
  roleId: string | undefined | null,
  isFirstNight: boolean
): boolean {
  const spec = roleId ? TWILIGHT_TRAVELERS[roleId] : undefined;
  if (!spec) return false;
  if (spec.when === "every") return true;
  if (spec.when === "first") return isFirstNight;
  return !isFirstNight; // "other"
}

/**
 * 构建本夜暮色步骤。
 *
 * @param travelers `state.travelers`：`(Role | null)[]`，定长 4（旅行者不占 seats）
 * @param isFirstNight 是否为首夜（决定学徒/流莺/集骨者是否出现）
 */
export function buildTwilightSteps(
  travelers: ReadonlyArray<Role | null | undefined>,
  isFirstNight: boolean
): TwilightStep[] {
  const steps: TwilightStep[] = [];
  const list = travelers ?? [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t) continue;
    if (!actsOnNight(t.id, isFirstNight)) continue;
    const spec = TWILIGHT_TRAVELERS[t.id];
    steps.push({
      key: `${t.id}#${i}`,
      seatIndex: i,
      roleId: t.id,
      roleName: t.name ?? spec.name,
      ability: t.ability ?? "",
      hint: spec.hint,
    });
  }
  return steps;
}

/** 本夜是否需要暮色阶段（无步骤 ⇒ 不应插入空阶段） */
export function hasTwilightPhase(
  travelers: ReadonlyArray<Role | null | undefined>,
  isFirstNight: boolean
): boolean {
  return buildTwilightSteps(travelers, isFirstNight).length > 0;
}
