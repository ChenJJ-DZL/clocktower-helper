/**
 * 唱诗男孩（Choir Boy）新引擎技能实现（实验角色）
 *
 * 【官方百科能力】"如果恶魔杀死了国王，你会得知哪名玩家是恶魔。[+国王]"
 *
 * 运作方式：
 * - 仅当恶魔杀死了国王（非其他死亡原因）时，唱诗男孩被唤醒并得知恶魔玩家。
 * - 若国王被僧侣等保护未死亡，则不触发。
 * - 若唱诗男孩醉酒/中毒，说书人可以给他指出非恶魔玩家（例如食人族等其他角色）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { roles as ALL_ROLES } from "../../../app/data";
import { applyChoirboyKingSetup } from "../../utils/expansionMechanics";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * ⭐ 唯一判据（SST）：国王是否**在今晚被杀死**。
 *
 * 官方【角色能力】：「**如果恶魔杀死了国王**，你会得知哪名玩家是恶魔。[+国王]」
 * ⇒ 判据 = 国王座位 ∈ `snapshot.deadThisNight`（与 `expansionMechanics.ts::checkChoirboyTrigger`
 *   的 `killedTonightIds` **同构**，同一份事实源）。
 *
 * ⚠️ 2026-09-21 修复 P1-14：原先 **preCheck 与 calculate 各判一套**——
 *   preCheck 读手搓旗标 `isKingKilledByDemon`（`app/data.ts` 无此字段、生产从不写），
 *   calculate **完全不判**（无条件告知真实恶魔）。现统一到本函数，两处共用。
 *
 * 📌 **已登记的阻塞项**：`king` **未注册进 `app/data.ts` 的 roles 表**
 *   （`src/roles/new_engine/king.ability.ts` 存在，但 roles 表无 `id: "king"`），
 *   而官方的 `[+国王]` 设置注入亦未落地 ⇒ 生产牌局里 seats 中**不会出现 king 座位**
 *   ⇒ 本能力（以及 `checkChoirboyTrigger`）在生产**尚不可达**。
 *   ⇒ 待办：注册 `king` + 落地 `[+国王]` 设置注入（见当日日志批次 40）。
 *
 * 🔁 过渡期兼容：仍接受 `isKingKilledByDemon` 旗标（既有测试夹具使用），
 *   待 `king` 注册后**应删除**该分支。
 */
function isKingKilledTonight(ctx: MiddlewareContext): boolean {
  const seats: any[] = (ctx.snapshot as any)?.seats ?? [];
  const killedTonight: number[] = (ctx.snapshot as any)?.deadThisNight ?? [];
  const kingSeat = seats.find((s: any) => s.role?.id === "king");
  if (kingSeat && killedTonight.includes(kingSeat.id)) return true;

  // ── 过渡期兼容（king 未注册期间）──
  return (
    (ctx.snapshot as any).isKingKilledByDemon === true ||
    (ctx.actionNode as any)?.isKingKilledByDemon === true ||
    (ctx.storytellerInput as any)?.isKingKilledByDemon === true
  );
}

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };

  if (!isKingKilledTonight(ctx)) {
    return { ...ctx, aborted: true, abortReason: "国王今晚未被杀死" };
  }

  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isAbilityActive = ctx.meta.abilityEffective ?? true;

  // 🔔 防御性复查（preCheck 已用**同一个** `isKingKilledTonight` 拦过一次；
  //   此处保留是为了「直接喂管道」的测试路径也能守住前提 —— 单一判据，不重复实现）。
  if (!isKingKilledTonight(ctx)) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { triggered: false, demonSeatId: null, reason: "国王今晚未被杀死" },
      },
    };
  }

  // 寻找真实恶魔
  const realDemon = ctx.snapshot.seats.find(
    (s: any) => s.role && s.role.type === "demon"
  );

  let targetDemonSeatId: number | null = null;
  let isCorrupted = false;

  if (isAbilityActive) {
    // 正常状态：得知真实恶魔（支持说书人显式指定或默认）
    targetDemonSeatId =
      ctx.storytellerInput?.selectedSeatId ??
      realDemon?.id ??
      null;
    isCorrupted = false;
  } else {
    // 醉酒/中毒：指出错误玩家（例如非恶魔玩家）
    isCorrupted = true;
    if (ctx.storytellerInput?.selectedSeatId != null) {
      targetDemonSeatId = ctx.storytellerInput.selectedSeatId;
    } else {
      // 默认挑选一名非恶魔玩家作为干扰
      const nonDemon = ctx.snapshot.seats.find(
        (s: any) => s.id !== ctx.actionNode.seatId && (!s.role || s.role.type !== "demon")
      );
      targetDemonSeatId = nonDemon ? nonDemon.id : (realDemon?.id ?? 0);
    }
  }

  const targetSeat = ctx.snapshot.seats.find((s: any) => s.id === targetDemonSeatId);

  const abilityResult = {
    demonFound: targetDemonSeatId != null,
    demonSeatId: targetDemonSeatId,
    demonRoleName: targetSeat?.role?.name ?? null,
    isAbilityActive,
    isCorrupted,
  };

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult,
      isCorrupted,
      displayInfo: {
        demonSeatId: targetDemonSeatId,
        demonRoleName: targetSeat?.role?.name ?? null,
        isCorrupted,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) {
    return ctx;
  }
  return {
    ...ctx,
    meta: { ...ctx.meta, choirBoyResult: r },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        choirBoy: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) return ctx;
  const tag = r.isCorrupted ? "【受干扰】" : "";
  const log = `[ChoirBoy]${tag} 国王被恶魔杀害，唱诗男孩得知恶魔是 ${r.demonSeatId + 1}号（${r.demonRoleName ?? "未知"}）`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `国王被恶魔杀害。唤醒${ctx.actionNode.seatId + 1}号【唱诗男孩】，指向${r.demonSeatId + 1}号为恶魔。`,
      abilityLog: log,
    },
  };
};

