import { roles } from "../../../app/data";
import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function DayAbilityModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;
  const { roleId, seatId } = modal;
  const seat = props.seats.find((s) => s.id === seatId);
  if (!seat) return null;
  const effectiveRole =
    seat.role?.id === "drunk"
      ? seat.charadeRole || seat.role
      : seat.role;
  const roleName = effectiveRole?.name || seat.role?.name || "";

  const closeModal = () => {
    props.setCurrentModal(null);
    props.setDayAbilityForm({});
  };

  const submit = () => {
    if (roleId === "gossip") {
      const statement = (props.dayAbilityForm.info1 || "").trim();
      const verdict = props.dayAbilityForm.info2 || ""; // 'true' | 'false' | ''
      if (!statement) {
        alert("请填写造谣内容（说书人记录）。");
        return;
      }
      const isTrue = verdict === "true";
      const isFalse = verdict === "false";
      props.addLog(
        `${seat.id + 1}号(造谣者) 造谣：${statement}` +
          (isTrue
            ? "（说书人裁定：为真，今晚额外死亡）"
            : isFalse
              ? "（说书人裁定：为假）"
              : "（未裁定真假）")
      );
      props.setDayAbilityLogs((prev: any[]) => [
        ...prev,
        { id: seat.id, roleId, day: props.nightCount, text: statement },
      ]);
      props.setGossipStatementToday?.(statement);
      props.setGossipSourceSeatId?.(seat.id);
      props.setGossipTrueTonight?.(isTrue);
      closeModal();
      return;
    }
    if (roleId === "savant" || roleId === "savant_mr") {
      if (!props.dayAbilityForm.info1 || !props.dayAbilityForm.info2) {
        alert("请填写两条信息（其中一真一假）。");
        return;
      }
      props.addLog(
        `${seat.id + 1}号(博学者) 今日私聊信息：【真/假 1】${props.dayAbilityForm.info1} | 【真/假 2】${props.dayAbilityForm.info2}`
      );
      props.setDayAbilityLogs((prev: any[]) => [
        ...prev,
        {
          id: seat.id,
          roleId,
          day: props.nightCount,
          text: `信息1: ${props.dayAbilityForm.info1} | 信息2: ${props.dayAbilityForm.info2}`,
        },
      ]);
      props.markDailyAbilityUsed?.("savant", seat.id);
      props.markDailyAbilityUsed?.("savant_mr", seat.id);
      closeModal();
      return;
    }
    if (roleId === "juggler") {
      const guesses = props.dayAbilityForm.jugglerGuesses || [];
      if (guesses.length === 0) {
        alert("请至少添加 1 条杂耍艺人猜测。");
        return;
      }
      const guessSummaries = guesses
        .map((g: any) => `${g.targetSeatId + 1}号是【${g.roleName}】`)
        .join("，");
      props.addLog(`${seat.id + 1}号(杂耍艺人) 公开猜测：${guessSummaries}`);
      props.setDayAbilityLogs((prev: any[]) => [
        ...prev,
        {
          id: seat.id,
          roleId,
          day: props.nightCount,
          text: `公开猜测：${guessSummaries}`,
          guesses,
        },
      ]);
      props.markAbilityUsed?.("juggler", seat.id);
      closeModal();
      return;
    }
    if (roleId === "mutant") {
      // 畸形秀演员违反疯狂仲裁处决
      if (confirm(`确定判定 ${seat.id + 1}号【畸形秀演员】违反疯狂并立即处决？`)) {
        props.addLog(`⚠️ 说书人裁定：${seat.id + 1}号(畸形秀演员) 违反疯狂，立即处决！`);
        props.executePlayer?.(seat.id);
        closeModal();
      }
      return;
    }
    if (roleId === "amnesiac") {
      if (!props.dayAbilityForm.guess || !props.dayAbilityForm.feedback) {
        alert("请填写猜测和反馈。");
        return;
      }
      props.addLog(
        `${seat.id + 1}号(失忆者) 今日猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}`
      );
      props.setDayAbilityLogs((prev: any[]) => [
        ...prev,
        {
          id: seat.id,
          roleId,
          day: props.nightCount,
          text: `猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}`,
        },
      ]);
      props.markDailyAbilityUsed("amnesiac", seat.id);
      closeModal();
      return;
    }
    if (roleId === "fisherman") {
      if (!props.dayAbilityForm.advice) {
        alert("请填写说书人提供的建议。");
        return;
      }
      props.addLog(
        `${seat.id + 1}号(渔夫) 获得建议：${props.dayAbilityForm.advice}`
      );
      props.setDayAbilityLogs((prev: any[]) => [
        ...prev,
        {
          id: seat.id,
          roleId,
          day: props.nightCount,
          text: `建议：${props.dayAbilityForm.advice}`,
        },
      ]);
      props.markAbilityUsed("fisherman", seat.id);
      closeModal();
      return;
    }
    if (roleId === "engineer") {
      const mode = props.dayAbilityForm.engineerMode;
      const newRoleId = props.dayAbilityForm.engineerRoleId;
      if (!mode) {
        alert("请选择改造目标（恶魔或爪牙）。");
        return;
      }
      if (!newRoleId) {
        alert("请选择要改造成为的角色。");
        return;
      }
      const newRole = roles.find((r) => r.id === newRoleId);
      if (!newRole) return;
      if (mode === "demon" && newRole.type !== "demon") {
        alert("请选择一个恶魔角色。");
        return;
      }
      if (mode === "minion" && newRole.type !== "minion") {
        alert("请选择一个爪牙角色。");
        return;
      }
      if (mode === "demon") {
        const demonSeat = props.seats.find(
          (s: any) => s.role?.type === "demon" || s.isDemonSuccessor
        );
        if (!demonSeat) {
          alert("场上没有可改造的恶魔。");
          return;
        }
        props.setSeats((prev: any[]) =>
          prev.map((s: any) => {
            if (s.id !== demonSeat.id) return s;
            return props.cleanseSeatStatuses(
              {
                ...s,
                role: newRole,
                charadeRole: null,
              },
              { keepDeathState: true }
            );
          })
        );
        props.addLog(`${seat.id + 1}号(工程师) 将恶魔改造成 ${newRole.name}`);
        // 调整唤醒队列：如果当前在夜晚，将改造后的恶魔插入唤醒队列
        if (["night", "firstNight"].includes(props.gamePhase)) {
          props.insertIntoWakeQueueAfterCurrent(demonSeat.id, {
            roleOverride: newRole,
            logLabel: `${demonSeat.id + 1}号(${newRole.name})`,
          });
        }
      } else {
        const minions = props.seats.filter(
          (s: any) => s.role?.type === "minion"
        );
        if (minions.length === 0) {
          alert("场上没有可改造的爪牙。");
          return;
        }
        props.setSeats((prev: any[]) =>
          prev.map((s: any) => {
            if (s.role?.type !== "minion") return s;
            return props.cleanseSeatStatuses(
              {
                ...s,
                role: newRole,
                charadeRole: null,
              },
              { keepDeathState: true }
            );
          })
        );
        props.addLog(
          `${seat.id + 1}号(工程师) 将所有爪牙改造成 ${newRole.name}`
        );
        // 调整唤醒队列：如果当前在夜晚，将所有改造后的爪牙插入唤醒队列
        if (["night", "firstNight"].includes(props.gamePhase)) {
          minions.forEach((m: any) => {
            props.insertIntoWakeQueueAfterCurrent(m.id, {
              roleOverride: newRole,
              logLabel: `${m.id + 1}号(${newRole.name})`,
            });
          });
        }
      }
      props.markAbilityUsed("engineer", seat.id);
      closeModal();
      return;
    }
  };

  return (
    <ModalWrapper
      title={`🌞 ${roleName} 日间能力`}
      onClose={closeModal}
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <button
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium text-white transition"
            onClick={closeModal}
          >
            取消
          </button>
          <button
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition"
            onClick={submit}
          >
            确认
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {roleId === "gossip" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              记录造谣内容，并由说书人裁定真假（工具不自动判定）。
            </p>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              placeholder="造谣内容（说书人记录）"
              value={props.dayAbilityForm.info1 || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  info1: e.target.value,
                }))
              }
            />
            <div className="text-sm text-gray-300">裁定结果：</div>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
              value={props.dayAbilityForm.info2 || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  info2: e.target.value,
                }))
              }
            >
              <option value="">未裁定（稍后再定）</option>
              <option value="true">为真（今晚额外死亡 1 人）</option>
              <option value="false">为假（无事发生）</option>
            </select>
          </div>
        )}

        {(roleId === "savant" || roleId === "savant_mr") && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              博学者每日私聊：请填写 2 条信息（说书人保证其中 1 条为真、1 条为假）。
            </p>
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-amber-300 font-bold self-center">快捷填入建议：</span>
              <button
                type="button"
                onClick={() =>
                  props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                    ...f,
                    info1: "在场存活爪牙数量为 1 名",
                  }))
                }
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-200"
              >
                爪牙数量
              </button>
              <button
                type="button"
                onClick={() =>
                  props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                    ...f,
                    info2: "双子玩家坐在圆桌偶数座位上",
                  }))
                }
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-200"
              >
                双子位置
              </button>
              <button
                type="button"
                onClick={() =>
                  props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                    ...f,
                    info2: "红罗刹玩家今日发起过提名",
                  }))
                }
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-200"
              >
                红罗刹动作
              </button>
            </div>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white"
              placeholder="信息 1（真或假）"
              value={props.dayAbilityForm.info1 || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  info1: e.target.value,
                }))
              }
            />
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white"
              placeholder="信息 2（对应相反真假）"
              value={props.dayAbilityForm.info2 || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  info2: e.target.value,
                }))
              }
            />
          </div>
        )}

        {roleId === "juggler" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              杂耍艺人猜测记录器（首个白天最多可猜测 5 名玩家身份，次夜将得知猜对总数）：
            </p>
            {/* 猜测列表 */}
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {((props.dayAbilityForm.jugglerGuesses || []) as Array<{ targetSeatId: number; roleName: string }>).map(
                (g, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-800 p-2.5 rounded-xl border border-slate-700"
                  >
                    <span className="text-sm text-amber-200 font-bold">
                      {idx + 1}. {g.targetSeatId + 1}号 玩家是 【{g.roleName}】
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...(props.dayAbilityForm.jugglerGuesses || [])];
                        next.splice(idx, 1);
                        props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                          ...f,
                          jugglerGuesses: next,
                        }));
                      }}
                      className="px-2 py-1 bg-red-800 hover:bg-red-700 text-xs rounded text-white"
                    >
                      删除
                    </button>
                  </div>
                )
              )}
            </div>

            {/* 添加单条猜测 */}
            {((props.dayAbilityForm.jugglerGuesses || []).length < 5) && (
              <div className="flex gap-2 items-center bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <select
                  id="juggler-target"
                  className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white flex-1"
                  defaultValue=""
                >
                  <option value="" disabled>
                    选择目标玩家
                  </option>
                  {props.seats.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.id + 1}号 {s.playerName || ""}
                    </option>
                  ))}
                </select>
                <select
                  id="juggler-role"
                  className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white flex-1"
                  defaultValue=""
                >
                  <option value="" disabled>
                    猜测角色
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.type})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const targetEl = document.getElementById("juggler-target") as HTMLSelectElement;
                    const roleEl = document.getElementById("juggler-role") as HTMLSelectElement;
                    if (!targetEl.value || !roleEl.value) {
                      alert("请选择目标玩家与猜测角色");
                      return;
                    }
                    const targetSeatId = Number(targetEl.value);
                    const roleName = roleEl.value;
                    const next = [
                      ...(props.dayAbilityForm.jugglerGuesses || []),
                      { targetSeatId, roleName },
                    ];
                    props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                      ...f,
                      jugglerGuesses: next,
                    }));
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shrink-0"
                >
                  + 添加猜测
                </button>
              </div>
            )}
          </div>
        )}

        {roleId === "mutant" && (
          <div className="space-y-4 text-center py-4">
            <div className="text-base text-red-300 font-bold">
              🎭 畸形秀演员疯狂仲裁
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              如果畸形秀演员在白天试图向其他玩家明示或暗示自己是外来者，说书人可裁定其违反疯狂并立即处决。
            </p>
            <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-200">
              ⚠️ 点击确认处决后将立即触发处决流程并结束今日白天！
            </div>
          </div>
        )}

        {roleId === "amnesiac" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              填写今天的猜测与说书人反馈。
            </p>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              placeholder="你的猜测"
              value={props.dayAbilityForm.guess || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  guess: e.target.value,
                }))
              }
            />
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              placeholder="说书人反馈"
              value={props.dayAbilityForm.feedback || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  feedback: e.target.value,
                }))
              }
            />
          </div>
        )}

        {roleId === "fisherman" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              记录说书人给出的建议（一次性）。
            </p>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              placeholder="建议内容"
              value={props.dayAbilityForm.advice || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  advice: e.target.value,
                }))
              }
            />
          </div>
        )}

        {roleId === "engineer" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              选择改造恶魔或爪牙，并指定新的角色。
            </p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-gray-200 text-sm">
                <input
                  type="radio"
                  checked={props.dayAbilityForm.engineerMode === "demon"}
                  onChange={() =>
                    props.setDayAbilityForm(
                      (f: typeof props.dayAbilityForm) => ({
                        ...f,
                        engineerMode: "demon",
                      })
                    )
                  }
                />
                改造恶魔
              </label>
              <label className="flex items-center gap-2 text-gray-200 text-sm">
                <input
                  type="radio"
                  checked={props.dayAbilityForm.engineerMode === "minion"}
                  onChange={() =>
                    props.setDayAbilityForm(
                      (f: typeof props.dayAbilityForm) => ({
                        ...f,
                        engineerMode: "minion",
                      })
                    )
                  }
                />
                改造所有爪牙
              </label>
            </div>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              value={props.dayAbilityForm.engineerRoleId || ""}
              onChange={(e) =>
                props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({
                  ...f,
                  engineerRoleId: e.target.value || undefined,
                }))
              }
            >
              <option value="">选择目标角色</option>
              {(() => {
                const usedRoleIds = new Set(
                  props.seats
                    .map((s: any) => props.getSeatRoleId(s))
                    .filter(Boolean) as string[]
                );
                return roles
                  .filter(
                    (r) =>
                      r.type ===
                      (props.dayAbilityForm.engineerMode === "demon"
                        ? "demon"
                        : props.dayAbilityForm.engineerMode === "minion"
                          ? "minion"
                          : undefined)
                  )
                  .filter((r) => !usedRoleIds.has(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.type})
                    </option>
                  ));
              })()}
            </select>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
