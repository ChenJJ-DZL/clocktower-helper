"use client";

import React, { useState, useEffect } from "react";
import { Seat } from "../../../../app/data";

interface NoteEditModalProps {
    seat: Seat;
    currentNote: string;
    onConfirm: (seatId: number, note: string) => void;
    onCancel: () => void;
}

export function NoteEditModal({ seat, currentNote, onConfirm, onCancel }: NoteEditModalProps) {
    const [noteText, setNoteText] = useState(currentNote);

    // Auto focus input
    useEffect(() => {
        const timer = setTimeout(() => {
            document.getElementById('note-edit-input')?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const handleConfirm = () => {
        onConfirm(seat.id, noteText.trim());
    };

    return (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div
                className="bg-slate-800 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl border border-slate-600 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 bg-slate-700/50 border-b border-slate-600 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        📝 备忘录
                    </h3>
                    <div className="text-sm font-medium px-2 py-1 bg-slate-800 rounded text-slate-300">
                        {seat.id + 1}号 {seat.role?.name || '未知身份'}
                    </div>
                </div>

                <div className="p-6">
                    <textarea
                        id="note-edit-input"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="输入说书人笔记（例如真假身份、毒/醉状态、夜间目标等）..."
                        className="w-full bg-slate-900 text-slate-100 border border-slate-600 rounded-xl p-3 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500/50 placeholder-slate-500"
                        maxLength={100}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleConfirm();
                            }
                        }}
                    />
                    <div className="text-right text-xs text-slate-500 mt-1">
                        {noteText.length}/100 - 可以使用 Ctrl+Enter 提交
                    </div>
                </div>

                <div className="p-4 border-t border-slate-600 bg-slate-700/30 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-5 py-2 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white font-bold shadow-lg transition-colors"
                    >
                        保存笔记
                    </button>
                </div>
            </div>
        </div>
    );
}
