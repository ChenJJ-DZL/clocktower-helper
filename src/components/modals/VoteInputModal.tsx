import React, { useState, useEffect } from "react";
import { Seat } from "../../../app/data";
import { ModalType } from "../../types/modal";

export function VoteInputModalContent(props: {
    voterId: number | null;
    seats: Seat[];
    registerVotes?: (seatIds: number[]) => void;
    submitVotes: (count: number, voters?: number[]) => void;
    setCurrentModal: (modal: ModalType | null) => void;
    setShowVoteInputModal?: (value: number | null) => void;
}) {
    const { voterId, seats } = props;
    const [selectedVoters, setSelectedVoters] = useState<number[]>([]);

    useEffect(() => {
        setSelectedVoters([]);
    }, [voterId]);

    if (voterId === null) return null;
    const candidate = seats.find(s => s.id === voterId);
    const aliveCore = seats.filter(s => {
        if (!s.role) return false;
        const roleType = (s.role as any).type;
        return !s.isDead && roleType !== 'traveler';
    });
    const threshold = Math.ceil(aliveCore.length / 2);

    const toggleVoter = (id: number) => {
        setSelectedVoters(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const invalidDeadSelected = selectedVoters.some(id => {
        const seat = seats.find(s => s.id === id);
        return seat && seat.isDead && seat.hasGhostVote === false;
    });

    const selectedAlive = selectedVoters.filter(id => {
        const seat = seats.find(s => s.id === id);
        return seat && !seat.isDead;
    }).length;
    const selectedDead = selectedVoters.length - selectedAlive;

    const ghostHolders = seats
        .filter(s => s.isDead && s.hasGhostVote !== false)
        .map(s => `${s.id + 1}号`);

    return (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative w-[720px] max-h-[90vh] overflow-y-auto">
                <h3 className="text-3xl font-bold mb-4">🗳️ 选择举手玩家</h3>
                <div className="mb-4 text-sm text-gray-200 leading-relaxed">
                    <div>当前被提名者：{candidate ? `${candidate.id + 1}号` : '未知'}</div>
                    <div className="text-xs text-yellow-300 mt-1">
                        规则：选中的死亡玩家会自动消耗幽灵票；没有幽灵票的死亡玩家无法再举手。
                    </div>
                    <div className="text-xs text-yellow-200 mt-1">
                        场上仍有死者票的玩家：{ghostHolders.length ? ghostHolders.join('、') : '无'}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                    {seats.filter(s => s.role).map(s => {
                        const ghostUsed = s.isDead && s.hasGhostVote === false;
                        const disabled = ghostUsed;
                        const isSelected = selectedVoters.includes(s.id);
                        return (
                            <button
                                key={s.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleVoter(s.id)}
                                className={`p-3 rounded-xl border-2 text-left transition ${disabled
                                    ? 'border-gray-700 bg-gray-900/50 text-gray-500 cursor-not-allowed'
                                    : isSelected
                                        ? 'border-blue-400 bg-blue-900/60 text-white shadow-lg shadow-blue-500/30'
                                        : 'border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700'
                                    }`}
                                title={ghostUsed ? '幽灵票已用尽' : (s.isDead ? '死亡玩家可用幽灵票' : '存活玩家')}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="font-bold">{s.id + 1}号 {s.playerName || ''}</div>
                                    <div className="text-xs text-gray-300">
                                        {s.isDead ? (ghostUsed ? '💀(无票)' : '💀 幽灵票') : '存活'}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="mb-4 text-sm text-gray-100">
                    <div>当前选中的票数：<span className="font-bold text-blue-200 text-lg">{selectedVoters.length}</span></div>
                    <div className="text-xs text-gray-300 mt-1">存活：{selectedAlive} 张 / 死亡（消耗幽灵票）：{selectedDead} 张</div>
                    <div className="text-xs text-gray-300 mt-1">上台门槛：{threshold} 票</div>
                    {invalidDeadSelected && (
                        <div className="mt-2 text-red-400 text-xs">选择中包含已用完幽灵票的死亡玩家，请取消勾选</div>
                    )}
                </div>

                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => {
                            if (invalidDeadSelected) {
                                alert('选择中包含已用完幽灵票的死亡玩家');
                                return;
                            }
                            props.registerVotes?.(selectedVoters);
                            props.submitVotes(selectedVoters.length, selectedVoters);
                            setSelectedVoters([]);
                        }}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        确认（{selectedVoters.length} 票）
                    </button>
                    <button
                        onClick={() => {
                            setSelectedVoters([]);
                            props.setCurrentModal(null);
                            if (props.setShowVoteInputModal) props.setShowVoteInputModal(null);
                        }}
                        className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold shadow"
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
}
