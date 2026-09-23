/**
 * 剧本级特殊规则层（Script-level special rules）
 * ==================================================================
 * 背景：本仓的 `Script` 原只有 `{id,name,difficulty,description,…,roleIds}`，
 * **没有承载"剧本级规则"的字段** ⇒ 某些剧本在简介里承诺的机制（例如
 * 「游园惊梦：恶魔不会在夜晚攻击，但是会在固定的天数后自动获胜」）
 * 在数据模型里**无处声明**，因此从未被实现（2026-09-22 实测确认）。
 *
 * 本模块是**唯一事实源**：所有剧本级规则的判据都从这里取，禁止在调用点硬编码。
 *
 * ⚠️ 官方口径说明（2026-09-22 核查）
 * ------------------------------------------------------------------
 * 游园惊梦的官方中文 wiki 页面（`json/play/游园惊梦.json` 记录的
 * `clocktower-wiki.gstonegames.com`，页面 oldid=3175，最后编辑 2023-05-25）
 * **只有一段简介，没有任何规则细节** —— 「固定的天数」的具体数字官方未给。
 * ⇒ 该数字由**用户裁定**（2026-09-22）：
 *    · **取值为可配置**（写在剧本数据里，默认 3）；
 *    · **判定时点 = 第 N 个黄昏结束 / 进入第 N+1 个夜晚时**。
 * 本模块因此**不写死天数**，只负责"给定值 → 判据"。
 */

export interface ScriptSpecialRules {
  /**
   * 恶魔不会在夜晚攻击。
   * 官方（游园惊梦）：「恶魔不会在夜晚攻击，但是会在固定的天数后自动获胜。」
   *
   * 语义：恶魔的**夜间能力不造成死亡**。
   * ⚠️ 只拦「死亡」——非死亡效果（如诺-达鲺的相邻镇民中毒）**照常生效**，
   *   因此**不能**用"删夜序节点"来实现（那会连带砍掉中毒）。
   */
  demonCannotKill?: boolean;

  /**
   * 进入第 (N+1) 个夜晚时（= 第 N 个白天结束 / 黄昏结束），若恶魔仍存活 ⇒ **邪恶自动获胜**。
   * ⚠️ 语义按**用户裁定口径**：`N` = 白天数，触发点 = 进入 `N+1` 夜。
   * （默认 3 ⇒ 进入第 4 夜时触发。）
   */
  evilAutoWinOnEnteringNight?: number;
}

/** 安全读取剧本上的特殊规则（剧本可能为 null / 自定义剧本无此字段）。 */
export function getScriptSpecialRules(
  script: { specialRules?: unknown } | null | undefined
): ScriptSpecialRules {
  const raw = script?.specialRules;
  /**
   * ⚠️ 必须返回**规范形状**（而不是 `{}`）：调用方会直接解构
   *   `{ demonCannotKill, evilAutoWinOnEnteringNight }`，形状不一致会让
   *   `toEqual` 断言与下游判据出现"看起来是空对象"的诡异差异（首版即栽在此）。
   */
  if (!raw || typeof raw !== "object") {
    return { demonCannotKill: false, evilAutoWinOnEnteringNight: undefined };
  }
  const r = raw as ScriptSpecialRules;
  return {
    demonCannotKill: r.demonCannotKill === true,
    evilAutoWinOnEnteringNight:
      typeof r.evilAutoWinOnEnteringNight === "number" &&
      r.evilAutoWinOnEnteringNight > 0
        ? r.evilAutoWinOnEnteringNight
        : undefined,
  };
}

/** 该剧本是否「恶魔夜晚不攻击」。（管道层用） */
export function isDemonNightKillSuppressed(
  script: { specialRules?: unknown } | null | undefined
): boolean {
  return getScriptSpecialRules(script).demonCannotKill === true;
}

/**
 * 自动获胜判据（纯函数，便于单测）。
 *
 * @param script        剧本对象（含 `specialRules`）
 * @param nightCount    本局**当前** `nightCount` 状态
 * @param demonAlive    场上是否有存活恶魔（无存活恶魔 ⇒ 善良已胜，不触发）
 * @returns 触发时返回理由字符串；不触发返回 null
 *
 * 推演：`nightCount` 语义 = 已开始的夜数（首夜 = 1）。
 *   ⇒ 第 1 个白天结束时进入 night 2；第 N 个白天结束时进入 night N+1。
 *   ⇒ **当前 nightCount === N + 1** 即"已进入第 N+1 夜"⇒ 触发。
 */
export function resolveScriptAutoEvilWin(params: {
  script: { specialRules?: unknown } | null | undefined;
  nightCount: number;
  demonAlive: boolean;
}): string | null {
  const { script, nightCount, demonAlive } = params;
  const n = getScriptSpecialRules(script).evilAutoWinOnEnteringNight;
  if (typeof n !== "number") return null;
  if (!demonAlive) return null; // 恶魔已死 ⇒ 走官方"恶魔死⇒善良胜"，不得被本规则覆盖
  if (nightCount !== n + 1) return null;
  return `剧本特殊规则：第 ${n} 个白天结束（进入第 ${n + 1} 夜），恶魔仍存活 ⇒ 邪恶自动获胜`;
}
