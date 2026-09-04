"use client";

import { useState, useMemo, useEffect } from "react";
import type { Role, Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

export interface CharadeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  seats: Seat[];
  filteredGroupedRoles: Record<string, Role[]>;
  onConfirm: (newSeats: Seat[]) => void;
  targetSeatId?: number | null; // 若指定，则聚焦于特定座位（右键设置入口）
}

export function CharadeConfigModal({
  isOpen,
  onClose,
  seats,
  filteredGroupedRoles,
  onConfirm,
  targetSeatId = null,
}: CharadeConfigModalProps) {
  // 找出所有需要配置伪装身份的座位 (酒鬼、提线木偶、疯子)
  const charadeSeats = useMemo(() => {
    return seats.filter(
      (s) =>
        s.role?.id === "drunk" ||
        s.role?.id === "marionette" ||
        s.role?.id === "lunatic"
    );
  }, [seats]);

  // 本地暂存每个座位的伪装身份
  const [selections, setSelections] = useState<
    Record<number, { charadeRole?: Role | null; apparentDemonRole?: Role | null }>
  >({});

  // 每次打开弹窗时，从 seats 初始化 selections
  useEffect(() => {
    if (isOpen) {
      const init: Record<
        number,
        { charadeRole?: Role | null; apparentDemonRole?: Role | null }
      > = {};
      charadeSeats.forEach((s) => {
        init[s.id] = {
          charadeRole: s.charadeRole || null,
          apparentDemonRole: s.apparentDemonRole || null,
        };
      });
      setSelections(init);
    }
  }, [isOpen, charadeSeats]);

  // 在场真实角色 ID 集合
  const inPlayRoleIds = useMemo(() => {
    return new Set(seats.map((s) => s.role?.id).filter(Boolean));
  }, [seats]);

  const townsfolkList = filteredGroupedRoles.townsfolk || [];
  const demonList = filteredGroupedRoles.demon || [];

  // 计算当前已被选中的伪装角色 ID
  const selectedRoleIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(selections).forEach((val) => {
      if (val.charadeRole?.id) ids.add(val.charadeRole.id);
      if (val.apparentDemonRole?.id) ids.add(val.apparentDemonRole.id);
    });
    return ids;
  }, [selections]);

  // 为单个座位随机选择一个伪装角色
  const handleRandomPickForSeat = (seat: Seat) => {
    if (seat.role?.id === "drunk" || seat.role?.id === "marionette") {
      const unusedTownsfolk = townsfolkList.filter(
        (t) =>
          !inPlayRoleIds.has(t.id) &&
          !selectedRoleIds.has(t.id) &&
          t.id !== "drunk"
      );
      const pool =
        unusedTownsfolk.length > 0
          ? unusedTownsfolk
          : townsfolkList.filter((t) => t.id !== "drunk");
      if (pool.length > 0) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        setSelections((prev) => ({
          ...prev,
          [seat.id]: { ...prev[seat.id], charadeRole: picked },
        }));
      }
    } else if (seat.role?.id === "lunatic") {
      const unusedDemons = demonList.filter(
        (d) =>
          !inPlayRoleIds.has(d.id) &&
          !selectedRoleIds.has(d.id) &&
          d.id !== "lunatic"
      );
      const pool =
        unusedDemons.length > 0
          ? unusedDemons
          : demonList.filter((d) => d.id !== "lunatic");
      if (pool.length > 0) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        setSelections((prev) => ({
          ...prev,
          [seat.id]: { ...prev[seat.id], apparentDemonRole: picked },
        }));
      }
    }
  };

  // 为所有未选择伪装的角色一键随机生成
  const handleRandomPickAll = () => {
    const newSelections = { ...selections };
    const usedIds = new Set(selectedRoleIds);

    charadeSeats.forEach((seat) => {
      const current = newSelections[seat.id];
      if (seat.role?.id === "drunk" || seat.role?.id === "marionette") {
        if (!current?.charadeRole) {
          const unused = townsfolkList.filter(
            (t) =>
              !inPlayRoleIds.has(t.id) &&
              !usedIds.has(t.id) &&
              t.id !== "drunk"
          );
          const pool =
            unused.length > 0
              ? unused
              : townsfolkList.filter((t) => t.id !== "drunk");
          if (pool.length > 0) {
            const picked = pool[Math.floor(Math.random() * pool.length)];
            usedIds.add(picked.id);
            newSelections[seat.id] = {
              ...newSelections[seat.id],
              charadeRole: picked,
            };
          }
        }
      } else if (seat.role?.id === "lunatic") {
        if (!current?.apparentDemonRole) {
          const unused = demonList.filter(
            (d) =>
              !inPlayRoleIds.has(d.id) &&
              !usedIds.has(d.id) &&
              d.id !== "lunatic"
          );
          const pool =
            unused.length > 0
              ? unused
              : demonList.filter((d) => d.id !== "lunatic");
          if (pool.length > 0) {
            const picked = pool[Math.floor(Math.random() * pool.length)];
            usedIds.add(picked.id);
            newSelections[seat.id] = {
              ...newSelections[seat.id],
              apparentDemonRole: picked,
            };
          }
        }
      }
    });

    setSelections(newSelections);
  };

  // 检查是否所有角色都已配置了伪装身份
  const isAllConfigured = useMemo(() => {
    return charadeSeats.every((s) => {
      const sel = selections[s.id];
      if (s.role?.id === "drunk" || s.role?.id === "marionette") {
        return !!sel?.charadeRole;
      }
      if (s.role?.id === "lunatic") {
        return !!sel?.apparentDemonRole;
      }
      return true;
    });
  }, [charadeSeats, selections]);

  // 如果指定了特定座位（右键入口），仅检查该座位是否配置好
  const canConfirm = useMemo(() => {
    if (targetSeatId !== null && targetSeatId !== undefined) {
      const s = charadeSeats.find((seat) => seat.id === targetSeatId);
      if (!s) return isAllConfigured;
      const sel = selections[targetSeatId];
      if (s.role?.id === "drunk" || s.role?.id === "marionette") {
        return !!sel?.charadeRole;
      }
      if (s.role?.id === "lunatic") {
        return !!sel?.apparentDemonRole;
      }
      return false;
    }
    return isAllConfigured;
  }, [targetSeatId, charadeSeats, selections, isAllConfigured]);

  // 提交配置
  const handleConfirmSubmit = () => {
    const updatedSeats = seats.map((seat) => {
      const sel = selections[seat.id];
      if (!sel) return seat;

      if (seat.role?.id === "drunk" || seat.role?.id === "marionette") {
        return {
          ...seat,
          charadeRole: sel.charadeRole || null,
          displayRole: sel.charadeRole || seat.displayRole || seat.role,
        };
      }
      if (seat.role?.id === "lunatic") {
        return {
          ...seat,
          apparentDemonRole: sel.apparentDemonRole || null,
          displayRole: sel.apparentDemonRole || seat.displayRole || seat.role,
        };
      }
      return seat;
    });

    onConfirm(updatedSeats);
    onClose();
  };

  if (!isOpen) return null;

  // 待展示的角色列表：若传了 targetSeatId，则展示该目标座位置顶
  const displayedSeats =
    targetSeatId !== null && targetSeatId !== undefined
      ? [
          ...charadeSeats.filter((s) => s.id === targetSeatId),
          ...charadeSeats.filter((s) => s.id !== targetSeatId),
        ]
      : charadeSeats;

  const targetSeatObj =
    targetSeatId !== null && targetSeatId !== undefined
      ? charadeSeats.find((s) => s.id === targetSeatId)
      : null;

  const modalTitle = targetSeatObj
    ? `🎭 为 ${targetSeatObj.id + 1}号【${targetSeatObj.role?.name}】设定伪装身份`
    : `🎭 设定伪装身份（提线木偶 / 酒鬼 / 疯子）`;

  return (
    <ModalWrapper
      title={modalTitle}
      onClose={onClose}
      size="fullscreen90"
      className="w-[94vw] max-w-5xl max-h-[90vh] flex flex-col p-4 overflow-hidden"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRandomPickAll}
              className="px-4 py-2.5 rounded-xl border border-amber-500/50 bg-amber-950/40 hover:bg-amber-900/60 text-amber-200 text-sm font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <span>🎲</span>
              <span>一键随机分配所有未选</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-sm font-bold transition cursor-pointer"
            >
              返回修改
            </button>
          </div>
          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={!canConfirm}
            className={`px-8 py-3 rounded-xl text-base font-black transition shadow-lg flex items-center gap-2 cursor-pointer ${
              canConfirm
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30"
                : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60"
            }`}
          >
            <span>✓</span>
            <span>
              {targetSeatObj ? "确认并保存此伪装" : "确认伪装并继续"}
            </span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0 text-slate-200">
        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3 text-xs sm:text-sm text-purple-200/90 leading-relaxed shrink-0">
          《染·钟楼谜团》规则说明：<b>提线木偶</b>与<b>酒鬼</b>以为自己是一个善良镇民，<b>疯子</b>以为自己是一个恶魔。落座时他们保持原角色代币，请为他们手动点选伪装身份。
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {displayedSeats.map((seat) => {
            const isTarget =
              targetSeatId !== null &&
              targetSeatId !== undefined &&
              seat.id === targetSeatId;
            const isDemonDisguise = seat.role?.id === "lunatic";
            const currentSelected = isDemonDisguise
              ? selections[seat.id]?.apparentDemonRole
              : selections[seat.id]?.charadeRole;

            const roleOptions = isDemonDisguise ? demonList : townsfolkList;
            const roleBadgeColor =
              seat.role?.id === "marionette"
                ? "bg-purple-900/60 border-purple-500/50 text-purple-200"
                : seat.role?.id === "drunk"
                  ? "bg-teal-900/60 border-teal-500/50 text-teal-200"
                  : "bg-red-900/60 border-red-500/50 text-red-200";

            const roleIcon =
              seat.role?.id === "marionette"
                ? "🎪"
                : seat.role?.id === "drunk"
                  ? "🎭"
                  : "🤪";

            return (
              <div
                key={seat.id}
                className={`rounded-2xl border p-4 space-y-3 shadow-md transition-all ${
                  isTarget
                    ? "border-purple-400 bg-slate-800/90 ring-2 ring-purple-500/50"
                    : "border-white/10 bg-slate-800/60"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{roleIcon}</span>
                    <span className="text-base sm:text-lg font-black text-white">
                      {seat.id + 1}号玩家
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${roleBadgeColor}`}
                    >
                      真实身份：{seat.role?.name}
                    </span>
                    {isTarget && (
                      <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-md font-bold">
                        当前右键选定
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs sm:text-sm">
                      {currentSelected ? (
                        <span className="text-emerald-300 font-bold bg-emerald-950/60 border border-emerald-500/40 px-3 py-1 rounded-lg">
                          已选伪装：【{currentSelected.name}】
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold bg-amber-950/60 border border-amber-500/40 px-3 py-1 rounded-lg animate-pulse">
                          ⚠️ 请在下方选择伪装
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRandomPickForSeat(seat)}
                      className="px-2.5 py-1 rounded-lg border border-white/20 bg-slate-700/80 hover:bg-slate-600 text-xs text-white font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>🎲</span>
                      <span>随机选</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  {isDemonDisguise
                    ? "请选择一个不在场的【恶魔】角色："
                    : "请选择一个不在场的【善良镇民】角色："}
                </div>

                {/* 候选角色网格 */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {roleOptions.map((opt) => {
                    const isInPlay = inPlayRoleIds.has(opt.id);
                    const isSelectedByThisSeat = currentSelected?.id === opt.id;
                    const isTakenByOther =
                      !isSelectedByThisSeat && selectedRoleIds.has(opt.id);

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelections((prev) => ({
                            ...prev,
                            [seat.id]: isDemonDisguise
                              ? { ...prev[seat.id], apparentDemonRole: opt }
                              : { ...prev[seat.id], charadeRole: opt },
                          }));
                        }}
                        className={`relative rounded-xl p-2 flex flex-col items-center justify-center border text-center transition cursor-pointer min-h-[56px] ${
                          isSelectedByThisSeat
                            ? "bg-purple-600 text-white border-purple-300 ring-2 ring-purple-400 shadow-md scale-105"
                            : isInPlay
                              ? "bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700"
                              : isTakenByOther
                                ? "bg-slate-900/80 border-slate-700/60 text-slate-400"
                                : "bg-slate-700/60 border-slate-600 hover:border-purple-400 text-slate-100 hover:bg-slate-600"
                        }`}
                      >
                        <span className="text-xs sm:text-sm font-bold">
                          {opt.name}
                        </span>
                        {isInPlay && (
                          <span className="text-[9px] text-red-400 font-mono scale-90">
                            已在场
                          </span>
                        )}
                        {isTakenByOther && (
                          <span className="text-[9px] text-amber-400 font-mono scale-90">
                            已被占用
                          </span>
                        )}
                        {isSelectedByThisSeat && (
                          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalWrapper>
  );
}
