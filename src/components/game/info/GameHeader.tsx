"use client";

import React from "react";

export interface GameHeaderProps {
  onShowGameRecords: () => void;
  onShowReview: () => void;
  onShowRoleInfo: () => void;
  onSwitchScript: () => void;
  onRestart: () => void;
  showMenu: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCloseMenu: () => void;
}

export function GameHeader(props: GameHeaderProps) {
  const {
    onShowGameRecords,
    onShowReview,
    onShowRoleInfo,
    onSwitchScript,
    onRestart,
    showMenu,
    onToggleMenu,
    onCloseMenu,
  } = props;

  return (
    <header className="flex items-center justify-between px-4 h-16 border-b border-white/10 bg-slate-900/50 z-20 shrink-0">
      <span className="font-bold text-purple-400 text-xl flex items-center justify-center h-8 flex-shrink-0">控制</span>
      <div className="flex items-center flex-shrink-0 gap-1">
        <button 
          onClick={onShowGameRecords} 
          className="px-2 py-1 text-sm h-8 bg-green-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0"
        >
          对局记录
        </button>
        <button 
          onClick={onShowReview} 
          className="px-2 py-1 text-sm h-8 bg-indigo-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0"
        >
          复盘
        </button>
        <div className="relative flex-shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleMenu(e); }} 
            className="px-2 py-1 text-sm h-8 bg-gray-800 border rounded shadow-lg flex items-center justify-center"
          >
            
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border rounded-lg shadow-xl z-[1000]">
              <button 
                onClick={() => { onShowRoleInfo(); onCloseMenu(); }} 
                className="w-full p-4 text-left text-blue-400 hover:bg-gray-700 border-b border-gray-700"
              >
                角色信息
              </button>
              <button 
                onClick={() => { onSwitchScript(); onCloseMenu(); }} 
                className="w-full p-4 text-left text-purple-400 hover:bg-gray-700 border-b border-gray-700"
              >
                切换剧本
              </button>
              <button 
                onClick={onRestart} 
                className="w-full p-4 text-left text-red-400 hover:bg-gray-700"
              >
                重开
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