export const choirBoyAbility = createRoleAbility({
  roleId: "choir_boy",
  abilityId: "choir_boy_king_death",
  abilityName: "国王之殁",
  /**
   * ⚠️⚠️ 2026-09-21 修复 P1-14【唱诗男孩：每夜入队 + 无前提校验】
   * 官方【角色能力】：「**如果恶魔杀死了国王**，你会得知哪名玩家是恶魔。[+国王]」
   *   ⇒ 这是**「他人（国王）死亡触发」**，不是常驻被动。
   *
   * 🔴 原状：`triggerTiming: [PASSIVE]` + `otherNightPriority: 84` ⇒ **每夜被唤醒**
   *   （说书人每夜看到多余步骤），且 calculate **无条件**告知真实恶魔
   *   （缺「国王被恶魔杀死」这一前提）。
   *
   * ✅ 修法（统一引擎，非特例）：
   *   ① 声明 `deathEventWatch: { roleId: "king" }` ⇒ 由 **死亡事件统一分发器**
   *      （`dynamicQueueGenerator.ts::resolveDeathEventWakeups`）在国王死亡当晚，
   *      把**存活的**唱诗男孩动态插入唤醒队列；
   *   ② 静态队列**自动排除**（声明了 deathEventWatch 的角色一律不入静态队列）；
   *   ③ `calculate` 增加前提校验：国王**未在今晚被杀死** ⇒ 不产出恶魔信息。
   */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  deathEventWatch: { roleId: "king", cause: "any" },
  /**
   * ⭐ 【设置调整】`[+国王]`：官方「**在游戏设置阶段，如果唱诗男孩在场而国王不在场，
   *   那么国王就会被添加进来并替换掉一个其他镇民。**」
   *
   * 落点说明：`useSeatManager.ts:205` 会在设置阶段调用**新引擎**的 `onSetup`
   *   （签名 `({ seats, selfId }) => { updates?, logs? }`）。
   *   实际逻辑收敛到纯函数 `expansionMechanics::applyChoirboyKingSetup`（SST），
   *   本钩子只做适配 —— **禁止**在此写专属特例。
   */
  onSetup: ({ seats, selfId }: { seats: any[]; selfId: number }) => {
    const kingRole = (ALL_ROLES as any[]).find((r) => r.id === "king");
    const res = applyChoirboyKingSetup(seats as any, kingRole as any);
    if (!res.changed) {
      return {
        logs: { publicLog: `[+国王] 未注入：${res.reason}` },
      };
    }
    // 只回传被替换座位的 patch（role 替换）
    const updated = res.seats.find((s: any) => s.id === res.replacedSeatId);
    return {
      updates: [{ id: res.replacedSeatId, role: (updated as any)?.role }],
      logs: {
        publicLog: `[+国王] ${(res.replacedSeatId ?? -1) + 1}号 被替换为「国王」（唱诗男孩在场）`,
      },
    };
  },
  firstNightPriority: null,
  otherNightPriority: 84,
  firstNightOnly: false,
  wakePromptId: "role.choir_boy.wake",
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
