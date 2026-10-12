"use client";

import { useState } from "react";
import type { Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface ExileVoteModalProps {
  isOpen: boolean;
  /** 目标展示名（旅行者名或「N号」） */
  targetLabel: string;
  /** 目标类型（决定文案：旅行者离开游戏 / 玩家死亡） */
  targetKind: "traveler" | "seat";
  /** 提议者展示名（「说书人」或「N号玩家」；含死者标 💀） */
  proposerLabel: string;
  /**
   * 目标的角色 id（用于怪咖豁免判定）。
   * 目标为旅行者时传 `travelers[i].id`；为座位时传 `seat.role`。
   */
  targetRoleId?: string | null;
  seats: Seat[];
  /** 已赞成者座位 id 数组（可含死者） */
  votes: number[];
  /** 门槛 = 全体玩家（含死者与旅行者）一半向上取整 */
  threshold: number;
  onVote: (voterId: number) => void;
  /** @param deviantAmusing 说书人判定目标是「有趣的怪咖」⇒ 官方豁免不可流放 */
  onResolve: (deviantAmusing: boolean) => void;
  onClose: () => void;
}

/**
 * 流放投票弹窗（Round 10b）
 * ==================================================================
 * 官方口径（officialRules.json 明文）：
 *   · 门槛 = 全体玩家（无论生死）一半向上取整（**不是存活的一半**，
 *     与处决口径不同）；
 *   · 任何人（含死者）可提议、可表决且不消耗投票标记；
 *   · 一日可流放多人；流放 ≠ 处决 ⇒ 同日可既有流放又有处决；
 *   · 不受任何能力影响；不产生终局。
 */
export function ExileVoteModal({
  isOpen,
  targetLabel,
  targetKind,
  proposerLabel,
  targetRoleId = null,
  seats,
  votes,
  threshold,
  onVote,
  onResolve,
  onClose,
}: ExileVoteModalProps) {
  const [selectedVoter, setSelectedVoter] = useState<number | null>(null);
  const [deviantAmusing, setDeviantAmusing] = useState(false);

  if (!isOpen) return null;

  const passed = votes.length >= threshold;
  // 怪咖（Deviant）官方豁免：「如果你表现得很有趣，当天你不能被流放。」
  // 「有趣」是说书人主观判定 ⇒ 弹窗里显式勾选，引擎不猜。
  const isDeviant = targetRoleId === "deviant";
  const blocked = isDeviant && deviantAmusing;

  return (
    <ModalWrapper
      title="流放投票"
      onClose={onClose}
      maxWidthPx={720}
      autoHeight
    >
      <div className="flex flex-col gap-4">
        {/* 目标与门槛 */}
        <div className="rounded-xl border-2 border-sky-400/40 bg-sky-500/10 px-4 py-3">
          <div className="text-2xl font-bold text-sky-100">
            流放目标：{targetLabel}
          </div>
          <div className="text-sm text-sky-200/80 mt-1">
            提议人：{proposerLabel}
          </div>
          <div className="text-sm text-sky-200/80 mt-1">
            {targetKind === "traveler"
              ? "旅行者被流放 ⇒ 立即离开游戏（不计入任何阵营计数）"
              : "被流放者立即死亡（不触发终局、不受任何能力影响）"}
          </div>
          <div className="text-lg text-sky-100 mt-2">
            票数 <span className="font-bold text-3xl">{votes.length}</span>
            <span className="text-sky-200/70"> / 门槛 </span>
            <span className="font-bold text-3xl">{threshold}</span>
            <span className="text-sky-200/70">
              （全体玩家含死者与旅行者的一半向上取整）
            </span>
            {passed && (
              <span className="ml-3 text-emerald-300 font-bold">✓ 已达标</span>
            )}
          </div>
        </div>

        {/* 怪咖豁免（官方：表现得有趣 ⇒ 当日不可被流放） */}
        {isDeviant && (
          <div className="rounded-xl border-2 border-amber-400/50 bg-amber-500/10 px-4 py-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deviantAmusing}
                onChange={(e) => setDeviantAmusing(e.target.checked)}
                className="mt-1 w-5 h-5 accent-amber-400 cursor-pointer"
              />
              <span className="text-base text-amber-100">
                <span className="font-bold">目标是怪咖：</span>
                说书人判定其今日「表现得有趣」⇒
                按官方规则当日<b>不可被流放</b>（票数达标也作废）。
              </span>
            </label>
          </div>
        )}

        {/* 投票者选择（含死者） */}
        <div>
          <div className="text-lg font-bold text-slate-200 mb-2">
            选择投票者（含死者；不消耗投票标记）
          </div>
          <div className="grid grid-cols-5 gap-2 max-h-48 overflow-auto">
            {seats.map((s) => {
              const already = votes.includes(s.id);
              return (
                <button
                  key={s.id}
                  disabled={already}
                  onClick={() => {
                    setSelectedVoter(s.id);
                    onVote(s.id);
                  }}
                  className={`px-2 py-1.5 rounded-lg border text-sm font-bold transition-colors ${
                    already
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 cursor-default"
                      : "border-white/15 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 cursor-pointer"
                  } ${selectedVoter === s.id ? "ring-2 ring-sky-400" : ""}`}
                  title={already ? "已赞成" : undefined}
                >
                  {s.id + 1}号{s.isDead ? " 💀" : ""}
                  {already && " ✓"}
                </button>
              );
            })}
          </div>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onResolve(deviantAmusing)}
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-xl font-bold transition-colors cursor-pointer ${
              blocked
                ? "border-amber-400/80 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35"
                : "border-sky-400/80 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30"
            }`}
          >
            {blocked
              ? "结算流放（怪咖豁免 → 不生效）"
              : `结算流放（${passed ? "通过" : "不通过"}）`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl border-2 border-white/15 bg-slate-800/60 text-slate-300 text-xl font-bold hover:bg-slate-700/60 transition-colors cursor-pointer"
          >
            取消
          </button>
        </div>

        <div className="text-xs text-slate-400">
          口径：门槛为全体玩家（无论生死）的一半向上取整；死者可投票；
          一日可流放多人；流放 ≠ 处决，同日可既有流放又有处决。
        </div>
      </div>
    </ModalWrapper>
  );
}
