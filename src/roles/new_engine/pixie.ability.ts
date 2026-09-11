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
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

interface PixieRoleRef {
  id: string;
  name: string;
  type: string;
}

/**
 * 选出小精灵首夜得知的「在场镇民角色」。
 *
 * - 正常：从在场镇民中随机挑一个；
 * - 醉酒/中毒/涡流：从「不在场镇民」中随机挑一个（保证信息必然是假的）。
 *
 * 抽取 rng 参数：同一夜同一角色的「提示预演」与「实际执行」必须得到同一个
 * 角色，否则提示里预告的角色与实际记录 / 弹窗不一致。
 */
export function pickPixieRole(
  allTownsfolk: PixieRoleRef[],
  outOfPlayTownsfolk: PixieRoleRef[],
  effective: boolean,
  rng: DeterministicRandom = Math.random
): PixieRoleRef {
  if (!effective) {
    return outOfPlayTownsfolk.length > 0
      ? outOfPlayTownsfolk[Math.floor(rng() * outOfPlayTownsfolk.length)]
      : { id: "washerwoman", name: "洗衣妇", type: "townsfolk" };
  }
  if (allTownsfolk.length > 0) {
    return allTownsfolk[Math.floor(rng() * allTownsfolk.length)];
  }
  return { id: "chef", name: "厨师", type: "townsfolk" };
}

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
  const isDrunk = effects.some((e: any) => e.type === "drunk") || !!seat.isDrunk;
  const isPoisoned = effects.some((e: any) => e.type === "poisoned") || !!seat.isPoisoned;
  const isVortox =
    (ctx.snapshot as any).vortoxWorld ||
    (ctx.snapshot as any).isVortoxWorld ||
    ctx.snapshot.seats.some((s: any) => s.role?.id === "vortox" && !s.isDead);

  const abilityEffective = !isDrunk && !isPoisoned && !isVortox;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      isVortox,
      abilityEffective,
      isCorrupted: !abilityEffective,
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

  // 从所有在场 townsfolk 中（排除小精灵自身）
  const allTownsfolk = ctx.snapshot.seats
    .filter(
      (s: any) => s.role?.type === "townsfolk" && s.id !== ctx.actionNode.seatId
    )
    .map((s: any) => ({
      id: s.role.id,
      name: s.role.name,
      type: s.role.type,
    }));

  const inPlayTownsfolkIds = new Set(
    ctx.snapshot.seats
      .filter((s: any) => s.role?.type === "townsfolk")
      .map((s: any) => s.role?.id)
  );

  // 候选不在场镇民：优先从当前剧本中筛选不在场的镇民
  const scriptRoles: any[] = (ctx.snapshot as any).selectedScript?.roles ?? [];
  const outOfPlayTownsfolkFromScript = scriptRoles.filter(
    (r: any) => r.type === "townsfolk" && !inPlayTownsfolkIds.has(r.id)
  );

  // 兜底官方标准镇民库
  const fallbackTownsfolk = [
    { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
    { id: "librarian", name: "图书管理员", type: "townsfolk" },
    { id: "investigator", name: "调查员", type: "townsfolk" },
    { id: "chef", name: "厨师", type: "townsfolk" },
    { id: "empath", name: "共情者", type: "townsfolk" },
    { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
    { id: "undertaker", name: "送葬者", type: "townsfolk" },
    { id: "monk", name: "僧侣", type: "townsfolk" },
    { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
    { id: "virgin", name: "处女", type: "townsfolk" },
    { id: "slayer", name: "猎手", type: "townsfolk" },
    { id: "soldier", name: "士兵", type: "townsfolk" },
    { id: "mayor", name: "镇长", type: "townsfolk" },
  ].filter((r) => !inPlayTownsfolkIds.has(r.id));

  const outOfPlayTownsfolk =
    outOfPlayTownsfolkFromScript.length > 0
      ? outOfPlayTownsfolkFromScript
      : fallbackTownsfolk;

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行）必须一致
  const rng = createDeterministicRandom(
    nightInfoSeed("pixie", ctx.actionNode.seatId, ctx.snapshot.nightCount ?? 1)
  );

  let picked: PixieRoleRef;
  if (ctx.storytellerInput?.pixieMadnessRoleId) {
    const explicit =
      allTownsfolk.find(
        (r) => r.id === ctx.storytellerInput.pixieMadnessRoleId
      ) ||
      outOfPlayTownsfolk.find(
        (r) => r.id === ctx.storytellerInput.pixieMadnessRoleId
      ) || {
        id: ctx.storytellerInput.pixieMadnessRoleId,
        name:
          ctx.storytellerInput.pixieMadnessRoleName ||
          ctx.storytellerInput.pixieMadnessRoleId,
        type: "townsfolk",
      };
    picked = explicit;
  } else {
    // 醉酒/中毒/涡流：告知一个不在场的镇民角色；否则从在场镇民中随机挑一个
    picked = pickPixieRole(allTownsfolk, outOfPlayTownsfolk, effective, rng);
  }

  const tag = !effective ? "【受干扰】" : "";
  const infoText = `得知【${picked.name}】在场`;
  const abilityLog = `[Pixie]${tag} 首夜得知一个在场镇民角色：${picked.name}（疯狂证明后，该镇民死亡时获得其能力）`;

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
      displayInfo: {
        type: "pixie_info",
        roleId: picked.id,
        roleName: picked.name,
        isCorrupted: !effective,
        log: infoText,
      },
      abilityLog,
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
            pixieHasAbility: true,
            acquiredAbilities: [
              ...((s.acquiredAbilities as string[]) ?? []),
              ...(s.acquiredAbilities?.includes?.(r.roleId) ? [] : [r.roleId]),
            ],
            statusDetails: [
              ...(s.statusDetails || []).filter(
                (st: string) =>
                  st !== "能力已激活" && !st.startsWith("获得死去镇民能力:")
              ),
              "能力已激活",
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
        (d: any) => typeof d === "string" ? !d.startsWith("伪装身份:") : true
      );
      return {
        ...s,
        pixieTargetRole: r.roleName,
        pixieMadnessRoleId: r.roleId,
        pixieMadnessRoleName: r.roleName,
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
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【小精灵】，展示角色标记告知其【${r?.roleName ?? "未知"}】在场。小精灵不知道该角色属于哪位玩家；需"疯狂"地证明自己是该角色，当该玩家死亡时小精灵获得其能力。`,
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
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
