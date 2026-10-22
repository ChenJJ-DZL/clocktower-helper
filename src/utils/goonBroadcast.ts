/**
 * 🪤 莽夫（Goon）「被选中 ⇒ 选者醉酒 + 自己转阵营」的广播中间件
 * ==================================================================
 * 官方【莽夫】：「每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。
 *   **你会转变为他的阵营**。」
 *
 * 🔴 修复的缺陷（2026-10-22）：
 *   `goon.ability.ts:28` 读 `ctx.meta.chooserSeatId`，但**全仓零传入点** ——
 *   只有该文件内部的 5 处自读自用。而莽夫是 PASSIVE
 *   （`firstNightPriority: null` / `otherNightPriority: null`），
 *   **自己永远不会被排进夜序** ⇒ 它的 `calculate` 永远拿不到 chooserSeat ⇒
 *   `chooserSeat` 恒 `undefined` ⇒ `alignmentChanged` 恒 false
 *   ⇒ **永不转阵营、永不令选者醉酒**（E2E 实测：恶魔选中后 `isEvilConverted` 仍是 undefined）。
 *
 *   这与「主谋额外一天」「弄臣免死消费」同型：**判据写得很完整，但没有生产调用方**。
 *
 * ── 为什么放在 `postProcess`（与弄臣免死消费者同一套路）────────────────
 *   `runFullAbilityPipeline` 在 `preview === true` 时**跳过 stateUpdate 与 postProcess**
 *   ⇒ 说书人的「提示预演」绝不会误触发阵营转换（本项目复发多次的「提示 ≠ 结算」）。
 *
 * ── 判据 ────────────────────────────────────────────────────────────
 *   ① 行动者必须**真的发动了能力**（`abilityEffective !== false`：醉/毒的选者不算）；
 *   ② 目标里存在**存活、未醉毒**的莽夫，且不是行动者自己；
 *   ③ **每夜只有首个**选者生效 ⇒ 用 `goonTriggeredAtNight === nightCount` 判重；
 *   ④ 阵营判定复用 `utils/bmrMechanics::isGoodSeat`（与 `goon.ability` 完全同源），
 *      不在这里内联 `role.type === "demon"`。
 */
import type { MiddlewareContext } from "./middlewareTypes";
import { isGoodSeat, isDrunkOrPoisoned } from "./bmrMechanics";

/** 与 `goon.ability.ts` 的标记完全一致，保证两条写入路径可互相识别 */
const GOON_DRUNK_SOURCE = "goon";

export function createGoonBroadcast(): (
  context: MiddlewareContext
) => Promise<MiddlewareContext> {
  return async (context: MiddlewareContext): Promise<MiddlewareContext> => {
    if (context.aborted) return context;

    const actorId = context.actionNode?.seatId;
    if (typeof actorId !== "number") return context;

    // ① 能力必须真的生效（醉/毒的选者「没有使用能力」）
    if (context.meta?.abilityEffective === false) return context;

    // ② 收集本次能力涉及的目标（不同角色 result 形状不同 ⇒ 逐个字段兜住）
    const ids = new Set<number>();
    const push = (v: any) => {
      if (typeof v === "number") ids.add(v);
      else if (Array.isArray(v)) v.forEach(push);
    };
    const r: any = context.meta?.abilityResult ?? {};
    push(r.targetId);
    push(r.targetIds);
    push(r.chooserSeatId);
    push((context.actionNode as any)?.targetIds);
    push(context.targetIds);
    if (ids.size === 0) return context;

    const seats = ((context.snapshot?.seats ?? []) as any[]).slice();
    const nightCount = context.snapshot?.nightCount ?? 0;
    const actorIdx = seats.findIndex((s) => s.id === actorId);
    if (actorIdx < 0) return context;
    const actorSeat = seats[actorIdx];

    for (const id of ids) {
      if (id === actorId) continue; // 「选择了你」不含自己选自己
      const idx = seats.findIndex((s) => s.id === id);
      if (idx < 0) continue;

      const goon = seats[idx];
      if (goon?.role?.id !== "goon") continue;
      if (goon.isDead === true) continue;
      // ③ 每夜只认首个选者
      if (goon.goonTriggeredAtNight === nightCount) continue;
      // 醉酒/中毒的莽夫失去能力（官方核心规则）
      if (isDrunkOrPoisoned(goon, seats)) continue;

      const isChooserEvil = !isGoodSeat(actorSeat);

      // 选者醉酒至下个黄昏（与 goon.ability 的 effects 形状保持一致）
      const actorEffects = [...(actorSeat.statusEffects ?? [])];
      if (
        !actorEffects.some(
          (e: any) => e?.type === "drunk" && e?.source === GOON_DRUNK_SOURCE
        )
      ) {
        actorEffects.push({
          type: "drunk",
          source: GOON_DRUNK_SOURCE,
          sourceSeatId: id,
          duration: "黄昏",
        });
      }
      seats[actorIdx] = {
        ...actorSeat,
        isDrunk: true,
        statusEffects: actorEffects,
      };

      // 莽夫转变为「他的阵营」
      seats[idx] = {
        ...goon,
        alignment: isChooserEvil ? "evil" : "good",
        isEvilConverted: isChooserEvil,
        goonTriggeredAtNight: nightCount,
      };

      return {
        ...context,
        snapshot: { ...context.snapshot, seats },
        meta: {
          ...context.meta,
          goonBroadcastApplied: true,
          goonBroadcast: { goonSeatId: id, chooserSeatId: actorId, isChooserEvil },
        },
      };
    }

    return context;
  };
}
