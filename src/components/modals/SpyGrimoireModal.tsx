import React from "react";
import { Seat } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface SpyGrimoireModalProps {
    isOpen: boolean;
    onClose: () => void;
    seats: Seat[];
    isPortrait: boolean;
}

export function SpyGrimoireModal({ isOpen, onClose, seats, isPortrait }: SpyGrimoireModalProps) {
    if (!isOpen) return null;

    return (
        <ModalWrapper
            title="📖 魔典 (间谍查看)"
            onClose={onClose}
            className="max-w-4xl"
        >
            <div className="space-y-4">
                <div className="text-sm text-gray-300 mb-4 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    间谍可以查看魔典。以下为场上所有玩家的真实身份状态（不受中毒/醉酒影响而显示的真实分配角色）。
                </div>

                <div className={`grid ${isPortrait ? 'grid-cols-2' : 'grid-cols-3'} gap-3 max-h-[60vh] overflow-y-auto pr-2`}>
                    {seats.map((seat) => {
                        if (!seat.role) return null;

                        // 真实阵营颜色判断
                        const isDemon = seat.role.type === 'demon' || seat.isDemonSuccessor;
                        const isMinion = seat.role.type === 'minion';
                        const isEvil = isDemon || isMinion;

                        const roleColorClass = isDemon
                            ? 'text-red-400 font-bold'
                            : isMinion
                                ? 'text-orange-400 font-bold'
                                : 'text-blue-300 font-bold';

                        const bgClass = seat.isDead
                            ? 'bg-gray-800 border-gray-700 opacity-70'
                            : isEvil
                                ? 'bg-red-900/20 border-red-900/30'
                                : 'bg-blue-900/20 border-blue-900/30';

                        return (
                            <div
                                key={seat.id}
                                className={`p-3 rounded-xl border flex flex-col justify-between ${bgClass}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-lg text-white">{seat.id + 1}号</span>
                                    {seat.isDead && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 border border-gray-600">
                                            💀 死亡
                                        </span>
                                    )}
                                </div>

                                <div className={`text-base ${roleColorClass}`}>
                                    {seat.role.name}
                                    <div className="text-xs text-gray-400 font-normal mt-0.5">
                                        ({seat.role.type === 'townsfolk' ? '镇民' : seat.role.type === 'outsider' ? '外来者' : seat.role.type === 'minion' ? '爪牙' : seat.role.type === 'demon' ? '恶魔' : '旅行者'})
                                    </div>
                                </div>

                                {/* 状态指示器 */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {seat.role.id === 'drunk' && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/60 text-purple-200 border border-purple-700">
                                            伪:{seat.charadeRole?.name}
                                        </span>
                                    )}
                                    {seat.isPoisoned && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-900/60 text-green-200 border border-green-700">
                                            中毒
                                        </span>
                                    )}
                                    {seat.isDrunk && seat.role.id !== 'drunk' && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/60 text-purple-200 border border-purple-700">
                                            醉酒
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors shadow-lg"
                    >
                        我已查看完毕
                    </button>
                </div>
            </div>
        </ModalWrapper>
    );
}
