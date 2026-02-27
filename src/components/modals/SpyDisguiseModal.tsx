import React, { useMemo } from "react";
import { useGameActions } from "../../contexts/GameActionsContext";
import { RoleType } from "../../../app/data";

export function SpyDisguiseModal() {
    const props = useGameActions();
    const spyDisguiseModal = props.currentModal?.type === 'SPY_DISGUISE' ? props.currentModal : null;
    const shouldShowSpyDisguise = !!spyDisguiseModal;

    const spySeats = props.seats.filter((s: any) => s.role?.id === 'spy');
    const recluseSeats = props.seats.filter((s: any) => s.role?.id === 'recluse');
    const chefSeat = props.seats.find((s: any) => s.role?.id === 'chef');
    const empathSeat = props.seats.find((s: any) => s.role?.id === 'empath');
    const investigatorSeat = props.seats.find((s: any) => s.role?.id === 'investigator');
    const fortuneTellerSeat = props.seats.find((s: any) => s.role?.id === 'fortune_teller');

    const hasInterferenceRoles =
        (spySeats.length > 0 || recluseSeats.length > 0) &&
        (chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat);

    const registrationInfo = useMemo(() => {
        if (!shouldShowSpyDisguise || !hasInterferenceRoles) return null;
        const infoViewers = props.seats.filter(
            (s: any) =>
                s.role &&
                ['chef', 'empath', 'investigator', 'fortune_teller'].includes(s.role.id)
        );
        const affected = props.seats.filter(
            (s: any) => s.role && (s.role.id === 'spy' || s.role.id === 'recluse')
        );
        if (infoViewers.length === 0 || affected.length === 0) return null;
        return { infoViewers, affected };
    }, [shouldShowSpyDisguise, hasInterferenceRoles, props.seats]);

    if (!shouldShowSpyDisguise) return null;

    return (
        <div
            className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center"
            onClick={() => {
                props.setCurrentModal(null);
            }}
        >
            <div
                className="bg-gray-800 border-2 border-purple-500 rounded-xl p-4 w-80 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-bold text-purple-300">🎭 伪装身份识别</h3>
                    <button
                        onClick={() => {
                            props.setCurrentModal(null);
                        }}
                        className="text-gray-400 hover:text-white text-xl"
                    >
                        ×
                    </button>
                </div>

                {hasInterferenceRoles ? (
                    <div className="space-y-3 text-sm">
                        {spySeats.length > 0 && (
                            <div>
                                <div className="text-xs text-gray-400 mb-1">间谍：</div>
                                {spySeats.map((s: any) => (
                                    <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                                ))}
                            </div>
                        )}
                        {recluseSeats.length > 0 && (
                            <div>
                                <div className="text-xs text-gray-400 mb-1">隐士：</div>
                                {recluseSeats.map((s: any) => (
                                    <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                                ))}
                            </div>
                        )}
                        <div className="pt-2 border-t border-gray-700">
                            <div className="text-xs text-gray-400 mb-2">干扰模式：</div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => props.setSpyDisguiseMode('off')}
                                    className={`flex-1 py-1.5 px-2 text-xs rounded ${props.spyDisguiseMode === 'off'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                >
                                    关闭
                                </button>
                                <button
                                    onClick={() => props.setSpyDisguiseMode('default')}
                                    className={`flex-1 py-1.5 px-2 text-xs rounded ${props.spyDisguiseMode === 'default'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                >
                                    默认
                                </button>
                                <button
                                    onClick={() => props.setSpyDisguiseMode('on')}
                                    className={`flex-1 py-1.5 px-2 text-xs rounded ${props.spyDisguiseMode === 'on'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                >
                                    开启
                                </button>
                            </div>
                        </div>
                        {props.spyDisguiseMode === 'on' && (
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-300 flex-shrink-0">概率：</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={props.spyDisguiseProbability * 100}
                                    onChange={(e) => props.setSpyDisguiseProbability(parseInt(e.target.value) / 100)}
                                    className="flex-1"
                                />
                                <span className="text-xs text-gray-300 w-10 text-right">
                                    {Math.round(props.spyDisguiseProbability * 100)}%
                                </span>
                            </div>
                        )}
                        {props.spyDisguiseMode === 'default' && (
                            <div className="text-xs text-gray-400">
                                默认概率：80%
                            </div>
                        )}
                        {(chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat) && (
                            <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                                受影响角色：{chefSeat && '厨师'} {chefSeat && (empathSeat || investigatorSeat || fortuneTellerSeat) && '、'}
                                {empathSeat && '共情者'} {(chefSeat || empathSeat) && (investigatorSeat || fortuneTellerSeat) && '、'}
                                {investigatorSeat && '调查员'} {(chefSeat || empathSeat || investigatorSeat) && fortuneTellerSeat && '、'}
                                {fortuneTellerSeat && '占卜师'}
                            </div>
                        )}
                        {registrationInfo && (
                            <div className="mt-3 border-t border-gray-700 pt-2 text-xs text-gray-300 space-y-2">
                                <div className="text-purple-300 font-semibold">🧾 注册结果（仅说书人可见）</div>
                                {registrationInfo.affected.map((target: any) => (
                                    <div key={target.id} className="bg-gray-750 rounded p-2 border border-gray-700">
                                        <div className="font-medium mb-1">{target.id + 1}号【{target.role?.name || '未知'}】</div>
                                        <div className="space-y-1">
                                            {registrationInfo.infoViewers.map((viewer: any) => {
                                                if (!viewer.role) return null;
                                                const typeLabels: Record<RoleType, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔', traveler: '旅人' };
                                                const reg = props.getRegistrationCached(target, viewer.role);
                                                const typeText = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : '无类型';
                                                const status = reg.registersAsDemon
                                                    ? '视为恶魔'
                                                    : reg.registersAsMinion
                                                        ? '视为爪牙'
                                                        : `阵营=${reg.alignment === 'Evil' ? '邪恶' : '善良'}, 类型=${typeText}`;
                                                return (
                                                    <div key={`${viewer.id}-${target.id}`} className="flex items-center justify-between gap-2">
                                                        <span className="text-gray-400">在【{viewer.role?.name}】眼中</span>
                                                        <span className="text-white">{status}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-gray-400 text-center py-4">
                        当前无需要伪装身份识别的角色
                    </div>
                )}
            </div>
        </div>
    );
}
