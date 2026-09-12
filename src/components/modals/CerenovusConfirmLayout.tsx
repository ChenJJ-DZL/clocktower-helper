"use client";

/**
 * 🧠 洗脑师（Cerenovus）专属「技能确认页」布局
 * ============================================================================
 * 【为什么要单独做一套】
 *   通用夜间确认弹窗用 AdaptiveSeatGrid 渲染目标：15 人局会排成 3~5 列 × 高卡片，
 *   每个按钮约占 1/5 屏宽，说书人扫视成本极高；而洗脑师的交互天生是「1 个座位 +
 *   1 个角色」两段式，不需要那么大的点击面。
 *
 * 【本布局的规格】
 *   · 目标网格：8 列（窄屏/手机横屏 5 列）、格高 56px(h-14)、字号 text-base，
 *     只显示「N号」；行动者本人灰显并标注「自己」且不可选；选中态蓝底白字；
 *     选中后在网格右上角显示「已选：X号」。
 *   · 疯狂角色：6 列小胶囊、高 40px(h-10)、text-sm，位于说明行
 *     「请选择需要疯狂证明的角色（范围为当前剧本所有角色）」之下，只显示角色名。
 *   · 主按钮两态：未选全 → 灰显「请先选择目标与疯狂角色」；
 *     选全 → 「确认：3号 ➔ 疯狂扮演【图书管理员】」。
 *
 * 【为什么单独一个模块】
 *   这里不 import ModalWrapper（它依赖 portal / 动画层），因此可以在 node 环境下
 *   直接 renderToStaticMarkup 做静态 HTML 断言（见 __tests__）。
 */

import type { Role, Seat } from "../../../app/data";

/** 目标网格：8 列；窄屏 / 手机横屏（视口 < 1024px）降为 5 列。 */
export const CERENOVUS_TARGET_GRID_CLASS =
  "grid grid-cols-8 max-[1024px]:grid-cols-5 gap-2";

/** 疯狂角色胶囊网格：固定 6 列。 */
export const CERENOVUS_ROLE_GRID_CLASS = "grid grid-cols-6 gap-1.5";

/** 角色胶囊按阵营着色（与通用确认弹窗同一套色板）。 */
const ROLE_TYPE_TONE: Record<string, string> = {
  townsfolk:
    "border-blue-500/50 text-blue-300 hover:border-blue-400 bg-blue-950/20 hover:bg-blue-900/40",
  outsider:
    "border-teal-500/50 text-teal-300 hover:border-teal-400 bg-teal-950/20 hover:bg-teal-900/40",
  minion:
    "border-orange-500/50 text-orange-300 hover:border-orange-400 bg-orange-950/20 hover:bg-orange-900/40",
  demon:
    "border-red-500/50 text-red-300 hover:border-red-400 bg-red-950/20 hover:bg-red-900/40",
};

/**
 * 洗脑师确认页主按钮文案（两态）。
 *  - 未同时选好目标与疯狂角色 → 「请先选择目标与疯狂角色」；
 *  - 选全 → 「确认：3号 ➔ 疯狂扮演【图书管理员】」。
 */
export function getCerenovusConfirmLabel(
  selectedTargets: number[],
  chosenRoleName?: string | null
): string {
  if (selectedTargets.length !== 1 || !chosenRoleName) {
    return "请先选择目标与疯狂角色";
  }
  return `确认：${selectedTargets[0] + 1}号 ➔ 疯狂扮演【${chosenRoleName}】`;
}

export interface CerenovusConfirmContentProps {
  /** 已分配角色的座位（按座位号升序） */
  seats: Seat[];
  /** 当前剧本全部角色 */
  scriptRoles: Role[];
  /** 已选目标座位 ID */
  selectedTargets: number[];
  /** 已选疯狂角色 ID */
  selectedRoleId: string | null;
  /** 行动者（洗脑师）座位 ID —— 本人灰显不可选 */
  actorSeatId?: number;
  onToggleTarget: (seatId: number) => void;
  onSelectRole: (roleId: string) => void;
}

