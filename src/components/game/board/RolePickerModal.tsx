"use client";

import { useMemo, useState } from "react";
import type { Role } from "../../../../app/data";
import { RoleTokenBadge } from "../../common/RoleTokenBadge";
import { ModalWrapper } from "../../modals/ModalWrapper";

/**
 * RolePickerModal —— 传奇角色 / 旅行者选人弹窗（2026-10-13 视觉重做）
 *
 * 设计语言取自两个既有界面（保持全站一致，不再各写一套）：
 *   · `RoleCodexModal`（角色图鉴）：圆形代币徽章 RoleTokenBadge + 名字 + 阵营配色 +
 *     技能说明放进独立深色小盒，悬浮抬升 `-translate-y-0.5`；
 *   · `CustomScriptBuilderModal`（自定义剧本）：紧凑卡片网格 + 选中态
 *     `ring-2 + scale-[1.02] + 右上角 ✓ 圆标` + 分组计数 chip。
 *
 * ⭐ 与旧实现的关键差异（旧版是「text-4xl 大字 + text-xl 能力」的竖直列表，占地大且难扫读）：
 *   ① 代币徽章让 23 个角色一眼可辨（对齐图鉴的视觉锚点）；
 *   ② **能力全文一字不删**（用户明确要求「保持技能效果的清晰描述」），
 *      放在 `bg-black/30` 盒里用 `leading-relaxed` 排版，不做 line-clamp；
 *   ③ 顶部加搜索框（15 个旅行者时尤其必要）+「已选/占用」计数；
 *   ④ 卡片带 `data-role-id`（简繁异体文案不可靠，自动化/读屏按 id 定位——
 *      与 CustomScriptBuilderModal 的既有约定一致）。
 *
 * ⚠️ 主题色分工（刻意如此）：
 *   传奇角色 = 琥珀（图鉴/自定义剧本对 fabled 均用 amber）；
 *   旅行者   = 天蓝（与本局 HUD 的旅行者座位行 sky 配色保持一致，
 *             图鉴里 traveler 用的是紫色——但弹窗从旅行者座位点开，
 *             与座位的 sky 同色更不易割裂）。
 */
export interface RolePickerModalProps {
  open: boolean;
  title: string;
  /** 可选角色列表（调用方传 FABLED_ROLES / TRAVELER_ROLES，禁 roles.filter） */
  roles: Role[];
  kind: "fabled" | "traveler";
  /** 当前已选中的角色 id（传奇=全局唯一；旅行者=该座位） */
  selectedId?: string | null;
  /** 已被其他座位/位置占用的 id ⇒ 禁用并提示 */
  disabledIds?: string[];
  /** 顶部说明条文案（解释该角色类型的规则要点） */
  hint?: string;
  /** 计数 chip 的文案，如「上限 1」「座位 1」 */
  countLabel?: string;
  onPick: (role: Role) => void;
  onClear: () => void;
  /** 清空按钮文案，如「移除传奇角色」「清空该座位」 */
  clearLabel: string;
  onClose: () => void;
}

interface PickerTheme {
  hintBg: string;
  hintText: string;
  hintBorder: string;
  countChip: string;
  selectedCard: string;
  hoverBorder: string;
  nameHover: string;
  tokenBg: string;
  checkBg: string;
  clearBtn: string;
}

const THEME: Record<"fabled" | "traveler", PickerTheme> = {
  fabled: {
    hintBg: "bg-amber-900/25",
    hintText: "text-amber-200",
    hintBorder: "border-amber-600/40",
    countChip: "bg-amber-900/40 text-amber-300 border-amber-600/40",
    selectedCard:
      "border-amber-400/80 bg-amber-500/20 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]",
    hoverBorder: "hover:border-amber-400/70",
    nameHover: "group-hover:text-amber-300",
    tokenBg:
      "bg-gradient-to-br from-slate-800 to-slate-950 border-amber-400 text-amber-200",
    checkBg: "bg-amber-500",
    clearBtn:
      "border-amber-500/40 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50",
  },
  traveler: {
    hintBg: "bg-sky-900/25",
    hintText: "text-sky-200",
    hintBorder: "border-sky-600/40",
    countChip: "bg-sky-900/40 text-sky-300 border-sky-600/40",
    selectedCard:
      "border-sky-400/80 bg-sky-500/20 ring-2 ring-sky-400/50 shadow-[0_0_15px_rgba(14,165,233,0.25)]",
    hoverBorder: "hover:border-sky-400/70",
    nameHover: "group-hover:text-sky-300",
    tokenBg:
      "bg-gradient-to-br from-sky-900 via-sky-950 to-slate-950 border-sky-400 text-sky-200",
    checkBg: "bg-sky-500",
    clearBtn: "border-sky-500/40 bg-sky-950/40 text-sky-200 hover:bg-sky-900/50",
  },
};

