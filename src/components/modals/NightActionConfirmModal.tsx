"use client";

import { useEffect, useMemo, useState } from "react";
import { roles as defaultRoles, type Role, type Script, type Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

export interface NightActionConfirmData {
  /** 角色中文名，如 "12号-投毒者" */
  roleName: string;
  /** 角色ID，如 "cerenovus" */
  roleId?: string;
  /** 行动描述，如 "选择一名玩家进行下毒" */
  actionDescription: string;
  /** 被选中的目标描述列表，如 ["3号", "5号"] */
  targetDescriptions?: string[];
  /** 附加提示，如中毒/醉酒警告 */
  extraNote?: string;
  /** 目标选择配置 */
  targetLimit?: { min: number; max: number };
  /** 当前行动者座位ID（用于自身可选性判断） */
  actorSeatId?: number;
  /** 允许选自己吗（默认 true） */
  allowSelf?: boolean;
  /** 仅存活玩家可选（默认 false） */
  aliveOnly?: boolean;
  /** 初始已选中的目标ID列表 */
  initialSelectedTargets?: number[];
  /** 是否需要同时在当前弹窗中选择洗脑角色（洗脑师专属） */
  requiresRoleSelection?: boolean;
  /** 剧本或可选角色列表 */
  availableRoles?: Role[];
  /** 剧本配置 */
  selectedScript?: Script | null;
  /** 初始已选中的角色ID */
  initialSelectedRoleId?: string;
  /** 确认回调，接收选中的目标ID列表与选中的角色对象/ID */
  onConfirm: (
    selectedTargetIds?: number[],
    chosenRole?: Role | string
  ) => void | Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
}

interface NightActionConfirmModalProps {
  data: NightActionConfirmData | null;
  seats?: Seat[];
  availableRoles?: Role[];
  selectedScript?: Script | null;
  onConfirm: (selectedTargetIds?: number[], chosenRole?: Role | string) => void;
  onCancel: () => void;
}

const typeLabels: Record<string, string> = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
};

const typeColors: Record<string, string> = {
  townsfolk:
    "border-blue-500/50 text-blue-300 hover:border-blue-400 bg-blue-950/20 hover:bg-blue-900/40",
  outsider:
    "border-teal-500/50 text-teal-300 hover:border-teal-400 bg-teal-950/20 hover:bg-teal-900/40",
  minion:
    "border-orange-500/50 text-orange-300 hover:border-orange-400 bg-orange-950/20 hover:bg-orange-900/40",
  demon:
    "border-red-500/50 text-red-300 hover:border-red-400 bg-red-950/20 hover:bg-red-900/40",
};

const typeDotColors: Record<string, string> = {
  townsfolk: "bg-blue-400",
  outsider: "bg-teal-400",
  minion: "bg-orange-400",
  demon: "bg-red-400",
};

