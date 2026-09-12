"use client";

import { useEffect, useMemo, useState } from "react";
import {
  roles as defaultRoles,
  type Role,
  type Script,
  type Seat,
} from "../../../app/data";
import { AdaptiveSeatGrid, SEAT_CARD_FONT } from "../common/AdaptiveSeatGrid";
import { AutoFitContent } from "../common/AutoFitContent";
import {
  CERENOVUS_NOTICE_PLAYER_SUBTITLE,
  getCerenovusNoticePlayerText,
} from "../../utils/cerenovusNotice";
import {
  CerenovusConfirmContent,
  CerenovusConfirmFooter,
  getCerenovusConfirmLabel,
} from "./CerenovusConfirmLayout";
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
  /**
   * 🌀 A4：真恶魔专属提示 ——「疯子本夜选择了哪些玩家」。
   * 官方原文（json/wiki_crawl/parsed_roles.json「疯子」）：
   *   「真正的恶魔会知道疯子每个夜晚攻击了哪些玩家。」
   * 因此这条不是泄漏：它只出现在**真恶魔自己的行动页**上，且每个夜晚都要出现
   * （未选择时给出"本夜未选择"的明确文案）。由 useNightActionHandler 注入。
   */
  lunaticHint?: string;
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
  /** 是否需要同时在当前弹窗中选择角色（洗脑师/奥赫/酿酒师等专属） */
  requiresRoleSelection?: boolean;
  /** 角色选择区域标题，默认为"请选择需要疯狂证明的角色（范围为当前剧本所有角色）" */
  roleSelectionTitle?: string;
  /** 剧本或可选角色列表 */
  availableRoles?: Role[];
  /** 剧本配置 */
  selectedScript?: Script | null;
  /** 初始已选中的角色ID */
  initialSelectedRoleId?: string;
  /**
   * 🧠 洗脑师：该座位当夜有待送达的洗脑告知。
   * 存在时确认页顶部额外渲染一张**纯玩家面**告知卡（只含"疯狂证明的对象角色"，
   * 不含洗脑师身份/座位号）。玩家视角的正式节点见 components/modals/CerenovusMadnessModal.tsx。
   */
  cerenovusNotice?: { targetId: number; roleName: string };
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

  const isRoleSelectorActive =
    data?.roleId === "cerenovus" ||
    data?.roleId === "ojo" ||
    data?.roleId === "brewer" ||
    data?.requiresRoleSelection === true;
  const isCerenovus = data?.roleId === "cerenovus";

  // 提取剧本内的所有角色列表（镇民、外来者、爪牙、恶魔，无论是否在场）
  const scriptRoles = useMemo(() => {
    if (!isRoleSelectorActive) return [];
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
    lunaticHint,
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
    : isRoleSelectorActive && !needsTargetSelection
      ? !selectedRoleId
      : (needsTargetSelection && selectedTargets.length < min) ||
        (isRoleSelectorActive && !selectedRoleId);

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
      if (isRoleSelectorActive) {
        await onConfirm(
          needsTargetSelection ? selectedTargets : undefined,
          chosenRoleObj || selectedRoleId || undefined
        );
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
      widthRatio={0.98}
      maxWidthPx={1560}
      autoHeight
      onClose={onCancel}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        /* 🧠 洗脑师：专属两态主按钮（未选全 → 灰显提示；选全 → 确认文案） */
        isCerenovus ? (
          <CerenovusConfirmFooter
            canConfirm={!isConfirmDisabled}
            isSubmitting={isSubmitting}
            label={getCerenovusConfirmLabel(
              selectedTargets,
              chosenRoleObj?.name || selectedRoleId
            )}
            onCancel={onCancel}
            onConfirm={handleConfirm}
          />
        ) : (
        <div className="flex flex-col gap-1.5 w-full">
          {/* 撤销提示：放在按钮正上方，避免再说一遍"本夜已执行"这类废话 */}
          <div className="text-center text-[20px] font-medium text-amber-300/90">
            ⚠️ 撤销后可重新发动
          </div>
          <div className="flex gap-4 w-full">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 sm:py-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition text-base sm:text-lg shadow-md cursor-pointer"
            >
              撤销本次行动
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
                : isRoleSelectorActive
                  ? !selectedRoleId
                    ? "请选择角色"
                    : `确认选择【${chosenRoleObj?.name || selectedRoleId}】`
                  : needsTargetSelection
                    ? selectedTargets.length === 0 && min === 0
                      ? "确认（不选目标）"
                      : `确认选择 (${selectedTargets.length}/${max})`
                    : "确认执行"}
            </button>
          </div>
        </div>
        )
      }
    >
      {data?.cerenovusNotice ? (
        /* 🧠 被洗脑玩家当夜另有自身技能时的告知卡（合并显示，信息不丢）。
           纯玩家面：只有"疯狂证明的对象角色"，零行动者信息。 */
        <div
          data-testid="madness-notice-player"
          className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-center space-y-3 text-white"
        >
          <p className="text-xs font-bold tracking-widest text-slate-400">
            技能告知
          </p>
          <div className="text-5xl select-none">🧠</div>
          <h2
            data-testid="madness-notice-player-text"
            className="text-3xl font-black text-amber-100 leading-snug"
          >
            {getCerenovusNoticePlayerText(data.cerenovusNotice.roleName)}
          </h2>
          <p className="text-lg font-medium text-slate-300">
            {CERENOVUS_NOTICE_PLAYER_SUBTITLE}
          </p>
        </div>
      ) : null}

      {isCerenovus ? (
        /* 🧠 洗脑师专属紧凑布局：8 列（窄屏 5 列）目标网格 + 6 列角色胶囊网格。
           通用 AdaptiveSeatGrid 会把 15 个目标排成 3~5 列的大方块，
           洗脑师只需要"点一个座位 + 点一个角色"，不需要那么大的点击面。 */
        <div className="w-full flex flex-col gap-3">
          <p className="text-center text-base font-bold text-slate-300 px-2">
            💡 选 1 名目标 + 1 个疯狂角色：他明日白天必须疯狂扮演该角色，否则可能被处决。
          </p>
          <CerenovusConfirmContent
            seats={seatedPlayers}
            scriptRoles={scriptRoles}
            selectedTargets={selectedTargets}
            selectedRoleId={selectedRoleId}
            actorSeatId={data?.actorSeatId}
            onToggleTarget={handleToggleTarget}
            onSelectRole={setSelectedRoleId}
          />
        </div>
      ) : needsTargetSelection || isRoleSelectorActive ? (
        /* 有目标选择或角色选择交互时的布局 */
        <div className="space-y-4 text-white w-full flex flex-col h-full">
          {/* 顶部行动指引 */}
          <div className="text-center space-y-1.5 max-w-full">
            {isCerenovus ? (
              <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100 break-words leading-relaxed px-2">
                确认为
                <span className="text-indigo-300 font-black">
                  【{roleName}】
                </span>
                指定洗脑：
                {selectedTargets.length > 0 ? (
                  <span className="text-amber-400 font-black">
                    【{selectedTargets[0] + 1}号】
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">
                    【请点选座位】
                  </span>
                )}
                &nbsp;➔ 疯狂证明自己是&nbsp;
                {selectedRoleId ? (
                  <span className="text-emerald-400 font-black">
                    【{chosenRoleObj?.name || selectedRoleId}】
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">
                    【请点选角色】
                  </span>
                )}
                吗？
              </div>
            ) : isRoleSelectorActive ? (
              <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100 break-words leading-relaxed px-2">
                确认为
                <span className="text-indigo-300 font-black">
                  【{roleName}】
                </span>
                选择角色：
                {selectedRoleId ? (
                  <span className="text-emerald-400 font-black">
                    【{chosenRoleObj?.name || selectedRoleId}】
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal">
                    【请点选下方角色】
                  </span>
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
                <span className="text-indigo-300 font-black">
                  【{roleName}】
                </span>
                执行
                <span className="text-indigo-200"> "{actionDescription}"</span>
                吗？
              </div>
            )}
            {/* B1：这里原本写着「说书人可直接将本页面展示给该玩家…」——本页面会直接
                交给玩家点击，任何"说书人专属说明"都不应出现，故改为纯玩家提示。 */}
            <p className="text-xs sm:text-sm text-slate-400">
              💡 本页面只显示座位号，其他玩家的角色信息已完全隐蔽。
            </p>
          </div>

          {/* 选人交互网格 */}
          {needsTargetSelection && (
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

              {/* 按在场人数自适应列数 / 卡片尺寸 / 字号（与举手表决页同一套规则） */}
              <AdaptiveSeatGrid
                count={seatedPlayers.length}
                gap={0.5}
                renderItem={(index) => {
                  const seat = seatedPlayers[index];
                  const isSelected = selectedTargets.includes(seat.id);
                  const isSelf = seat.id === actorSeatId;
                  const isSelfDisabled = isSelf && allowSelf === false;
                  const isDeadDisabled = seat.isDead && aliveOnly === true;
                  const isDisabled = isSelfDisabled || isDeadDisabled;

                  return (
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleToggleTarget(seat.id)}
                      className={`w-full h-full px-1 rounded-2xl text-center border-2 font-bold transition-all flex flex-col items-center justify-center gap-0.5 select-none cursor-pointer active:scale-95 shadow-sm ${
                        isSelected
                          ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-400 scale-[1.02]"
                          : isDisabled
                            ? "bg-slate-900/40 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed"
                            : seat.isDead
                              ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:border-slate-600"
                              : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <span
                        className="font-black whitespace-nowrap leading-none"
                        style={{ fontSize: SEAT_CARD_FONT.primary }}
                      >
                        {seat.id + 1}号
                      </span>
                      {
                        seat.isDead ? (
                          <span
                            className="whitespace-nowrap leading-none text-red-400 font-normal"
                            style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                          >
                            (已死亡)
                          </span>
                        ) : isSelf ? (
                          <span
                            className="whitespace-nowrap leading-none text-slate-300 font-normal"
                            style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                          >
                            (自己)
                          </span>
                        ) : null /* 普通座位不显示任何角色信息：本弹窗会直接拿给玩家选人，必须隐蔽身份 */
                      }
                    </button>
                  );
                }}
              />
            </div>
          )}

          {/* 完整的剧本角色列表选择区域（洗脑师/奥赫/酿酒师专属） */}
          {isRoleSelectorActive && (
            <div className="pt-2 border-t border-slate-700/60 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-2 px-1 text-xs sm:text-sm shrink-0">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  {data?.roleSelectionTitle ||
                    (isCerenovus
                      ? "请选择需要疯狂证明的角色（范围为当前剧本所有角色）"
                      : data?.roleId === "ojo"
                        ? "请选择想要击杀的角色（范围为当前剧本所有角色）"
                        : "请选择目标角色（范围为当前剧本所有角色）")}
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

          {lunaticHint && (
            <div className="text-sm sm:text-base font-black text-fuchsia-100 bg-fuchsia-900/50 rounded-xl p-3 border-2 border-fuchsia-400/70 shadow-lg shadow-fuchsia-900/40 whitespace-pre-line">
              {lunaticHint}
            </div>
          )}

          {extraNote && (
            <div className="text-xs sm:text-sm text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40">
              ⚠️ {extraNote}
            </div>
          )}
        </div>
      ) : (
        /* 无需选人时的信息角色确认布局（自适应大字号等比缩放） */
        <AutoFitContent
          targetRatio={0.9}
          minScale={0.2}
          className="p-2 sm:p-4 text-white"
        >
          <div className="flex flex-col items-center justify-center text-center space-y-6 w-max max-w-none px-6 py-4 my-auto">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-indigo-950/80 border-2 border-indigo-500/40 flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-indigo-900/30 select-none">
              🌙
            </div>

            <div className="space-y-4">
              <div className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-100 whitespace-nowrap leading-snug">
                确认为 <span className="text-indigo-300">【{roleName}】</span>{" "}
                执行行动
              </div>
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-300 bg-slate-800/80 border border-slate-700/80 rounded-2xl py-3 px-6 shadow-inner whitespace-nowrap inline-block">
                "{actionDescription}"
              </div>
            </div>

            <p className="text-base sm:text-lg md:text-xl text-slate-300 font-medium whitespace-nowrap">
              💡 该角色能力为
              <span className="text-slate-100 font-bold">
                夜间信息获取 / 自动结算
              </span>
              ，无需由玩家点选目标。点击下方【确认执行】后将计算并展示告知结果。
            </p>

            {lunaticHint && (
              <div className="text-base sm:text-lg font-black text-fuchsia-100 bg-fuchsia-900/50 rounded-xl p-3 border-2 border-fuchsia-400/70 shadow-lg shadow-fuchsia-900/40 whitespace-pre-line w-max max-w-none">
                {lunaticHint}
              </div>
            )}

            {extraNote && (
              <div className="text-sm sm:text-base text-yellow-300 bg-yellow-950/40 rounded-xl p-3 border border-yellow-600/40 w-max max-w-none whitespace-nowrap">
                ⚠️ {extraNote}
              </div>
            )}
          </div>
        </AutoFitContent>
      )}
    </ModalWrapper>
  );
}
