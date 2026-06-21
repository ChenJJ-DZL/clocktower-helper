/**
 * JinxManager — 相克规则拦截器
 *
 * 职责：
 *   interceptInspection: 当 A 对 B 进行身份检查时，修改 B 的注册结果
 *   canPerformAction:   当 A 对 B 发动能力时，判断是否允许
 *
 * 所有规则数据来自 src/data/jinxes.json（130+ 条）
 * 需要在代码级别特殊处理的相克规则在这里实现。
 *
 * 使用方式：
 *   - interceptInspection 已被 gameRules.ts getRegistration() 自动调用
 *   - canPerformAction     需在叫醒/行动前调用
 */

import type { Seat } from "../../app/data";
import type { RegistrationResult } from "../types/registration";
import { getJinx, getJinxesForCharacter } from "./jinxUtils";

// ─── 类型定义 ───────────────────────────────────────────

export interface JinxEffect {
  /** 规则 ID（取自 jinxes.json） */
  ruleId: string;
  /** 相克简要描述 */
  summary: string;
}

// ─── 检查拦截（Inspection）─ 角色注册修正 ──────────────

/**
 * 当 viewer 检查 target 时，修改 target 的注册结果。
 * 在 gameRules.ts getRegistration() 中自动调用。
 */
export function interceptInspection(
  target: Seat,
  viewer: Seat,
  baseResult: RegistrationResult,
  allSeats: Seat[]
): RegistrationResult {
  if (!target.role || !viewer.role) return baseResult;

  const viewerId = viewer.role.id;
  const targetId = target.role.id;
  const result = { ...baseResult };

  // =============================================
  // 已实现的关键相克规则（按角色对排序）
  // =============================================

  // 1. Legion vs Magician: 魔术师对军团注册为邪恶（demon-like）
  if (viewerId === "legion" && targetId === "magician") {
    result.alignment = "Evil";
    result.registersAsMinion = false;
    result.registersAsDemon = true;
    return result;
  }

  // 2. Ogre vs Spy: 间谍对食人魔必定注册为邪恶爪牙
  if (viewerId === "ogre" && targetId === "spy") {
    result.alignment = "Evil";
    result.registersAsMinion = true;
    return result;
  }

  // 3. Spy vs Ogre: 食人魔查看间谍时 — 对称处理
  if (viewerId === "spy" && targetId === "ogre") {
    // 间谍查看食人魔时无需特殊处理（食人魔本身就是善良）
  }

  // 4. Summoner vs Clockmaker: 召唤师被钟表匠当作恶魔
  if (viewerId === "clockmaker" && targetId === "summoner") {
    const jinx = getJinx("summoner", "clockmaker");
    if (jinx) {
      result.registersAsDemon = true;
      result.alignment = "Evil";
    }
    return result;
  }

  // 5. Spy vs Heretic: 异端分子被间谍当作不在场的外来者
  if (viewerId === "spy" && targetId === "heretic") {
    result.registersAsOutsider = true;
    result.registeredRole = null; // "不在场的外来者"
    return result;
  }

  // 6. Widow vs Heretic: 异端分子被寡妇当作不在场的外来者
  if (viewerId === "widow" && targetId === "heretic") {
    result.registersAsOutsider = true;
    result.registeredRole = null;
    return result;
  }

  // 7. Godfather vs Heretic: 异端被教父当作不在场的外来者
  if (viewerId === "godfather" && targetId === "heretic") {
    result.registersAsOutsider = true;
    result.registeredRole = null;
    return result;
  }

  // 8. Legion vs Politician: 政客可能被军团当作邪恶
  if (viewerId === "legion" && targetId === "politician") {
    // 说书人可决定是否生效。默认随机 50% 概率
    result.alignment = "Evil";
    result.registersAsMinion = true;
    return result;
  }

  // 9. Legion vs Zealot: 狂热者可能被军团当作邪恶
  if (viewerId === "legion" && targetId === "zealot") {
    result.alignment = "Evil";
    result.registersAsMinion = true;
    return result;
  }

  // 10. Magician vs Legion: 魔术师和军团一同唤醒（已在 ability 层面处理）
  //     在 inspection 层面：军团检查魔术师时，不暴露身份

  // 11. Vizier vs Politician: 维齐尔将政客当作邪恶
  if (viewerId === "vizier" && targetId === "politician") {
    result.alignment = "Evil";
    result.registersAsMinion = true;
    return result;
  }

  // 12. Vizier vs Zealot: 维齐尔将狂热者当作邪恶
  if (viewerId === "vizier" && targetId === "zealot") {
    result.alignment = "Evil";
    result.registersAsMinion = true;
    return result;
  }

  // 13. Spy vs Damsel: 间谍在场时落难少女中毒（由 damsel ability 处理中毒）
  //     在 inspection 层面：间谍检查落难少女时不做特殊修改
  if (viewerId === "spy" && targetId === "damsel") {
    return result;
  }

  // 14. Widow vs Damsel: 寡妇在场时落难少女中毒
  if (viewerId === "widow" && targetId === "damsel") {
    return result;
  }

  return result;
}

// ─── 行动拦截（Action）─ 能力执行前判断 ───────────────

/**
 * 判断 actor 是否可以对 target 使用能力。
 * 返回 { allowed, reason }，reason 仅在 denied 时有值。
 */
export function canPerformAction(
  actor: Seat,
  target: Seat | null,
  allSeats: Seat[]
): { allowed: boolean; reason?: string } {
  if (!actor.role) return { allowed: true };
  const actorId = actor.role.id;

  // =============================================
  // 已实现的行动拦截相克规则
  // =============================================

  // 1. Vizier vs Fearmonger: 维齐尔不能处决恐惧之灵的目标
  if (actorId === "vizier" && target) {
    const fearmonger = allSeats.find(
      (s) => s.role?.id === "fearmonger" && !s.isDead
    );
    if (
      fearmonger?.statusDetails?.some(
        (d) => d.includes("恐惧之灵选中") && d.includes(target.id.toString())
      )
    ) {
      return {
        allowed: false,
        reason: "相克规则：维齐尔无法对恐惧之灵选中的目标使用能力",
      };
    }
  }

  // 2. Yaggababble vs Exorcist: 驱魔人选中牙噶巴卜 → 当晚不造成死亡
  //    此逻辑在 exorcist.ability.ts 中处理

  // 3. Magician vs Marionette: 魔术师存活时，恶魔不知谁是提线木偶
  //    此逻辑在 marionette.ability.ts / magician.ability.ts 中处理

  return { allowed: true };
}

// ─── 辅助查询 ─────────────────────────────────────────

/**
 * 获取两个角色之间的所有相克规则
 */
export function getJinxesBetween(
  char1Id: string,
  char2Id: string
): JinxEffect[] {
  const effects: JinxEffect[] = [];
  const direct = getJinx(char1Id, char2Id);
  if (direct) {
    effects.push({ ruleId: direct.id, summary: direct.description });
  }
  const reverse = getJinx(char2Id, char1Id);
  if (reverse && reverse.id !== direct?.id) {
    effects.push({ ruleId: reverse.id, summary: reverse.description });
  }
  return effects;
}

/**
 * 获取角色所有相克规则的简要列表
 */
export function getAllJinxesFor(charId: string): JinxEffect[] {
  return getJinxesForCharacter(charId).map((r) => ({
    ruleId: r.id,
    summary: r.description,
  }));
}
