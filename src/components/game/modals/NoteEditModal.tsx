"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Seat } from "../../../../app/data";

interface NoteEditModalProps {
  seat: Seat;
  currentNote: string;
  onConfirm: (seatId: number, note: string) => void;
  onCancel: () => void;
}

export function NoteEditModal({
  seat,
  currentNote,
  onConfirm,
  onCancel,
}: NoteEditModalProps) {
  const [noteText, setNoteText] = useState(currentNote);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto focus input
  useEffect(() => {
    const timer = setTimeout(() => {
      document.getElementById("note-edit-input")?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleConfirm = () => {
    onConfirm(seat.id, noteText.trim());
  };

  if (typeof document === "undefined" || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl border border-slate-600 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 bg-slate-700/50 border-b border-slate-600 flex items-center justify-between">
          <h3 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            📝 备忘录
          </h3>
          <div className="text-base font-bold px-3 py-1.5 bg-slate-800 rounded-xl text-amber-300 border border-white/10">
            {seat.id + 1}号 {seat.role?.name || "未知身份"}
          </div>
        </div>

        <div className="p-6 space-y-2">
          <textarea
            id="note-edit-input"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="输入说书人笔记（例如真假身份、毒/醉状态、夜间目标等）..."
            className="w-full bg-slate-900 text-slate-100 border border-slate-600 rounded-2xl p-4 h-36 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500/50 placeholder-slate-500 text-lg sm:text-xl leading-relaxed"
            maxLength={100}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleConfirm();
              }
            }}
          />
          <div className="text-right text-sm text-slate-400 font-medium">
            {noteText.length}/100 - 可以使用 Ctrl+Enter 提交
          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-slate-600 bg-slate-700/30 flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-2xl bg-slate-600 hover:bg-slate-500 text-slate-100 font-bold text-base sm:text-lg transition-colors cursor-pointer active:scale-95"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-base sm:text-lg shadow-lg shadow-amber-600/40 transition-colors cursor-pointer active:scale-95"
          >
            保存笔记
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
