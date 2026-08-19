"use client";

import { useMemo, useState } from "react";
import { FABLED_ROLES, type Role } from "../../../../app/data";

interface FabledBadgeTrayProps {
  activeFabled: Role[];
  onToggle: (role: Role) => void;
}

export function FabledBadgeTray({ activeFabled, onToggle }: FabledBadgeTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const activeIds = useMemo(
    () => new Set(activeFabled.map((f) => f.id)),
    [activeFabled]
  );

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg
          bg-amber-900/30 border border-amber-600/40 text-amber-200
          hover:bg-amber-800/40 transition-colors text-sm"
      >
        <span>⭐ 寓言角色</span>
        {activeFabled.length > 0 && (
          <span className="bg-amber-600 text-amber-50 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {activeFabled.length}
          </span>
        )}
        <span className="ml-auto text-amber-400/60 text-xs">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {FABLED_ROLES.map((role) => {
            const isActive = activeIds.has(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onToggle(role)}
                className={`flex flex-col items-start gap-1 px-3 py-2 rounded-lg
                  border text-left text-xs transition-all
                  ${
                    isActive
                      ? "bg-amber-800/60 border-amber-400 text-amber-100 ring-1 ring-amber-400/50"
                      : "bg-gray-800/40 border-gray-600/40 text-gray-300 hover:bg-gray-700/40"
                  }`}
              >
                <span className="font-medium truncate w-full">{role.name}</span>
                <span className="text-[10px] opacity-70 line-clamp-2">
                  {role.ability}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
