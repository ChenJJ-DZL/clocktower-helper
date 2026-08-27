/**
 * 提刑官（Inspector）新引擎技能实现
 *
 * 【角色能力】"在你首次提名玩家后，你会在当晚得知他的角色。恶魔会被你的能力当作善良角色。"
 *
 * - 白天首次发起提名后（UI 层写入 snapshot.inspectorNomination = { targetId }），
 *   当晚提刑官被唤醒，得知被提名玩家的角色。
 * - 恶魔玩家会被当作某个镇民或外来者（说书人决定 → 引擎随机选取）。
 * - 首次提名得知信息后提刑官失去能力：此后即使再提名其他玩家也不会得知信息。
 * - 白天没有发起提名 → 当晚不被唤醒。
 *
 * 网页版适配：白天提名事件在 UI 层记录到快照，引擎夜间按记录结算。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 可被伪装的善良角色（镇民/外来者 id 池） */
const GOOD_ROLE_IDS = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "undertaker",
  "monk",
  "ravenkeeper",
  "virgin",
  "slayer",
  "soldier",
  "mayor",
  "butler",
  "drunk",
  "recluse",
  "saint",
  "poisoner_target",
];

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 存活校验
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  const snapshot = ctx.snapshot as any;
  // 已消耗（首次提名已结算过）→ 不再唤醒
  if (snapshot.inspectorUsed === true) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "已失去能力（首次提名已结算）",
    };
  }
  // 当天未提名 → 不被唤醒
  const nomination = snapshot.inspectorNomination;
  if (!nomination || nomination.targetId == null) {
    return { ...ctx, aborted: true, abortReason: "白天未发起提名，当晚不唤醒" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const snapshot = ctx.snapshot as any;
  const nomination = snapshot.inspectorNomination as { targetId: number };
  const targetId = nomination.targetId;
  const target = snapshot.seats.find((s: any) => s.id === targetId);

  if (!target) {
    return { ...ctx, aborted: true, abortReason: "被提名玩家不存在" };
  }

  const isDemon =
    target.role?.type === "demon" || target.isDemonSuccessor === true;
  let revealedRoleId: string | null;
  let revealedRoleName: string | null;

  if (isDemon) {
    // 恶魔被当作某个善良角色（镇民/外来者），说书人决定 → 引擎随机
    const fakeId =
      GOOD_ROLE_IDS[Math.floor(Math.random() * GOOD_ROLE_IDS.length)];
    revealedRoleId = fakeId;
    revealedRoleName = fakeId;
  } else {
    revealedRoleId = target.role?.id ?? null;
    revealedRoleName = target.role?.name ?? target.role?.id ?? null;
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        revealedRoleId,
        revealedRoleName,
        isDemon,
        inspectorActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      // 首次结算后消耗能力并清除提名记录
      inspectorUsed: true,
      inspectorNomination: undefined,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        inspector: r,
      },
    },
    meta: { ...ctx.meta, inspectorResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const demonNote = r?.isDemon ? "（恶魔被当作善良角色）" : "";
  const log = `[Inspector] 首次提名 ${r?.targetId != null ? r.targetId + 1 + "号" : ""}，得知角色为【${r?.revealedRoleName ?? "未知"}】${demonNote}，已失去能力`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【提刑官】：你首次提名的${r?.targetId != null ? r.targetId + 1 + "号" : ""}玩家角色是【${r?.revealedRoleName ?? "未知"}】${demonNote}。你的能力已消耗。`,
      displayInfo: {
        type: "inspector_result",
        targetId: r?.targetId ?? null,
        roleId: r?.revealedRoleId ?? null,
        roleName: r?.revealedRoleName ?? "未知",
        isDemon: r?.isDemon ?? false,
      },
      abilityLog: log,
    },
  };
};

export const inspectorAbility = createRoleAbility({
  roleId: "inspector",
  abilityId: "inspector_nomination_info",
  abilityName: "提刑官",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 20,
  otherNightPriority: 20,
  firstNightOnly: false,
  wakePromptId: "role.inspector.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
