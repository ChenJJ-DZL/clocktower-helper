/**
 * 麻脸巫婆（Pit-Hag）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家和一个角色，如果该角色不在场，
 *   他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"
 *
 * 每夜选择目标+角色，进行角色变换。
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
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const newRoleId =
    ctx.storytellerInput?.newRoleId ?? ctx.storytellerInput?.roleId ?? null;

  // 官方规则：如果该角色在场，则无事发生
  const seats = ctx.snapshot.seats ?? [];
  const isAlreadyInPlay =
    newRoleId != null &&
    seats.some(
      (s: any) => s.role?.id === newRoleId || (s as any).roleId === newRoleId
    );

  const canTransform = targetId !== null && newRoleId !== null && !isAlreadyInPlay;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        newRoleId,
        isAlreadyInPlay,
        transformed: canTransform,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   本 `stateUpdate` 此前**完全不消费 `ctx.meta.abilityEffective`**
   *   ⇒ 中毒/醉酒的该角色照样施加效果（与已修的 cerenovus / vortox 同类）。
   *
   * 🔒 blocked 分支**只记「选择」与「已受干扰」**，刻意**不写**：
   *   · `snapshot.seats`（死亡 / 状态效果本身就是"效果"，写了就等于能力生效）
   *   · 各角色的特征副作用字段（如相邻中毒名单 / 变身标记 / 交换标记）
   *   ⇒ 说书人能看到技能被发动过，但世界没有变化。
   */

  const abilityEffective = ctx.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        pit_hagResult: { ...r, blockedByDrunkOrPoison: true },
        isCorrupted: true,
      },
      snapshot: {
        ...ctx.snapshot,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          pit_hag: { ...r, blockedByDrunkOrPoison: true },
        },
      },
    };
  }

  if (!r?.transformed) return ctx;

  const seats = ctx.snapshot.seats ?? [];
  const targetSeat = seats.find((s: any) => s.id === r.targetId);
  const isDemonCreated = [
    "fang_gu",
    "vigormortis",
    "no_dashii",
    "vortox",
    "imp",
    "zombuul",
    "pukka",
    "shabaloth",
    "po",
  ].includes(r.newRoleId);

  const nextSeats = seats.map((s: any) => {
    if (s.id === r.targetId) {
      return {
        ...s,
        role: {
          id: r.newRoleId,
          name: r.newRoleId,
          type: isDemonCreated ? "demon" : s.role?.type ?? "townsfolk",
        },
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      isDemonCreatedByPitHag: isDemonCreated,
      deathDecidedByStoryteller: isDemonCreated,
      roleChanges: [
        ...((ctx.snapshot as any).roleChanges ?? []),
        { seatId: r.targetId, newRole: r.newRoleId },
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        pit_hag: r,
      },
    },
    meta: { ...ctx.meta, pitHagResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) {
    console.log("[PitHag] 无操作");
    return ctx;
  }
  const log = `[PitHag] ${r.targetId + 1}号 → ${r.newRoleId ?? "未指定角色"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【麻脸巫婆】，选择一名玩家和一个角色进行变换。`,
      abilityLog: log,
    },
  };
};

export const pit_hagAbility = createRoleAbility({
  roleId: "pit_hag",
  abilityId: "pit_hag_transform",
  abilityName: "角色变换",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 11,
  firstNightOnly: false,
  wakePromptId: "role.pit_hag.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
