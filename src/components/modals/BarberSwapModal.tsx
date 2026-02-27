import React from "react";
import { useGameActions } from "../../contexts/GameActionsContext";

export function BarberSwapModal() {
    const props = useGameActions();
    if (props.currentModal?.type !== 'BARBER_SWAP') return null;
    const modalData = props.currentModal.data;

    return (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
                <h2 className="text-3xl font-bold text-blue-300">理发师：交换两名玩家角色</h2>
                <div className="text-sm text-gray-300">恶魔（参考）：{modalData.demonId + 1}号</div>
                <select
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2"
                    value={modalData.firstId ?? ''}
                    onChange={(e) => {
                        const current = props.currentModal;
                        if (current?.type === 'BARBER_SWAP') {
                            props.setCurrentModal({ ...current, data: { ...current.data, firstId: e.target.value === '' ? null : Number(e.target.value) } });
                        }
                    }}
                >
                    <option value="">选择玩家A</option>
                    {props.seats.filter((s: any) => s.role?.type !== 'demon' && !s.isDemonSuccessor).map((s: any) => (
                        <option key={s.id} value={s.id}>[{s.id + 1}] {s.role?.name}</option>
                    ))}
                </select>
                <select
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2"
                    value={modalData.secondId ?? ''}
                    onChange={(e) => {
                        const current = props.currentModal;
                        if (current?.type === 'BARBER_SWAP') {
                            props.setCurrentModal({ ...current, data: { ...current.data, secondId: e.target.value === '' ? null : Number(e.target.value) } });
                        }
                    }}
                >
                    <option value="">选择玩家B</option>
                    {props.seats.filter((s: any) => s.role?.type !== 'demon' && !s.isDemonSuccessor).map((s: any) => (
                        <option key={s.id} value={s.id}>[{s.id + 1}] {s.role?.name}</option>
                    ))}
                </select>
                <div className="flex gap-3 justify-end">
                    <button className="px-4 py-2 bg-gray-700 rounded" onClick={() => props.setCurrentModal(null)}>取消</button>
                    <button className="px-4 py-2 bg-indigo-600 rounded" onClick={() => {
                        if (modalData.firstId === null || modalData.secondId === null || modalData.firstId === modalData.secondId) return;
                        const aId = modalData.firstId;
                        const bId = modalData.secondId;
                        const aSeat = props.seats.find((s: any) => s.id === aId);
                        const bSeat = props.seats.find((s: any) => s.id === bId);
                        if (!aSeat || !bSeat) return;
                        const aRole = aSeat.role;
                        const bRole = bSeat.role;
                        props.setSeats((prev: any[]) => prev.map((s: any) => {
                            if (s.id === aId) {
                                const swapped = props.cleanseSeatStatuses({ ...s, role: bRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                                return swapped;
                            }
                            if (s.id === bId) {
                                const swapped = props.cleanseSeatStatuses({ ...s, role: aRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                                return swapped;
                            }
                            return s;
                        }));
                        props.addLog(`理发师触发：交换了 ${aId + 1}号 与 ${bId + 1}号 的角色`);
                        // 调整唤醒队列：如果当前在夜晚，将交换后的两名玩家插入唤醒队列
                        if (['night', 'firstNight'].includes(props.gamePhase)) {
                            if (aRole && ((aRole.firstNightOrder ?? 0) > 0 || (aRole.otherNightOrder ?? 0) > 0)) {
                                props.insertIntoWakeQueueAfterCurrent(aId, { roleOverride: aRole, logLabel: `${aId + 1}号(${aRole.name})` });
                            }
                            if (bRole && ((bRole.firstNightOrder ?? 0) > 0 || (bRole.otherNightOrder ?? 0) > 0)) {
                                props.insertIntoWakeQueueAfterCurrent(bId, { roleOverride: bRole, logLabel: `${bId + 1}号(${bRole.name})` });
                            }
                        }
                        props.setCurrentModal(null);
                    }}>确认交换</button>
                </div>
            </div>
        </div>
    );
}
