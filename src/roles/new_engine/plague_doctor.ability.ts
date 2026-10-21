/**
 * 瘟疫医生（Plague Doctor）新引擎技能实现
 *
 * 【官方百科能力】"当你死亡时，说书人会获得一个爪牙能力。"
 *
 * 运作方式：
 * - 当瘟疫医生死亡时（死于处决或夜间受袭），说书人获得一个爪牙能力（如投毒者、洗脑师、女巫等）。
 * - 随后，该爪牙能力在相应时机由说书人代行选择和结算。
 * - 即使瘟疫医生死后因吟游诗人等效果处于醉酒状态，说书人获得的爪牙能力依然保留并生效（因为该能力已归属于说书人）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { grantStorytellerMinionAbility } from "../../utils/expansionMechanics";
import { roles } from "../../../app/data";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  // 必须处于死亡状态才结算死亡获得爪牙能力
  if (seat && !seat.isDead) {
    return { ...ctx, aborted: true, abortReason: "瘟疫医生尚未死亡" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 选定赋予说书人的爪牙能力（支持说书人输入指定，默认 poisoner）
  const grantedMinionRole =
    ctx.storytellerInput?.minionRole ??
    (ctx.actionNode as any).minionRole ??
    "poisoner";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        plagueDoctorSeatId: ctx.actionNode.seatId,
        /** 内部用：爪牙角色 id（如 poisoner） */
        grantedMinionRole,
        /**
         * ⚠️⚠️ 2026-10-20 修复（L1 矩阵 G2b 抓出）：
         *   旧实现把 `grantedMinionRole`（英文 id）直接拼进玩家/说书人可见文案，
         *   实测输出「说书人已获得爪牙【poisoner】能力」。
         *   `prompt` 与 `displayInfo.log` 都会上屏，必须用中文名。
         */
        grantedMinionRoleName:
          roles.find((x) => x.id === grantedMinionRole)?.name ??
          grantedMinionRole,
        storytellerAcquired: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.storytellerAcquired) return ctx;

  const currentStorytellerAbilities =
    (ctx.snapshot as any).storytellerAbilities ?? [];

  const updatedAbilities = grantStorytellerMinionAbility(
    currentStorytellerAbilities,
    r.grantedMinionRole,
    ctx.snapshot.gamePhase ?? "day"
  );

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      storytellerAbilities: updatedAbilities,
      /**
       * 🔴 2026-10-22：`snapshot.storytellerAbilities` 是**每次行动现构的临时快照**，
       *   既不同步回 React 状态、也不在持久化白名单里 ⇒ 刷新即丢、事后无法追溯
       *   （实测 `clocktower_current_snapshot` 里根本没有这个字段）。
       *   这里额外把「获得了哪个爪牙能力」记到**瘟疫医生自己的座位上**
       *   （座位会同步 + 进快照），保证这条规则至少**可追溯**。
       *   ⚠️ 仍未做：说书人没有「使用该爪牙能力」的 UI 入口（见 §17.3 缺口 5）。
       */
      seats: (ctx.snapshot.seats ?? []).map((seat: any) =>
        seat.id === r.plagueDoctorSeatId
          ? {
              ...seat,
              storytellerGrantedMinion: r.grantedMinionRole,
              storytellerGrantedMinionName: r.grantedMinionRoleName,
              storytellerAbilityGrantedAtNight:
                ctx.snapshot?.nightCount ?? null,
            }
          : seat
      ),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        plague_doctor: r,
      },
    },
    meta: {
      ...ctx.meta,
      plagueDoctorResult: r,
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const roleName = r.grantedMinionRoleName ?? r.grantedMinionRole;
  const log = `[PlagueDoctor] 瘟疫医生死亡，说书人获得了【${roleName}】爪牙能力！`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `瘟疫医生死亡。说书人已获得爪牙【${roleName}】能力。`,
      displayInfo: {
        type: "plague_doctor_storyteller_gain",
        minionRole: r.grantedMinionRole,
        log,
      },
    },
  };
};

export const plagueDoctorAbility = createRoleAbility({
  roleId: "plague_doctor",
  abilityId: "plague_doctor_storyteller_minion",
  abilityName: "疫病恩赐",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 83,
  firstNightOnly: false,
  wakePromptId: "role.plague_doctor.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
