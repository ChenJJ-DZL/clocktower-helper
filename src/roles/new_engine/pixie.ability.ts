/**
 * 小精灵（Pixie）新引擎技能实现
 *
 * 官方 Wiki（罂粟花开 1:1 规格书）：
 *   "在你的首个夜晚，你会得知一个在场的镇民角色。
 *    如果你"疯狂"地证明你是该角色，当他死亡时你获得该角色的能力。"
 *
 * 实现：两阶段机制
 *   阶段 1（首夜）：说书人选择或随机选一个在场镇民角色
 *     → 存入 snapshot.pixieMadnessRoleId + pixieMadnessRoleName
 *     → 不立即获得能力
 *   阶段 2（被动 / 死亡触发）：当该镇民玩家死亡时（DEATH_TRIGGERED），
 *     小精灵获得该角色的能力（pixieCopiedRole 写入）
 *
 * "疯狂证明" 通过 GameConsole 上的「🎭 小精灵疯狂状态」切换控件由说书人标记。
 * 若小精灵醉酒/中毒（abilityEffective=false）→ 告知一个错误的镇民角色。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  const nightCount = ctx.snapshot.nightCount ?? 0;
  if (nightCount !== 1 && ctx.snapshot.gamePhase !== "firstNight") {
    // 阶段 2（死亡触发）：首夜已记录疯狂角色且该镇民死亡 → 允许唤醒继承能力
    const madRoleId = (ctx.snapshot as any).pixieMadnessRoleId;
    if (madRoleId && nightCount > 1) {
      const madRoleSeat = ctx.snapshot.seats.find(
        (s: any) => s.role?.id === madRoleId
      );
      // 记录的镇民仍在场且存活 → 不触发继承
      if (madRoleSeat && !madRoleSeat.isDead) {
        return {
          ...ctx,
          aborted: true,
          abortReason: "记录的镇民未死亡，小精灵不获得能力",
        };
      }
      return { ...ctx, meta: { ...ctx.meta, isPixieDeathTrigger: true } };
    }
    return { ...ctx, aborted: true, abortReason: "非首夜，小精灵不唤醒" };
  }

  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const effective = ctx.meta.abilityEffective ?? true;

  // 阶段 2：死亡触发，直接继承记录的镇民能力
  if ((ctx.meta as any).isPixieDeathTrigger) {
    const madRoleId = (ctx.snapshot as any).pixieMadnessRoleId;
    const madRoleName =
      (ctx.snapshot as any).pixieMadnessRoleName ?? madRoleId ?? "未知";
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          isDeathTrigger: true,
          roleId: madRoleId,
          roleName: madRoleName,
        },
      },
    };
  }

  // 从所有在场 townsfolk 中随机/说书人选一个
  const allTownsfolk = ctx.snapshot.seats
    .filter(
      (s: any) => s.role?.type === "townsfolk" && s.id !== ctx.actionNode.seatId
    )
    .map((s: any) => ({
      id: s.role.id,
      name: s.role.name,
      type: s.role.type,
    }));

  let picked: { id: string; name: string; type: string };
  if (ctx.storytellerInput?.pixieMadnessRoleId) {
    const explicit = allTownsfolk.find(
      (r) => r.id === ctx.storytellerInput.pixieMadnessRoleId
    );
    picked = explicit ??
      allTownsfolk[0] ?? { id: "未知", name: "未知", type: "townsfolk" };
  } else if (allTownsfolk.length > 0) {
    if (!effective) {
      // 醉酒/中毒：换一个不正确的（排除说书人指定如有）
      const other = allTownsfolk.filter(
        (r) => r.id !== (ctx.storytellerInput?.pixieMadnessRoleId ?? "")
      );
      picked =
        other[Math.floor(Math.random() * other.length)] ?? allTownsfolk[0];
    } else {
      picked = allTownsfolk[Math.floor(Math.random() * allTownsfolk.length)];
    }
  } else {
    picked = { id: "未知", name: "未知", type: "townsfolk" };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        roleId: picked.id,
        roleName: picked.name,
        roleType: picked.type,
        isCorrupted: !effective,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const selfSeatId = ctx.actionNode.seatId;

  if ((r as any)?.isDeathTrigger && r?.roleId) {
    const seatsAfterCopy = ctx.snapshot.seats.map((s: any) =>
      s.id === selfSeatId
        ? {
            ...s,
            pixieCopiedRole: r.roleId,
            acquiredAbilities: [
              ...((s.acquiredAbilities as string[]) ?? []),
              ...(s.acquiredAbilities?.includes?.(r.roleId) ? [] : [r.roleId]),
            ],
            statusDetails: [
              ...(s.statusDetails || []),
              `获得死去镇民能力:${r.roleName}`,
            ],
          }
        : s
    );
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        seats: seatsAfterCopy,
        pixieCopiedRole: r.roleId,
      },
      meta: { ...ctx.meta, pixieResult: r },
    };
  }
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === selfSeatId && r?.roleName) {
      const details = (s.statusDetails || []).filter(
        (d: string) => !d.startsWith("伪装身份:")
      );
      return {
        ...s,
        pixieTargetRole: r.roleName,
        statusDetails: [...details, `伪装身份:${r.roleName}`],
      };
    }
    return s;
  });
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      pixieMadnessRoleId: r?.roleId ?? null,
      pixieMadnessRoleName: r?.roleName ?? null,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        pixie: r,
      },
    },
    meta: { ...ctx.meta, pixieResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = r?.isCorrupted ? "【受干扰】" : "";
  const log = `[Pixie]${tag} 首夜得知一个在场镇民角色：${r?.roleName ?? "未知"}（疯狂证明后，该镇民死亡时获得其能力）`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【小精灵】，告知其一个在场镇民角色：${r?.roleName ?? "未知"}。他需"疯狂"地证明自己是该角色；当该玩家死亡时小精灵获得其能力。`,
      abilityLog: log,
    },
  };
};

export const pixieAbility = createRoleAbility({
  roleId: "pixie",
  abilityId: "pixie_first_night",
  abilityName: "小精灵两阶段",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 50,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.pixie.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
