import { Seat, Role } from "../../app/data";

/**
 * 统一的弹窗类型定义
 * 所有弹窗状态都通过这个类型系统管理
 */
export type ModalType =
  // 夜晚相关弹窗
  | { type: 'NIGHT_ORDER_PREVIEW'; data: { preview: Array<{ roleName: string; seatNo: number; order: number | null }>; title: string; pendingQueue: Seat[] | null } }
  | { type: 'KILL_CONFIRM'; data: { targetId: number; isImpSelfKill: boolean } }
  | { type: 'POISON_CONFIRM'; data: { targetId: number } }
  | { type: 'POISON_EVIL_CONFIRM'; data: { targetId: number } }
  | { type: 'NIGHT_DEATH_REPORT'; data: { message: string } }
  | { type: 'HADESIA_KILL_CONFIRM'; data: { targetIds: number[] } }
  | { type: 'MOONCHILD_KILL'; data: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } }
  | { type: 'STORYTELLER_DEATH'; data: { sourceId: number } }
  | { type: 'SWEETHEART_DRUNK'; data: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } }
  | { type: 'KLUTZ_CHOICE'; data: { sourceId: number; onResolve?: (latestSeats?: Seat[]) => void } }
  | { type: 'PIT_HAG'; data: { targetId: number | null; roleId: string | null } }
  | { type: 'RANGER'; data: { targetId: number; roleId: string | null } }
  | { type: 'ATTACK_BLOCKED'; data: { targetId: number; reason: string; demonName?: string } }
  | { type: 'MAYOR_REDIRECT'; data: { targetId: number; demonName: string } }
  
  // 白天相关弹窗
  | { type: 'EXECUTION_RESULT'; data: { message: string; isVirginTrigger?: boolean } }
  | { type: 'SHOOT_RESULT'; data: { message: string; isDemonDead: boolean } }
  | { type: 'VOTE_INPUT'; data: { voterId: number } }
  | { type: 'DAY_ACTION'; data: { type: 'slayer' | 'nominate' | 'lunaticKill'; sourceId: number } }
  | { type: 'DAY_ABILITY'; data: { roleId: string; seatId: number } }
  | { type: 'VIRGIN_TRIGGER'; data: { source: Seat; target: Seat } }
  | { type: 'VIRGIN_GUIDE'; data: { targetId: number; nominatorId: number; isFirstTime: boolean; nominatorIsTownsfolk: boolean } }
  | { type: 'MAYOR_THREE_ALIVE'; data: null }
  | { type: 'LUNATIC_RPS'; data: { targetId: number; nominatorId: number | null } }
  | { type: 'SAINT_EXECUTION_CONFIRM'; data: { targetId: number; skipLunaticRps?: boolean } }
  | { type: 'MADNESS_CHECK'; data: { targetId: number; roleName: string; day: number } }
  | { type: 'DAMSEL_GUESS'; data: { minionId: number | null; targetId: number | null } }
  
  // 设置相关弹窗
  | { type: 'DRUNK_CHARADE'; data: { seatId: number } }
  | { type: 'ROLE_SELECT'; data: { type: 'philosopher' | 'cerenovus' | 'pit_hag'; targetId: number; onConfirm: (roleId: string) => void } }
  | { type: 'SHAMAN_CONVERT'; data: null }
  | { type: 'SPY_DISGUISE'; data: null }
  | { type: 'BARBER_SWAP'; data: { demonId: number; firstId: number | null; secondId: number | null } }
  
  // 信息展示弹窗
  | { type: 'RAVENKEEPER_FAKE'; data: { targetId: number } }
  | { type: 'REVIEW'; data: null }
  | { type: 'GAME_RECORDS'; data: null }
  | { type: 'ROLE_INFO'; data: null }
  | { type: 'RESTART_CONFIRM'; data: null }
  
  // 游戏阶段弹窗
  | { type: 'DAWN_REPORT'; data: null }
  | { type: 'GAME_OVER'; data: null }
  
  | null;

/**
 * Z-Index 层级规范
 */
export const Z_INDEX = {
  OVERLAY: 50,        // 遮罩层
  MODAL: 60,          // 普通弹窗
  CONFIRM_MODAL: 70,  // 确认弹窗（优先级更高）
  CONTEXT_MENU: 80,   // 右键菜单
  TOAST: 90,          // 提示信息（最高）
} as const;
