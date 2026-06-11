/**
 * 利兹（Liz）新引擎技能实现
 *
 * 【角色能力】"实验性恶魔，夜晚可选择是否死亡，选择死亡后，一个爪牙成为利兹，活到最后即胜利。"
 *
 * 每夜由说书人询问利兹是否选择死亡。若选择死亡，随机一名存活爪牙变为利兹，原利兹死亡。
 * 当利兹是场上最后一个存活的恶魔且邪恶阵营获胜时，利兹单独获胜。
 *
 * 说书人操作（targetIds 为空），通过 storytellerInput.lizDies 控制是否触发死亡。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface PlayerLookup {
  id: number;
  isDead?: boolean;
  isAlive?: boolean;
  playerName?: string;
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  roleName?: string;
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  markedForDeath?: boolean;
  deathSource?: string;
  deathSourceSeatId?: number;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck：存活检测
 */
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "利兹已死亡，技能失效" };
  }

  return context;
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate：确定利兹是否选择死亡
 *
 * 说书人通过 storytellerInput.lizDies 决定：
 * - true：利兹死亡，一个爪牙成为新利兹
 * - false：利兹继续存活，无事发生
 */
const calculateChoice = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const lizDies = (context.storytellerInput as any)?.lizDies === true;

  if (!lizDies) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: { lizDies: false },
      },
    };
  }

  // 寻找存活爪牙
  const aliveMinions = context.snapshot.seats.filter((s: any) => {
    if (s.id === context.actionNode.seatId) return false;
    if (!s.isAlive) return false;
    const roleType = s.role?.type ?? s.roleType ?? "";
    return roleType === "minion";
  });

  const successor =
    aliveMinions.length > 0
      ? aliveMinions[Math.floor(Math.random() * aliveMinions.length)]
      : null;

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        lizDies: true,
        successorId: successor?.id ?? null,
        hasSuccessor: successor !== null,
      },
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate：执行利兹死亡 / 爪牙变身
 */
const updateState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  if (!r?.lizDies) return context;

  const { actionNode, snapshot } = context;
  const updatedSeats = [...snapshot.seats];
  const record = {
    lizDies: true,
    successorId: r.successorId,
    nightCount: snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  // 变身爪牙为新利兹
  if (r.successorId != null) {
    const succIdx = updatedSeats.findIndex((s: any) => s.id === r.successorId);
    if (succIdx !== -1) {
      updatedSeats[succIdx] = {
        ...updatedSeats[succIdx],
        role: {
          ...(updatedSeats[succIdx].role ?? {}),
          id: "liz",
          name: "利兹",
          type: "demon",
        },
        roleId: "liz",
        roleType: "demon",
        roleName: "利兹",
        statusDetails: [
          ...(updatedSeats[succIdx].statusDetails ?? []),
          "被利兹传位，成为新的利兹",
        ],
      };
    }
  }

  // 原利兹死亡
  const selfIdx = updatedSeats.findIndex(
    (s: any) => s.id === actionNode.seatId
  );
  if (selfIdx !== -1) {
    updatedSeats[selfIdx] = {
      ...updatedSeats[selfIdx],
      isDead: true,
      markedForDeath: true,
      deathSource: "liz_suicide",
      deathSourceSeatId: actionNode.seatId,
    };
  }

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        liz: record,
      },
    },
    meta: {
      ...context.meta,
      lizResult: record,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess：日志与提示词
 */
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  const selfId = context.actionNode.seatId;

  let prompt: string;
  let abilityLog: string;

  if (!r?.lizDies) {
    prompt = `唤醒${selfId + 1}号【利兹】，询问是否选择死亡。（说书人选择不死亡）`;
    abilityLog = `利兹（${selfId + 1}号）选择继续存活`;
  } else if (r.hasSuccessor) {
    const successorLabel =
      r.successorId != null ? `${r.successorId + 1}号` : "未知";
    prompt = `唤醒${selfId + 1}号【利兹】，询问是否选择死亡。（说书人选择死亡，${successorLabel}已成为新利兹）`;
    abilityLog = `利兹（${selfId + 1}号）选择死亡，${successorLabel}成为新利兹`;
  } else {
    prompt = `唤醒${selfId + 1}号【利兹】，询问是否选择死亡。（说书人选择死亡，但无存活爪牙可继任）`;
    abilityLog = `利兹（${selfId + 1}号）选择死亡，但无存活爪牙继任`;
  }

  console.log(`[Liz] ${abilityLog}`);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt,
      abilityLog,
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const lizAbility = createRoleAbility({
  roleId: "liz",
  abilityId: "liz_night_ability",
  abilityName: "利兹传位",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.liz.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateChoice],
  stateUpdate: [updateState],
  postProcess: [postProcess],
});
