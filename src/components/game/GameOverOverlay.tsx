import React from "react";
import { useGameActions } from "../../contexts/GameActionsContext";

export function GameOverOverlay() {
    const props = useGameActions();
    if (props.gamePhase !== "gameOver") return null;

    return (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center">
            <div className="text-center">
                <h1 className={`text-8xl font-bold mb-10 ${props.winResult === 'good' ? 'text-blue-500' : 'text-red-500'
                    }`}>
                    {props.winResult === 'good' ? '🏆 善良阵营胜利' : '👿 邪恶阵营获胜'}
                </h1>
                {props.winReason && (
                    <p className="text-xl text-gray-400 mb-8">
                        胜利依据：{props.winReason}
                    </p>
                )}
                {props.winReason && props.winReason.includes('猎手') && (
                    <p className="text-sm text-gray-500 mb-8">
                        按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。
                    </p>
                )}
                <div className="flex gap-6 justify-center">
                    <button
                        onClick={props.handleNewGame}
                        className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-3xl font-bold transition-colors"
                    >
                        再来一局
                    </button>
                    <button
                        onClick={() => props.setCurrentModal({ type: 'REVIEW', data: null })}
                        className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-3xl font-bold transition-colors"
                    >
                        本局复盘
                    </button>
                </div>
            </div>
        </div>
    );
}