export function RolePickerModal({
  open,
  title,
  roles,
  kind,
  selectedId = null,
  disabledIds = [],
  hint,
  countLabel,
  onPick,
  onClear,
  clearLabel,
  onClose,
}: RolePickerModalProps) {
  const [query, setQuery] = useState("");
  const theme = THEME[kind];
  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q) ||
        r.ability?.toLowerCase().includes(q)
    );
  }, [roles, query]);

  if (!open) return null;

  return (
    <ModalWrapper
      title={title}
      onClose={onClose}
      maxWidthPx={1180}
      autoHeight
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-xs text-slate-400">
            共 <b className="text-slate-200">{roles.length}</b> 个可选
            {query.trim() && (
              <>
                {" · "}
                命中 <b className="text-slate-200">{filtered.length}</b>
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className={`px-4 py-2 rounded-xl border font-bold text-sm transition-colors cursor-pointer ${theme.clearBtn}`}
            >
              {clearLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full min-h-0 w-full">
        {/* 顶部：说明条 + 计数 + 搜索 */}
        <div className="shrink-0 flex flex-row items-center gap-2.5 pb-3">
          {hint && (
            <div
              className={`flex-1 px-3 py-2 rounded-xl border text-xs leading-relaxed ${theme.hintBg} ${theme.hintText} ${theme.hintBorder}`}
            >
              {hint}
            </div>
          )}
          {countLabel && (
            <span
              className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs font-bold ${theme.countChip}`}
            >
              {countLabel}
            </span>
          )}
          <div className="relative shrink-0">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 技能关键词…"
              className="w-56 px-3 py-2 pl-8 bg-black/50 border border-white/15 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-xs text-slate-400">
              🔍
            </span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                aria-label="清空搜索"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 角色卡片网格（固定 2 列设计像素：舞台内禁用 sm:/xl: 等视口断点） */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((role) => {
              const isSelected = selectedId === role.id;
              const isDisabled = disabledSet.has(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  data-role-id={role.id}
                  data-selected={isSelected ? "true" : "false"}
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  onClick={() => onPick(role)}
                  title={isDisabled ? "已被其他座位占用" : undefined}
                  className={`group relative w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 backdrop-blur-sm ${
                    isSelected
                      ? theme.selectedCard
                      : `border-white/10 bg-slate-800/50 ${theme.hoverBorder} ${
                          isDisabled
                            ? ""
                            : "hover:bg-slate-800/80 hover:-translate-y-0.5 hover:shadow-xl"
                        }`
                  } ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {/* 圆形代币徽章（同图鉴视觉锚点） */}
                  <RoleTokenBadge
                    name={role.name}
                    tokenBg={theme.tokenBg}
                    size="lg"
                    className={isDisabled ? "grayscale" : ""}
                  />

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-lg font-black text-slate-100 transition-colors truncate ${
                          isSelected ? "" : theme.nameHover
                        }`}
                      >
                        {role.name}
                      </h4>
                      {isSelected && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/50 bg-emerald-500/20 text-emerald-200">
                          当前生效
                        </span>
                      )}
                      {isDisabled && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/20 bg-slate-900/70 text-slate-400">
                          已被占用
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate -mt-1">
                      {role.id}
                    </p>

                    {/* 能力全文：一字不截断（用户要求「保持技能效果的清晰描述」） */}
                    <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>⚡</span>
                        <span>角色能力</span>
                      </div>
                      <p className="text-[15px] leading-relaxed text-slate-200">
                        {role.ability || "无特殊能力说明"}
                      </p>
                    </div>
                  </div>

                  {/* 选中勾标（同自定义剧本的选中语言） */}
                  {isSelected && (
                    <div
                      className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center shadow ${theme.checkBg}`}
                    >
                      <svg
                        className="w-3.5 h-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <span className="text-4xl">🔍</span>
              <p className="text-base font-bold text-slate-300">
                未找到符合条件的角色
              </p>
              <p className="text-xs text-slate-500">请尝试更换搜索关键字</p>
            </div>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
