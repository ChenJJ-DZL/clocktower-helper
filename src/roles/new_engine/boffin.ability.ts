/**
 * 科学怪人（Boffin）新引擎技能实现
 *
 * 【角色能力】"恶魔拥有一个不在场的善良角色的能力，即使他醉酒或中毒。你和他都知道他获得了什么能力。"
 *
 * PASSIVE 触发：存档时配置，恶魔获得额外能力。
 * 由说书人通过 storytellerInput 配置恶魔获得的额外能力。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const grantedAbility = ctx.storytellerInput?.grantedAbility ?? null;
  const targetDemonId = ctx.storytellerInput?.targetDemonId ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        boffinActive: true,
        grantedAbility,
        targetDemonId,
        configured: grantedAbility !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.configured) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      boffinGrantedAbility: r.grantedAbility,
      boffinTargetDemon: r.targetDemonId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        boffin: r,
      },
    },
    meta: { ...ctx.meta, boffinResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.configured
    ? `[科学怪人] 恶魔获得能力: ${r.grantedAbility}`
    : "[科学怪人] 未配置额外能力";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: "【科学怪人】为恶魔配置一个不在场的善良角色能力。",
    },
  };
};

export const boffinAbility = createRoleAbility({
  roleId: "boffin",
  abilityId: "boffin_grant_ability",
  abilityName: "恶魔能力赋予",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: true,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
