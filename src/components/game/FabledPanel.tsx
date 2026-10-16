"use client";

import { useState } from "react";
import { isPlayerEvil } from "../../../app/gameLogic";
import { gameActions, useGameContext } from "../../contexts/GameContext";
import { ModalWrapper } from "../modals/ModalWrapper";

/**
 * 🎴 传奇角色（Fabled）说书人操作面板（2026-10-16）
 * ==================================================================
 * 传奇角色**不占座位、不入夜序**（`fabledLock.ts` 已钉死），
 * 官方把它们的裁定权全部交给说书人 ⇒ 本面板是它们的**唯一操作入口**。
 *
 * 落地口径分两档（诚实标注，不假装引擎自动化了做不到的事）：
 *   · **真实状态效果**：🚣 摆渡人（最后一天所有死者重获投票标记，直接改 seats）
 *   · **说书人裁决记录**：其余角色记录裁定 + 写入 `state.fabledState` + 落日志，
 *     由说书人据此执行桌面动作（引擎不猜测主观判定）。
 *
 * 官方原文来源：`json/wiki_crawl/parsed_roles.json`（`type === "legendary"`）。
 */
export function FabledPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useGameContext();
  const [pickA, setPickA] = useState<number | null>(null);

  const fabled = state.activeFabled ?? [];
  if (!isOpen || fabled.length === 0) return null;
  const role = fabled[0];
  const fs = state.fabledState;
  const upd = (u: Partial<typeof fs>) =>
    dispatch(gameActions.setFabledState(u));

  /** 统一日志（day/phase 必填，与全仓 addLog 口径一致） */
  const log = (message: string) =>
    dispatch(
      gameActions.addLog({
        day: state.nightCount ?? 0,
        phase: state.gamePhase,
        message,
      } as any)
    );

  const seatBtn = (
    seatId: number,
    label: string,
    onClick: () => void,
    picked = false,
    disabled = false
  ) => (
    <button
      key={seatId}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl border-2 text-base font-bold transition-colors ${
        disabled
          ? "border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed"
          : picked
            ? "border-emerald-300 bg-emerald-600 text-white cursor-pointer"
            : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700 cursor-pointer"
      }`}
    >
      {label}
    </button>
  );

  const initialEvilCount = (state.initialSeats ?? []).filter((s: any) =>
    isPlayerEvil(s as any)
  ).length;
  const currentEvilCount = state.seats.filter((s) => isPlayerEvil(s)).length;

  return (
    <ModalWrapper
      title={`🎴 传奇角色 · ${role.name}`}
      onClose={onClose}
      widthRatio={0.86}
      autoHeight
    >
      <div className="flex flex-col gap-4 p-5 text-white">
        <div className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 px-4 py-3 text-lg text-indigo-100 leading-relaxed">
          {role.ability}
        </div>

        {/* 🚣 摆渡人 —— 唯一有真实状态效果的传奇角色 */}
        {role.id === "ferryman" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：在游戏的**最后一天**，所有已死亡玩家会重新获得投票标记。
            </div>
            <button
              type="button"
              disabled={fs.ferrymanLastDayResolved}
              onClick={() => {
                dispatch(gameActions.ferrymanLastDay());
                log("🚣 摆渡人结算：游戏最后一天，所有已死亡玩家重新获得投票标记");
              }}
              className={`px-6 py-3 rounded-xl border-2 text-lg font-black transition-colors ${
                fs.ferrymanLastDayResolved
                  ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300 cursor-default"
                  : "border-amber-400/80 bg-amber-600 text-slate-950 hover:bg-amber-500 cursor-pointer active:scale-[0.98]"
              }`}
            >
              {fs.ferrymanLastDayResolved
                ? "✓ 已结算（本局死者均已重获投票标记）"
                : "🚣 结算最后一天：所有死者重获投票标记"}
            </button>
            <div className="text-sm text-slate-400 leading-relaxed">
              ⚠️ 本操作会**重置所有死亡座位的幽灵票**（官方规则对「幽灵票单向锁存」的合法豁免）。
            </div>
          </div>
        )}

        {/* 🧸 玩具匠 */}
        {role.id === "toymaker" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：恶魔可以在夜晚选择放弃攻击（**每局游戏至少一次**）。邪恶玩家照常获取初始信息。
            </div>
            <button
              type="button"
              disabled={fs.toymakerAttackSkipped}
              onClick={() => {
                upd({ toymakerAttackSkipped: true });
                log("🧸 玩具匠：恶魔本夜选择放弃攻击（每局至少一次的额度已用）");
              }}
              className={`px-6 py-3 rounded-xl border-2 text-lg font-black transition-colors ${
                fs.toymakerAttackSkipped
                  ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300 cursor-default"
                  : "border-amber-400/80 bg-amber-600 text-slate-950 hover:bg-amber-500 cursor-pointer active:scale-[0.98]"
              }`}
            >
              {fs.toymakerAttackSkipped
                ? "✓ 恶魔已放弃过一次攻击"
                : "🧸 记录：恶魔本次放弃攻击"}
            </button>
          </div>
        )}

        {/* 🔮 骗人精 */}
        {role.id === "fibbin" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：每局游戏限一次，一名**善良**玩家可能会得知「有问题」的信息。
            </div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) =>
                seatBtn(
                  s.id,
                  `${s.id + 1} 号`,
                  () => {
                    upd({ fibbinUsed: true, fibbinTargetId: s.id });
                    log(
                      `🔮 骗人精：${s.id + 1}号（善良）本次得知的信息「有问题」（每局限一次，已用）`
                    );
                  },
                  fs.fibbinTargetId === s.id,
                  fs.fibbinUsed && fs.fibbinTargetId !== s.id
                )
              )}
            </div>
            {fs.fibbinUsed && (
              <div className="text-base text-emerald-300 font-bold">
                ✓ 本局已使用{fs.fibbinTargetId !== null ? `（目标：${fs.fibbinTargetId + 1} 号）` : ""}
              </div>
            )}
          </div>
        )}

        {/* 😇 天使 */}
        {role.id === "angel" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：对新玩家的死亡负最大责任的人，可能会遭遇一些不好的事情。
              （俗称「新手保护」：先庇护一名新手玩家，其死亡时把「不好的事」标记给责任最大者。）
            </div>
            <div className="text-base text-slate-300">① 选择被庇护的新手玩家：</div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) =>
                seatBtn(
                  s.id,
                  `${s.id + 1} 号`,
                  () => {
                    upd({ angelProtectedSeatId: s.id });
                    log(`😇 天使：${s.id + 1}号被庇护（新手保护）`);
                  },
                  fs.angelProtectedSeatId === s.id
                )
              )}
            </div>
            <div className="text-base text-slate-300">
              ② 若其死亡 ⇒ 选择「负最大责任者」（给他「不好的事」标记）：
            </div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) =>
                seatBtn(
                  s.id,
                  `${s.id + 1} 号`,
                  () => {
                    upd({ angelPunishedSeatId: s.id });
                    log(`😇 天使：${s.id + 1}号对其（新手）死亡负最大责任 ⇒ 遭遇「不好的事」`);
                  },
                  fs.angelPunishedSeatId === s.id
                )
              )}
            </div>
          </div>
        )}

        {/* ✊ 革命者 */}
        {role.id === "revolutionary" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：公开声明一对**邻座**玩家本局游戏一直保持同一阵营。每局游戏限一次，
              他们中的一人**可能被当作**其他的角色/阵营。
            </div>
            <div className="text-base text-slate-300">
              选择邻座的一对（{pickA === null ? "先点第一位" : `已选 ${pickA + 1} 号，再点第二位`}）：
            </div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) => {
                const isNeighbor =
                  pickA !== null &&
                  (Math.abs(s.id - pickA) === 1 ||
                    // 圆桌首尾相邻（0 与末位）
                    (pickA === 0 && s.id === state.seats.length - 1) ||
                    (s.id === 0 && pickA === state.seats.length - 1));
                return seatBtn(
                  s.id,
                  `${s.id + 1} 号${isNeighbor ? " ⇄" : ""}`,
                  () => {
                    if (pickA === null) {
                      setPickA(s.id);
                      return;
                    }
                    if (!isNeighbor) {
                      setPickA(s.id);
                      return;
                    }
                    upd({ revolutionaryPair: { a: pickA, b: s.id } });
                    log(
                      `✊ 革命者：公开声明 ${pickA + 1}号 与 ${s.id + 1}号 本局一直保持同一阵营`
                    );
                    setPickA(null);
                  },
                  pickA === s.id || fs.revolutionaryPair?.a === s.id || fs.revolutionaryPair?.b === s.id
                );
              })}
            </div>
            {fs.revolutionaryPair && (
              <div className="text-base text-emerald-300 font-bold">
                已声明：{fs.revolutionaryPair.a + 1} 号 ↔ {fs.revolutionaryPair.b + 1} 号
              </div>
            )}
            <button
              type="button"
              disabled={!fs.revolutionaryPair || fs.revolutionaryDisguiseUsed}
              onClick={() => {
                upd({ revolutionaryDisguiseUsed: true });
                log(
                  "✊ 革命者：本局限一次 —— 其中一人被当作其他角色/阵营（由说书人选择哪一人）"
                );
              }}
              className={`px-6 py-3 rounded-xl border-2 text-lg font-black transition-colors ${
                !fs.revolutionaryPair || fs.revolutionaryDisguiseUsed
                  ? "border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed"
                  : "border-amber-400/80 bg-amber-600 text-slate-950 hover:bg-amber-500 cursor-pointer active:scale-[0.98]"
              }`}
            >
              {fs.revolutionaryDisguiseUsed
                ? "✓ 本局「被当作其他」已使用"
                : "✊ 使用：其中一人被当作其他角色/阵营（每局限一次）"}
            </button>
          </div>
        )}

        {/* 🛡️ 哨兵 */}
        {role.id === "sentinel" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：在初始设置时，可能会额外增加或减少一个外来者。
            </div>
            <div className="flex flex-wrap gap-3">
              {[-1, 0, 1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    upd({ sentinelOutsiderDelta: d });
                    log(
                      d === 0
                        ? "🛡️ 哨兵：本次设置不调整外来者数量"
                        : `🛡️ 哨兵：本次设置外来者数量 ${d > 0 ? "+1" : "-1"}`
                    );
                  }}
                  className={`px-6 py-3 rounded-xl border-2 text-lg font-black transition-colors cursor-pointer active:scale-[0.98] ${
                    fs.sentinelOutsiderDelta === d
                      ? "border-emerald-300 bg-emerald-600 text-white"
                      : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {d === 0 ? "不调整" : d > 0 ? "外来者 +1" : "外来者 −1"}
                </button>
              ))}
            </div>
            <div className="text-sm text-slate-400 leading-relaxed">
              ⚠️ 本仓库的配比校验读的是剧本配比 + 男爵等角色修正；
              哨兵的调整需说书人在「角色配置」环节据此手动设置（面板记录裁定，不擅自改配比）。
            </div>
          </div>
        )}

        {/* 🕊️ 圣洁之魂 */}
        {role.id === "spirit_of_ivory" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：游戏过程中邪恶玩家的总数**最多能比初始设置多一名**。
            </div>
            <div className="rounded-xl border border-white/15 bg-slate-800/70 px-4 py-3 text-lg">
              初始邪恶数：<b>{initialEvilCount}</b> ／ 当前邪恶数：<b>{currentEvilCount}</b> ／
              上限：<b>{initialEvilCount + 1}</b>
              {currentEvilCount >= initialEvilCount + 1 && (
                <span className="ml-2 text-red-300 font-bold">
                  ⚠️ 已达上限：不得再新增邪恶
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                upd({ spiritOfIvoryCapped: currentEvilCount >= initialEvilCount + 1 })
              }
              className="px-6 py-3 rounded-xl border-2 border-amber-400/70 bg-amber-900/40 text-amber-100 text-lg font-bold hover:bg-amber-800/50 transition-colors cursor-pointer"
            >
              🕊️ 重新评估是否已封顶
            </button>
            {fs.spiritOfIvoryCapped && (
              <div className="text-base text-red-300 font-bold">
                ✓ 已标记封顶（说书人应拒绝任何「转为邪恶」的操作）
              </div>
            )}
          </div>
        )}

        {/* 🧘 佛教徒 —— 纯桌面规则 */}
        {role.id === "buddhist" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-lg text-amber-100 leading-relaxed">
            官方：每个白天的**前两分钟**，老玩家不能发言。
            <div className="mt-2 text-base text-amber-200/80">
              ⚠️ 这是**纯桌面流程规则**（靠计时与口头约定），引擎无法介入计时 ⇒
              本面板只作提示，不产生任何状态。
            </div>
          </div>
        )}

        {/* 🎻 小提琴手 */}
        {role.id === "fiddler" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：每局游戏限一次，恶魔可以秘密选择一名**对立阵营**的玩家，
              所有玩家要表决：这两名玩家中**谁的阵营获胜**。（**平局邪恶阵营获胜**）
            </div>
            <div className="rounded-xl border border-white/15 bg-slate-800/70 px-4 py-3 text-base text-slate-300 leading-relaxed">
              操作：说书人主持公开表决 → 给两人各一次发言/投票 → 统计后宣布获胜阵营；
              <b className="text-red-300">平票按邪恶阵营获胜</b>。引擎不自动判定（表决是桌面行为）。
            </div>
          </div>
        )}

        {/* 👑 公爵夫人 */}
        {role.id === "duchess" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：每个白天，三名玩家可以一起拜访你。当晚*，他们会得知他们之中
              **有几个是邪恶的**，但**其中一人的信息是错的**。
            </div>
            <div className="rounded-xl border border-white/15 bg-slate-800/70 px-4 py-3 text-base text-slate-300 leading-relaxed">
              操作：说书人把三名访客记为「访客」、任选其一记为「错误信息」，
              当晚向三人分别给出「组内邪恶数」（对那位错误者给错值）。
              信息渠道可用既有的说书人纠偏页（`StorytellerCorrectionModal`）。
            </div>
          </div>
        )}

        {/* 🧞 灯神 */}
        {role.id === "djinn" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：使用灯神的**相克规则**。所有玩家都会知道其内容。
            </div>
            <div className="rounded-xl border border-white/15 bg-slate-800/70 px-4 py-3 text-base text-slate-300 leading-relaxed">
              操作：在开局把「相克规则」开关打开（控制台顶部），并把适用的相克规则
              逐条公示给所有玩家。⚠️ 引擎复用**既有**相克规则开关，
              <b>不另起第二套</b>（避免"双写入点"分叉）。
            </div>
          </div>
        )}

        {/* 其余传奇角色（末日预言者 / 地狱藏书员 / 失败的上帝） */}
        {![
          "ferryman",
          "toymaker",
          "fibbin",
          "angel",
          "revolutionary",
          "sentinel",
          "spirit_of_ivory",
          "buddhist",
          "fiddler",
          "duchess",
          "djinn",
        ].includes(role.id) && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 px-4 py-3 text-base text-slate-300 leading-relaxed">
            该传奇角色的规则由说书人按官方说明执行。
            {role.id === "doomsayer" &&
              "（末日预言者 / 地狱藏书员 已有日间桥接入口；失败的上帝为「承认失误」的桌面礼节。）"}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
