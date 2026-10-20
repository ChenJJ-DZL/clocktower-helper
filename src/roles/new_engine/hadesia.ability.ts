/**
 * 哈迪寂亚（Hadesia）新引擎技能实现
 *
 * 【角色能力】官方：「每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：
 *   他们分别秘密决定自己的生死，然后如果他们都存活则都死亡。」
 *
 * ⚠️ 2026-10-20 语义修正：原实现误为「选一名死亡玩家复活并转化为爪牙」
 *   （与官方完全不符，系「哈德西亚」误记）。现改为官方的「选 3 人定生死」，
 *   结算中间件复用 al_hadikhia.ability（同一套逻辑的唯一事实源）。
 *   拂晓的生/死选择与结算走 HADESIA_KILL_CONFIRM 弹窗（GameModals 挂载）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  preCheck as alHadikhiaPreCheck,
  calculate as alHadikhiaCalculate,
  stateUpdate as alHadikhiaStateUpdate,
  postProcess as alHadikhiaPostProcess,
} from "./al_hadikhia.ability";

export const hadesiaAbility = createRoleAbility({
  /** 角色标识符：data.ts 的哈迪寂亚座位 */
  roleId: "hadesia",
  /** 能力标识符 */
  abilityId: "hadesia_night",
  /** 能力中文名 */
  abilityName: "选择三名玩家决定生死",

  /** 触发时机：每个夜晚*（不含首夜） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 51,
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.hadesia.wake",

  /**
   * 目标选择配置：必须恰好选择三名玩家。
   */
  targetConfig: {
    min: 3,
    max: 3,
    allowSelf: false,
    allowDead: false,
  },

  preCheck: [alHadikhiaPreCheck],
  calculate: [alHadikhiaCalculate],
  stateUpdate: [alHadikhiaStateUpdate],
  postProcess: [alHadikhiaPostProcess],
});
