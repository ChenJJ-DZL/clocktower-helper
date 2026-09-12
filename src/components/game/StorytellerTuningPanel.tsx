"use client";

/**
 * 说书人「信息微调」面板（唯一 UI 实现，两个入口共用）
 * ============================================================================
 * 入口 1：NightActionPage 的**说书人解锁视图**（长按 1.5 秒解锁，见该文件顶部注释）。
 * 入口 2：GameConsole 的常驻「信息微调」折叠区块（默认折叠，展开前内容不进 DOM）。
 *
 * ⚠️ 本面板只允许出现在"说书人视图"里。调用方负责用 <StorytellerOnly> 或
 * 折叠容器把它包起来（**条件渲染**，不是 CSS 隐藏）。
 * 状态来源：components/game/StorytellerTuningContext.tsx（两处共享同一份 state，
 * 因此默认值与说书人改动永远一致）。
 */

import React from "react";
import { formatSeatLabel } from "../../utils/seatLabel";
import { useStorytellerTuning } from "./StorytellerTuningContext";

interface StorytellerTuningPanelProps {
  seats: any[];
  /** 座位补丁写入（疯子假信息覆盖等需要落库的字段） */
  onUpdateSeat?: (seatId: number, patch: Record<string, any>) => void;
}

export function StorytellerTuningPanel({
  seats,
  onUpdateSeat,
}: StorytellerTuningPanelProps) {
  const tuning = useStorytellerTuning();
  if (!tuning) return null;
  const { state, patch, roleId, derived } = tuning;
  const {
    vortoxActive,
    allTownsfolkRoles,
    allOutsiderRoles,
    allMinionRoles,
    defaultAutoInfo,
    livingLeftNeighbor,
    livingRightNeighbor,
    fortuneTellerDetection,
    demonTargetProtection,
    isImpAttackingMayor,
    isImpSuicide,
    aliveMinions,
    isInfoRole,
    currentGoodTwinSeat,
  } = derived;

  const aliveSeats = seats.filter((s) => !s.isDead);

  return (
    <div className="space-y-5" data-testid="storyteller-tuning-panel">
      {/* 🌀 A1：疯子首夜"假恶魔信息"覆盖（只影响疯子所见） */}
      <LunaticFakeInfoEditor seats={seats} onUpdateSeat={onUpdateSeat} />

      {/* ─── 信息类角色（洗衣妇/图书管理员/调查员/厨师）──────────────────── */}
      {isInfoRole && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧙‍♂️</span>
              <h3 className="text-sm font-bold text-indigo-200 uppercase tracking-wider">
                说书人信息指定与微调
              </h3>
            </div>
            <button
              onClick={() => patch({ showOverride: !state.showOverride })}
              className="text-xs px-3 py-1 rounded-lg bg-indigo-800/60 hover:bg-indigo-700/60 text-indigo-200 font-medium border border-indigo-500/30 transition-colors"
            >
              {state.showOverride ? "收起微调面板" : "展开微调面板"}
            </button>
          </div>

          <div className="bg-black/40 rounded-xl p-3 border border-indigo-500/20">
            <span className="text-xs text-indigo-400 font-medium block mb-1">
              当前将发送的信息：
            </span>
            <p className="text-base text-indigo-100 font-bold">
              {roleId === "washerwoman" &&
                `${state.customC1 + 1}号 和 ${state.customC2 + 1}号 之中有一位是【${state.customRoleName}】`}
              {roleId === "librarian" &&
                (state.librarianMode === "zero"
                  ? "场上没有外来者在场（数字0）"
                  : `${state.customC1 + 1}号 和 ${state.customC2 + 1}号 之中有一位是【${state.customRoleName}】`)}
              {roleId === "investigator" &&
                `${state.customC1 + 1}号 和 ${state.customC2 + 1}号 之中有一位是【${state.customRoleName}】`}
              {roleId === "chef" &&
                `场上有 ${state.chefCount} 对邻座的邪恶玩家`}
            </p>
          </div>

          {state.showOverride && (
            <div className="space-y-4 pt-2 border-t border-indigo-500/20 text-sm">
              {roleId === "librarian" && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-300 font-medium">模式选择:</span>
                  <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="librarian_mode"
                      checked={state.librarianMode === "candidates"}
                      onChange={() => patch({ librarianMode: "candidates" })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>指定外来者对</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="librarian_mode"
                      checked={state.librarianMode === "zero"}
                      onChange={() => patch({ librarianMode: "zero" })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>宣告 0 外来者</span>
                  </label>
                </div>
              )}

              {(roleId === "washerwoman" ||
                roleId === "investigator" ||
                (roleId === "librarian" &&
                  state.librarianMode === "candidates")) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      ["候选玩家 1", state.customC1, (v: number) => patch({ customC1: v })],
                      ["候选玩家 2", state.customC2, (v: number) => patch({ customC2: v })],
                    ] as const
                  ).map(([label, value, onChange]) => (
                    <div key={label}>
                      <label className="block text-xs text-slate-400 mb-1">
                        {label}
                      </label>
                      <select
                        value={value}
                        onChange={(e) => onChange(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-indigo-500"
                      >
                        {seats.map((s) => (
                          <option key={s.id} value={s.id}>
                            {formatSeatLabel(s.id, s.playerName)} -{" "}
                            {s.role?.name || "未知"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      展示角色
                    </label>
                    <select
                      value={state.customRoleName}
                      onChange={(e) => patch({ customRoleName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      {roleId === "washerwoman" &&
                        allTownsfolkRoles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      {roleId === "librarian" && (
                        <>
                          <option value="酒鬼">酒鬼 (真实标记)</option>
                          {allOutsiderRoles.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ))}
                        </>
                      )}
                      {roleId === "investigator" &&
                        allMinionRoles.map((r) => (
                          <option key={r.id} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {roleId === "chef" && (
                <div className="flex items-center gap-4">
                  <span className="text-slate-300 font-medium">邪恶邻座对数:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        patch({ chefCount: Math.max(0, state.chefCount - 1) })
                      }
                      className="w-8 h-8 rounded-lg bg-indigo-900 hover:bg-indigo-800 text-white font-bold flex items-center justify-center border border-indigo-700"
                    >
                      -
                    </button>
                    <span className="w-10 text-center text-xl font-bold text-amber-400">
                      {state.chefCount}
                    </span>
                    <button
                      onClick={() => patch({ chefCount: state.chefCount + 1 })}
                      className="w-8 h-8 rounded-lg bg-indigo-900 hover:bg-indigo-800 text-white font-bold flex items-center justify-center border border-indigo-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (!defaultAutoInfo) return;
                  const info = defaultAutoInfo as any;
                  patch({
                    ...(typeof info.c1 === "number" ? { customC1: info.c1 } : {}),
                    ...(typeof info.c2 === "number" ? { customC2: info.c2 } : {}),
                    ...(typeof info.roleName === "string"
                      ? { customRoleName: info.roleName }
                      : {}),
                    ...(info.mode === "zero" || info.mode === "candidates"
                      ? { librarianMode: info.mode }
                      : {}),
                    ...(typeof info.count === "number"
                      ? { chefCount: info.count }
                      : {}),
                  });
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                ↺ 恢复系统计算推荐
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── 共情者 ─────────────────────────────────────────────────────── */}
      {roleId === "empath" && (
        <div className="rounded-2xl border border-blue-500/40 bg-blue-950/40 backdrop-blur-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">👁️</span>
            <h3 className="text-sm font-bold text-blue-200 uppercase tracking-wider">
              共情者邻座检测（已自动跳过死亡玩家）
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-black/40 p-3 rounded-xl border border-blue-500/20 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">👈 左侧存活邻居:</span>
              <span className="font-bold text-blue-200 text-sm">
                {livingLeftNeighbor
                  ? `${livingLeftNeighbor.id + 1}号 [${livingLeftNeighbor.role?.name || "未知"}]`
                  : "无"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">👉 右侧存活邻居:</span>
              <span className="font-bold text-blue-200 text-sm">
                {livingRightNeighbor
                  ? `${livingRightNeighbor.id + 1}号 [${livingRightNeighbor.role?.name || "未知"}]`
                  : "无"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-300">得知邪恶邻居数：</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  patch({
                    empathCustomCount: Math.max(0, state.empathCustomCount - 1),
                  })
                }
                className="w-7 h-7 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold flex items-center justify-center border border-blue-700"
              >
                -
              </button>
              <span className="w-8 text-center text-lg font-black text-amber-400">
                {state.empathCustomCount}
              </span>
              <button
                onClick={() =>
                  patch({
                    empathCustomCount: Math.min(2, state.empathCustomCount + 1),
                  })
                }
                className="w-7 h-7 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold flex items-center justify-center border border-blue-700"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 占卜师 ─────────────────────────────────────────────────────── */}
      {fortuneTellerDetection && (
        <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/40 backdrop-blur-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔮</span>
            <h3 className="text-sm font-bold text-indigo-200">
              占卜师查验判定（恶魔或红罗刹）
            </h3>
          </div>
          <div className="bg-black/40 p-3 rounded-xl border border-indigo-500/20 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">系统计算判定：</span>
              <span className="font-bold text-indigo-300">
                {fortuneTellerDetection.reason}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-indigo-500/20">
              <span className="text-slate-300 font-medium">当前返回答案：</span>
              <button
                type="button"
                onClick={() =>
                  patch({
                    fortuneTellerCustomAnswer: !state.fortuneTellerCustomAnswer,
                  })
                }
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                  state.fortuneTellerCustomAnswer
                    ? "bg-red-600 border-red-400 text-white shadow-md"
                    : "bg-emerald-600 border-emerald-400 text-white shadow-md"
                }`}
              >
                {state.fortuneTellerCustomAnswer
                  ? "【是】 (发现恶魔/红罗刹)"
                  : "【否】 (无恶魔/红罗刹)"}{" "}
                ↺ 点击切换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 镜像双子 ───────────────────────────────────────────────────── */}
      {roleId === "evil_twin" && (
        <div className="rounded-2xl border border-purple-500/40 bg-purple-950/40 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h3 className="text-base font-bold text-purple-200">
                镜像双子对立绑定（说书人可换选）
              </h3>
            </div>
            {currentGoodTwinSeat && (
              <span className="px-2.5 py-0.5 rounded-full bg-purple-600/30 text-purple-300 text-xs font-bold border border-purple-400/40">
                当前对立：{currentGoodTwinSeat.id + 1}号【
                {currentGoodTwinSeat.role?.name || "未知"}】
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {aliveSeats.map((s) => {
              const isSelected = state.evilTwinGoodId === s.id;
              const isGood =
                s.role?.type === "townsfolk" || s.role?.type === "outsider";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => patch({ evilTwinGoodId: s.id })}
                  className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-purple-600 border-purple-300 text-white shadow-lg"
                      : "bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="truncate">
                    <span className="font-black text-sm mr-1.5">{s.id + 1}号</span>
                    <span className="text-xs font-medium">
                      {s.role?.name || "未分配"}
                    </span>
                  </div>
                  {isGood && (
                    <span className="text-[10px] px-1.5 rounded bg-blue-500/20 text-blue-300 shrink-0 font-bold">
                      善良
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 赏金猎人 ───────────────────────────────────────────────────── */}
      {roleId === "bounty_hunter" && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h3 className="text-base font-bold text-red-200">
              赏金猎人悬赏目标选择
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {aliveSeats.map((s) => {
              const isSelected = state.bountyHunterTargetId === s.id;
              const isEvil =
                s.role?.type === "demon" ||
                s.role?.type === "minion" ||
                s.isEvilConverted ||
                (s as any).alignment === "evil";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => patch({ bountyHunterTargetId: s.id })}
                  className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? "bg-red-600 border-red-300 text-white shadow-lg"
                      : "bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="truncate">
                    <span className="font-black text-sm mr-1.5">{s.id + 1}号</span>
                    <span className="text-xs font-medium">
                      {s.role?.name || "未分配"}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 rounded shrink-0 font-bold ${
                      isEvil
                        ? "bg-red-500/30 text-red-300 border border-red-500/40"
                        : "bg-blue-500/20 text-blue-300"
                    }`}
                  >
                    {isEvil ? "邪恶" : "善良"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 恶魔夜杀防护（僧侣守护 / 士兵免疫）──────────────────────────── */}
      {demonTargetProtection && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 backdrop-blur-xl p-4 flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <p className="text-xs font-bold text-amber-200 leading-relaxed">
            {demonTargetProtection.text}
          </p>
        </div>
      )}

      {/* ─── 恶魔击中镇长：弹刀选择 ─────────────────────────────────────── */}
      {isImpAttackingMayor && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h3 className="text-base font-bold text-red-200">
              恶魔击中镇长：说书人弹刀选择器
            </h3>
          </div>
          <div className="space-y-2">
            {(
              [
                ["mayor_die", "① 镇长承受攻击（镇长死亡）"],
                ["bounce", "② 弹刀给指定存活玩家"],
                ["immune", "③ 弹刀给免死/守护目标（平安夜）"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-black/40 border border-red-500/20 cursor-pointer hover:bg-black/60"
              >
                <input
                  type="radio"
                  name="mayor_choice"
                  checked={state.mayorChoice === key}
                  onChange={() => patch({ mayorChoice: key })}
                  className="text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-200">{label}</span>
                  {key === "bounce" && state.mayorChoice === "bounce" && (
                    <select
                      value={state.mayorBounceTargetId}
                      onChange={(e) =>
                        patch({ mayorBounceTargetId: Number(e.target.value) })
                      }
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-medium"
                    >
                      {seats
                        .filter((s) => !s.isDead && s.role?.id !== "mayor")
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {formatSeatLabel(s.id, s.playerName)}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ─── 小恶魔自杀传刀 ─────────────────────────────────────────────── */}
      {isImpSuicide && (
        <div className="rounded-2xl border border-purple-500/40 bg-purple-950/40 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">😈</span>
              <h3 className="text-base font-bold text-purple-200">
                小恶魔自杀传刀：选择继任爪牙
              </h3>
            </div>
            {aliveMinions.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const randomMinion =
                    aliveMinions[
                      Math.floor(Math.random() * aliveMinions.length)
                    ];
                  patch({ selectedSuccessorId: randomMinion.id });
                }}
                className="text-xs px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 transition-colors"
              >
                🎲 随机爪牙
              </button>
            )}
          </div>
          {aliveMinions.length === 0 ? (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-700/50 text-red-300 text-xs font-bold">
              ⚠️ 场上暂无存活爪牙！小恶魔自杀将直接导致恶魔死亡且无法传刀！
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {aliveMinions.map((m) => {
                const isSelected = state.selectedSuccessorId === m.id;
                const isSW = m.role?.id === "scarlet_woman";
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => patch({ selectedSuccessorId: m.id })}
                    className={`relative p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-purple-600 border-purple-300 text-white shadow-lg"
                        : "bg-black/40 border-purple-500/20 text-slate-300 hover:bg-black/60"
                    }`}
                  >
                    <span className="font-black text-sm">{m.id + 1}号</span>
                    <p className="text-xs font-bold opacity-90 mt-1">
                      {m.role?.name}
                    </p>
                    {isSW && (
                      <span className="text-[10px]">🌟 推荐 (红唇女郎)</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 涡流世界：说书人专属提醒（玩家视角下整块不渲染） */}
      {vortoxActive && (
        <div className="rounded-xl border border-fuchsia-500/60 bg-fuchsia-950/40 p-3 text-fuchsia-200 text-xs font-bold">
          🌪️ 涡流世界 · 镇民信息将反相（说书人提示，玩家不可见）
        </div>
      )}
    </div>
  );
}

/**
 * 🌀 A1：疯子首夜假信息覆盖编辑器。
 * 覆盖只写进**疯子座位**（`lunaticFakeBluffNames` / `lunaticFakeMinionIds`），
 * 生成侧（utils/nightInfoAdapter.ts 的 demon_info 分支）只在该疯子走该步骤时读取，
 * 因此真恶魔、真爪牙的信息完全不受影响。
 */
function LunaticFakeInfoEditor({
  seats,
  onUpdateSeat,
}: {
  seats: any[];
  onUpdateSeat?: (seatId: number, patch: Record<string, any>) => void;
}) {
  const tuning = useStorytellerTuning();
  const lunatic = seats.find((s) => s.role?.id === "lunatic" && !s.isDead);
  const [draftBluffs, setDraftBluffs] = React.useState<string | null>(null);
  const [draftMinions, setDraftMinions] = React.useState<string | null>(null);
  if (!tuning || !lunatic) return null;
  const { state, patch } = tuning;
  const bluffs = state.lunaticFakeBluffNames ?? [];
  const minionIds = state.lunaticFakeMinionIds ?? [];
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 backdrop-blur-xl p-5 space-y-3">
      <h3 className="text-sm font-bold text-amber-200">
        🌀 疯子首夜假信息覆盖（{lunatic.id + 1}号 · 只影响疯子所见）
      </h3>
      <p className="text-[11px] text-amber-200/70 leading-relaxed">
        官方：「疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量
        符合的爪牙，但是这些信息可能是错误的。」默认值为系统确定性生成的假信息，
        说书人可在此覆盖。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-slate-300 mb-1">
            假伪装牌（逗号分隔，至多 3 张）
          </label>
          <input
            value={draftBluffs ?? (bluffs.length > 0 ? bluffs.join("、") : "")}
            placeholder="例如：洗衣妇、猎手、圣徒"
            onChange={(e) => {
              setDraftBluffs(e.target.value);
              const names = e.target.value
                .split(/[、,，\s]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              patch({ lunaticFakeBluffNames: names.length > 0 ? names : null });
              onUpdateSeat?.(lunatic.id, {
                lunaticFakeBluffNames: names.length > 0 ? names : undefined,
              });
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          />
        </div>
        <div>
          <label className="block text-slate-300 mb-1">
            假爪牙座位（逗号分隔，如 2,4）
          </label>
          <input
            value={
              draftMinions ??
              (minionIds.length > 0
                ? minionIds.map((id) => id + 1).join(",")
                : "")
            }
            placeholder="例如：2,4"
            onChange={(e) => {
              setDraftMinions(e.target.value);
              const ids = e.target.value
                .split(/[、,，\s]+/)
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n >= 1)
                .map((n) => n - 1);
              patch({ lunaticFakeMinionIds: ids });
              onUpdateSeat?.(lunatic.id, { lunaticFakeMinionIds: ids });
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setDraftBluffs(null);
          setDraftMinions(null);
          patch({ lunaticFakeBluffNames: null, lunaticFakeMinionIds: [] });
          onUpdateSeat?.(lunatic.id, {
            lunaticFakeBluffNames: undefined,
            lunaticFakeMinionIds: [],
          });
        }}
        className="text-xs text-amber-300 hover:text-amber-200 underline"
      >
        ↺ 恢复系统生成的默认假信息
      </button>
    </div>
  );
}
