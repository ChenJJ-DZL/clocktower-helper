"use client";

import { useState } from "react";
import { isPlayerEvil } from "../../../app/gameLogic";
import { isSeatAlive } from "../../utils/seatAlive";
import { roles as ALL_ROLES } from "../../../app/data";
import { gameActions, useGameContext } from "../../contexts/GameContext";
import { useOptionalGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "../modals/ModalWrapper";
import { RolePickerModal } from "./board/RolePickerModal";

/** 角色 id → 中文名（革命者「被当作」显示用） */
function roleNameOf(id: string | null | undefined): string | null {
  if (!id) return null;
  return ALL_ROLES.find((r) => r.id === id)?.name ?? id;
}

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
  // 🎯 真实效果需要 killPlayer / addPoisonMark（天使·地狱藏书员的「不好的事」）
  const actions = useOptionalGameActions() ?? ({} as any);
  const [pickA, setPickA] = useState<number | null>(null);
  /** ✊ 革命者：「被当作其他」的选人与内容（2026-10-20 补齐交互） */
  const [disguiseSeat, setDisguiseSeat] = useState<number | null>(null);
  const [asRoleId, setAsRoleId] = useState<string | null>(null);
  const [asAlignment, setAsAlignment] = useState<"good" | "evil" | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  /** 🛡️ 哨兵：换角（外来者 ±1 的真实落地） */
  const [sentinelSeat, setSentinelSeat] = useState<number | null>(null);
  const [showSentinelRolePicker, setShowSentinelRolePicker] = useState(false);
  const [sentinelToOutsider, setSentinelToOutsider] = useState(true);

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
                    // ⭐ 2026-10-20 真实效果：给目标打 fibbin_misinfo 状态
                    //   （原只写 fabledState 字段无人读 = 假效果）
                    dispatch(gameActions.fabledFibbinMisinfo(s.id));
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
            {/* ⭐ 2026-10-20 真实效果：「不好的事」必须落地（原只写字段无人读 = 假效果） */}
            {fs.angelPunishedSeatId != null && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const pid = fs.angelPunishedSeatId!;
                    actions.killPlayer(pid, { source: "fabled" });
                    log(
                      `😇 天使「不好的事」：${pid + 1}号 死亡（官方：对新玩家死亡负最大责任者遭遇不好的事）`
                    );
                  }}
                  className="px-5 py-2.5 rounded-xl border-2 border-rose-400/80 bg-rose-600 text-white font-bold hover:bg-rose-500 cursor-pointer"
                >
                  💀 执行惩罚：{fs.angelPunishedSeatId + 1} 号死亡
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pid = fs.angelPunishedSeatId!;
                    actions.toggleStatus("poisoned", pid);
                    log(`😇 天使「不好的事」：${pid + 1}号 中毒`);
                  }}
                  className="px-5 py-2.5 rounded-xl border-2 border-purple-400/80 bg-purple-600 text-white font-bold hover:bg-purple-500 cursor-pointer"
                >
                  ☠️ 执行惩罚：{fs.angelPunishedSeatId + 1} 号中毒
                </button>
              </div>
            )}
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
                （本局一直保持同一阵营）
              </div>
            )}

            {/* ── 步骤 2/3：「被当作其他」——必须指明哪一名玩家、被当作什么 ──
                ⚠️ 2026-10-20 补交互（用户实测：旧版只有开关，无从落地）：
                官方要求说书人**选择其中一人**被当作其他角色和/或阵营；
                此前只有 `revolutionaryDisguiseUsed` 布尔位 ⇒ 效果无处生效。 */}
            {fs.revolutionaryPair && !fs.revolutionaryDisguiseUsed && (
              <>
                <div className="text-base text-amber-200">
                  步骤 2：选择**哪一名**玩家「被当作其他」（每局限一次）：
                </div>
                <div className="flex gap-2">
                  {([fs.revolutionaryPair.a, fs.revolutionaryPair.b] as number[]).map(
                    (id) =>
                      seatBtn(
                        id,
                        `${id + 1} 号被当作其他`,
                        () => setDisguiseSeat(id),
                        disguiseSeat === id
                      )
                  )}
                </div>
              </>
            )}

            {disguiseSeat !== null && !fs.revolutionaryDisguiseUsed && (
              <>
                <div className="text-base text-slate-300">
                  步骤 3：指定 {disguiseSeat + 1} 号「被当作」的角色和/或阵营
                  （可只改其一，也可都改）：
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setShowRolePicker(true)}
                    className="px-4 py-2 rounded-lg border-2 border-sky-400/70 bg-sky-500/15 text-sky-100 cursor-pointer"
                  >
                    被当作角色：{roleNameOf(asRoleId) ?? "不改（保持真实角色认知）"}
                  </button>
                  {(["good", "evil"] as const).map((al) => (
                    <button
                      key={al}
                      type="button"
                      onClick={() =>
                        setAsAlignment((cur) => (cur === al ? null : al))
                      }
                      className={`px-4 py-2.5 rounded-xl border-2 text-base font-bold transition-colors cursor-pointer ${
                        asAlignment === al
                          ? "border-emerald-300 bg-emerald-600 text-white"
                          : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      {al === "good" ? "被当作善良" : "被当作邪恶"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAsAlignment(null)}
                    className="px-4 py-2 rounded-lg border-2 border-slate-500 text-slate-300 cursor-pointer"
                  >
                    阵营不改
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!asRoleId && !asAlignment) {
                      log(
                        "✊ 革命者：未指定任何「被当作」内容，未发动（请至少改角色或阵营之一）"
                      );
                      return;
                    }
                    upd({
                      revolutionaryDisguise: {
                        seatId: disguiseSeat,
                        asRoleId,
                        asAlignment,
                      },
                      revolutionaryDisguiseUsed: true,
                    });
                    log(
                      `✊ 革命者（限一次）：${disguiseSeat + 1}号 被当作 ${roleNameOf(asRoleId) ?? "原角色"} / ${asAlignment === "good" ? "善良" : asAlignment === "evil" ? "邪恶" : "原阵营"} —— 其他角色的信息类能力将按此认知该玩家`
                    );
                  }}
                  className="px-6 py-3 rounded-xl border-2 border-amber-400/80 bg-amber-600 text-slate-950 text-lg font-black hover:bg-amber-500 cursor-pointer active:scale-[0.98]"
                >
                  ✊ 发动「被当作其他」（每局限一次）
                </button>
              </>
            )}

            {fs.revolutionaryDisguise && (
              <div className="text-base text-emerald-300 font-bold">
                ✓ 已发动：{fs.revolutionaryDisguise.seatId + 1} 号被当作{" "}
                {roleNameOf(fs.revolutionaryDisguise.asRoleId) ?? "原角色"} /
                {fs.revolutionaryDisguise.asAlignment === "good"
                  ? " 善良"
                  : fs.revolutionaryDisguise.asAlignment === "evil"
                    ? " 邪恶"
                    : " 原阵营"}
                （其他角色的信息类能力按此认知；真实身份与胜负判定不变）
              </div>
            )}
          </div>
        )}

        {/* 🛡️ 哨兵 */}
        {role.id === "sentinel" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：在初始设置时，可能会额外增加或减少一个外来者。
            </div>
            {/* ⭐ 2026-10-20 真实效果：±1 不再只是记录 —— 选座位换角色（内容换、id 保留） */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "外来者 +1", toOutsider: true },
                { label: "外来者 −1", toOutsider: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setSentinelToOutsider(opt.toOutsider);
                    setSentinelSeat(-1); // 进入选座位模式
                    upd({ sentinelOutsiderDelta: opt.toOutsider ? 1 : -1 });
                  }}
                  className={`px-6 py-3 rounded-xl border-2 text-lg font-black transition-colors cursor-pointer active:scale-[0.98] ${
                    sentinelSeat === -1 && sentinelToOutsider === opt.toOutsider
                      ? "border-emerald-300 bg-emerald-600 text-white"
                      : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {sentinelSeat === -1 && (
              <div className="text-base text-amber-200">
                选择要{sentinelToOutsider ? "改成外来者" : "改成镇民"}的座位：
              </div>
            )}
            {sentinelSeat === -1 && (
              <div className="flex flex-wrap gap-2">
                {state.seats.map((s) =>
                  seatBtn(
                    s.id,
                    `${s.id + 1} 号（${s.role?.name ?? "?"}）`,
                    () => {
                      setSentinelSeat(s.id);
                      setShowSentinelRolePicker(true);
                    },
                    false
                  )
                )}
              </div>
            )}
            <div className="text-sm text-slate-400 leading-relaxed">
              ⚠️ 选择座位后会打开角色选择器，把该座位换成对应类型的角色
              （外来者 / 镇民）—— 这是**真实换角**，配比随之改变。
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

        {/* 💀 末日预言者 —— 每名存活玩家限一次：公开要求杀死同阵营玩家 */}
        {role.id === "doomsayer" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：如果大于等于四名玩家存活，每名当前存活的玩家可以公开要求你杀死一名
              **与他阵营相同**的玩家（每名玩家限一次）。
            </div>
            <div className="text-base text-slate-300">① 谁提出请求？</div>
            <div className="flex flex-wrap gap-2">
              {state.seats
                .filter((s) => isSeatAlive(s as any))
                .map((s) =>
                  seatBtn(s.id, `${s.id + 1} 号`, () => setPickA(s.id), pickA === s.id)
                )}
            </div>
            {pickA !== null && (
              <>
                <div className="text-base text-amber-200">
                  ② 杀死一名**与 {pickA + 1} 号同阵营**的存活玩家（真实死亡）：
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.seats
                    .filter(
                      (s) =>
                        !s.isDead &&
                        s.id !== pickA &&
                        isPlayerEvil(s) === isPlayerEvil(
                          state.seats.find((x) => x.id === pickA)!
                        )
                    )
                    .map((s) =>
                      seatBtn(s.id, `${s.id + 1} 号`, () => {
                        actions.killPlayer(s.id, { source: "fabled" });
                        log(
                          `💀 末日预言者：${pickA + 1}号 公开请求 ⇒ ${s.id + 1}号（同阵营）死亡`
                        );
                        setPickA(null);
                      })
                    )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 📕 地狱藏书员 —— 说书人宣布安静时，仍在说话者遭遇「不好的事」 */}
        {role.id === "hells_librarian" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：当说书人宣布安静时，仍在说话的玩家可能会遭遇一些不好的事情。
            </div>
            <div className="text-base text-slate-300">
              选择「仍在说话」的玩家，执行「不好的事」（真实生效）：
            </div>
            <div className="flex flex-wrap gap-2">
              {state.seats
                .filter((s) => isSeatAlive(s as any))
                .map((s) => (
                  <div key={s.id} className="flex flex-col gap-1">
                    {seatBtn(s.id, `${s.id + 1} 号`, () => setPickA(s.id), pickA === s.id)}
                    {pickA === s.id && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            actions.killPlayer(s.id, { source: "fabled" });
                            log(`📕 地狱藏书员：${s.id + 1}号 仍在说话 ⇒ 死亡（不好的事）`);
                            setPickA(null);
                          }}
                          className="px-2 py-1 text-xs rounded bg-rose-600 text-white cursor-pointer"
                        >
                          死亡
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            actions.toggleStatus("poisoned", s.id);
                            log(`📕 地狱藏书员：${s.id + 1}号 仍在说话 ⇒ 中毒（不好的事）`);
                            setPickA(null);
                          }}
                          className="px-2 py-1 text-xs rounded bg-purple-600 text-white cursor-pointer"
                        >
                          中毒
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 🎻 小提琴手 —— 恶魔秘密选对立玩家 → 全员表决谁的阵营获胜（平局邪恶胜） */}
        {role.id === "fiddler" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：每局游戏限一次，恶魔可以秘密选择一名**对立阵营**的玩家，
              所有玩家要表决：这两名玩家中谁的阵营获胜。（平局邪恶阵营获胜）
            </div>
            <div className="text-base text-slate-300">① 选择两名玩家（恶魔 + 对立阵营）：</div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) =>
                seatBtn(
                  s.id,
                  `${s.id + 1} 号`,
                  () => {
                    if (pickA === null) setPickA(s.id);
                    else if (pickA !== s.id) {
                      upd({ fiddlerPair: { a: pickA, b: s.id } });
                      log(`🎻 小提琴手：${pickA + 1}号 与 ${s.id + 1}号 进入最终表决`);
                      setPickA(null);
                    }
                  },
                  pickA === s.id || fs.fiddlerPair?.a === s.id || fs.fiddlerPair?.b === s.id
                )
              )}
            </div>
            {fs.fiddlerPair && (
              <>
                <div className="text-base text-slate-300">
                  ② 表决结果（得票多者阵营获胜；**平局 = 邪恶获胜**）：
                </div>
                <div className="flex flex-wrap gap-2">
                  {([fs.fiddlerPair.a, fs.fiddlerPair.b] as number[]).map((id) => {
                    const evil = isPlayerEvil(
                      state.seats.find((x) => x.id === id)!
                    );
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          const winner: "good" | "evil" = evil ? "evil" : "good";
                          upd({ fiddlerWinner: winner, fiddlerUsed: true });
                          log(
                            `🎻 小提琴手表决：${id + 1}号（${evil ? "邪恶" : "善良"}）胜出 ⇒ 游戏以${evil ? "邪恶" : "善良"}阵营获胜结束`
                          );
                          actions.setWinResult?.(winner);
                          actions.setWinReason?.("小提琴手表决（fiddler）");
                        }}
                        className="px-5 py-2.5 rounded-xl border-2 border-amber-400/80 bg-amber-600 text-slate-950 font-bold hover:bg-amber-500 cursor-pointer"
                      >
                        {id + 1} 号（{evil ? "邪恶" : "善良"}）胜出
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      upd({ fiddlerWinner: "evil", fiddlerUsed: true });
                      log("🎻 小提琴手表决平局 ⇒ 官方：平局邪恶阵营获胜");
                      actions.setWinResult?.("evil");
                      actions.setWinReason?.("小提琴手表决平局（fiddler）");
                    }}
                    className="px-5 py-2.5 rounded-xl border-2 border-rose-400/80 bg-rose-600 text-white font-bold hover:bg-rose-500 cursor-pointer"
                  >
                    平局 ⇒ 邪恶获胜
                  </button>
                </div>
              </>
            )}
            {fs.fiddlerUsed && (
              <div className="text-base text-emerald-300 font-bold">
                ✓ 已结算：{fs.fiddlerWinner === "evil" ? "邪恶" : "善良"}阵营获胜
              </div>
            )}
          </div>
        )}

        {/* 👑 公爵夫人 —— 三名玩家拜访 → 当晚得知其中几人邪恶（一人信息错） */}
        {role.id === "duchess" && (
          <div className="flex flex-col gap-3">
            <div className="text-lg text-slate-200">
              官方：每个白天，三名玩家可以一起拜访你。当晚*，他们会得知他们之中有几个是邪恶的，
              但其中一人的信息是错的。
            </div>
            <div className="text-base text-slate-300">
              选择来访的三名玩家（已选 {pickA !== null ? 1 : 0} / 3，点击加入）：
            </div>
            <div className="flex flex-wrap gap-2">
              {state.seats.map((s) => {
                const chosen = (fs.duchessVisitIds ?? []).includes(s.id);
                return seatBtn(
                  s.id,
                  `${s.id + 1} 号`,
                  () => {
                    const cur = fs.duchessVisitIds ?? [];
                    const next = chosen
                      ? cur.filter((x) => x !== s.id)
                      : cur.length < 3
                        ? [...cur, s.id]
                        : cur;
                    upd({ duchessVisitIds: next });
                  },
                  chosen
                );
              })}
            </div>
            {(fs.duchessVisitIds ?? []).length === 3 && (
              <button
                type="button"
                onClick={() => {
                  const ids = fs.duchessVisitIds!;
                  const evilCount = ids.filter((id) =>
                    isPlayerEvil(state.seats.find((x) => x.id === id)!)
                  ).length;
                  upd({ duchessEvilCount: evilCount });
                  log(
                    `👑 公爵夫人：${ids.map((i) => i + 1).join("、")}号 拜访 ⇒ 真实邪恶数 ${evilCount}（其中一人的信息是错的，由说书人裁定给谁）`
                  );
                }}
                className="px-5 py-2.5 rounded-xl border-2 border-amber-400/80 bg-amber-600 text-slate-950 font-bold hover:bg-amber-500 cursor-pointer"
              >
                👑 结算拜访：生成当晚信息
              </button>
            )}
            {fs.duchessEvilCount != null && (
              <div className="text-base text-emerald-300 font-bold">
                ✓ 当晚信息：三人中有 {fs.duchessEvilCount} 名邪恶（其中一人的信息是错的）
              </div>
            )}
          </div>
        )}

        {/* 其余传奇角色（失败的上帝 = 桌面礼节） */}
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
          "doomsayer",
          "hells_librarian",
        ].includes(role.id) && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 px-4 py-3 text-base text-slate-300 leading-relaxed">
            该传奇角色的规则由说书人按官方说明执行。
            {role.id === "deus_ex_fiasco" &&
              "（失败的上帝：说书人出现失误并公开承认 —— 桌面礼节，引擎不模拟。）"}
          </div>
        )}
      </div>

      {/* ✊ 革命者：「被当作角色」选择器（复用 RolePickerModal 设计语言） */}
      <RolePickerModal
        open={showRolePicker && role.id === "revolutionary"}
        kind="fabled"
        title={`选择 ${disguiseSeat != null ? disguiseSeat + 1 + " 号" : ""} 被当作的角色`}
        roles={ALL_ROLES}
        selectedId={asRoleId}
        countLabel="可选任意角色"
        hint="革命者效果：每局限一次，可使这对玩家中的一人「被当作」其他角色和/或阵营（其他角色的信息类能力按此认知）。选「清空」= 不改角色认知。"
        onPick={(r) => {
          setAsRoleId(r.id);
          setShowRolePicker(false);
        }}
        onClear={() => {
          setAsRoleId(null);
          setShowRolePicker(false);
        }}
        clearLabel="不改角色（保持真实认知）"
        onClose={() => setShowRolePicker(false)}
      />

      {/* 🛡️ 哨兵：换角选择器（外来者 ↔ 镇民，真实改变座位角色） */}
      <RolePickerModal
        open={showSentinelRolePicker && role.id === "sentinel"}
        kind="fabled"
        title={`哨兵：把 ${sentinelSeat != null && sentinelSeat >= 0 ? sentinelSeat + 1 + " 号" : ""} 换成${sentinelToOutsider ? "外来者" : "镇民"}`}
        roles={ALL_ROLES.filter((r) =>
          sentinelToOutsider ? r.type === "outsider" : r.type === "townsfolk"
        )}
        selectedId={null}
        countLabel={sentinelToOutsider ? "外来者角色" : "镇民角色"}
        hint="哨兵官方：初始设置时可能额外增加或减少一个外来者。选中角色后该座位**真实换角**（内容换、座位 id 保留）。"
        onClear={() => {
          setShowSentinelRolePicker(false);
          setSentinelSeat(null);
        }}
        clearLabel="取消换角"
        onPick={(r) => {
          if (sentinelSeat != null && sentinelSeat >= 0) {
            dispatch(gameActions.fabledSwapRole(sentinelSeat, r));
            log(
              `🛡️ 哨兵：${sentinelSeat + 1}号 换角为【${r.name}】（${sentinelToOutsider ? "外来者 +1" : "外来者 −1"}，真实生效）`
            );
          }
          setShowSentinelRolePicker(false);
          setSentinelSeat(null);
        }}
        onClose={() => {
          setShowSentinelRolePicker(false);
          setSentinelSeat(null);
        }}
      />
    </ModalWrapper>
  );
}
