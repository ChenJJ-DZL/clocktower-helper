// 从 data.ts 导入相关类型
import type { Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, RoleType } from '../../app/data';

// 重新导出相关类型
export type { Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, RoleType };

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

// --- Timeline Architecture Types ---
export type TimelineStepType = 'announcement' | 'character' | 'dawn';

export interface TimelineInteraction {
  type: 'choosePlayer' | 'chooseRole' | 'none';
  amount: number; // How many to select (e.g., 1 for Poisoner, 2 for Seer)
  required: boolean;
  canSelf?: boolean; // Can they pick themselves?
}

export interface TimelineStep {
  id: string;             // Unique ID (e.g., "step_1_poisoner")
  type: TimelineStepType;
  roleId?: string;        // The character associated (e.g., "poisoner")
  seatId?: number;        // The seat number of the player (if applicable)
  
  // Static Metadata (Computed at generation time)
  order: number;
  isFirstNight: boolean;
  
  // Content for UI display
  content: {
    title: string;        // Step title (e.g., "投毒者")
    script: string;       // Script text to speak (e.g., "请选择一名玩家投毒")
    instruction: string;  // Instruction for storyteller (e.g., "等待说书人操作...")
  };
  
  // Interaction Logic
  interaction?: TimelineInteraction;
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

