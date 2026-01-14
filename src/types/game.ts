// 从 data.ts 导入相关类型
import type { 
  Role, 
  Seat, 
  StatusEffect, 
  LogEntry, 
  GamePhase, 
  WinResult, 
  RoleType,
  NightActionMeta,
  SetupMeta,
  DayActionMeta,
  TriggerMeta
} from '../../app/data';

// 重新导出相关类型
export type { 
  Role, 
  Seat, 
  StatusEffect, 
  LogEntry, 
  GamePhase, 
  WinResult, 
  RoleType,
  NightActionMeta,
  SetupMeta,
  DayActionMeta,
  TriggerMeta
};

// --- 辅助类型 ---
export interface NightHintState { 
  isPoisoned: boolean; 
  reason?: string; 
  guide: string; 
  speak: string; 
  action?: string;
  fakeInspectionResult?: string;
}

export interface NightInfoResult {
  seat: Seat;
  effectiveRole: Role;
  isPoisoned: boolean;
  reason?: string;
  guide: string;
  speak: string;
  action: string;
}

// 夜间时间线相关类型
export interface TimelineInteractionEffect {
  type: 'add_status' | 'kill' | 'protect' | 'info' | 'none';
  value?: string;
}

export interface TimelineInteraction {
  type: 'choosePlayer' | 'none';
  amount: number;
  required: boolean;
  canSelectSelf: boolean;
  canSelectDead: boolean;
  effect: TimelineInteractionEffect;
}

export interface TimelineStepContent {
  title: string;
  script: string;
  instruction: string;
}

export interface TimelineStep {
  id: string;
  type: 'character' | 'dawn';
  seatId?: number;
  roleId?: string;
  order: number;
  content: TimelineStepContent;
  interaction?: TimelineInteraction;
}

// 对局记录数据结构
export interface GameRecord {
  id: string; // 唯一ID
  scriptName: string; // 剧本名称
  startTime: string; // 游戏开始时间
  endTime: string; // 游戏结束时间
  duration: number; // 游戏总时长（秒）
  winResult: WinResult; // 游戏结果
  winReason: string | null; // 胜利原因
  seats: Seat[]; // 座位信息（游戏结束时的状态）
  gameLogs: LogEntry[]; // 游戏日志
}

export const phaseNames: Record<string, string> = {
  setup: "准备阶段", 
  check: "核对身份", 
  firstNight: "首夜", 
  day: "白天", 
  dusk: "黄昏/处决", 
  night: "夜晚", 
  dawnReport: "天亮结算", 
  gameOver: "游戏结束"
};

