import { useGameActions } from "../../contexts/GameActionsContext";
import React from "react";

export function MadnessCheckModal({ modal }: { modal: any }) {
    const props = useGameActions();
    if (!modal) return null;

    return (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
            <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-purple-500 max-w-md">
                <h3 className="text-3xl font-bold mb-6">🧠 疯狂判定</h3>
                <div className="mb-6 text-left">
                    <p className="mb-2">目标：{modal.targetId + 1}号</p>
                    <p className="mb-2">要求扮演角色：{modal.roleName}</p>
                    <p className="text-sm text-gray-400 mb-4">
                        该玩家需要在白天和夜晚"疯狂"地证明自己是这个角色，否则可能被处决。
                    </p>
                </div>
                <div className="flex gap-3 mb-4">
                    <button
                        onClick={() => {
                            props.addLog(`${modal.targetId + 1}号 疯狂判定：通过（正确扮演 ${modal.roleName}）`);
                            props.setCurrentModal(null);
                        }}
                        className="flex-1 py-3 bg-green-600 rounded-xl font-bold text-lg"
                    >
                        通过
                    </button>
                    <button
                        onClick={() => {
                            props.addLog(`${modal.targetId + 1}号 疯狂判定：失败（未正确扮演 ${modal.roleName}）`);
                            const target = props.seats.find((s: any) => s.id === modal.targetId);
                            if (target && !target.isDead) {
                                // 如果判定失败，说书人可以决定是否处决
                                const shouldExecute = window.confirm(`是否处决 ${modal.targetId + 1}号？`);
                                if (shouldExecute) {
                                    props.saveHistory();
                                    props.executePlayer(modal.targetId);
                                }
                            }
                            props.setCurrentModal(null);
                        }}
                        className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-lg"
                    >
                        失败
                    </button>
                </div>
                <button
                    onClick={() => {
                        props.setCurrentModal(null);
                    }}
                    className="w-full py-2 bg-gray-600 rounded-xl font-bold hover:bg-gray-500"
                >
                    取消
                </button>
            </div>
        </div>
    );
}
