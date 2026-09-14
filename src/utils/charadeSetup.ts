/**
 * 酒鬼 / 提线木偶 的「永久醉酒」落地 —— **全仓唯一入口**
 *
 * ============================================================
 * 为什么需要这个模块（2026-09-14 用户实测报告的缺陷）
 * ============================================================
 * 官方（`officialRoleDocs.json`）：
 *   · 酒鬼「你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。」
 *     「酒鬼**没有任何能力**。…如果那个镇民能够获取信息，说书人可以对酒鬼给出
 *      **错误的信息**作为替代」
 *   · 提线木偶「认为自己是提线木偶的玩家所抽取到的善良角色对应的能力**不会产生
 *      任何效果**，但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。」
 *     「将提线木偶以为的那个角色**视同醉酒一样来运作**…**可能获得错误信息**」
 *
 * 实现链路：座位上写入 `statusEffects: [{ type: "drunk", permanent: true }]`
 *   → `abilityPriorityMiddleware` 判 `abilityEffective = false`
 *   → 信息类能力走假信息路径（`infoMessageBuilder` / `corruptedInfo`）
 *
 * ⚠️⚠️ 曾经的缺陷（用户实测：**提线木偶被当作赏金猎人后得知了真实信息**）：
 *   `drunk.ability.ts` / `marionette.ability.ts` 确实会写这个效果，
 *   但那是在**它们自己的能力管道**里写的 —— 而**生产从不调用这两个管道**：
 *   酒鬼/木偶以为自己是被伪装的那个镇民，引擎按**伪装角色**的能力来调度
 *   （不会去跑 `drunkAbility` / `marionetteAbility`）。
 *   ⇒ 设置阶段只落了 `charadeRole` / `displayRole`，**没有落 drunk 效果** →
 *     中间件判 `abilityEffective = true` → 赏金猎人之类**给出真值**。
 *   （测试之所以一直绿，是因为测试夹具**手动补了**这个效果 —— 假绿。）
 *
 * ⇒ 修法：把「配置伪装身份」与「落地永久醉酒」绑定成同一个动作，
 *   在**所有**写入 `charadeRole` 的地方统一调用本模块，并在游戏开始 / 读档处兜底。
 */

/** 永久醉酒的来源标记（与 drunk.ability.ts / marionette.ability.ts 逐字一致，保证幂等） */
const PERMANENT_DRUNK_SOURCE: Record<string, string> = {
  drunk: "drunk",
  marionette: "marionette",
};

export interface CharadeLikeSeat {
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: unknown;
  statusEffects?: any[];
  [k: string]: any;
}

/** 该座位是否属于「永久醉酒」类身份（酒鬼 / 提线木偶） */
export function isCharadeDrunkSeat(seat: CharadeLikeSeat | null | undefined): boolean {
  const rid = seat?.role?.id;
  return rid === "drunk" || rid === "marionette";
}

/**
 * 幂等地给座位补上「永久醉酒」效果。
 *
 * - 只处理酒鬼 / 提线木偶；其他座位原样返回（同一引用，便于 `toBe` 断言）
 * - 幂等：同来源的旧效果先被过滤，再追加一条；重复调用结果不变
 * - 不影响其他来源的醉酒（水手 / 吟游诗人 / 吟游歌手的临时醉酒）
 */
export function withCharadePermanentDrunk<T extends CharadeLikeSeat>(seat: T): T {
  if (!isCharadeDrunkSeat(seat)) return seat;
  const source = PERMANENT_DRUNK_SOURCE[seat.role!.id!];
  const rest = (seat.statusEffects ?? []).filter(
    (e: any) => !(e?.type === "drunk" && e?.source === source)
  );
  const alreadyClean =
    rest.length === (seat.statusEffects ?? []).length &&
    (seat.statusEffects ?? []).some(
      (e: any) => e?.type === "drunk" && e?.source === source && e?.permanent === true
    );
  if (alreadyClean) return seat;
  return {
    ...seat,
    statusEffects: [
      ...rest,
      {
        type: "drunk",
        source,
        permanent: true,
        appliedAt: Date.now(),
      },
    ],
  } as T;
}

/**
 * 批量落地。**已配置伪装身份**（酒鬼/木偶的 `charadeRole`）时才是正常态；
 * 但即便尚未配置伪装，也照样落地 —— 因为酒鬼/木偶从设置阶段起就是永久醉酒的，
 * 与其伪装是否已选无关（避免"未设伪装"的存档漏掉这层）。
 */
export function applyCharadePermanentDrunk<T extends CharadeLikeSeat>(
  seats: readonly T[]
): T[] {
  let changed = false;
  const out = seats.map((s) => {
    const next = withCharadePermanentDrunk(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? out : (seats as unknown as T[]);
}
