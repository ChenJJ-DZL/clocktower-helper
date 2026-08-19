/**
 * 象牙之魂（Spirit of Ivory）寓言角色实现
 *
 * 【角色能力】全局限制邪恶阵营额外生成上限为1名。
 * 当已有1名额外邪恶玩家被转化时，阻止后续转化。
 * 被动触发，不唤醒。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seats = ctx.snapshot.seats ?? [];
  const initialEvilCount = (ctx.snapshot as any).initialEvilCount ?? 0;
  const currentEvilCount = seats.filter(
    (s: any) => s.role?.type === "demon" || s.role?.type === "minion" || s.isEvilConverted
  ).length;
  const extraEvil = Math.max(0, currentEvilCount - initialEvilCount);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        spiritOfIvoryActive: true,
        extraEvilCount: extraEvil,
        maxExtraEvil: 1,
        canConvert: extraEvil < 1,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      spiritOfIvoryActive: true,
      spiritOfIvoryExtraEvil: r?.extraEvilCount ?? 0,
    },
    meta: { ...ctx.meta, spiritOfIvoryResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[SpiritOfIvory] 象牙之魂生效 — 额外邪恶${r?.extraEvilCount}/${r?.maxExtraEvil}`;
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const spiritOfIvoryAbility = createRoleAbility({
  roleId: "spirit_of_ivory",
  abilityId: "spirit_of_ivory_passive",
  abilityName: "象牙之魂",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  otherNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
