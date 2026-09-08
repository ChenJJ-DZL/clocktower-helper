/**
 * 异教领袖（Cult Leader）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会转变为与你邻近的一名存活的玩家的阵营。
 *  每个白天，你可以提议所有玩家加入你的教派，如果所有善良玩家同意加入，你的阵营获胜。"
 *
 * 夜间唤醒方式与共情者/占卜师相同：不让其交互选人，直接根据左右两侧存活玩家的阵营情况：
 * - 左右两侧存活玩家中有且仅有1个邪恶：给出“是”（通知其转变为邪恶）；
 * - 左右两侧存活玩家中没有邪恶或全为邪恶：给出“否”（若全邪恶则转为邪恶但无需在非1邪恶时通知“是”，遵循说书人手势规则）。
 * targetConfig: { min: 0, max: 0 }
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
  const seats = ctx.snapshot.seats ?? [];
  const selfSeatId = ctx.actionNode.seatId;
  const selfIndex = seats.findIndex((s: any) => s.id === selfSeatId);
  const effective = ctx.meta.abilityEffective ?? true;

  if (selfIndex === -1 || seats.length < 3) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { result: false, hasOneEvilNeighbor: false },
      },
    };
  }

  // 顺时针找最近存活邻居
  let rightNeighbor: any = null;
  for (let i = 1; i < seats.length; i++) {
    const s = seats[(selfIndex + i) % seats.length];
    if (s.isAlive && !s.isDead) {
      rightNeighbor = s;
      break;
    }
  }

  // 逆时针找最近存活邻居
  let leftNeighbor: any = null;
  for (let i = 1; i < seats.length; i++) {
    const s = seats[(selfIndex - i + seats.length) % seats.length];
    if (s.isAlive && !s.isDead) {
      leftNeighbor = s;
      break;
    }
  }

  const isEvil = (s: any) => {
    if (!s) return false;
    const team = s.role?.team || s.team;
    return (
      team === "evil" ||
      team === "demon" ||
      team === "minion" ||
      s.role?.type === "demon" ||
      s.role?.type === "minion" ||
      s.isEvilConverted === true
    );
  };

  const leftEvil = isEvil(leftNeighbor);
  const rightEvil = isEvil(rightNeighbor);
  const evilCount = (leftEvil ? 1 : 0) + (rightEvil ? 1 : 0);

  // 左右有且仅有1个邪恶时，告知“是”；否则“否”
  let hasOneEvil = evilCount === 1;

  if (!effective) {
    // 醉酒中毒时反转
    hasOneEvil = !hasOneEvil;
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        result: hasOneEvil,
        hasOneEvilNeighbor: hasOneEvil,
        answer: hasOneEvil,
        evilNeighborCount: evilCount,
        leftNeighborId: leftNeighbor?.id,
        rightNeighborId: rightNeighbor?.id,
        isCorrupted: !effective,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        cult_leader: r,
      },
    },
    meta: { ...ctx.meta, cultLeaderResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = r?.isCorrupted ? "【受干扰】" : "";
  const resultText = r?.result ? "是（左右有1名邪恶邻居）" : "否（左右无或全为邪恶）";
  const log = `[CultLeader]${tag} 异教领袖得知邻居阵营情况：${resultText}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【异教领袖】，给出手势：【${r?.result ? "大拇指向下 / 是" : "大拇指水平或向上 / 否"}】`,
      displayInfo: {
        type: "cult_leader_info",
        result: r?.result,
        resultText,
        log,
        isCorrupted: r?.isCorrupted,
      },
    },
  };
};

export const cultLeaderAbility = createRoleAbility({
  roleId: "cult_leader",
  abilityId: "cult_leader_ally",
  abilityName: "异教领袖",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 74,
  otherNightPriority: 107,
  firstNightOnly: false,
  wakePromptId: "role.cult_leader.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});
