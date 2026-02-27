import React from "react";
import { useGameActions } from "../../contexts/GameActionsContext";

export function ShamanConvertModal() {
    const props = useGameActions();
    if (props.currentModal?.type !== 'SHAMAN_CONVERT') return null;

    return (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
                <h2 className="text-3xl font-bold text-purple-300">灵言师：关键词被说出</h2>
                <div className="text-gray-200 text-sm">
                    请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
                </div>
                <select
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2"
                    value={props.shamanConvertTarget ?? ''}
                    onChange={e => props.setShamanConvertTarget(e.target.value === '' ? null : Number(e.target.value))}
                >
                    <option value="">选择玩家</option>
                    {props.seats.filter((s: any) => !s.isDead).map((s: any) => (
                        <option key={s.id} value={s.id}>[{s.id + 1}] {s.role?.name}</option>
                    ))}
                </select>
                <div className="flex gap-3 justify-end">
                    <button className="px-4 py-2 bg-gray-700 rounded" onClick={() => {
                        props.setCurrentModal(null);
                        props.setShamanConvertTarget(null);
                    }}>取消</button>
                    <button className="px-4 py-2 bg-purple-600 rounded" onClick={() => {
                        if (props.shamanConvertTarget === null) return;
                        const target = props.seats.find((s: any) => s.id === props.shamanConvertTarget);
                        if (!target || target.isDead) return;
                        const isGoodNow = props.isGoodAlignment(target);
                        if (!isGoodNow) {
                            props.addLog(`灵言师关键词触发检查：${props.shamanConvertTarget + 1}号本就为邪恶阵营，未产生额外效果`);
                            props.setShamanTriggered(true);
                            props.setCurrentModal(null);
                            props.setShamanConvertTarget(null);
                            return;
                        }
                        props.setSeats((prev: any[]) => prev.map((s: any) => {
                            if (s.id !== props.shamanConvertTarget) return s;
                            const next = props.cleanseSeatStatuses({ ...s, isEvilConverted: true }, { keepDeathState: true });
                            const details = Array.from(new Set([...(next.statusDetails || []), '灵言转邪']));
                            return { ...next, statusDetails: details };
                        }));
                        props.addLog(`灵言师关键词触发：${props.shamanConvertTarget + 1}号公开说出关键词，从今晚开始被视为邪恶阵营`);
                        props.insertIntoWakeQueueAfterCurrent(props.shamanConvertTarget, { logLabel: `${props.shamanConvertTarget + 1}号(转邪恶)` });
                        props.setShamanTriggered(true);
                        props.setCurrentModal(null);
                        props.setShamanConvertTarget(null);
                    }}>确认转换</button>
                </div>
            </div>
        </div>
    );
}
