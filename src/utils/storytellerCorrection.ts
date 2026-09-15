/**
 * 🎙️ 说书人「技能修正页」统一机制
 * ============================================================================
 *
 * 【为什么需要这一层】
 * 「技能确认页 / 技能结果页」是**整机交给玩家亲手点击**的（见 playerView.ts 顶部注释），
 * 因此它们**只能呈现玩家视角能看到的信息**。
 *
 * 但有些**必须让说书人知道、却绝不能告诉玩家**的真相，恰恰发生在同一时刻，例如：
 *   - 小恶魔攻击了【1号】，但【1号】当晚被僧侣保护 → 无人死亡；
 *   - 小恶魔攻击了【4号】（士兵）→ 士兵免疫，无人死亡；
 *   - 小恶魔攻击了镇长 → 触发替死，另一名镇民替代死亡。
 *
 * 官方原文（`src/roles/townsfolk/monk.ts`）明确：
 *   「**恶魔不知道哪一名玩家受到了保护。**」
 * ⇒ 「未能造成伤亡」这类**失败原因**绝不能出现在恶魔的结果页上，
 *   否则等于直接告诉恶魔"你被僧侣挡了、谁是僧侣"。
 *
 * 【机制】
 * 结果页（玩家视角）只呈现**中性事实**（如「你选择了【1号】」）；
 * 玩家点「确认结果」后，**紧接着弹出一张说书人专用的「技能修正页」**，
 * 写清"这一夜实际发生了什么、为什么没死人"，说书人点确认后才继续夜间流程。
 *
 * 该页承担两个职责：
 *   ① 让玩家在不知情的状态下完成自己的步骤（结果页不泄漏）；
 *   ② 不让说书人在连续点击中"瞬间搞不清楚状况"（修正页给出明确真相）。
 *
 * 【安全默认】
 * 修正页文案一律视为**说书人专属**：
 *   - 由引擎在 `displayInfo.storytellerCorrection` 显式给出；
 *   - 玩家视角永不读取该字段（模态只在结果页「确认」之后出现，且标注"说书人专用"）。
 */

/** 技能修正页的结构化数据。 */
export interface StorytellerCorrection {
  /** 修正标题，如「因僧侣保护，今晚无人死亡」 */
  title: string;
  /** 详情正文（可多行）——说书人专属，请勿展示给玩家 */
  detail: string;
  /** 触发这次修正的角色 id（如 "imp"），供将来按角色渲染不同图标/配色 */
  sourceRoleId?: string;
  /** 归一化的修正原因，供测试与后续扩展（不用解析文案） */
  reason?:
    | "monk_protection"
    | "soldier_immunity"
    | "mayor_substitution"
    | "taowu_substitution"
    | "no_kill_other"
    | "target_already_dead"
    | "demon_self_kill"
    | "unknown";
}

/**
 * 恶魔击杀被挡下时，**玩家可见**的中性结果文案。
 *
 * 玩家（恶魔）只应知道"我选了谁"，不知道是否成功 ——
 * 死亡与否在黎明统一由说书人公布（官方：恶魔不知道谁被保护）。
 */
export function getDemonPlayerFacingResultText(targetLabel: string): string {
  return `你选择了【${targetLabel}】`;
}

/**
 * 构建「恶魔击杀被修正」的说书人修正页数据。
 *
 * @param params.reason       归一化原因（决定标题）
 * @param params.targetLabel  恶魔选择的目标（含玩家名/座位号）
 * @param params.demonLabel   恶魔的座位标签（如「13号」）
 * @param params.extraNote    额外说明（如替死者的座位号）
 * @returns 修正页数据；若不需要修正（正常击杀）则返回 null
 */
export function buildDemonKillCorrection(params: {
  reason: StorytellerCorrection["reason"];
  targetLabel: string;
  demonLabel?: string;
  extraNote?: string;
}): StorytellerCorrection | null {
  const { reason, targetLabel, demonLabel, extraNote } = params;
  const who = demonLabel ? `${demonLabel}恶魔` : "恶魔";

  const titles: Record<string, string> = {
    monk_protection: `因僧侣保护，${targetLabel}今晚未受伤害`,
    soldier_immunity: `因士兵免疫，${targetLabel}今晚未受伤害`,
    mayor_substitution: `镇长替死触发：${targetLabel}存活`,
    taowu_substitution: `梼杌替死触发：${targetLabel}存活`,
    target_already_dead: `${targetLabel}已死亡，今晚无新增伤亡`,
    demon_self_kill: `恶魔自杀，血脉已传递`,
    no_kill_other: `今晚无人死亡`,
  };

  const details: Record<string, string> = {
    monk_protection:
      `⛪ ${who}选择了【${targetLabel}】，但该玩家当晚受到**僧侣保护**，` +
      `恶魔的负面能力对其无效 ⇒ **今晚无人因此死亡**。\n\n` +
      `⚠️ 说书人请注意：官方规定恶魔**不知道**哪名玩家受到了保护 —— ` +
      `请勿向恶魔透露本条信息。`,
    soldier_immunity:
      `🛡️ ${who}选择了【${targetLabel}】，但该玩家是**士兵**，` +
      `免疫恶魔的击杀 ⇒ **今晚无人因此死亡**。\n\n` +
      `⚠️ 说书人请注意：士兵的免疫同样不告知恶魔。`,
    mayor_substitution:
      `🎩 ${who}攻击了**镇长**【${targetLabel}】，触发镇长替死：` +
      `${extraNote ?? "另一名存活镇民替代死亡"}。`,
    taowu_substitution:
      `🐯 ${who}攻击了**梼杌**【${targetLabel}】，触发梼杌替死：` +
      `${extraNote ?? "一名爪牙失去能力"}。`,
    target_already_dead:
      `💀 ${who}选择了已死亡的【${targetLabel}】，今晚无新增伤亡` +
      `（可用于伪装成士兵/僧侣挡杀）。`,
    demon_self_kill: `☠️ 恶魔自杀，恶魔血脉已传递给一名存活爪牙。`,
    no_kill_other: `🌙 ${who}选择了【${targetLabel}】，但今晚无人死亡。`,
  };

  const key = reason ?? "unknown";
  const title = titles[key];
  const detail = details[key];
  if (!title || !detail) return null;

  return {
    title,
    detail,
    sourceRoleId: "imp",
    reason,
  };
}