export function NightActionConfirmModal({
  data,
  seats = [],
  availableRoles,
  selectedScript,
  onConfirm,
  onCancel,
}: NightActionConfirmModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSubmitting(false);
    if (data?.initialSelectedTargets) {
      setSelectedTargets(data.initialSelectedTargets);
    } else {
      setSelectedTargets([]);
    }
    if (data?.initialSelectedRoleId) {
      setSelectedRoleId(data.initialSelectedRoleId);
    } else {
      setSelectedRoleId(null);
    }
  }, [data]);

  // 筛选已分配角色的座位，按座位号升序展示
  const seatedPlayers = useMemo(() => {
    return seats
      .filter((s) => s.role !== null && s.role !== undefined)
      .sort((a, b) => a.id - b.id);
  }, [seats]);

  const isCerenovus =
    data?.roleId === "cerenovus" || data?.requiresRoleSelection === true;

  // 提取剧本内的所有角色列表（镇民、外来者、爪牙、恶魔，无论是否在场）
  const scriptRoles = useMemo(() => {
    if (!isCerenovus) return [];
    const sourceRoles =
      data?.availableRoles && data.availableRoles.length > 0
        ? data.availableRoles
        : availableRoles && availableRoles.length > 0
          ? availableRoles
          : defaultRoles;

    const script = data?.selectedScript || selectedScript;
    if (!script) return sourceRoles;

    const filtered = sourceRoles.filter((r: Role) => {
      return (
        r.script === script.name ||
        (script as any).roleIds?.includes(r.id) ||
        (script as any).roles?.some((sr: any) =>
          typeof sr === "string" ? sr === r.id : sr.id === r.id
        )
      );
    });

    return filtered.length > 0 ? filtered : sourceRoles;
  }, [
    isCerenovus,
    data?.availableRoles,
    data?.selectedScript,
    availableRoles,
    selectedScript,
  ]);

  const rolesByType = useMemo(() => {
    const groups: Record<string, Role[]> = {
      townsfolk: [],
      outsider: [],
      minion: [],
      demon: [],
    };
    scriptRoles.forEach((r) => {
      if (groups[r.type]) {
        groups[r.type].push(r);
      } else {
        if (!groups[r.type]) groups[r.type] = [];
        groups[r.type].push(r);
      }
    });
    return groups;
  }, [scriptRoles]);

  if (!data) return null;

  const {
    roleName,
    actionDescription,
    targetDescriptions = [],
    extraNote,
    targetLimit,
    actorSeatId,
    allowSelf = true,
    aliveOnly = false,
  } = data;

  const min = targetLimit?.min ?? 0;
  const max = targetLimit?.max ?? 0;
  const needsTargetSelection = max > 0;

  const handleToggleTarget = (seatId: number) => {
    setSelectedTargets((prev) => {
      if (prev.includes(seatId)) {
        return prev.filter((id) => id !== seatId);
      }
      if (max === 1) {
        return [seatId];
      }
      if (prev.length < max) {
        return [...prev, seatId];
      }
      // 若已达上限且 max > 1，移除首个并加入新选的
      return [...prev.slice(1), seatId];
    });
  };

  const isConfirmDisabled = isCerenovus
    ? selectedTargets.length !== 1 || !selectedRoleId
    : needsTargetSelection && selectedTargets.length < min;

  const rawTargetText = needsTargetSelection
    ? selectedTargets.length > 0
      ? `${selectedTargets.map((id) => `${id + 1}号`).join("、")}`
      : ""
    : targetDescriptions.length > 0
      ? targetDescriptions.join("、")
      : "";

  // 严格过滤占位符文本（如 "（信息获取 - 无目标）"、"（首夜信息 - 无目标）"、"无目标" 等）
  const isPlaceholderTarget =
    !rawTargetText ||
    rawTargetText.includes("无目标") ||
    rawTargetText.includes("信息获取") ||
    rawTargetText.includes("首夜信息");

  const targetText = isPlaceholderTarget ? "" : rawTargetText.trim();

  const chosenRoleObj = scriptRoles.find((r) => r.id === selectedRoleId);

  const handleConfirm = async () => {
    if (isSubmitting || isConfirmDisabled) return;
    setIsSubmitting(true);
    try {
      if (isCerenovus) {
        await onConfirm(selectedTargets, chosenRoleObj || selectedRoleId || undefined);
      } else {
        await onConfirm(needsTargetSelection ? selectedTargets : undefined);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      title={`🌙 ${roleName} - 行动确认`}
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 sm:py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition text-base sm:text-lg shadow-md cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isConfirmDisabled || isSubmitting}
            onClick={handleConfirm}
            className={`flex-1 py-3 sm:py-4 rounded-xl font-black transition text-base sm:text-lg shadow-lg ${
              isConfirmDisabled || isSubmitting
                ? "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/40 ring-2 ring-blue-400 active:scale-[0.98] cursor-pointer"
            }`}
          >
            {isSubmitting
              ? "处理中..."
              : isCerenovus
                ? selectedTargets.length === 0
                  ? "请选择目标玩家"
                  : !selectedRoleId
                    ? `请选择洗脑角色（已选 ${selectedTargets[0] + 1}号）`
                    : `确认洗脑：${selectedTargets[0] + 1}号 ➔ 【${
                        chosenRoleObj?.name || selectedRoleId
                      }】`
                : needsTargetSelection
                  ? selectedTargets.length === 0 && min === 0
                    ? "确认（不选目标）"
                    : `确认选择 (${selectedTargets.length}/${max})`
                  : "确认执行"}
          </button>
        </div>
      }
    >
      {needsTargetSelection ? (
        /* 有目标选择交互时的布局 */
        <div className="space-y-4 text-white w-full flex flex-col h-full">
          {/* 顶部行动指引 */}
          <div className="text-center space-y-1.5 max-w-full">
            {isCerenovus ? (
              <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100 break-words leading-relaxed px-2">
                确认为
                <span className="text-indigo-300 font-black">【{roleName}】</span>
                指定洗脑：
                {selectedTargets.length > 0 ? (
                  <span className="text-amber-400 font-black">
                    【{selectedTargets[0] + 1}号】
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">【请点选座位】</span>
                )}
                &nbsp;➔ 疯狂证明自己是&nbsp;
                {selectedRoleId ? (
                  <span className="text-emerald-400 font-black">
                    【{chosenRoleObj?.name || selectedRoleId}】
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">【请点选角色】</span>
                )}
                吗？
              </div>
            ) : (
              <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100 break-words leading-relaxed px-2">
                确认为
                {targetText && (
                  <span className="text-amber-400 font-black">
                    【{targetText}】
                  </span>
                )}
                <span className="text-indigo-300 font-black">【{roleName}】</span>
                执行
                <span className="text-indigo-200"> "{actionDescription}"</span>
                吗？
              </div>
            )}
            <p className="text-xs sm:text-sm text-slate-400">
              💡
              说书人可直接将本页面展示给该玩家进行选人操作，已完全隐蔽其他玩家角色信息。
            </p>
          </div>

          {/* 选人交互网格 */}
          <div className="pt-2 border-t border-slate-700/60 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-2 px-1 text-xs sm:text-sm">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                请选择目标玩家（最少 {min} 人，最多 {max} 人）
              </span>
              <span className="text-slate-400 font-medium">
                已选:{" "}
                <b className="text-amber-400 text-sm sm:text-base font-black">
                  {selectedTargets.length}
                </b>{" "}
                / {max}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-2.5 p-0.5">
              {seatedPlayers.map((seat) => {
                const isSelected = selectedTargets.includes(seat.id);
                const isSelf = seat.id === actorSeatId;
                const isSelfDisabled = isSelf && allowSelf === false;
                const isDeadDisabled = seat.isDead && aliveOnly === true;
                const isDisabled = isSelfDisabled || isDeadDisabled;

                return (
                  <button
                    key={seat.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleToggleTarget(seat.id)}
                    className={`h-11 sm:h-12 md:h-13 w-full px-1.5 rounded-xl text-center border font-bold transition-all flex flex-row items-center justify-center select-none cursor-pointer active:scale-95 shadow-sm ${
                      isSelected
                        ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-400 scale-[1.02]"
                        : isDisabled
                          ? "bg-slate-900/40 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed"
                          : seat.isDead
                            ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:border-slate-600"
                            : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500"
                    }`}
                  >
                    <span className="text-sm sm:text-base font-black tracking-tight whitespace-nowrap inline-flex items-center justify-center">
                      <span>{seat.id + 1}号</span>
                      {isSelf && (
                        <span className="text-[11px] sm:text-xs text-slate-300 font-normal ml-0.5">
                          (自己)
                        </span>
                      )}
                      {seat.isDead && (
                        <span className="text-[11px] sm:text-xs text-red-400 font-normal ml-0.5">
                          (已死亡)
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 完整的剧本角色列表选择区域（洗脑师专属：同时选择座位号 + 洗脑内容） */}
          {isCerenovus && (
            <div className="pt-2 border-t border-slate-700/60 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-2 px-1 text-xs sm:text-sm shrink-0">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  请选择需要疯狂证明的角色（范围为当前剧本所有角色）
                </span>
                <span className="text-slate-400 font-medium">
                  已选角色:{" "}
                  {selectedRoleId ? (
                    <b className="text-emerald-400 text-sm sm:text-base font-black">
                      【{chosenRoleObj?.name || selectedRoleId}】
                    </b>
                  ) : (
                    <span className="text-slate-500 font-normal">未选择</span>
                  )}
                </span>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2.5 pr-1 max-h-[38vh]">
                {Object.entries(rolesByType).map(([type, rolesOfType]) => {
                  if (rolesOfType.length === 0) return null;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5 px-0.5">
                        <span
                          className={`w-2 h-2 rounded-full ${typeDotColors[type] || "bg-slate-400"}`}
                        />
                        <span>{typeLabels[type] || type}</span>
                        <span className="text-slate-500 text-[11px]">
                          ({rolesOfType.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                        {rolesOfType.map((role) => {
                          const isRoleSelected = selectedRoleId === role.id;
                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => setSelectedRoleId(role.id)}
                              className={`h-11 sm:h-12 px-2 rounded-xl text-center border font-bold transition-all text-xs sm:text-sm flex items-center justify-center cursor-pointer select-none active:scale-95 shadow-sm ${
                                isRoleSelected
                                  ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-500/40 ring-2 ring-amber-400 scale-[1.03]"
                                  : `${typeColors[role.type] || "border-slate-700 text-slate-200 bg-slate-800"}`
                              }`}
                            >
                              <span className="truncate">{role.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extraNote && (
            <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40">
              ⚠️ {extraNote}
            </div>
          )}
        </div>
      ) : (
        /* 无需选人时的信息角色确认布局（垂直弹性居中，排版饱满优雅） */
        <div className="flex flex-col flex-1 my-auto justify-center items-center text-center space-y-6 max-w-2xl mx-auto p-4 w-full">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-indigo-950/80 border-2 border-indigo-500/40 flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-indigo-900/30">
            🌙
          </div>

          <div className="space-y-3">
            <div className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-100 leading-snug">
              确认为 <span className="text-indigo-300">【{roleName}】</span>{" "}
              执行行动
            </div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-amber-300 bg-slate-800/80 border border-slate-700/80 rounded-2xl py-3 px-6 shadow-inner inline-block">
              "{actionDescription}"
            </div>
          </div>

          <p className="text-xs sm:text-sm md:text-base text-slate-400 max-w-lg leading-relaxed">
            💡 该角色能力为
            <span className="text-slate-200 font-semibold">
              夜间信息获取 / 自动结算
            </span>
            ，无需由玩家点选目标。点击下方【确认执行】后将计算并展示告知结果。
          </p>

          {extraNote && (
            <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40 w-full max-w-lg">
              ⚠️ {extraNote}
            </div>
          )}
        </div>
      )}
    </ModalWrapper>
  );
}