/** 洗脑师确认页内容区（目标网格 + 疯狂角色胶囊网格）。 */
export function CerenovusConfirmContent({
  seats,
  scriptRoles,
  selectedTargets,
  selectedRoleId,
  actorSeatId,
  onToggleTarget,
  onSelectRole,
}: CerenovusConfirmContentProps) {
  const selectedTargetId =
    selectedTargets.length === 1 ? selectedTargets[0] : null;

  return (
    <div className="w-full flex flex-col gap-3 text-white">
      {/* ── 目标网格（紧凑：8 列 / 格高 56px / text-base / 只显示 N号）────── */}
      <section className="flex flex-col">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-sm font-bold text-emerald-400">
            🎯 请选择需要洗脑的目标（1 人）
          </span>
          <span
            data-testid="cerenovus-selected-target"
            className="text-sm font-bold text-blue-300"
          >
            {selectedTargetId != null
              ? `已选：${selectedTargetId + 1}号`
              : ""}
          </span>
        </div>
        <div
          data-testid="cerenovus-target-grid"
          className={CERENOVUS_TARGET_GRID_CLASS}
        >
          {seats.map((seat) => {
            const isSelf = seat.id === actorSeatId;
            const isSelected = selectedTargets.includes(seat.id);
            return (
              <button
                key={seat.id}
                type="button"
                disabled={isSelf}
                onClick={() => onToggleTarget(seat.id)}
                data-seat-id={seat.id}
                data-selected={isSelected ? "true" : "false"}
                className={`h-14 px-1 rounded-lg border-2 text-base font-bold transition-all select-none flex items-center justify-center gap-1 shadow-sm ${
                  isSelected
                    ? "bg-blue-600 border-blue-400 text-white ring-2 ring-blue-400 shadow-blue-500/40 active:scale-95 cursor-pointer"
                    : isSelf
                      ? "bg-slate-900/40 border-slate-800 text-slate-600 opacity-50 cursor-not-allowed"
                      : seat.isDead
                        ? "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-700/70 hover:border-slate-500 cursor-pointer active:scale-95"
                        : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500 cursor-pointer active:scale-95"
                }`}
              >
                <span className="whitespace-nowrap">{seat.id + 1}号</span>
                {isSelf && (
                  <span className="text-xs font-normal whitespace-nowrap">
                    自己
                  </span>
                )}
                {seat.isDead && !isSelf && (
                  <span className="text-xs font-normal text-red-400 whitespace-nowrap">
                    已死亡
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 疯狂角色（小胶囊：6 列 / 高 40px / text-sm / 只显示角色名）────── */}
      <section className="flex flex-col border-t border-slate-700/60 pt-3">
        <div className="mb-1.5 px-1 text-sm font-bold text-amber-400">
          请选择需要疯狂证明的角色（范围为当前剧本所有角色）
        </div>
        <div
          data-testid="cerenovus-role-grid"
          className={CERENOVUS_ROLE_GRID_CLASS}
        >
          {scriptRoles.map((role) => {
            const isSelected = selectedRoleId === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onSelectRole(role.id)}
                data-role-id={role.id}
                data-selected={isSelected ? "true" : "false"}
                className={`h-10 px-2 rounded-full border text-sm font-bold overflow-hidden text-ellipsis whitespace-nowrap transition-all select-none active:scale-95 shadow-sm ${
                  isSelected
                    ? "bg-amber-600 border-amber-400 text-white ring-2 ring-amber-400 shadow-amber-500/40"
                    : ROLE_TYPE_TONE[role.type] ||
                      "border-slate-700 text-slate-200 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                {role.name}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export interface CerenovusConfirmFooterProps {
  /** 目标与疯狂角色是否都已选全 */
  canConfirm: boolean;
  isSubmitting: boolean;
  /** 主按钮文案（由 getCerenovusConfirmLabel 生成） */
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 洗脑师确认页底部操作区：左「撤销本次行动」次按钮 + 右两态主按钮。 */
export function CerenovusConfirmFooter({
  canConfirm,
  isSubmitting,
  label,
  onCancel,
  onConfirm,
}: CerenovusConfirmFooterProps) {
  const disabled = !canConfirm || isSubmitting;
  return (
    <div className="flex w-full items-stretch gap-3">
      <button
        type="button"
        onClick={onCancel}
        data-testid="cerenovus-cancel-button"
        className="flex-1 py-3.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-base shadow-md transition cursor-pointer active:scale-[0.98]"
      >
        撤销本次行动
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        data-testid="cerenovus-confirm-button"
        className={`flex-[2] py-3.5 rounded-xl font-black text-base shadow-lg transition ${
          disabled
            ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-70"
            : "bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400 shadow-blue-600/40 cursor-pointer active:scale-[0.98]"
        }`}
      >
        {isSubmitting ? "处理中..." : label}
      </button>
    </div>
  );
}
