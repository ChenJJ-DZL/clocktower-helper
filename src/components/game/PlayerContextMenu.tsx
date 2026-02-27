import React from "react";
import { useGameActions } from "../../contexts/GameActionsContext";

export function PlayerContextMenu() {
    const props = useGameActions();
    if (!props.contextMenu) return null;

    const targetSeat = props.seats.find(s => s.id === props.contextMenu?.seatId);
    if (!targetSeat) return null;

    return (
        <div
            className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden"
            style={{ top: props.contextMenu.y, left: props.contextMenu.x }}
        >
            {props.gamePhase === 'dusk' && !targetSeat.isDead && (
                <button
                    onClick={() => props.handleMenuAction('nominate')}
                    disabled={props.contextMenu ? props.nominationRecords.nominators.has(props.contextMenu.seatId) : false}
                    className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${(props.contextMenu && props.nominationRecords.nominators.has(props.contextMenu.seatId)) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                >
                    🗣️ 提名
                </button>
            )}
            {/* 开枪可以在任意环节（除了setup阶段） */}
            {!targetSeat.isDead && props.gamePhase !== 'setup' && (
                <button
                    onClick={() => props.handleMenuAction('slayer')}
                    disabled={targetSeat.hasUsedSlayerAbility}
                    className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${targetSeat.hasUsedSlayerAbility ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                >
                    💥 开枪
                </button>
            )}
            {/* 爪牙白天猜测落难少女 */}
            {props.gamePhase === 'day' && targetSeat.role?.type === 'minion' && !targetSeat.isDead && props.seats.some(s => s.role?.id === 'damsel') && (
                <button
                    onClick={() => props.handleMenuAction('damselGuess')}
                    disabled={props.damselGuessUsedBy.includes(targetSeat.id)}
                    className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 ${props.damselGuessUsedBy.includes(targetSeat.id)
                        ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                        : 'hover:bg-pink-900 text-pink-300'
                        }`}
                >
                    🎯 猜测落难少女
                </button>
            )}
            {/* 快捷状态标记：中毒 / 醉酒（说书人工具） */}
            {props.gamePhase !== 'setup' && (
                <>
                    <button
                        onClick={() => props.toggleStatus('poison', targetSeat.id)}
                        className="block w-full text-left px-6 py-3 hover:bg-green-900/80 text-green-200 text-lg font-medium border-t border-gray-700"
                    >
                        ☠️ 切换中毒标记
                    </button>
                    <button
                        onClick={() => props.toggleStatus('drunk', targetSeat.id)}
                        className="block w-full text-left px-6 py-3 hover:bg-yellow-900/80 text-yellow-200 text-lg font-medium border-t border-gray-700"
                    >
                        🍺 切换醉酒标记
                    </button>
                </>
            )}
            {/* 修补匠：说书人可在任意时刻裁定其死亡 */}
            {targetSeat.role?.id === 'tinker' && !targetSeat.isDead && props.gamePhase !== 'setup' && (
                <button
                    onClick={() => props.handleMenuAction('tinker_die')}
                    className="block w-full text-left px-6 py-3 hover:bg-orange-900 text-orange-300 text-lg font-medium border-t border-gray-700"
                >
                    🛠️ 修补匠：裁定死亡
                </button>
            )}
            {/* 造谣者：白天记录造谣并由说书人裁定真假（若为真，今晚额外死一人） */}
            {props.gamePhase === 'day' && targetSeat.role?.id === 'gossip' && !targetSeat.isDead && (
                <button
                    onClick={() => props.handleMenuAction('gossip_record')}
                    className="block w-full text-left px-6 py-3 hover:bg-cyan-900 text-cyan-200 text-lg font-medium border-t border-gray-700"
                >
                    🗣️ 造谣者：记录/裁定
                </button>
            )}
            <button
                onClick={() => props.toggleStatus('dead')}
                className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium transition-colors"
            >
                💀 切换死亡
            </button>
            {/* 在核对身份阶段及首夜刚开始时，允许选择红罗刹 */}
            {(props.gamePhase === 'check' || (props.gamePhase === 'firstNight' && props.nightCount === 1)) && (
                <button
                    onClick={() => props.toggleStatus('redherring', targetSeat.id)}
                    className="block w-full text-left px-6 py-4 hover:bg-red-700 bg-red-900/30 text-red-100 text-lg font-bold border-t border-gray-700 transition-colors"
                    style={{ textShadow: '0 0 8px rgba(239, 68, 68, 0.5)' }}
                >
                    🎭 选为红罗刹
                </button>
            )}
        </div>
    );
}
