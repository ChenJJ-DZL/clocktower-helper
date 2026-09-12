import type { Role, Seat } from "../../app/data";

/**
 * 统一的弹窗类型定义
 * 所有弹窗状态都通过这个类型系统管理
 */
export type ModalType =
  // 夜晚相关弹窗
  | {
      type: "NIGHT_ORDER_PREVIEW";
      data: {
        preview: Array<{
          roleName: string;
          seatNo: number;
          order: number | null;
        }>;
        title: string;
        pendingQueue: Seat[] | null;
        autoConfirm?: boolean;
      };
    }
  | { type: "KILL_CONFIRM"; data: { targetId: number; isImpSelfKill: boolean } }
  | { type: "POISON_CONFIRM"; data: { targetId: number } }
  | { type: "POISON_EVIL_CONFIRM"; data: { targetId: number } }
  | { type: "NIGHT_DEATH_REPORT"; data: { message: string } }
  | { type: "HADESIA_KILL_CONFIRM"; data: { targetIds: number[] } }
  | {
      type: "MOONCHILD_KILL";
      data: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void };
    }
  | { type: "STORYTELLER_DEATH"; data: { sourceId: number } }
  | {
      type: "SWEETHEART_DRUNK";
      data: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void };
    }
  | {
      type: "KLUTZ_CHOICE";
      data: { sourceId: number; onResolve?: (latestSeats?: Seat[]) => void };
    }
  | {
      type: "PIT_HAG";
      data: { targetId: number | null; roleId: string | null };
    }
  | { type: "RANGER"; data: { targetId: number; roleId: string | null } }
  | {
      type: "ATTACK_BLOCKED";
      data: { targetId: number; reason: string; demonName?: string };
    }
  | { type: "MAYOR_REDIRECT"; data: { targetId: number; demonName: string } }

  // 白天相关弹窗
  | {
      type: "EXECUTION_RESULT";
      data: {
        message: string;
        isVirginTrigger?: boolean;
        isInstantNight?: boolean;
        isMadnessTrigger?: boolean;
      };
    }
  | {
      type: "PACIFIST_CONFIRM";
      data: { targetId: number; onResolve: (saved: boolean) => void };
    }
  | {
      type: "VIZIER_EXECUTION";
      data: {
        targetId: number;
        vizierId: number;
        onResolve: (execute: boolean) => void;
      };
    }
  | {
      type: "SHOOT_RESULT";
      data: {
        message: string;
        isDemonDead: boolean;
        targetId?: number;
        shooterId?: number;
        phaseText?: string;
        detail?: string;
      };
    }
  | { type: "SLAYER_SELECT_TARGET"; data: { shooterId: number } }
  | { type: "VOTE_INPUT"; data: { voterId: number } }
  | {
      type: "DAY_ACTION";
      data: { type: "slayer" | "nominate" | "lunaticKill"; sourceId: number };
    }
  | { type: "DAY_ABILITY"; data: { roleId: string; seatId: number } }
  | { type: "VIRGIN_TRIGGER"; data: { source: Seat; target: Seat } }
  | {
      type: "VIRGIN_GUIDE";
      data: {
        targetId: number;
        nominatorId: number;
        isFirstTime: boolean;
        nominatorIsTownsfolk: boolean;
      };
    }
  | { type: "MAYOR_THREE_ALIVE"; data: null }
  | {
      type: "LUNATIC_RPS";
      data: { targetId: number; nominatorId: number | null };
    }
  | {
      type: "SAINT_EXECUTION_CONFIRM";
      data: { targetId: number; skipLunaticRps?: boolean };
    }
  | {
      type: "EVIL_TWIN_EXECUTION_CONFIRM";
      data: { targetId: number; skipLunaticRps?: boolean };
    }
  | {
      type: "MADNESS_CHECK";
      data: {
        targetId: number;
        roleName: string;
        day?: number;
        sourceSeatId?: number;
      };
    }
  | {
      type: "DAMSEL_GUESS";
      data: { minionId: number | null; targetId: number | null };
    }

  // 设置相关弹窗
  | {
      type: "DRUNK_CHARADE_SELECT";
      data: { seatId: number; availableRoles: Role[]; scriptId: string };
    }
  | {
      type: "ROLE_SELECT";
      data: {
        type: "philosopher" | "cerenovus" | "pit_hag";
        targetId: number;
        onConfirm: (roleId: string) => void;
      };
    }
  | { type: "SHAMAN_CONVERT"; data: null }
  | { type: "SPY_DISGUISE"; data: null }
  | { type: "SPY_GRIMOIRE"; data: null }
  | { type: "SPY_RECORDS"; data: null }
  | {
      type: "BARBER_SWAP";
      data: {
        demonId: number;
        firstId: number | null;
        secondId: number | null;
      };
    }

  // 说书人选择弹窗（当能力描述中没有"选择"一词或特殊转火/传承时）
  | {
      type: "STORYTELLER_SELECT";
      data: {
        sourceId: number;
        roleId: string;
        roleName: string;
        description: string;
        targetCount: number;
        title?: string;
        confirmLabel?: string;
        filterCandidates?: (seat: Seat) => boolean;
        onConfirm: (targetIds: number[]) => void;
      };
    }

  // BMR：侍臣（Courtier）选择角色弹窗
  | {
      type: "COURTIER_SELECT_ROLE";
      data: {
        sourceId: number;
        roles: Role[];
        seats: Seat[];
        onConfirm: (roleId: string) => void;
        onCancel: () => void;
      };
    }

  // 夜晚行动通用确认弹窗
  | {
      type: "NIGHT_ACTION_CONFIRM";
      data: import("../components/modals/NightActionConfirmModal").NightActionConfirmData & {
        onConfirm: (
          selectedTargetIds?: number[],
          chosenRole?: any
        ) => void | Promise<void>;
        onCancel: () => void;
      };
    }

  // 信息展示弹窗
  | { type: "GENERIC_ALERT"; data: { title?: string; message: string } }
  | {
      type: "GENERIC_CONFIRM";
      data: {
        title?: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        onConfirm: () => void;
        onCancel?: () => void;
      };
    }
  | { type: "DREAMER_RESULT"; data: { roleA: Role; roleB: Role } }
  | {
      type: "FORTUNE_TELLER_RESULT";
      data: {
        result: boolean;
        targetLabels: string[];
        roleName?: string;
        actorSeatNo?: number;
      };
    }
  | {
      type: "INFO_RESULT";
      data: {
        roleName: string;
        resultText: string;
        /**
         * 🎭 受干扰（中毒/醉酒/涡流）或伪装身份（酒鬼/提线木偶）时的**真值**。
         * 只允许在说书人解锁视图/控制台渲染；玩家页一律不读这个字段。
         */
        realResultText?: string;
        /** 本次结果是否被"受干扰假值校验层"替换过（说书人提示用） */
        isCorruptedResult?: boolean;
        /**
         * 🧠 洗脑师专属结果页数据：被洗脑目标 + 疯狂角色。
         * 存在时 GameModals 不再渲染通用 <InfoResultModal/>（它会用
         * `${roleName} - 结果` 当标题，把行动者座位号暴露给被洗脑玩家），
         * 改由 NightActionPage 渲染专属结果页（默认玩家视角）。
         */
        cerenovusResult?: { targetId: number; roleName: string } | null;
        /** 洗脑师（行动者）座位号 —— 只在说书人解锁视图渲染 */
        cerenovusSeatId?: number;
        /** 洗脑师角色名 —— 只在说书人解锁视图渲染 */
        cerenovusRoleName?: string;
        onNext?: () => void;
      };
    }
  /**
   * 🧠 洗脑师专属：被洗脑玩家的「得知自己被洗脑」夜间节点页。
   * 玩家侧只含"疯狂证明的对象角色"，行动者信息只进解锁视图。
   */
  | {
      type: "CERENOVUS_NOTICE";
      data: {
        targetId: number;
        roleName: string;
        actorSeatId?: number;
        actorRoleName?: string;
      };
    }
  | { type: "ARTIST_RESULT"; data: { result: string } }
  | {
      type: "SAVANT_RESULT";
      data: { infoA?: string; infoB?: string; isReadOnly?: boolean };
    }
  | { type: "GAMBLER_JUDGE"; data: { seatId: number } }
  | { type: "JUGGLER_JUDGE"; data: { seatId: number } }
  | { type: "RAVENKEEPER_FAKE"; data: { targetId: number } }
  | { type: "REVIEW"; data: null }
  | { type: "GAME_RECORDS"; data: null }
  | { type: "ROLE_INFO"; data?: { roleId?: string } | null }
  | { type: "ROLE_CODEX"; data?: { roleId?: string } | null }
  | { type: "RESTART_CONFIRM"; data: null }

  // 提醒标记弹窗
  | { type: "REMINDER_TOKENS"; data: { seatId: number } }

  // 游戏阶段弹窗
  | { type: "DAWN_REPORT"; data: null }
  | { type: "GAME_OVER"; data: null }
  | { type: "IDENTITY_SHOWCASE"; data: { initialSeatId?: number } | null }
  | null;

/**
 * Z-Index 层级规范
 */
export const Z_INDEX = {
  OVERLAY: 50, // 遮罩层
  MODAL: 60, // 普通弹窗
  CONFIRM_MODAL: 70, // 确认弹窗（优先级更高）
  CONTEXT_MENU: 80, // 右键菜单
  TOAST: 90, // 提示信息（最高）
} as const;
