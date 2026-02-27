import { useGameActions } from "../../contexts/GameActionsContext";
import { roles, Role } from "../../../app/data";
import React from "react";

export function DayAbilityModal({ modal }: { modal: any }) {
    const props = useGameActions();
    if (!modal) return null;
    const { roleId, seatId } = modal;
    const seat = props.seats.find(s => s.id === seatId);
    if (!seat) return null;
    const roleName = seat.role?.name || '';

    const closeModal = () => {
        props.setCurrentModal(null);
        props.setDayAbilityForm({});
    };

    const submit = () => {
        if (roleId === 'gossip') {
            const statement = (props.dayAbilityForm.info1 || '').trim();
            const verdict = props.dayAbilityForm.info2 || ''; // 'true' | 'false' | ''
            if (!statement) {
                alert('请填写造谣内容（说书人记录）。');
                return;
            }
            const isTrue = verdict === 'true';
            const isFalse = verdict === 'false';
            props.addLog(
                `${seat.id + 1}号(造谣者) 造谣：${statement}` +
                (isTrue ? '（说书人裁定：为真，今晚额外死亡）' : isFalse ? '（说书人裁定：为假）' : '（未裁定真假）')
            );
            props.setDayAbilityLogs((prev: any[]) => [...prev, { id: seat.id, roleId, day: props.nightCount, text: statement }]);
            props.setGossipStatementToday?.(statement);
            props.setGossipSourceSeatId?.(seat.id);
            props.setGossipTrueTonight?.(isTrue);
            closeModal();
            return;
        }
        if (roleId === 'savant_mr') {
            if (!props.dayAbilityForm.info1 || !props.dayAbilityForm.info2) {
                alert('请填写两条信息（可真可假）。');
                return;
            }
            props.addLog(`${seat.id + 1}号(博学者) 今日信息：${props.dayAbilityForm.info1} / ${props.dayAbilityForm.info2}`);
            props.setDayAbilityLogs((prev: any[]) => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `${props.dayAbilityForm.info1} / ${props.dayAbilityForm.info2}` }]);
            props.markDailyAbilityUsed('savant_mr', seat.id);
            closeModal();
            return;
        }
        if (roleId === 'amnesiac') {
            if (!props.dayAbilityForm.guess || !props.dayAbilityForm.feedback) {
                alert('请填写猜测和反馈。');
                return;
            }
            props.addLog(`${seat.id + 1}号(失意者) 今日猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}`);
            props.setDayAbilityLogs((prev: any[]) => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}` }]);
            props.markDailyAbilityUsed('amnesiac', seat.id);
            closeModal();
            return;
        }
        if (roleId === 'fisherman') {
            if (!props.dayAbilityForm.advice) {
                alert('请填写说书人提供的建议。');
                return;
            }
            props.addLog(`${seat.id + 1}号(渔夫) 获得建议：${props.dayAbilityForm.advice}`);
            props.setDayAbilityLogs((prev: any[]) => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `建议：${props.dayAbilityForm.advice}` }]);
            props.markAbilityUsed('fisherman', seat.id);
            closeModal();
            return;
        }
        if (roleId === 'engineer') {
            const mode = props.dayAbilityForm.engineerMode;
            const newRoleId = props.dayAbilityForm.engineerRoleId;
            if (!mode) {
                alert('请选择改造目标（恶魔或爪牙）。');
                return;
            }
            if (!newRoleId) {
                alert('请选择要改造成为的角色。');
                return;
            }
            const newRole = roles.find(r => r.id === newRoleId);
            if (!newRole) return;
            if (mode === 'demon' && newRole.type !== 'demon') {
                alert('请选择一个恶魔角色。');
                return;
            }
            if (mode === 'minion' && newRole.type !== 'minion') {
                alert('请选择一个爪牙角色。');
                return;
            }
            if (mode === 'demon') {
                const demonSeat = props.seats.find((s: any) => s.role?.type === 'demon' || s.isDemonSuccessor);
                if (!demonSeat) {
                    alert('场上没有可改造的恶魔。');
                    return;
                }
                props.setSeats((prev: any[]) => prev.map((s: any) => {
                    if (s.id !== demonSeat.id) return s;
                    return props.cleanseSeatStatuses({
                        ...s,
                        role: newRole,
                        charadeRole: null,
                    }, { keepDeathState: true });
                }));
                props.addLog(`${seat.id + 1}号(工程师) 将恶魔改造成 ${newRole.name}`);
                // 调整唤醒队列：如果当前在夜晚，将改造后的恶魔插入唤醒队列
                if (['night', 'firstNight'].includes(props.gamePhase)) {
                    props.insertIntoWakeQueueAfterCurrent(demonSeat.id, { roleOverride: newRole, logLabel: `${demonSeat.id + 1}号(${newRole.name})` });
                }
            } else {
                const minions = props.seats.filter((s: any) => s.role?.type === 'minion');
                if (minions.length === 0) {
                    alert('场上没有可改造的爪牙。');
                    return;
                }
                props.setSeats((prev: any[]) => prev.map((s: any) => {
                    if (s.role?.type !== 'minion') return s;
                    return props.cleanseSeatStatuses({
                        ...s,
                        role: newRole,
                        charadeRole: null,
                    }, { keepDeathState: true });
                }));
                props.addLog(`${seat.id + 1}号(工程师) 将所有爪牙改造成 ${newRole.name}`);
                // 调整唤醒队列：如果当前在夜晚，将所有改造后的爪牙插入唤醒队列
                if (['night', 'firstNight'].includes(props.gamePhase)) {
                    minions.forEach((m: any) => {
                        props.insertIntoWakeQueueAfterCurrent(m.id, { roleOverride: newRole, logLabel: `${m.id + 1}号(${newRole.name})` });
                    });
                }
            }
            props.markAbilityUsed('engineer', seat.id);
            closeModal();
            return;
        }
    };

    return (
        <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border-4 border-blue-500 rounded-2xl p-6 max-w-2xl w-full space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-blue-200">🌞 {roleName} 日间能力</h2>
                    <button className="text-gray-400 hover:text-white" onClick={closeModal}>✕</button>
                </div>

                {roleId === 'gossip' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-300">记录造谣内容，并由说书人裁定真假（工具不自动判定）。</p>
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="造谣内容（说书人记录）"
                            value={props.dayAbilityForm.info1 || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, info1: e.target.value }))}
                        />
                        <div className="text-sm text-gray-300">裁定结果：</div>
                        <select
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                            value={props.dayAbilityForm.info2 || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, info2: e.target.value }))}
                        >
                            <option value="">未裁定（稍后再定）</option>
                            <option value="true">为真（今晚额外死亡 1 人）</option>
                            <option value="false">为假（无事发生）</option>
                        </select>
                    </div>
                )}

                {roleId === 'savant_mr' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-300">填写两条信息（其中一真一假）。</p>
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="信息1"
                            value={props.dayAbilityForm.info1 || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, info1: e.target.value }))}
                        />
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="信息2"
                            value={props.dayAbilityForm.info2 || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, info2: e.target.value }))}
                        />
                    </div>
                )}

                {roleId === 'amnesiac' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-300">填写今天的猜测与说书人反馈。</p>
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="你的猜测"
                            value={props.dayAbilityForm.guess || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, guess: e.target.value }))}
                        />
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="说书人反馈"
                            value={props.dayAbilityForm.feedback || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, feedback: e.target.value }))}
                        />
                    </div>
                )}

                {roleId === 'fisherman' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-300">记录说书人给出的建议（一次性）。</p>
                        <textarea
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            placeholder="建议内容"
                            value={props.dayAbilityForm.advice || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, advice: e.target.value }))}
                        />
                    </div>
                )}

                {roleId === 'engineer' && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-300">选择改造恶魔或爪牙，并指定新的角色。</p>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 text-gray-200 text-sm">
                                <input
                                    type="radio"
                                    checked={props.dayAbilityForm.engineerMode === 'demon'}
                                    onChange={() => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, engineerMode: 'demon' }))}
                                />
                                改造恶魔
                            </label>
                            <label className="flex items-center gap-2 text-gray-200 text-sm">
                                <input
                                    type="radio"
                                    checked={props.dayAbilityForm.engineerMode === 'minion'}
                                    onChange={() => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, engineerMode: 'minion' }))}
                                />
                                改造所有爪牙
                            </label>
                        </div>
                        <select
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                            value={props.dayAbilityForm.engineerRoleId || ''}
                            onChange={e => props.setDayAbilityForm((f: typeof props.dayAbilityForm) => ({ ...f, engineerRoleId: e.target.value || undefined }))}
                        >
                            <option value="">选择目标角色</option>
                            {(() => {
                                const usedRoleIds = new Set(
                                    props.seats.map((s: any) => props.getSeatRoleId(s)).filter(Boolean) as string[]
                                );
                                return roles
                                    .filter(r => r.type === (props.dayAbilityForm.engineerMode === 'demon' ? 'demon' : props.dayAbilityForm.engineerMode === 'minion' ? 'minion' : undefined))
                                    .filter(r => !usedRoleIds.has(r.id))
                                    .map(r => (
                                        <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                                    ));
                            })()}
                        </select>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button className="px-4 py-2 bg-gray-700 rounded" onClick={closeModal}>取消</button>
                    <button className="px-4 py-2 bg-blue-600 rounded font-bold" onClick={submit}>确认</button>
                </div>
            </div>
        </div>
    );
}
