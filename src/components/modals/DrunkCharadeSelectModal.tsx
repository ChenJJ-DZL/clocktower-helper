"use client";

import React, { useState, useMemo } from 'react';
import { ModalWrapper } from './ModalWrapper';
import { Role, Seat } from '../../../app/data';

interface DrunkCharadeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedCharadeRoleId: string) => void;
  drunkSeat: Seat | null;
  availableTownsfolkRoles: Role[];
  selectedScriptId: string | null;
}

export function DrunkCharadeSelectModal({
  isOpen,
  onClose,
  onConfirm,
  drunkSeat,
  availableTownsfolkRoles,
  selectedScriptId,
}: DrunkCharadeSelectModalProps) {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);


  if (!isOpen || !drunkSeat) return null;

  const canConfirm = !!selectedRole;

  const handleConfirm = () => {
    if (selectedRole) {
      onConfirm(selectedRole.id);
      onClose(); // 关闭弹窗
    }
  };

  const currentDrunkRoleName = drunkSeat.role?.name || "酒鬼";

  return (
    <ModalWrapper
      title={"为 " + currentDrunkRoleName + " 选择伪装身份"}
      onClose={onClose}
    >
      <div className="space-y-4 p-4 text-white">
        <p className="text-sm text-slate-300">
          请为编号 **{drunkSeat.id + 1}** 的 {currentDrunkRoleName} 选择一个未被分配的“镇民”角色作为其伪装身份。
          一旦选定，该身份将贯穿整场游戏，且无法更改。
        </p>

        <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
          {availableTownsfolkRoles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role)}
              className={`relative flex items-center justify-center p-3 rounded-lg border transition ${selectedRole?.id === role.id ? "border-purple-500 bg-purple-900/50 ring-2 ring-purple-500" : "border-slate-700 bg-slate-800/50 hover:bg-slate-700/50"}`}
            >
              <span className="text-sm font-bold">{role.name}</span>
              <span className="text-xs text-slate-400 absolute bottom-1 right-2">{role.id}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`w-full rounded-lg py-3 text-lg font-bold transition ${canConfirm ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-slate-700 text-slate-500 cursor-not-allowed"}`}
        >
          确认选择
        </button>
      </div>
    </ModalWrapper>
  );
}

